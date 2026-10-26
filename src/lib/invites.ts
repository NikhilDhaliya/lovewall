import "server-only";
import { createHash } from "node:crypto";
import { one, q } from "@/lib/db";
import { planFor } from "@/lib/data/billing";
import { env } from "@/lib/env";
import { EMAIL_RE, type FormConfig } from "@/lib/forms";
import { formLanguage } from "@/lib/i18n/collect";
import { t } from "@/lib/i18n/collect/languages";
import { newId } from "@/lib/ids";
import { inviteMail } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { signId, verifySigned } from "@/lib/tokens";
import { footerAddress, LEGAL } from "@/lib/legal/config";

// Email invites: one link per person, prefilled with their name and email. The token in the link is the invite id
// signed with the app secret (nothing to store), and the invite expires after 60 days.

const PURPOSE = "invite";

export type InviteRow = {
  id: string;
  space_id: string;
  form_id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  reply_to: string | null;
  reminders_left: number;
  remind_after_days: number;
  sent_at: string | null;
  reminded_at: string | null;
  reminders_sent: number;
  opened_at: string | null;
  clicked_at: string | null;
  submitted_at: string | null;
  unsubscribed_at: string | null;
  expires_at: string;
  created_at: string;
};

export type InviteStatus = "sent" | "opened" | "clicked" | "submitted" | "unsubscribed";

export function inviteStatus(r: Pick<InviteRow, "opened_at" | "clicked_at" | "submitted_at" | "unsubscribed_at">): InviteStatus {
  if (r.unsubscribed_at) return "unsubscribed";
  if (r.submitted_at) return "submitted";
  if (r.clicked_at) return "clicked";
  if (r.opened_at) return "opened";
  return "sent";
}

export const inviteToken = (id: string) => signId(PURPOSE, id);

// Unsubscribes are kept as sha256(lower(email)) in hex; the SQL side computes the same with emailHashSql().
export const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const emailHashSql = (column: string) => `encode(sha256(convert_to(lower(${column}), 'UTF8')), 'hex')`;

// A valid, unexpired invite for this token (in this space, when one is given). Unsubscribing works after expiry too.
export async function findInvite(token: unknown, spaceId?: string, opts: { expired?: boolean } = {}): Promise<InviteRow | null> {
  const id = verifySigned(PURPOSE, token);
  if (!id) return null;
  const where = ["id = $1", ...(opts.expired ? [] : ["expires_at > now()"]), ...(spaceId ? ["space_id = $2"] : [])];
  return one<InviteRow>(`select * from invites where ${where.join(" and ")}`, spaceId ? [id, spaceId] : [id]);
}

// The public link of a form: on the space's verified custom domain when it has one.
export async function formUrl(space: { id: string; slug: string }, form: Pick<FormConfig, "isDefault" | "slug">): Promise<string> {
  const domain = await one<{ domain: string }>("select domain from domains where space_id = $1 and verified_at is not null", [space.id]);
  if (domain) return `https://${domain.domain}${form.isDefault ? "" : `/${form.slug}`}`;
  return `${env.appUrl}/${space.slug}${form.isDefault ? "" : `/${form.slug}`}`;
}

// {name} becomes the first name; without a name, "Hi {name}," reads "Hi,".
export function personalize(template: string, name: string, space: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return template
    .replace(/[ \t]*\{name\}/g, (m) => (first ? `${m.startsWith(" ") || m.startsWith("\t") ? " " : ""}${first}` : ""))
    .replace(/\{space\}/g, space);
}

export function defaultInvite(space: string) {
  return {
    subject: `A quick favour for ${space}?`,
    message: `Hi {name},\n\nThanks for using ${space}. Would you share a few words about your experience? It takes a minute.\n\nThank you!`,
  };
}

export async function sentToday(spaceId: string): Promise<number> {
  const row = await one<{ n: number }>(
    `select (count(*) filter (where sent_at > now() - interval '1 day') + count(*) filter (where reminded_at > now() - interval '1 day'))::int as n
     from invites where space_id = $1`,
    [spaceId],
  );
  return row?.n ?? 0;
}

// Hosted trials (billing on, not paid yet): people a space owner may invite per 24 hours across all their spaces, so a
// throwaway trial account can't be used to send bulk mail. Paid plans and self-hosted servers have the per-space limit
// only (MAX_INVITES_PER_SPACE_PER_DAY).
export const TRIAL_INVITES_PER_DAY = 50;

