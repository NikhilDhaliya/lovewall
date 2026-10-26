import { webhooks } from "@polar-sh/sdk/2026-10";
import { one, q } from "@/lib/db";
import { env, polarEnv } from "@/lib/env";
import { ipKey } from "@/lib/ip";
import { saveSubscription } from "@/lib/polar";
import { rateLimit, tooMany } from "@/lib/rate-limit";

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
]);

// Polar webhooks (Standard Webhooks): the signature and its timestamp (5-minute window) are checked by the SDK with
// a constant-time HMAC compare before anything is parsed. Each delivery is handled once (webhook-id).
export async function POST(request: Request) {
  if (!env.billing || !polarEnv.webhookSecret) return new Response("Not found", { status: 404 });
  const limit = await rateLimit(`polar-webhook:${ipKey(request.headers)}`, 600, 60);
  if (!limit.ok) return tooMany(limit);
  if (Number(request.headers.get("content-length") ?? 0) > 512 * 1024) return new Response("Too large", { status: 413 });
  const body = await request.text();
  if (body.length > 512 * 1024) return new Response("Too large", { status: 413 });
  const id = request.headers.get("webhook-id") ?? "";
  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    event = await webhooks.validateEvent(
      body,
      {
        "webhook-id": id,
        "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
        "webhook-signature": request.headers.get("webhook-signature") ?? "",
      },
      polarEnv.webhookSecret,
    );
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError) return Response.json({ error: "Invalid signature" }, { status: 403 });
    // Signed, but a type this SDK version doesn't know: acknowledge so Polar stops retrying.
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) return new Response(null, { status: 202 });
    if (error instanceof webhooks.PolarWebhookError) return Response.json({ error: "Invalid payload" }, { status: 400 });
    throw error;
  }
  if (!SUBSCRIPTION_EVENTS.has(event.type)) return new Response(null, { status: 202 });

  // Already handled (Polar retries until it gets a 2xx).
  const fresh = await one("insert into billing_events (id, type) values ($1, $2) on conflict (id) do nothing returning id", [
    id.slice(0, 200),
    event.type,
  ]);
  if (!fresh) return new Response(null, { status: 202 });
  try {
    await saveSubscription(event.data);
  } catch (error) {
    // Let Polar retry this delivery.
    await q("delete from billing_events where id = $1", [id.slice(0, 200)]).catch(() => {});
    throw error;
  }
  return new Response(null, { status: 202 });
}
