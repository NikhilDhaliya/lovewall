import "server-only";
import { one, q } from "@/lib/db";
import { appLink, newTestimonialMail } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { sourceById } from "@/lib/sources";
import { importerFor } from "./index";
import { attachMedia, insertFound, newest } from "./save";
import { BlockedError, ImportError } from "./types";

// Connected sources ("Keep in sync"): fetch the page again, add reviews newer than the watermark, approve the ones at
// or above the owner's minimum rating, and email the owner like a form submission. Errors back off: 2, 4, 8 hours...
// up to a week.

export type ImportSourceRow = {
  id: string;
  space_id: string;
  source: string;
  input: string;
  label: string;
  auto_approve: number | null;
  since: string | null;
  last_run_at: string | null;
  last_added: number | null;
  last_error: string | null;
  failures: number;
  next_run_at: string;
  created_at: string;
};

const MAX_EMAILS = 5;

export async function syncSource(row: ImportSourceRow): Promise<{ added: number; error: string | null }> {
  const importer = importerFor(row.source);
  const label = sourceById(row.source)?.label ?? row.source;
  try {
    if (!importer) throw new ImportError(`${label} isn't set up`);
    const fetched = await importer.fetch(row.input);
    const since = row.since ? new Date(row.since).toISOString() : null;
    const fresh = fetched.items.filter((f) => !since || !f.date || f.date > since);
    const { saved } = await insertFound(row.space_id, label, fresh, (f) =>
      row.auto_approve && f.rating && f.rating >= row.auto_approve ? "approved" : "new",
    );
    await attachMedia(row.space_id, saved, 20);
    const watermark = [since, newest(fetched.items)].filter(Boolean).sort().pop() ?? null;
    await q(
      `update import_sources set since = $2, label = coalesce(nullif($3, ''), label), last_run_at = now(), last_added = $4,
         last_error = null, failures = 0, next_run_at = now() + interval '23 hours' where id = $1`,
      [row.id, watermark, fetched.label.slice(0, 80), saved.length],
    );
    if (saved.length)
      await notify(
        row.space_id,
        saved.map((s) => s.row),
      );
    return { added: saved.length, error: null };
  } catch (error) {
    const message =
      error instanceof BlockedError || error instanceof ImportError ? error.message : `Couldn't reach ${label}. Trying again later.`;
    if (!(error instanceof BlockedError || error instanceof ImportError)) console.error(`[sync] ${row.source}`, (error as Error).message);
    await q(
      `update import_sources set last_run_at = now(), last_error = $2, failures = failures + 1,
         next_run_at = now() + make_interval(hours => least(power(2, failures + 1)::int, 168)) where id = $1`,
      [row.id, message.slice(0, 200)],
    );
    return { added: 0, error: message };
  }
}

// The same email as a form submission, one per new review (a few at most per run).
async function notify(spaceId: string, rows: { name: string; text: string; rating: number | null }[]) {
  const space = await one<{ name: string; notify: boolean; owner_email: string }>(
    "select s.name, s.notify, u.email as owner_email from spaces s join auth_users u on u.id = s.owner_id where s.id = $1",
    [spaceId],
  );
  if (!space?.notify) return;
  for (const t of rows.slice(0, MAX_EMAILS)) {
    const id = await enqueue(
      newTestimonialMail({
        to: space.owner_email,
        space: space.name,
        name: t.name,
        text: t.text,
        rating: t.rating,
        video: false,
        url: appLink(`/app/${spaceId}`),
      }),
    ).catch(() => null);
    if (id) await flushOne(id).catch(() => {});
  }
}

// The cron's share: a few due sources per run, within a time budget (serverless).
export async function syncDue(limit = 6, budgetMs = 20_000) {
  const started = Date.now();
  const rows = await q<ImportSourceRow>(
    `update import_sources set next_run_at = now() + interval '30 minutes'
     where id in (select id from import_sources where next_run_at <= now() order by next_run_at limit $1 for update skip locked)
     returning *`,
    [limit],
  );
  let synced = 0;
  let added = 0;
  for (const row of rows) {
    if (Date.now() - started > budgetMs) {
      await q("update import_sources set next_run_at = now() where id = $1", [row.id]);
      continue;
    }
    const r = await syncSource(row);
    synced++;
    added += r.added;
  }
  return { synced, added };
}
