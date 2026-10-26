"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { fail, limitUser, firstIssue, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { q } from "@/lib/db";
import { trash } from "@/lib/data/trash";
import { env } from "@/lib/env";
import { enqueue, flushOne } from "@/lib/outbox";
import { cancelSubscriptions } from "@/lib/polar";
import { accountDeletedMail } from "@/lib/privacy-mail";
import { rateLimit } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import { spacePrefix, storageConfigured } from "@/lib/storage";
import { nameSchema } from "@/lib/validation";
import { logError } from "@/lib/log";
import { vercelRemoveDomain } from "@/lib/data/domains";
import { rememberSignup } from "@/lib/data/billing";

export async function updateName(name: string): Promise<Result> {
  return guard(async () => {
    const user = await actionUser();
    await limitUser(user.id, "account-name", 60);
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    await q(`update auth_users set name = $2, "updatedAt" = now() where id = $1`, [user.id, parsed.data]);
    return ok(null);
  });
}

// Deletes the account: the spaces it owns (testimonials, widgets, files), its memberships in other spaces with the API
// keys, webhooks and chat links it made there (foreign keys cascade), its sessions, mail still waiting to go out to it
// or on its behalf, and (hosted) its subscription. A last email confirms it.
export async function deleteAccount(): Promise<Result> {
  return guard(async () => {
    const user = await actionUser();
    const limit = await rateLimit(`account-delete:${user.id}`, 5, 3600);
    if (!limit.ok) return fail("Too many tries. Try again later.");
    if (env.billing) {
      try {
        await cancelSubscriptions(user.id);
      } catch (error) {
        logError("billing: cancel before account deletion", error);
        return fail("Couldn’t cancel your plan. Try again.");
      }
    }
    const spaces = await q<{ id: string }>("select id from spaces where owner_id = $1", [user.id]);
    for (const s of spaces) await refreshWidgets(s.id);
    // Custom domains come off the hosting project too (else they stay attached to it, pointing at nothing).
    const domains = await q<{ domain: string }>("select domain from domains where space_id = any($1)", [spaces.map((s) => s.id)]);
    for (const d of domains) await vercelRemoveDomain(d.domain);
    await auth.api.revokeSessions({ headers: await headers() }).catch(() => {});
    await q("delete from email_outbox where sent_at is null and (lower(to_email) = lower($1) or lower(reply_to) = lower($1))", [
      user.email,
    ]);
    // Hosted: the address's first sign-up date stays (as a hash), so signing up again doesn't start a new trial.
    if (env.billing) await rememberSignup(user.id);
    await q("delete from auth_users where id = $1", [user.id]);
    if (storageConfigured()) await trash(spaces.map((s) => spacePrefix(s.id)));
    const outboxId = await enqueue(accountDeletedMail({ to: user.email, spaces: spaces.length }));
    after(() => flushOne(outboxId).catch(() => {}));
    const jar = await cookies();
    for (const c of jar.getAll()) if (/^(__Secure-)?lovewall\./.test(c.name)) jar.delete(c.name);
    return ok(null);
  });
}
