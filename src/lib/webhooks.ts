import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { queueAi } from "@/lib/ai/jobs";
import { toApi } from "@/lib/api/shape";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { FetchBlockedError, safeFetch } from "@/lib/safe-fetch";
import type { Testimonial } from "@/lib/types";
import type { HookKind, WebhookEvent } from "@/lib/webhook-events";
import { checkTarget, clip, discordMessage, maskUrl, sign, slackMessage, type Payload } from "@/lib/webhook-format";
import { logError } from "@/lib/log";

// Outgoing webhooks: signed JSON for endpoints (Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature),
// chat messages for Slack and Discord. Every change is queued in webhook_deliveries, tried once right after the
// response, then retried with backoff by the maintenance cron. Deliveries go through safe-fetch (no private
// addresses, no redirects, capped time and size).

export { CHAT_KINDS, EVENT_LABELS, EVENTS } from "@/lib/webhook-events";
export { maskUrl, sign } from "@/lib/webhook-format";
export type { ChatKind, HookKind, WebhookEvent } from "@/lib/webhook-events";

export const MAX_HOOKS_PER_SPACE = 20;
export const MAX_ATTEMPTS = 8;
// Minutes to wait after attempt n (1-based) before the next one: about 30 hours in all.
const BACKOFF = [1, 5, 30, 120, 300, 600, 720];
// Deliveries tried at once right after a change; any more wait for the cron.
const IMMEDIATE = 50;
// More new testimonials than this at once (an import) become one chat message instead of one each.
const CHAT_BATCH = 10;

// ---------- Secrets ----------

// whsec_ + base64 of 24 random bytes (the Standard Webhooks format).
export function newSecret() {
  return `whsec_${randomBytes(24).toString("base64")}`;
}

// Secrets are needed in clear to sign, so they are encrypted at rest (AES-256-GCM, key derived from
// BETTER_AUTH_SECRET) rather than hashed. Changing BETTER_AUTH_SECRET means rolling every webhook secret.
const boxKey = () => createHash("sha256").update(`lovewall:webhook-secret:${env.authSecret}`).digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", boxKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`;
}