// Sent in the last 24 hours against the limit that leaves less room: the space's own, or (trial) its owner's.
export async function inviteQuota(space: { id: string; owner_id: string }): Promise<{ today: number; max: number }> {
  const own = { today: await sentToday(space.id), max: env.maxInvitesPerDay };
  if ((await planFor(space.owner_id))?.state !== "trialing") return own;
  const row = await one<{ n: number }>(
    `select count(*)::int as n from invites i join spaces s on s.id = i.space_id
     where s.owner_id = $1 and i.sent_at > now() - interval '1 day'`,
    [space.owner_id],
  );
  const trial = { today: row?.n ?? 0, max: TRIAL_INVITES_PER_DAY };
  return trial.max - trial.today < own.max - own.today ? trial : own;
}

function mailFor(
  invite: Pick<InviteRow, "id" | "email" | "name" | "subject" | "message" | "reply_to">,
  space: { name: string; address: string | null },
  url: string,
  language: string,
  reminder = false,
) {
  const token = inviteToken(invite.id);
  // Fixed-language forms send their button and footer in that language; "visitor's browser" forms in English.
  const { dict } = formLanguage(language === "auto" ? "en" : language, null);
  return inviteMail({
    to: invite.email,
    space: space.name,
    subject: `${reminder ? "Reminder: " : ""}${personalize(invite.subject, invite.name, space.name)}`.slice(0, 200),
    message: personalize(invite.message, invite.name, space.name),
    url: `${url}${url.includes("?") ? "&" : "?"}i=${encodeURIComponent(token)}`,
    pixelUrl: LEGAL.inviteTracking ? `${env.appUrl}/api/invites/open/${encodeURIComponent(token)}` : null,
    unsubscribeUrl: `${env.appUrl}/i/${encodeURIComponent(token)}`,
    oneClickUrl: `${env.appUrl}/api/invites/unsubscribe/${encodeURIComponent(token)}`,
    replyTo: invite.reply_to,
    buttonLabel: dict.mailButton,
    unsubscribeLabel: dict.mailUnsubscribe,
    footerLine: t(dict, "mailFooter", { space: space.name }),
    address: space.address,
  });
}

export type Recipient = { name: string; email: string };
export type SendReport = { sent: number; unsubscribed: number; duplicates: number; invalid: number; overLimit: number; outbox: string[] };

