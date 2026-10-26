"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { draftSchema, saveDraft, writeDraft } from "@/lib/ai/case-study";
import { aiReady } from "@/lib/ai/client";
import { proposeForm, type FormProposal } from "@/lib/ai/form-from-url";
import { runJobsFor } from "@/lib/ai/jobs";
import { readImage, type ScreenshotText } from "@/lib/ai/screenshot";
import { AI_SWITCHES, aiKeys, saveAiSettings, type AiSettings } from "@/lib/ai/settings";
import { latestSummary, summarize, type StoredSummary } from "@/lib/ai/summary";
import { transcribe } from "@/lib/ai/transcribe";
import { languageName, translateTestimonial, type Translation } from "@/lib/ai/translate";
import { caseStudyDraft, type CaseStudyDraft } from "@/lib/case-study";
import { one, q } from "@/lib/db";
import { ensureDefaultForm, freeFormSlug, getForm } from "@/lib/data/forms";
import { getOwnedSpace, requireRole } from "@/lib/data/spaces";
import { defaultFields, formDefaults } from "@/lib/forms";
import { route } from "@/lib/import/http";
import { newId } from "@/lib/ids";
import { rateLimitAll } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import type { Testimonial } from "@/lib/types";
import { hexSchema, websiteSchema } from "@/lib/validation";

// Owner-side AI: settings, summaries, translations, transcripts, case studies, forms from a website, reading
// screenshots. Every action checks membership of the space, validates its input, is rate limited per user, and
// counts against the space's daily AI caps.

const ID = z.string().regex(/^[0-9A-Za-z]{8,32}$/);
const OFF = "AI is off on this server";
const BUSY = "Too many at once. Try again later.";

async function member(spaceId: string, action: string, max: number, windowSeconds = 3600) {
  const user = await actionUser();
  const space = ID.safeParse(spaceId).success ? await getOwnedSpace(user.id, spaceId) : null;
  // Per action, plus one daily ceiling per person across every space they work in (the AI caps are per space).
  const limit = space
    ? await rateLimitAll([
        [`ai:${action}:${user.id}`, max, windowSeconds],
        [`ai:day:${user.id}`, 3000, 86400],
      ])
    : null;
  return { space, limited: limit ? !limit.ok : false };
}

async function testimonialOf(spaceId: string, id: string) {
  if (!ID.safeParse(id).success) return null;
  return one<Testimonial>("select * from testimonials where id = $1 and space_id = $2", [id, spaceId]);
}

const settingsSchema = z.object(
  Object.fromEntries(AI_SWITCHES.map((k) => [k, z.boolean().optional()])) as Record<
    (typeof AI_SWITCHES)[number],
    z.ZodOptional<z.ZodBoolean>
  >,
);

export async function updateAiSettings(spaceId: string, patch: Partial<AiSettings>): Promise<Result<AiSettings>> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "settings", 240);
    if (!space) return fail("Not found");
    // Turning AI on sends the space's testimonials to Anthropic and Deepgram: the owner's call.
    if (!requireRole(space, "owner")) return fail("Only the owner can change this");
    if (limited) return fail(BUSY);
    const parsed = settingsSchema.strict().safeParse(patch);
    if (!parsed.success) return fail("Check the settings");
    return ok(await saveAiSettings(spaceId, parsed.data));
  });
}

// Spam is hidden, never deleted: "Not spam" puts it back with the new ones.
export async function markNotSpam(spaceId: string, id: string): Promise<Result> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "not-spam", 600);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const row = await one(
      "update testimonials set spam = false, status = 'new', updated_at = now() where id = $1 and space_id = $2 and spam returning id",
      [id, spaceId],
    );
    if (!row) return fail("Not found");
    return ok(null);
  });
}

export async function getSummary(spaceId: string): Promise<Result<StoredSummary | null>> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "summary-read", 600);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    return ok(await latestSummary(spaceId));
  });
}

export async function summarizeSpace(spaceId: string): Promise<Result<StoredSummary | null>> {
  return guard(async () => {
    if (!aiReady()) return fail(OFF);
    const { space, limited } = await member(spaceId, "summary", 10);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const res = await summarize(spaceId, space.name);
    return res.ok ? ok(res.data) : fail(res.error);
  });
}