export function unseal(sealed: string): string {
  const raw = Buffer.from(sealed.replace(/^v1\./, ""), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", boxKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

// ---------- Targets ----------

export const targetSchema = z
  .string()
  .trim()
  .min(1, "Add a link")
  .max(500, "That link is too long")
  .superRefine((value, ctx) => {
    const problem = checkTarget(value, env.webhooksAllowPrivate);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((value) => new URL(value).toString());

// ---------- Emitting ----------

const msgId = () => `msg_${newId(24)}`;

// Queues events for every endpoint of the space that wants them, then tries them right after the response.
// `items` are testimonial rows, or ids to load. Never throws: a webhook problem must not fail the change itself.
export async function emitTestimonialEvent(spaceId: string, events: WebhookEvent | WebhookEvent[], items: Testimonial[] | string[]) {
  try {
    const types = Array.isArray(events) ? events : [events];
    // New testimonials also get their AI work queued (spam, sentiment, best line, transcript), when a key is set.
    if (types.includes("testimonial.created")) {
      await queueAi(
        spaceId,
        items.map((t) => (typeof t === "string" ? t : t.id)),
      ).catch((e) => console.error("AI queue:", e instanceof Error ? e.message : e));
    }
    if (!items.length || !types.length) return;
    // The giver's email goes only to REST Hook subscriptions made with a read and write key.
    const hooks = await q<{ id: string; kind: HookKind; events: WebhookEvent[]; email: boolean }>(
      `select w.id, w.kind, w.events, coalesce(k.scope = 'write', false) as email
       from webhooks w left join api_keys k on k.id = w.api_key_id
       where w.space_id = $1 and w.events && $2::text[] order by w.created_at`,
      [spaceId, types],
    );
    if (!hooks.length) return;
    const rows =
      typeof items[0] === "string"
        ? await q<Testimonial>("select * from testimonials where space_id = $1 and id = any($2) order by created_at", [spaceId, items])
        : (items as Testimonial[]);
    if (!rows.length) return;
    const timestamp = new Date().toISOString();
    const plain = rows.map((t) => toApi(t));
    const full = hooks.some((h) => h.email) ? rows.map((t) => toApi(t, true)) : plain;
    const ids: string[] = [];
    const hookIds: string[] = [];
    const names: string[] = [];
    const bodies: string[] = [];
    for (const hook of hooks) {
      const chat = hook.kind === "slack" || hook.kind === "discord";
      const data = hook.email ? full : plain;
      for (const type of types.filter((t) => hook.events.includes(t))) {
        const list: Payload[] =
          chat && data.length > CHAT_BATCH
            ? [{ type, timestamp, data: { count: data.length, inbox_url: `${env.appUrl}/app/${spaceId}` } }]
            : data.map((d) => ({ type, timestamp, data: d }));
        for (const payload of list) {
          ids.push(msgId());
          hookIds.push(hook.id);
          names.push(type);
          bodies.push(JSON.stringify(payload));
        }
      }
    }
    if (!ids.length) return;
    // Leased for two minutes: the attempt below runs first; if this instance dies, the cron picks it up.
    await q(
      `insert into webhook_deliveries (id, webhook_id, space_id, event, payload, next_at)
       select id, hook, $1, event, body::jsonb, now() + interval '2 minutes'
       from unnest($2::text[], $3::text[], $4::text[], $5::text[]) as t(id, hook, event, body)`,
      [spaceId, ids, hookIds, names, bodies],
    );
    const now = ids.slice(0, IMMEDIATE);
    after(() => deliverMany(now).catch(() => {}));
  } catch (error) {
    logError("webhooks", error);
  }
}

// ---------- Delivering ----------

type DueRow = {
  id: string;
  webhook_id: string;
  event: string;
  payload: Payload;
  attempts: number;
  kind: HookKind;
  url: string;
  secret: string | null;
  space_name: string;
};

const DUE_SELECT = `d.id, d.webhook_id, d.event, d.payload, d.attempts, w.kind, w.url, w.secret, s.name as space_name
  from webhook_deliveries d join webhooks w on w.id = d.webhook_id join spaces s on s.id = d.space_id`;

function request(row: DueRow): { body: string; headers: Record<string, string> } {
  if (row.kind === "slack")
    return { body: JSON.stringify(slackMessage(row.payload, row.space_name)), headers: { "Content-Type": "application/json" } };
  if (row.kind === "discord")
    return { body: JSON.stringify(discordMessage(row.payload, row.space_name)), headers: { "Content-Type": "application/json" } };
  const body = JSON.stringify(row.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "webhook-id": row.id,
    "webhook-timestamp": String(timestamp),
  };
  if (row.secret) headers["webhook-signature"] = sign(unseal(row.secret), row.id, timestamp, body);
  return { body, headers };
}

// A short reason for the log, never the target URL or anything secret.
function reason(error: unknown): string {
  if (error instanceof FetchBlockedError) return /address|Port/.test(error.message) ? "Blocked address" : clip(error.message, 80);
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Host not found";
  if (code === "ECONNREFUSED") return "Connection refused";
  if (code === "ECONNRESET") return "Connection reset";
  if (/timed out/i.test(String((error as Error).message))) return "Timed out";
  if (/certificate|SSL|TLS/i.test(String((error as Error).message))) return "TLS error";
  return "Request failed";
}

async function attempt(row: DueRow): Promise<boolean> {
  const started = Date.now();
  let status: number | null = null;
  let error: string | null = null;
  try {
    const { body, headers } = request(row);
    const res = await safeFetch(row.url, {
      post: { body, headers },
      timeoutMs: 10_000,
      maxBytes: 256 * 1024,
      trusted: env.webhooksAllowPrivate,
    });
    status = res.status;
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (e) {
    error = reason(e);
  }
  const duration = Date.now() - started;
  const tries = row.attempts + 1;
  if (!error) {
    await q(
      `update webhook_deliveries set attempts = $2, delivered_at = now(), attempted_at = now(), next_at = null, status_code = $3,
         last_error = null, duration_ms = $4 where id = $1`,
      [row.id, tries, status, duration],
    );
    return true;
  }
  const delay = tries >= MAX_ATTEMPTS ? null : BACKOFF[Math.min(tries, BACKOFF.length) - 1];
  await q(
    `update webhook_deliveries set attempts = $2, attempted_at = now(), status_code = $3, last_error = $4, duration_ms = $5,
       next_at = case when $6::int is null then null else now() + make_interval(mins => $6::int) end where id = $1`,
    [row.id, tries, status, error, duration, delay],
  );
  // REST Hooks: 410 Gone means the subscriber (Zapier, Make) is gone. Remove the subscription.
  if (row.kind === "rest" && status === 410) await q("delete from webhooks where id = $1 and kind = 'rest'", [row.webhook_id]);
  return false;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// Tries these deliveries now (claimed so a concurrent cron run skips them).
export async function deliverMany(ids: string[]) {
  if (!ids.length) return 0;
  const rows = await q<DueRow>(
    `with claimed as (
       update webhook_deliveries set next_at = now() + interval '2 minutes'
       where id = any($1) and delivered_at is null returning id
     ) select ${DUE_SELECT} where d.id in (select id from claimed)`,
    [ids],
  );
  let delivered = 0;
  await pool(rows, 5, async (row) => {
    if (await attempt(row)) delivered++;
  });
  return delivered;
}

// The cron: deliveries whose retry time has come.
export async function deliverDue(limit = 50) {
  const rows = await q<DueRow>(
    `with claimed as (
       update webhook_deliveries set next_at = now() + interval '2 minutes'
       where id in (select id from webhook_deliveries where next_at <= now() and delivered_at is null order by next_at limit $1 for update skip locked)
       returning id
     ) select ${DUE_SELECT} where d.id in (select id from claimed)`,
    [limit],
  );
  let delivered = 0;
  await pool(rows, 5, async (row) => {
    if (await attempt(row)) delivered++;
  });
  return { due: rows.length, delivered };
}

// "Send test": one delivery of a sample event, tried at once.
export async function sendTest(spaceId: string, hookId: string): Promise<string> {
  const sample = await q<Testimonial>("select * from testimonials where space_id = $1 order by created_at desc limit 1", [spaceId]);
  const now = new Date().toISOString();
  const data = sample[0]
    ? toApi(sample[0])
    : {
        id: "sample",
        status: "approved",
        featured: false,
        rating: 5,
        text: "This is a test event from Lovewall.",
        name: "Ada Lovelace",
        title: "Founder",
        company: "Analytical Engines",
        handle: null,
        avatar_url: null,
        video_url: null,
        image_url: null,
        source: "Form",
        source_url: null,
        tags: [],
        given_at: now,
        created_at: now,
        updated_at: now,
        inbox_url: `${env.appUrl}/app/${spaceId}`,
      };
  const id = msgId();
  await q(
    `insert into webhook_deliveries (id, webhook_id, space_id, event, payload, next_at) values ($1, $2, $3, 'webhook.test', $4, now() + interval '2 minutes')`,
    [id, hookId, spaceId, JSON.stringify({ type: "webhook.test", timestamp: now, data })],
  );
  await deliverMany([id]);
  return id;
}

// ---------- Reading (settings UI) ----------

export type DeliveryView = {
  id: string;
  event: string;
  state: "delivered" | "pending" | "failed";
  code: number | null;
  error: string | null;
  attempts: number;
  at: string;
  ms: number | null;
};

type DeliveryRow = {
  id: string;
  event: string;
  delivered_at: string | null;
  next_at: string | null;
  status_code: number | null;
  last_error: string | null;
  attempts: number;
  created_at: string;
  attempted_at: string | null;
  duration_ms: number | null;
};

export function toDeliveryView(r: DeliveryRow): DeliveryView {
  return {
    id: r.id,
    event: r.event,
    state: r.delivered_at ? "delivered" : r.next_at ? "pending" : "failed",
    code: r.status_code,
    error: r.last_error,
    attempts: r.attempts,
    at: new Date(r.attempted_at ?? r.created_at).toISOString(),
    ms: r.duration_ms,
  };
}

export async function listDeliveries(spaceId: string, hookId: string, limit = 25): Promise<DeliveryView[]> {
  const rows = await q<DeliveryRow>(
    `select id, event, delivered_at, next_at, status_code, last_error, attempts, created_at, attempted_at, duration_ms
     from webhook_deliveries where space_id = $1 and webhook_id = $2 order by created_at desc limit $3`,
    [spaceId, hookId, limit],
  );
  return rows.map(toDeliveryView);
}

export async function getDelivery(spaceId: string, id: string): Promise<DeliveryView | null> {
  const rows = await q<DeliveryRow>(
    `select id, event, delivered_at, next_at, status_code, last_error, attempts, created_at, attempted_at, duration_ms
     from webhook_deliveries where space_id = $1 and id = $2`,
    [spaceId, id],
  );
  return rows[0] ? toDeliveryView(rows[0]) : null;
}

export type HookView = {
  id: string;
  kind: HookKind;
  url: string;
  events: WebhookEvent[];
  createdAt: string;
  last: DeliveryView | null;
};

export async function listHooks(spaceId: string): Promise<HookView[]> {
  const rows = await q<{ id: string; kind: HookKind; url: string; events: WebhookEvent[]; created_at: string; last: DeliveryRow | null }>(
    `select w.id, w.kind, w.url, w.events, w.created_at,
       (select row_to_json(d) from (
          select id, event, delivered_at, next_at, status_code, last_error, attempts, created_at, attempted_at, duration_ms
          from webhook_deliveries where webhook_id = w.id order by created_at desc limit 1) d) as last
     from webhooks w where w.space_id = $1 order by w.created_at`,
    [spaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    // Owner-added endpoints show in full; chat and REST Hook URLs are credentials, so only a hint.
    url: r.kind === "webhook" ? r.url : maskUrl(r.url),
    events: r.events,
    createdAt: new Date(r.created_at).toISOString(),
    last: r.last ? toDeliveryView(r.last) : null,
  }));
}
