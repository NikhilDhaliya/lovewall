"use server";

import { after } from "next/server";
import { z } from "zod";
import { fail, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { claimUploads, UploadError, verifyUpload } from "@/lib/data/files";
import { getOwnedSpace } from "@/lib/data/spaces";
import { newId } from "@/lib/ids";
import { importerFor, IMPORTER_IDS } from "@/lib/import";
import { copyRemote } from "@/lib/import/media";
import { attachMedia, insertFound, newest } from "@/lib/import/save";
import { readScreenshots } from "@/lib/import/screenshot";
import { syncSource, type ImportSourceRow } from "@/lib/import/sync";
import { BlockedError, ImportError, type Found } from "@/lib/import/types";
import { rateLimitAll } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import { sourceById, sourceLabel, type SourceId } from "@/lib/sources";
import { emitTestimonialEvent } from "@/lib/webhooks";
import { httpsUrl, optionalLine, sourceSchema, textSchema } from "@/lib/validation";

// The import sheet: find reviews on another site (preview), import the ones picked, keep a source in sync, import
// screenshots, and copy media from a CSV export. Every action checks the space, validates input and is rate limited
// per user and per space (Postgres counters).

const MAX_CONNECTED = 20;

async function owned(spaceId: string) {
  const user = await actionUser();
  const space = await getOwnedSpace(user.id, spaceId);
  return { user, space };
}

const limited = async (...limits: [string, number, number][]) => !(await rateLimitAll(limits)).ok;
const TOO_MANY = "Too many at once. Try again later.";

export type PreviewItem = Found & { exists: boolean };
export type Preview =
  | {
      status: "ok";
      source: SourceId;
      label: string;
      input: string;
      note: string | null;
      pick: "all" | "first" | "none";
      items: PreviewItem[];
      syncable: boolean;
      connected: boolean;
    }
  | { status: "blocked"; source: SourceId; site: string };

const findSchema = z.object({ source: z.enum(IMPORTER_IDS), query: z.string().trim().min(1).max(500) });

export async function findReviews(spaceId: string, input: { source: string; query: string }): Promise<Result<Preview>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = findSchema.safeParse(input);
    if (!parsed.success) return fail("Paste a link first");
    if (await limited([`import-find:${user.id}`, 60, 3600], [`import-find-space:${spaceId}`, 100, 3600])) return fail(TOO_MANY);
    const importer = importerFor(parsed.data.source);
    const meta = sourceById(parsed.data.source)!;
    if (!importer) return fail(`${meta.label} isn't set up here`);
    let fetched;
    try {
      fetched = await importer.fetch(parsed.data.query);
    } catch (error) {
      if (error instanceof BlockedError) return ok<Preview>({ status: "blocked", source: meta.id, site: meta.label });
      if (error instanceof ImportError) return fail(error.message);
      console.error(`[import] ${meta.id}`, (error as Error).message);
      return fail(`Couldn't read ${meta.label}. Try again.`);
    }
    const items = fetched.items.slice(0, 300);
    const urls = items.map((i) => i.url);
    const existing = new Set(
      (
        await q<{ source_url: string }>("select source_url from testimonials where space_id = $1 and source_url = any($2)", [spaceId, urls])
      ).map((r) => r.source_url),
    );
    const connected = Boolean(
      await one("select 1 from import_sources where space_id = $1 and source = $2 and input = $3", [spaceId, meta.id, fetched.input]),
    );
    return ok<Preview>({
      status: "ok",
      source: meta.id,
      label: fetched.label,
      input: fetched.input,
      note: fetched.note ?? null,
      pick: fetched.pick ?? "all",
      items: items.map((i) => ({ ...i, exists: existing.has(i.url) })),
      syncable: Boolean(meta.sync),
      connected,
    });
  });
}

const isoOrNull = z
  .string()
  .max(40)
  .nullable()
  .optional()
  .transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null));

const foundSchema = z.object({
  url: httpsUrl,
  name: optionalLine(80),
  text: textSchema.pipe(z.string().min(1)),
  rating: z.number().int().min(1).max(5).nullable().optional().catch(null),
  date: isoOrNull,
  title: optionalLine(80),
  company: optionalLine(80),
  handle: optionalLine(80),
  avatarUrl: httpsUrl.nullable().optional().catch(null),
  imageUrl: httpsUrl.nullable().optional().catch(null),
});

const importSchema = z.object({
  source: z.enum(IMPORTER_IDS),
  items: z.array(z.unknown()).max(300),
  status: z.enum(["approved", "new"]),
  sync: z
    .object({
      input: z.string().trim().min(1).max(500),
      label: z.string().trim().max(80),
      since: isoOrNull,
      autoApprove: z.number().int().min(1).max(5).nullable(),
    })
    .nullable()
    .optional(),
});

