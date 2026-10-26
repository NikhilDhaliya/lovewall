"use server";

import { z } from "zod";
import { fail, limitUser, firstIssue, guard, ok, type Result } from "@/lib/actions";
import { listKeys, MAX_KEYS_PER_SPACE, newKey, type ApiKeyRow, type Scope } from "@/lib/api/keys";
import { one, q } from "@/lib/db";
import { getOwnedSpace, requireRole } from "@/lib/data/spaces";
import { ID_RE, newId } from "@/lib/ids";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { checkChatTarget } from "@/lib/webhook-format";
import { audit } from "@/lib/privacy";
import { actionUser } from "@/lib/session";
import { nameSchema } from "@/lib/validation";
import {
  CHAT_KINDS,
  deliverMany,
  EVENTS,
  getDelivery,
  listDeliveries,
  listHooks,
  MAX_HOOKS_PER_SPACE,
  newSecret,
  seal,
  sendTest,
  targetSchema,
  type ChatKind,
  type DeliveryView,
  type HookView,
} from "@/lib/webhooks";

export type KeyItem = { id: string; name: string; scope: Scope; prefix: string; lastUsedAt: string | null; createdAt: string };

const toItem = (k: ApiKeyRow): KeyItem => ({
  id: k.id,
  name: k.name,
  scope: k.scope,
  prefix: `lw_${k.prefix}`,
  lastUsedAt: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
  createdAt: new Date(k.created_at).toISOString(),
});

async function owned(spaceId: string) {
  const user = await actionUser();
  await limitUser(user.id);
  // Owner only: integrations send the space's data elsewhere; a domain changes where the space lives.
  const space = requireRole(await getOwnedSpace(user.id, spaceId), "owner");
  return { user, space };
}

const validId = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

async function hookOf(spaceId: string, id: string) {
  const hooks = await listHooks(spaceId);
  return hooks.find((h) => h.id === id) ?? null;
}

// ---------- API keys ----------

const keySchema = z.object({ name: nameSchema, scope: z.enum(["read", "write"]) });

// The key itself is returned once, here; only its hash is stored.
export async function createApiKey(
  spaceId: string,
  input: { name: string; scope: Scope },
): Promise<Result<{ key: string; item: KeyItem }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = keySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const limit = await rateLimit(`api-key-create:${user.id}`, 30, 3600);
    if (!limit.ok) return fail("Too many new keys. Try again later.");
    const count = await one<{ n: number }>("select count(*)::int as n from api_keys where space_id = $1", [spaceId]);
    if ((count?.n ?? 0) >= MAX_KEYS_PER_SPACE) return fail(`Up to ${MAX_KEYS_PER_SPACE} keys per space`);
    const { key, prefix, hash } = newKey();
    const row = await one<ApiKeyRow>(
      `insert into api_keys (id, space_id, name, scope, prefix, hash, created_by) values ($1, $2, $3, $4, $5, $6, $7)
       returning id, space_id, name, scope, prefix, last_used_at, created_at`,
      [newId(12), spaceId, parsed.data.name, parsed.data.scope, prefix, hash, user.id],
    );
    await audit({ spaceId, actorId: user.id, action: "apikey.create", target: row!.id, detail: { scope: parsed.data.scope } });
    return ok({ key, item: toItem(row!) });
  });
}

// Revoking deletes the key; its REST Hook subscriptions (Zapier, Make) go with it.
export async function revokeApiKey(spaceId: string, id: string): Promise<Result> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space || !validId(id)) return fail("Not found");
    const gone = await one("delete from api_keys where id = $1 and space_id = $2 returning id", [id, spaceId]);
    if (gone) await audit({ spaceId, actorId: user.id, action: "apikey.revoke", target: id });
    return gone ? ok(null) : fail("Not found");
  });
}

export async function loadKeys(spaceId: string): Promise<Result<KeyItem[]>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space) return fail("Not found");
    return ok((await listKeys(spaceId)).map(toItem));
  });
}

// ---------- Webhooks ----------

const eventsSchema = z.array(z.enum(EVENTS)).min(1, "Pick at least one event").max(EVENTS.length);

// The signing secret is returned once, here (and by rollWebhookSecret); it is stored encrypted.
export async function addWebhook(
  spaceId: string,
  input: { url: string; events: string[] },
): Promise<Result<{ hook: HookView; secret: string }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space) return fail("Not found");
    const url = targetSchema.safeParse(input.url);
    if (!url.success) return fail(firstIssue(url.error));
    const events = eventsSchema.safeParse(input.events);
    if (!events.success) return fail(firstIssue(events.error));
    const limit = await rateLimit(`webhook-create:${user.id}`, 30, 3600);
    if (!limit.ok) return fail("Too many at once. Try again later.");
    const count = await one<{ n: number }>("select count(*)::int as n from webhooks where space_id = $1", [spaceId]);
    if ((count?.n ?? 0) >= MAX_HOOKS_PER_SPACE) return fail(`Up to ${MAX_HOOKS_PER_SPACE} webhooks per space`);
    const secret = newSecret();
    const id = newId(12);
    // created_by: the hook goes when this person leaves the space or deletes their account (like their API keys).
    await q("insert into webhooks (id, space_id, kind, url, events, secret, created_by) values ($1, $2, 'webhook', $3, $4, $5, $6)", [
      id,
      spaceId,
      url.data,
      [...new Set(events.data)],
      seal(secret),
      user.id,
    ]);
    return ok({ hook: (await hookOf(spaceId, id))!, secret });
  });
}

