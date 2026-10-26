import "server-only";
import { revalidateTag } from "next/cache";
import { one, q } from "@/lib/db";
import { widgetIdsOf } from "@/lib/data/spaces";
import { trash } from "@/lib/data/trash";
import { LEGAL } from "@/lib/legal/config";
import { hashToken, newToken, TOKEN_RE } from "@/lib/tokens";
import type { Space, Testimonial } from "@/lib/types";
import { emitTestimonialEvent } from "@/lib/webhooks";
import { logError } from "@/lib/log";

// ---------- Audit log: who did what with personal data. Ids and counts only; kept a year (see migration 0070). ----------

export type AuditAction =
  | "testimonials.export"
  | "testimonials.delete"
  | "testimonial.edit"
  | "testimonial.reply"
  | "invites.send"
  | "report.resolve"
  | "member.invite"
  | "member.remove"
  | "member.leave"
  | "member.owner"
  | "apikey.create"
  | "apikey.revoke"
  | "giver.edit"
  | "giver.delete"
  | "account.export";

export async function audit(entry: {
  spaceId: string | null;
  actorId: string | null;
  action: AuditAction;
  actorKind?: "member" | "giver" | "api" | "system";
  target?: string | null;
  detail?: Record<string, string | number | boolean | null>;
}) {
  // The log must never break the action it records.
  await q("insert into audit_log (space_id, actor_id, actor_kind, action, target, detail) values ($1, $2, $3, $4, $5, $6)", [
    entry.spaceId,
    entry.actorId,
    entry.actorKind ?? "member",
    entry.action,
    entry.target ?? null,
    JSON.stringify(entry.detail ?? {}),
  ]).catch((error) => logError("audit", error));
}

export type AuditItem = {
  id: string;
  action: AuditAction;
  actorKind: string;
  actor: string | null;
  target: string | null;
  detail: Record<string, unknown>;
  at: string;
};

export async function listAudit(spaceId: string, limit = 50): Promise<AuditItem[]> {
  const rows = await q<AuditItem & { at: Date }>(
    `select a.id::text, a.action, a.actor_kind as "actorKind", coalesce(nullif(u.name, ''), u.email) as actor, a.target, a.detail,
       a.created_at as at
     from audit_log a left join auth_users u on u.id = a.actor_id
     where a.space_id = $1 order by a.created_at desc, a.id desc limit $2`,
    [spaceId, limit],
  );
  return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}

// ---------- Removing testimonials (a giver's own request, or a report): files, widgets and webhooks follow. ----------

// Expires the space's cached widgets without re-rendering the page that asked (a giver's page would otherwise turn
// into "link expired" the moment their testimonial is deleted).
export async function expireWidgets(spaceId: string) {
  for (const id of await widgetIdsOf(spaceId)) revalidateTag(`widget:${id}`, { expire: 0 });
}

export async function removeTestimonials(spaceId: string, ids: string[]): Promise<Testimonial[]> {
  if (!ids.length) return [];
  const rows = await q<Testimonial>("delete from testimonials where space_id = $1 and id = any($2) returning *", [spaceId, ids]);
  await trash(rows.flatMap((r) => [r.avatar_key, r.video_key, r.poster_key, r.image_key, r.company_logo_key]));
  await expireWidgets(spaceId);
  if (rows.length) await emitTestimonialEvent(spaceId, "testimonial.deleted", rows);
  return rows;
}

// ---------- Givers' private links (in the receipt email): see, edit or delete their own testimonial. ----------

export const GIVER_LINK_DAYS = LEGAL.retention.giverLinkDays;

export async function createGiverLink(testimonialId: string): Promise<string> {
  const token = newToken();
  await q(
    `insert into giver_links (testimonial_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))
     on conflict (testimonial_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now()`,
    [testimonialId, hashToken(token), GIVER_LINK_DAYS],
  );
  return token;
}

export type GiverView = { testimonial: Testimonial; space: Pick<Space, "id" | "name" | "slug" | "logo_key">; expiresAt: string };

export async function findByGiverToken(token: unknown): Promise<GiverView | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const row = await one<{ t: Testimonial; space_id: string; space_name: string; slug: string; logo_key: string | null; expires_at: Date }>(
    `select to_jsonb(t) as t, s.id as space_id, s.name as space_name, s.slug, s.logo_key, l.expires_at
     from giver_links l join testimonials t on t.id = l.testimonial_id join spaces s on s.id = t.space_id
     where l.token_hash = $1 and l.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) return null;
  return {
    testimonial: row.t,
    space: { id: row.space_id, name: row.space_name, slug: row.slug, logo_key: row.logo_key },
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

// The page a consent was given on: origin and path only (a query string can carry an invite token).
export function consentPage(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

// ---------- Reports from the public (wall pages and widgets), open ones first. ----------

export type ReportItem = {
  id: string;
  testimonialId: string;
  name: string;
  text: string;
  status: string;
  reason: string;
  details: string;
  email: string | null;
  createdAt: string;
};

export async function listReports(spaceId: string): Promise<ReportItem[]> {
  const rows = await q<ReportItem & { createdAt: Date }>(
    `select r.id, r.testimonial_id as "testimonialId", t.name, left(t.text, 300) as text, t.status, r.reason, r.details, r.email,
       r.created_at as "createdAt"
     from reports r join testimonials t on t.id = r.testimonial_id
     where r.space_id = $1 and r.resolved_at is null order by r.created_at desc limit 50`,
    [spaceId],
  );
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
}