export async function importFound(
  spaceId: string,
  input: z.input<typeof importSchema>,
): Promise<Result<{ added: number; skipped: number; connected: boolean }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) return fail("Nothing to import");
    const d = parsed.data;
    if (!d.items.length && !d.sync) return fail("Pick at least one");
    if (await limited([`import-save:${user.id}`, 60, 3600], [`import-save-space:${spaceId}`, 100, 3600])) return fail(TOO_MANY);
    const meta = sourceById(d.source)!;
    const sync = d.sync && meta.sync ? d.sync : null;
    if (sync) {
      const count = await one<{ n: number }>("select count(*)::int as n from import_sources where space_id = $1", [spaceId]);
      const exists = await one("select 1 from import_sources where space_id = $1 and source = $2 and input = $3", [
        spaceId,
        meta.id,
        sync.input,
      ]);
      if (!exists && (count?.n ?? 0) >= MAX_CONNECTED) return fail(`Up to ${MAX_CONNECTED} synced sources per space`);
    }
    const valid: Found[] = [];
    let invalid = 0;
    for (const raw of d.items) {
      const r = foundSchema.safeParse(raw);
      if (!r.success) {
        invalid++;
        continue;
      }
      valid.push({ ...r.data, name: r.data.name ?? `${meta.label} user`, rating: r.data.rating ?? null });
    }
    const { saved, skipped } = await insertFound(spaceId, meta.label, valid, () => d.status);
    // A few: copy avatars and thumbnails now, so they show at once. Many: in the background.
    if (saved.length <= 10) await attachMedia(spaceId, saved);
    else after(() => attachMedia(spaceId, saved).then(() => refreshWidgetsLater(spaceId)));

    if (sync) {
      await q(
        `insert into import_sources (id, space_id, source, input, label, auto_approve, since)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (space_id, source, input) do update set label = excluded.label, auto_approve = excluded.auto_approve,
           since = greatest(import_sources.since, excluded.since)`,
        [newId(12), spaceId, meta.id, sync.input, sync.label, sync.autoApprove, sync.since ?? newest(valid)],
      );
    }
    await refreshWidgets(spaceId);
    return ok({ added: saved.length, skipped: skipped + invalid, connected: Boolean(sync) });
  });
}

async function refreshWidgetsLater(spaceId: string) {
  const { revalidateTag } = await import("next/cache");
  const rows = await q<{ id: string }>("select id from widgets where space_id = $1", [spaceId]);
  for (const r of rows) revalidateTag(`widget:${r.id}`, { expire: 0 });
}

// ---------- Connected sources ----------

export type Connected = {
  id: string;
  source: SourceId;
  label: string;
  input: string;
  autoApprove: number | null;
  lastRunAt: string | null;
  lastAdded: number | null;
  lastError: string | null;
};

const toConnected = (r: ImportSourceRow): Connected => ({
  id: r.id,
  source: r.source as SourceId,
  label: r.label,
  input: r.input,
  autoApprove: r.auto_approve,
  lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
  lastAdded: r.last_added,
  lastError: r.last_error,
});

export async function listConnected(spaceId: string): Promise<Result<Connected[]>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (await limited([`import-read:${user.id}`, 600, 3600])) return fail(TOO_MANY);
    const rows = await q<ImportSourceRow>("select * from import_sources where space_id = $1 order by created_at", [spaceId]);
    return ok(rows.map(toConnected));
  });
}

const idSchema = z.string().regex(/^[0-9A-Za-z]{8,32}$/);

export async function updateConnected(spaceId: string, id: string, input: { autoApprove: number | null }): Promise<Result<Connected>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = z.object({ autoApprove: z.number().int().min(1).max(5).nullable() }).safeParse(input);
    if (!idSchema.safeParse(id).success || !parsed.success) return fail("Not found");
    if (await limited([`import-sources:${user.id}`, 120, 3600])) return fail(TOO_MANY);
    const row = await one<ImportSourceRow>("update import_sources set auto_approve = $3 where id = $1 and space_id = $2 returning *", [
      id,
      spaceId,
      parsed.data.autoApprove,
    ]);
    return row ? ok(toConnected(row)) : fail("Not found");
  });
}

export async function removeConnected(spaceId: string, id: string): Promise<Result> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (!idSchema.safeParse(id).success) return fail("Not found");
    if (await limited([`import-sources:${user.id}`, 120, 3600])) return fail(TOO_MANY);
    await q("delete from import_sources where id = $1 and space_id = $2", [id, spaceId]);
    return ok(null);
  });
}

