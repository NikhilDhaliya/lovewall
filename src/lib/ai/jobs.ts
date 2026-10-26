import "server-only";
import { after } from "next/server";
import { one, q } from "@/lib/db";
import { analyzeTestimonial } from "./analyze";
import type { AiResult } from "./client";
import { expireWidgets } from "./refresh";
import { readTestimonialImage } from "./screenshot";
import { aiKeys, getAiSettings, type AiSettings } from "./settings";
import { transcribe } from "./transcribe";
import { translateTestimonial } from "./translate";

// AI work in the background: queued when a testimonial arrives, run right after the response (after()) and retried
// by the maintenance cron with backoff. A visitor's submit never waits for it.

type Kind = "analyze" | "transcript" | "translate" | "screenshot";
type Job = { id: number; space_id: string; testimonial_id: string; kind: Kind; lang: string; attempts: number };

const MAX_ATTEMPTS = 4;
const CONCURRENCY = 4;

async function insertJobs(rows: { spaceId: string; id: string; kind: Kind; lang?: string }[]) {
  if (!rows.length) return;
  await q(
    `insert into ai_jobs (space_id, testimonial_id, kind, lang)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
     on conflict (testimonial_id, kind, lang) where done_at is null do nothing`,
    [rows.map((r) => r.spaceId), rows.map((r) => r.id), rows.map((r) => r.kind), rows.map((r) => r.lang ?? "")],
  );
}

// What a new testimonial needs: a transcript first for a video (the analysis then reads it), the text read from a
// screenshot, then the analysis (spam, sentiment, best line).
function firstStep(
  t: { video_key: string | null; image_key: string | null; text: string; source: string; captions: boolean },
  s: AiSettings,
  keys: ReturnType<typeof aiKeys>,
): Kind | null {
  if (t.video_key && !t.captions && s.captions && keys.speech) return "transcript";
  if (!keys.text) return null;
  if (t.image_key && !t.text.trim()) return "screenshot";
  if (t.text.trim() && ((s.spam && t.source === "Form") || s.sentiment || s.highlight)) return "analyze";
  return null;
}

export async function queueAi(spaceId: string, ids: string[], opts: { run?: boolean } = {}) {
  const keys = aiKeys();
  if (!ids.length || (!keys.text && !keys.speech)) return;
  const settings = await getAiSettings(spaceId);
  const rows = await q<{ id: string; video_key: string | null; image_key: string | null; text: string; source: string; captions: boolean }>(
    "select id, video_key, image_key, text, source, captions from testimonials where space_id = $1 and id = any($2)",
    [spaceId, ids.slice(0, 500)],
  );
  const jobs = rows.flatMap((t) => {
    const kind = firstStep(t, settings, keys);
    return kind ? [{ spaceId, id: t.id, kind }] : [];
  });
  await insertJobs(jobs);
  if (jobs.length && opts.run !== false) later(() => runJobsFor(jobs.map((j) => j.id)));
}

// after() exists only inside a request; elsewhere the cron picks the jobs up.
function later(fn: () => Promise<unknown>) {
  try {
    after(() => fn().catch((e) => console.error("AI jobs:", e instanceof Error ? e.message : e)));
  } catch {
    // Not in a request.
  }
}

// Translations for every widget of the space that shows a language (approved testimonials only).
export async function queueTranslations(spaceId: string | null, limit = 200, opts: { run?: boolean } = {}) {
  if (!aiKeys().text) return 0;
  const rows = await q<{ space_id: string; id: string; lang: string }>(
    `select distinct t.space_id, t.id, w.lang
     from (select distinct space_id, config->>'language' as lang from widgets
           where coalesce(config->>'language', '') <> '' and ($1::text is null or space_id = $1)) w
     join testimonials t on t.space_id = w.space_id and t.status = 'approved' and t.text <> ''
     where not exists (select 1 from testimonial_translations tr where tr.testimonial_id = t.id and tr.lang = w.lang and tr.source_hash = md5(t.text))
       and not exists (select 1 from ai_jobs j where j.testimonial_id = t.id and j.kind = 'translate' and j.lang = w.lang
                       and (j.done_at is null or j.created_at > now() - interval '1 day'))
     limit $2`,
    [spaceId, limit],
  );
  await insertJobs(rows.map((r) => ({ spaceId: r.space_id, id: r.id, kind: "translate" as const, lang: r.lang })));
  if (rows.length && spaceId && opts.run !== false) later(() => runJobsFor(rows.map((r) => r.id)));
  return rows.length;
}

