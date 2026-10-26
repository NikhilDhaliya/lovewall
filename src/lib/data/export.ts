import "server-only";
import { z } from "zod";
import { q } from "@/lib/db";
import type { Testimonial } from "@/lib/types";
import { fileUrl } from "./files";

// Exports a space's testimonials (all, or the inbox's current filter) as CSV or JSON, every column included.

export const exportQuery = z.object({
  format: z.enum(["csv", "json"]).catch("csv"),
  status: z.enum(["new", "approved", "hidden", "all"]).catch("all"),
  source: z.string().trim().max(40).optional().catch(undefined),
  rating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  tag: z.string().trim().max(40).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type ExportQuery = z.infer<typeof exportQuery>;

export const EXPORT_MAX = 20_000;

export async function exportRows(spaceId: string, f: ExportQuery): Promise<Testimonial[]> {
  const where = ["space_id = $1"];
  const params: unknown[] = [spaceId];
  const add = (sql: (n: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (f.status !== "all") add((n) => `status = ${n}`, f.status);
  if (f.source) add((n) => `lower(source) = lower(${n})`, f.source);
  if (f.rating) add((n) => `rating = ${n}`, f.rating);
  if (f.tag) add((n) => `${n} = any(tags)`, f.tag);
  if (f.q) {
    const term = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    add((n) => `(text ilike ${n} or name ilike ${n} or coalesce(company, '') ilike ${n} or coalesce(title, '') ilike ${n})`, term);
  }
  return q<Testimonial>(
    `select * from testimonials where ${where.join(" and ")} order by created_at desc, id desc limit ${EXPORT_MAX}`,
    params,
  );
}

const COLUMNS = [
  "id",
  "status",
  "featured",
  "name",
  "email",
  "title",
  "company",
  "handle",
  "rating",
  "text",
  "source",
  "source_url",
  "tags",
  "date",
  "created_at",
  "consent",
  "consent_text",
  "consent_version",
  "consent_lang",
  "consent_at",
  "consent_url",
  "avatar_url",
  "video_url",
  "poster_url",
  "image_url",
  "company_logo_url",
  "video_start",
  "video_end",
  "form_id",
] as const;

type Consent = {
  consent_text?: string | null;
  consent_version?: string | null;
  consent_lang?: string | null;
  consent_at?: string | Date | null;
  consent_url?: string | null;
};

export function consentRecord(t: Testimonial) {
  const c = t as Testimonial & Consent;
  return {
    consent_text: c.consent_text ?? null,
    consent_version: c.consent_version ?? null,
    consent_lang: c.consent_lang ?? null,
    consent_at: c.consent_at ? new Date(c.consent_at).toISOString() : null,
    consent_url: c.consent_url ?? null,
  };
}

// One flat record per testimonial; answers to custom questions stay keyed by question id.
export function exportRecord(t: Testimonial) {
  return {
    id: t.id,
    status: t.status,
    featured: t.featured,
    name: t.name,
    email: t.email,
    title: t.title,
    company: t.company,
    handle: t.handle,
    rating: t.rating,
    text: t.text,
    source: t.source,
    source_url: t.source_url,
    tags: t.tags,
    date: new Date(t.given_at).toISOString(),
    created_at: new Date(t.created_at).toISOString(),
    consent: t.consent,
    // The consent record: the exact wording shown, its version and language, when, and on which page.
    ...consentRecord(t),
    avatar_url: fileUrl(t.avatar_key),
    video_url: fileUrl(t.video_key),
    poster_url: fileUrl(t.poster_key),
    image_url: fileUrl(t.image_key),
    company_logo_url: fileUrl(t.company_logo_key),
    video_start: t.video_start ?? null,
    video_end: t.video_end ?? null,
    form_id: t.form_id,
    answers: t.answers ?? {},
  };
}

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets a leading apostrophe.
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join("; ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (typeof value !== "number" && typeof value !== "boolean" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Testimonial[]): string {
  const records = rows.map(exportRecord);
  const answerKeys = [...new Set(records.flatMap((r) => Object.keys(r.answers)))].sort();
  const base = COLUMNS;
  const header = [...base, ...answerKeys.map((k) => `answer:${k}`)];
  const lines = [header.map(cell).join(",")];
  for (const r of records) {
    const values = base.map((k) => r[k]);
    lines.push([...values, ...answerKeys.map((k) => (r.answers as Record<string, unknown>)[k])].map(cell).join(","));
  }
  // A byte-order mark so Excel reads UTF-8.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
