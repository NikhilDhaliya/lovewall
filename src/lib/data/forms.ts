import "server-only";
import type { PoolClient } from "pg";
import { one, q } from "@/lib/db";
import { formDefaults, toFormConfig, type FormConfig, type FormKind, type FormRow } from "@/lib/forms";
import { newId } from "@/lib/ids";
import type { Space } from "@/lib/types";

// Every space has a default form. Spaces made before forms existed got one in migration 0020; new spaces get one
// the first time anything asks for it (so no other code path has to remember to create it).
export async function ensureDefaultForm(space: Pick<Space, "id" | "name" | "prompt" | "questions" | "collect_video">): Promise<FormConfig> {
  const existing = await one<FormRow>("select * from forms where space_id = $1 and is_default", [space.id]);
  if (existing) return toFormConfig(existing);
  const d = formDefaults("testimonial", space.name);
  await q(
    `insert into forms (id, space_id, kind, is_default, slug, name, title, hints, fields)
     values ($1, $2, 'testimonial', true, $3, $4, $5, $6, $7)
     on conflict do nothing`,
    [
      newId(12),
      space.id,
      d.slug,
      d.name,
      space.prompt || d.title,
      JSON.stringify(space.questions ?? []),
      JSON.stringify({ video: space.collect_video ? "optional" : "off" }),
    ],
  );
  const row = await one<FormRow>("select * from forms where space_id = $1 and is_default", [space.id]);
  return toFormConfig(row!);
}

export async function getForm(spaceId: string, formId: string): Promise<FormConfig | null> {
  if (!/^[0-9A-Za-z]{8,32}$/.test(formId)) return null;
  const row = await one<FormRow>("select * from forms where id = $1 and space_id = $2", [formId, spaceId]);
  return row ? toFormConfig(row) : null;
}

export async function getFormBySlug(spaceId: string, slug: string): Promise<FormConfig | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const row = await one<FormRow>("select * from forms where space_id = $1 and slug = $2", [spaceId, slug]);
  return row ? toFormConfig(row) : null;
}

export type FormListItem = { id: string; kind: FormKind; name: string; slug: string; isDefault: boolean; views: number; responses: number };

// Forms with their all-time views and responses (testimonials from the form, plus NPS answers that stayed feedback).
export async function listForms(spaceId: string): Promise<FormListItem[]> {
  const rows = await q<{ id: string; kind: FormKind; name: string; slug: string; is_default: boolean; views: number; responses: number }>(
    `select f.id, f.kind, f.name, f.slug, f.is_default,
            coalesce((select sum(views) from form_views v where v.form_id = f.id), 0)::int as views,
            (coalesce((select count(*) from testimonials t where t.form_id = f.id and t.space_id = f.space_id), 0)
             + coalesce((select count(*) from nps_responses r where r.form_id = f.id and r.testimonial_id is null), 0))::int as responses
     from forms f where f.space_id = $1 order by f.is_default desc, f.created_at`,
    [spaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    slug: r.slug,
    isDefault: r.is_default,
    views: r.views,
    responses: r.responses,
  }));
}

// Question labels of every form, for showing answers in the inbox.
export type FormMeta = {
  id: string;
  name: string;
  kind: FormKind;
  isDefault: boolean;
  labels: Record<string, string>;
  scoreLabel: string;
  reasonLabel: string;
};

export async function formsMeta(spaceId: string): Promise<FormMeta[]> {
  const rows = await q<FormRow>("select * from forms where space_id = $1 order by is_default desc, created_at", [spaceId]);
  return rows.map((row) => {
    const f = toFormConfig(row);
    return {
      id: f.id,
      name: f.name,
      kind: f.kind,
      isDefault: f.isDefault,
      labels: Object.fromEntries(f.questions.map((x) => [x.id, x.label])),
      scoreLabel: f.title || "Score",
      reasonLabel: f.followup || "Reason",
    };
  });
}

// One more view today. A plain counter: no cookies, no IPs stored.
export async function countView(formId: string) {
  await q(
    `insert into form_views (form_id, day, views) values ($1, current_date, 1)
     on conflict (form_id, day) do update set views = form_views.views + 1`,
    [formId],
  );
}

export async function freeFormSlug(spaceId: string, base: string, client?: PoolClient): Promise<string> {
  const run = (sql: string, params: unknown[]) => (client ? client.query(sql, params).then((r) => r.rows[0] ?? null) : one(sql, params));
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 34)}-${i + 1}`;
    if (!(await run("select 1 from forms where space_id = $1 and slug = $2", [spaceId, candidate]))) return candidate;
  }
  return `${base.slice(0, 30)}-${newId(6).toLowerCase()}`;
}

// ---------- Results ----------

export type NpsResponse = {
  id: string;
  score: number;
  comment: string;
  name: string | null;
  email: string | null;
  testimonialId: string | null;
  date: string;
};

export async function npsResponses(spaceId: string, formId: string): Promise<NpsResponse[]> {
  const rows = await q<{
    id: string;
    score: number;
    comment: string;
    name: string | null;
    email: string | null;
    testimonial_id: string | null;
    created_at: string;
  }>(
    `select id, score, comment, name, email, testimonial_id, created_at from nps_responses
     where space_id = $1 and form_id = $2 order by created_at desc limit 1000`,
    [spaceId, formId],
  );
  return rows.map((r) => ({
    id: r.id,
    score: r.score,
    comment: r.comment,
    name: r.name,
    email: r.email,
    testimonialId: r.testimonial_id,
    date: new Date(r.created_at).toISOString(),
  }));
}

export async function formTestimonials(spaceId: string, formId: string) {
  return q<{
    id: string;
    name: string;
    title: string | null;
    company: string | null;
    text: string;
    answers: Record<string, string | number | boolean | string[]>;
    status: string;
    given_at: string;
  }>(
    `select id, name, title, company, text, answers, status, given_at from testimonials
     where space_id = $1 and form_id = $2 order by created_at desc limit 500`,
    [spaceId, formId],
  );
}