export async function syncConnected(spaceId: string, id: string): Promise<Result<Connected>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    if (!idSchema.safeParse(id).success) return fail("Not found");
    if (await limited([`import-sync:${user.id}`, 30, 3600], [`import-sync-space:${spaceId}`, 20, 3600])) return fail(TOO_MANY);
    const row = await one<ImportSourceRow>("select * from import_sources where id = $1 and space_id = $2", [id, spaceId]);
    if (!row) return fail("Not found");
    await syncSource(row);
    await refreshWidgets(spaceId);
    const updated = await one<ImportSourceRow>("select * from import_sources where id = $1", [id]);
    return ok(toConnected(updated!));
  });
}

// ---------- Screenshots ----------

const shotsSchema = z.object({
  source: sourceSchema,
  status: z.enum(["approved", "new"]),
  items: z
    .array(z.object({ key: z.string().max(200), name: optionalLine(80) }))
    .min(1)
    .max(30),
});

export async function importScreenshots(
  spaceId: string,
  input: z.input<typeof shotsSchema>,
): Promise<Result<{ added: number; skipped: number }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = shotsSchema.safeParse(input);
    if (!parsed.success) return fail("Nothing to import");
    if (await limited([`import-shots:${user.id}`, 30, 3600], [`import-shots-space:${spaceId}`, 60, 3600])) return fail(TOO_MANY);
    const source = sourceLabel(parsed.data.source);
    let added = 0;
    let skipped = 0;
    const ids: string[] = [];
    const verified: { key: string; name: string | null | undefined }[] = [];
    for (const item of parsed.data.items) {
      try {
        const key = await verifyUpload(spaceId, "image", item.key);
        if (key && !verified.some((v) => v.key === key)) verified.push({ key, name: item.name });
        else skipped++;
      } catch (error) {
        if (!(error instanceof UploadError)) throw error;
        skipped++;
      }
    }
    // Read with AI when a key is set (name, text, stars); screenshots not read in time are read in the background.
    const reads = await readScreenshots(
      spaceId,
      verified.map((v) => v.key),
    );
    for (const { key, name } of verified) {
      const read = reads.get(key);
      const id = newId(12);
      await q(
        `insert into testimonials (id, space_id, status, source, rating, text, name, image_key, consent)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [id, spaceId, parsed.data.status, source, read?.rating ?? null, read?.text ?? "", name ?? read?.name ?? "", key],
      );
      await claimUploads([key]);
      added++;
      ids.push(id);
    }
    await emitTestimonialEvent(spaceId, "testimonial.created", ids);
    await refreshWidgets(spaceId);
    return ok({ added, skipped });
  });
}

// ---------- Media from a CSV export (Senja, Testimonial.to): copied a few at a time so each call stays short ----------

const mediaSchema = z
  .array(
    z.object({
      id: idSchema,
      avatar: httpsUrl.optional(),
      image: httpsUrl.optional(),
      video: httpsUrl.optional(),
      poster: httpsUrl.optional(),
    }),
  )
  .min(1)
  .max(3);

export type MediaJob = z.input<typeof mediaSchema>[number];

export async function copyMedia(spaceId: string, jobs: MediaJob[]): Promise<Result<{ copied: number; failed: number }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = mediaSchema.safeParse(jobs);
    if (!parsed.success) return fail("Nothing to copy");
    if (
      await limited(
        [`import-media:${user.id}`, 200, 3600],
        [`import-media-space:${spaceId}`, 200, 3600],
        [`import-media-day:${spaceId}`, 600, 86400],
      )
    )
      return fail(TOO_MANY);
    let copied = 0;
    let failed = 0;
    for (const job of parsed.data) {
      const row = await one<{ avatar_key: string | null; image_key: string | null; video_key: string | null; poster_key: string | null }>(
        "select avatar_key, image_key, video_key, poster_key from testimonials where id = $1 and space_id = $2",
        [job.id, spaceId],
      );
      if (!row) continue;
      const take = async (url: string | undefined, current: string | null, kind: "avatar" | "image" | "video" | "poster") => {
        if (!url || current) return null;
        const key = await copyRemote(spaceId, url, kind);
        if (key) copied++;
        else failed++;
        return key;
      };
      const avatar = await take(job.avatar, row.avatar_key, "avatar");
      const image = await take(job.image, row.image_key, "image");
      const video = await take(job.video, row.video_key, "video");
      const poster = video ? await take(job.poster, row.poster_key, "poster") : null;
      if (avatar || image || video)
        await q(
          `update testimonials set avatar_key = coalesce(avatar_key, $3), image_key = coalesce(image_key, $4),
             video_key = coalesce(video_key, $5), poster_key = coalesce(poster_key, $6), updated_at = now() where id = $1 and space_id = $2`,
          [job.id, spaceId, avatar, image, video, poster],
        );
    }
    await refreshWidgets(spaceId);
    return ok({ copied, failed });
  });
}