async function claim(filter: string, params: unknown[], limit: number): Promise<Job[]> {
  return q<Job>(
    `update ai_jobs set started_at = now(), attempts = attempts + 1
     where id in (select id from ai_jobs where done_at is null and next_at <= now()
                    and (started_at is null or started_at < now() - interval '3 minutes') ${filter}
                  order by id limit ${limit} for update skip locked)
     returning id, space_id, testimonial_id, kind, lang, attempts`,
    params,
  );
}

async function runOne(job: Job): Promise<void> {
  let res: AiResult<unknown>;
  try {
    res = await step(job);
  } catch (error) {
    res = { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "Failed", code: "failed" };
  }
  if (res.ok || res.code === "off") {
    await q("update ai_jobs set done_at = now(), last_error = null where id = $1", [job.id]);
    return;
  }
  if (res.code === "cap") {
    // Out of today's allowance: try again tomorrow without spending an attempt.
    await q(
      `update ai_jobs set started_at = null, attempts = attempts - 1, last_error = $2,
         next_at = date_trunc('day', now() at time zone 'utc') at time zone 'utc' + interval '1 day 5 minutes' where id = $1`,
      [job.id, res.error],
    );
    return;
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    await q("update ai_jobs set done_at = now(), last_error = $2 where id = $1", [job.id, res.error]);
    return;
  }
  await q("update ai_jobs set started_at = null, last_error = $2, next_at = now() + make_interval(mins => $3) where id = $1", [
    job.id,
    res.error,
    2 ** job.attempts,
  ]);
}

async function step(job: Job): Promise<AiResult<unknown>> {
  const keys = aiKeys();
  const settings = await getAiSettings(job.space_id);
  if (job.kind === "translate") {
    const res = await translateTestimonial(job.testimonial_id, job.lang);
    if (res.ok) await expireWidgets(job.space_id);
    return res;
  }
  if (job.kind === "transcript") {
    if (!settings.captions) return { ok: true, data: null };
    const res = await transcribe(job.testimonial_id);
    if (!res.ok) return res;
    await expireWidgets(job.space_id);
    // Now there are words to analyze.
    if (keys.text) await insertJobs([{ spaceId: job.space_id, id: job.testimonial_id, kind: "analyze" }]);
    return res;
  }
  if (job.kind === "screenshot") {
    const res = await readTestimonialImage(job.testimonial_id);
    if (!res.ok) return res;
    await insertJobs([{ spaceId: job.space_id, id: job.testimonial_id, kind: "analyze" }]);
    await expireWidgets(job.space_id);
    return res;
  }
  const res = await analyzeTestimonial(job.testimonial_id, settings);
  if (res.ok) await expireWidgets(job.space_id);
  return res;
}

async function runAll(jobs: Job[], deadline: number) {
  let i = 0;
  const worker = async () => {
    while (i < jobs.length && Date.now() < deadline) await runOne(jobs[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  // Claimed but not started before the deadline: free them for the next run.
  const left = jobs.slice(i).map((j) => j.id);
  if (left.length) await q("update ai_jobs set started_at = null, attempts = attempts - 1 where id = any($1)", [left]);
}

// Jobs of some testimonials, including the follow-up steps they queue (transcript, then analysis).
export async function runJobsFor(ids: string[], budgetMs = 50_000) {
  const deadline = Date.now() + budgetMs;
  for (let round = 0; round < 3 && Date.now() < deadline; round++) {
    const jobs = await claim("and testimonial_id = any($1)", [ids], 40);
    if (!jobs.length) return;
    await runAll(jobs, deadline);
  }
}

// The cron: due jobs from every space, a few at a time.
export async function runDueJobs(budgetMs = 25_000, limit = 24) {
  const deadline = Date.now() + budgetMs;
  const jobs = await claim("", [], limit);
  await runAll(jobs, deadline);
  return jobs.length;
}

// The collect form: wait (briefly) for the spam verdict before telling the owner about a new testimonial.
export async function settleSpam(spaceId: string, id: string, waitMs = 20_000): Promise<boolean> {
  const keys = aiKeys();
  if (!keys.text || !(await getAiSettings(spaceId)).spam) return false;
  const deadline = Date.now() + waitMs;
  await runJobsFor([id], waitMs);
  for (;;) {
    const row = await one<{ spam: boolean; pending: boolean }>(
      `select t.spam, exists (select 1 from ai_jobs j where j.testimonial_id = t.id and j.done_at is null and j.kind in ('analyze', 'transcript')) as pending
       from testimonials t where t.id = $1`,
      [id],
    );
    if (!row || row.spam || !row.pending || Date.now() > deadline) return Boolean(row?.spam);
    await new Promise((r) => setTimeout(r, 500));
  }
}