// Creates and queues invites. Skips bad addresses, repeats, people who unsubscribed, and anything over the daily limit.
export async function sendInvites(opts: {
  space: { id: string; name: string; slug: string; business_address?: string | null };
  form: FormConfig;
  recipients: Recipient[];
  subject: string;
  message: string;
  reminders: number;
  days: number;
  replyTo: string | null;
  // How many may still go out today (inviteQuota).
  room: number;
}): Promise<SendReport> {
  const report: SendReport = { sent: 0, unsubscribed: 0, duplicates: 0, invalid: 0, overLimit: 0, outbox: [] };
  const seen = new Set<string>();
  const list: Recipient[] = [];
  for (const r of opts.recipients) {
    const email = r.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) report.invalid++;
    else if (seen.has(email)) report.duplicates++;
    else {
      seen.add(email);
      list.push({ name: r.name.trim().slice(0, 80), email });
    }
  }
  const suppressed = new Set(
    (
      await q<{ email_hash: string }>("select email_hash from invite_suppressions where space_id = $1 and email_hash = any($2)", [
        opts.space.id,
        list.map((r) => emailHash(r.email)),
      ])
    ).map((r) => r.email_hash),
  );
  const sender = { name: opts.space.name, address: footerAddress(opts.space.business_address) };
  let room = Math.max(0, opts.room);
  const url = await formUrl(opts.space, opts.form);
  for (const r of list) {
    if (suppressed.has(emailHash(r.email))) {
      report.unsubscribed++;
      continue;
    }
    if (room <= 0) {
      report.overLimit++;
      continue;
    }
    const id = newId(16);
    const invite = { id, email: r.email, name: r.name, subject: opts.subject, message: opts.message, reply_to: opts.replyTo };
    await q(
      `insert into invites (id, space_id, form_id, name, email, subject, message, reply_to, reminders_left, remind_after_days, sent_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [id, opts.space.id, opts.form.id, r.name, r.email, opts.subject, opts.message, opts.replyTo, opts.reminders, opts.days],
    );
    report.outbox.push(await enqueue(mailFor(invite, sender, url, opts.form.language)));
    report.sent++;
    room--;
  }
  return report;
}

// Cron: one reminder per due invite (never to people who answered or unsubscribed), within each space's daily limit.
export async function sendDueReminders(limit = 50) {
  const rows = await q<
    InviteRow & {
      space_name: string;
      business_address: string | null;
      slug: string;
      is_default: boolean;
      form_slug: string;
      language: string;
    }
  >(
    `select i.*, s.name as space_name, s.business_address, s.slug, f.is_default, f.slug as form_slug, f.language
     from invites i join spaces s on s.id = i.space_id join forms f on f.id = i.form_id
     where i.reminders_left > 0 and i.submitted_at is null and i.unsubscribed_at is null and i.sent_at is not null
       and i.expires_at > now()
       and coalesce(i.reminded_at, i.sent_at) <= now() - make_interval(days => i.remind_after_days::int)
       and not exists (select 1 from invite_suppressions x where x.space_id = i.space_id and x.email_hash = ${emailHashSql("i.email")})
     order by coalesce(i.reminded_at, i.sent_at) limit $1`,
    [limit],
  );
  const room = new Map<string, number>();
  let sent = 0;
  for (const row of rows) {
    if (!room.has(row.space_id)) room.set(row.space_id, env.maxInvitesPerDay - (await sentToday(row.space_id)));
    if ((room.get(row.space_id) ?? 0) <= 0) continue;
    // Claim it first, so two cron runs never remind twice.
    const claimed = await one(
      `update invites set reminders_left = reminders_left - 1, reminders_sent = reminders_sent + 1, reminded_at = now()
       where id = $1 and reminders_left > 0 and submitted_at is null and unsubscribed_at is null returning id`,
      [row.id],
    );
    if (!claimed) continue;
    room.set(row.space_id, (room.get(row.space_id) ?? 0) - 1);
    const url = await formUrl({ id: row.space_id, slug: row.slug }, { isDefault: row.is_default, slug: row.form_slug });
    const id = await enqueue(mailFor(row, { name: row.space_name, address: footerAddress(row.business_address) }, url, row.language, true));
    await flushOne(id).catch(() => {});
    sent++;
  }
  return { due: rows.length, sent };
}

export async function markInvite(id: string, what: "opened" | "clicked") {
  if (what === "opened") await q("update invites set opened_at = coalesce(opened_at, now()) where id = $1", [id]);
  else await q("update invites set clicked_at = coalesce(clicked_at, now()), opened_at = coalesce(opened_at, now()) where id = $1", [id]);
}

export async function markSubmitted(id: string, testimonialId: string | null) {
  await q(
    `update invites set submitted_at = coalesce(submitted_at, now()), clicked_at = coalesce(clicked_at, now()),
       opened_at = coalesce(opened_at, now()), testimonial_id = coalesce($2, testimonial_id), reminders_left = 0
     where id = $1`,
    [id, testimonialId],
  );
}

// Stops every future invite from this space to this address.
export async function unsubscribe(invite: Pick<InviteRow, "id" | "space_id" | "email">) {
  await q("update invites set unsubscribed_at = coalesce(unsubscribed_at, now()), reminders_left = 0 where space_id = $1 and email = $2", [
    invite.space_id,
    invite.email,
  ]);
  await q("insert into invite_suppressions (space_id, email_hash) values ($1, $2) on conflict do nothing", [
    invite.space_id,
    emailHash(invite.email),
  ]);
}

export type InviteListItem = {
  id: string;
  name: string;
  email: string;
  form: string;
  status: InviteStatus;
  reminders: number;
  date: string;
};

export async function listInvites(spaceId: string): Promise<InviteListItem[]> {
  const rows = await q<InviteRow & { form_name: string }>(
    `select i.*, f.name as form_name from invites i join forms f on f.id = i.form_id
     where i.space_id = $1 order by i.created_at desc limit 300`,
    [spaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    form: r.form_name,
    status: inviteStatus(r),
    reminders: r.reminders_sent,
    date: new Date(r.submitted_at ?? r.clicked_at ?? r.opened_at ?? r.sent_at ?? r.created_at).toISOString(),
  }));
}