export async function listTranslations(spaceId: string, id: string): Promise<Result<Translation[]>> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "translations", 600);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    if (!(await testimonialOf(spaceId, id))) return fail("Not found");
    const rows = await q<Translation & { approved: boolean }>(
      `select tr.lang, tr.text, tr.highlight, tr.approved_at is not null as approved
       from testimonial_translations tr join testimonials t on t.id = tr.testimonial_id
       where tr.testimonial_id = $1 and tr.space_id = $2 and tr.source_hash = md5(t.text) and tr.discarded_at is null
       order by tr.created_at desc`,
      [id, spaceId],
    );
    return ok(rows);
  });
}

// A member reads a translation before widgets and the public API may show it (they are machine-made).
export async function reviewTranslation(spaceId: string, id: string, lang: string, verdict: "approve" | "discard"): Promise<Result> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "translation-review", 600);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    if (!languageName(String(lang)) || (verdict !== "approve" && verdict !== "discard")) return fail("Not found");
    if (!(await testimonialOf(spaceId, id))) return fail("Not found");
    const user = await actionUser();
    const row =
      verdict === "approve"
        ? await one(
            `update testimonial_translations set approved_at = now(), approved_by = $4, discarded_at = null
             where testimonial_id = $1 and space_id = $2 and lang = $3 returning lang`,
            [id, spaceId, lang, user.id],
          )
        : await one(
            `update testimonial_translations set discarded_at = now(), approved_at = null, approved_by = null
             where testimonial_id = $1 and space_id = $2 and lang = $3 returning lang`,
            [id, spaceId, lang],
          );
    if (!row) return fail("Not found");
    await refreshWidgets(spaceId);
    return ok(null);
  });
}

export async function translate(spaceId: string, id: string, lang: string): Promise<Result<Translation>> {
  return guard(async () => {
    if (!aiReady()) return fail(OFF);
    const { space, limited } = await member(spaceId, "translate", 120);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    if (!languageName(String(lang))) return fail("Pick a language");
    if (!(await testimonialOf(spaceId, id))) return fail("Not found");
    const res = await translateTestimonial(id, lang);
    if (!res.ok) return fail(res.error);
    await refreshWidgets(spaceId);
    return ok(res.data);
  });
}

export async function transcribeVideo(spaceId: string, id: string): Promise<Result<{ text: string; transcript: string } | null>> {
  return guard(async () => {
    if (!aiKeys().speech) return fail("Captions are off on this server");
    const { space, limited } = await member(spaceId, "transcribe", 30);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const t = await testimonialOf(spaceId, id);
    if (!t?.video_key) return fail("Not found");
    const res = await transcribe(id);
    if (!res.ok) return fail(res.error);
    if (!res.data) return fail("No speech found in this video");
    // The words can now be analyzed (sentiment, best line).
    if (aiReady())
      await q("insert into ai_jobs (space_id, testimonial_id, kind) values ($1, $2, 'analyze') on conflict do nothing", [
        spaceId,
        id,
      ]).catch(() => {});
    after(() => runJobsFor([id]).catch(() => {}));
    await refreshWidgets(spaceId);
    const row = await one<{ text: string }>("select text from testimonials where id = $1", [id]);
    return ok({ text: row?.text ?? "", transcript: res.data.text });
  });
}

export async function readImageText(spaceId: string, id: string): Promise<Result<ScreenshotText | null>> {
  return guard(async () => {
    if (!aiReady()) return fail(OFF);
    const { space, limited } = await member(spaceId, "read-image", 60);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const t = await testimonialOf(spaceId, id);
    if (!t?.image_key) return fail("Not found");
    const res = await readImage(spaceId, t.image_key);
    if (!res.ok) return fail(res.error);
    return res.data ? ok(res.data) : fail("No testimonial found in the image");
  });
}

// ---------- Case studies (the seam in src/lib/case-study.ts) ----------