export async function updateWebhook(spaceId: string, id: string, input: { url: string; events: string[] }): Promise<Result<HookView>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space || !validId(id)) return fail("Not found");
    const url = targetSchema.safeParse(input.url);
    if (!url.success) return fail(firstIssue(url.error));
    const events = eventsSchema.safeParse(input.events);
    if (!events.success) return fail(firstIssue(events.error));
    const row = await one(
      // Whoever points it somewhere new answers for it from now on.
      `update webhooks set url = $3, events = $4, created_by = case when url = $3 then created_by else $5 end, updated_at = now()
       where id = $1 and space_id = $2 and kind = 'webhook' returning id`,
      [id, spaceId, url.data, [...new Set(events.data)], user.id],
    );
    if (!row) return fail("Not found");
    return ok((await hookOf(spaceId, id))!);
  });
}

export async function rollWebhookSecret(spaceId: string, id: string): Promise<Result<{ secret: string }>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space || !validId(id)) return fail("Not found");
    const secret = newSecret();
    const row = await one(
      "update webhooks set secret = $3, updated_at = now() where id = $1 and space_id = $2 and kind = 'webhook' returning id",
      [id, spaceId, seal(secret)],
    );
    return row ? ok({ secret }) : fail("Not found");
  });
}

export async function deleteWebhook(spaceId: string, id: string): Promise<Result> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space || !validId(id)) return fail("Not found");
    const gone = await one("delete from webhooks where id = $1 and space_id = $2 returning id", [id, spaceId]);
    return gone ? ok(null) : fail("Not found");
  });
}

export async function loadHooks(spaceId: string): Promise<Result<HookView[]>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space) return fail("Not found");
    return ok(await listHooks(spaceId));
  });
}

export async function loadDeliveries(spaceId: string, hookId: string): Promise<Result<DeliveryView[]>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space || !validId(hookId)) return fail("Not found");
    return ok(await listDeliveries(spaceId, hookId));
  });
}

// Sends a sample event (or a hello message to Slack/Discord) and waits for the answer.
export async function sendWebhookTest(spaceId: string, hookId: string): Promise<Result<DeliveryView>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space || !validId(hookId)) return fail("Not found");
    if (!(await one("select 1 from webhooks where id = $1 and space_id = $2", [hookId, spaceId]))) return fail("Not found");
    const limit = await rateLimit(`webhook-test:${spaceId}`, 30, 600);
    if (!limit.ok) return fail("Too many tests. Try again in a few minutes.");
    const id = await sendTest(spaceId, hookId);
    return ok((await getDelivery(spaceId, id))!);
  });
}

export async function retryDelivery(spaceId: string, deliveryId: string): Promise<Result<DeliveryView>> {
  return guard(async () => {
    const { space } = await owned(spaceId);
    if (!space || !/^msg_[0-9A-Za-z]{24}$/.test(String(deliveryId))) return fail("Not found");
    const row = await one<{ delivered_at: string | null }>("select delivered_at from webhook_deliveries where id = $1 and space_id = $2", [
      deliveryId,
      spaceId,
    ]);
    if (!row) return fail("Not found");
    if (row.delivered_at) return fail("Already delivered");
    const limit = await rateLimit(`webhook-retry:${spaceId}`, 60, 600);
    if (!limit.ok) return fail("Too many retries. Try again in a few minutes.");
    await deliverMany([deliveryId]);
    return ok((await getDelivery(spaceId, deliveryId))!);
  });
}

// ---------- Slack and Discord ----------

// Connects (or replaces) the space's Slack or Discord incoming webhook and sends a hello message.
export async function connectChat(spaceId: string, kind: ChatKind, url: string): Promise<Result<{ hook: HookView; test: DeliveryView }>> {
  return guard(async () => {
    const { user, space } = await owned(spaceId);
    if (!space || !(CHAT_KINDS as readonly string[]).includes(kind)) return fail("Not found");
    const parsed = targetSchema.safeParse(url);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const chat = checkChatTarget(kind, parsed.data, env.webhooksAllowPrivate);
    if (chat) return fail(chat);
    const limit = await rateLimit(`chat-connect:${user.id}`, 30, 3600);
    if (!limit.ok) return fail("Too many at once. Try again later.");
    const row = await one<{ id: string }>(
      `insert into webhooks (id, space_id, kind, url, events, created_by) values ($1, $2, $3, $4, '{testimonial.created}', $5)
       on conflict (space_id, kind) where kind in ('slack', 'discord')
       do update set url = excluded.url, created_by = excluded.created_by, updated_at = now()
       returning id`,
      [newId(12), spaceId, kind, parsed.data, user.id],
    );
    const testId = await sendTest(spaceId, row!.id);
    return ok({ hook: (await hookOf(spaceId, row!.id))!, test: (await getDelivery(spaceId, testId))! });
  });
}