async function caseStudyOf(spaceId: string, spaceName: string, id: string) {
  const t = await testimonialOf(spaceId, id);
  if (!t?.form_id) return null;
  const form = await getForm(spaceId, t.form_id);
  if (!form || form.kind !== "case_study") return null;
  return caseStudyDraft({ name: t.name, title: t.title, company: t.company, text: t.text, answers: t.answers }, form.questions, spaceName);
}

export async function writeCaseStudy(spaceId: string, id: string): Promise<Result<CaseStudyDraft>> {
  return guard(async () => {
    if (!aiReady()) return fail(OFF);
    const { space, limited } = await member(spaceId, "case-study", 30);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const original = await caseStudyOf(spaceId, space.name, id);
    if (!original) return fail("Not found");
    const res = await writeDraft(spaceId, space.name, original);
    if (!res.ok) return fail(res.error);
    await saveDraft(spaceId, id, res.data, false);
    return ok(res.data);
  });
}

export async function saveCaseStudy(spaceId: string, id: string, draft: CaseStudyDraft): Promise<Result<CaseStudyDraft>> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "case-study-save", 600);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const original = await caseStudyOf(spaceId, space.name, id);
    if (!original) return fail("Not found");
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the fields");
    // The person and the quote are the customer's own: they come from the answers, not from the editor.
    const next: CaseStudyDraft = { ...parsed.data, metric: parsed.data.metric || null, person: original.person, quote: original.quote };
    await saveDraft(spaceId, id, next, true);
    return ok(next);
  });
}

export async function discardCaseStudy(spaceId: string, id: string): Promise<Result> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "case-study-save", 600);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    await q("delete from case_study_drafts where testimonial_id = $1 and space_id = $2", [id, spaceId]);
    return ok(null);
  });
}

// ---------- A new form from a website ----------

export async function proposeFormFromSite(spaceId: string, url: string): Promise<Result<FormProposal>> {
  return guard(async () => {
    if (!aiReady()) return fail(OFF);
    const { space, limited } = await member(spaceId, "form-propose", 20);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const parsed = websiteSchema.safeParse(url);
    if (!parsed.success || !parsed.data) return fail("A link like acme.com");
    // Tests route the page fetch to a mock (operator config only); otherwise it is the SSRF-safe fetch as is.
    const res = await proposeForm(spaceId, parsed.data, route(parsed.data));
    return res.ok ? ok(res.data) : fail(res.error);
  });
}

const proposalSchema = z.object({
  title: z.string().trim().min(1, "Add a headline").max(160, "At most 160 characters"),
  prompt: z.string().trim().max(400, "At most 400 characters"),
  hints: z
    .array(z.string().trim().max(140))
    .max(6)
    .transform((a) => a.filter(Boolean)),
  brandColor: hexSchema.nullable(),
});

export async function createFormFromProposal(spaceId: string, input: z.input<typeof proposalSchema>): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const { space, limited } = await member(spaceId, "form-create", 30);
    if (!space) return fail("Not found");
    if (limited) return fail(BUSY);
    const parsed = proposalSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the fields");
    await ensureDefaultForm(space);
    const count = await one<{ n: number }>("select count(*)::int as n from forms where space_id = $1", [spaceId]);
    if ((count?.n ?? 0) >= 50) return fail("A space can have up to 50 forms");
    const d = formDefaults("testimonial", space.name);
    const id = newId(12);
    await q(
      `insert into forms (id, space_id, kind, slug, name, title, prompt, hints, fields, questions, layout, followup)
       values ($1, $2, 'testimonial', $3, $4, $5, $6, $7, $8, '[]', $9, '')`,
      [
        id,
        spaceId,
        await freeFormSlug(spaceId, d.slug),
        d.name,
        parsed.data.title,
        parsed.data.prompt,
        JSON.stringify(parsed.data.hints),
        JSON.stringify(defaultFields("testimonial")),
        d.layout,
      ],
    );
    if (parsed.data.brandColor) {
      await q("update spaces set brand_color = $2, updated_at = now() where id = $1", [spaceId, parsed.data.brandColor.toLowerCase()]);
    }
    revalidatePath(`/app/${spaceId}/collect`);
    return ok({ id });
  });
}
