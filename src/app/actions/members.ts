"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, guard, ok, type Result } from "@/lib/actions";
import { one, q, tx } from "@/lib/db";
import { findInvite, hashToken, INVITE_DAYS, newInviteToken, TOKEN_RE, type Invite } from "@/lib/data/members";
import { getMemberSpace, getOwnedSpace, requireRole } from "@/lib/data/spaces";
import { env } from "@/lib/env";
import { ID_RE, newId } from "@/lib/ids";
import { appLink, teamInviteMail } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { rateLimit, rateLimitAll } from "@/lib/rate-limit";
import { audit } from "@/lib/privacy";
import { actionUser } from "@/lib/session";

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Not a valid email"));
const idSchema = z.string().regex(ID_RE);
const userIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z-]+$/);

// Owner-only actions: a stranger gets "not found", an editor a plain refusal (checked here, not just hidden in the UI).
async function asOwner(spaceId: string) {
  const user = await actionUser();
  const space = await getOwnedSpace(user.id, spaceId);
  return { user, space, owner: requireRole(space, "owner") };
}

async function changeLimit(userId: string) {
  return (await rateLimit(`members:${userId}`, 60, 3600)).ok;
}

// Each invite sends an email, so sending is limited per person and per space.
async function sendLimit(userId: string, spaceId: string) {
  const limit = await rateLimitAll([
    [`invite:${userId}`, 20, 3600],
    [`invite-space:${spaceId}`, 50, 86400],
  ]);
  return limit.ok;
}

async function sendInvite(opts: { email: string; token: string; space: string; from: string }) {
  const outboxId = await enqueue(
    teamInviteMail({ to: opts.email, space: opts.space, from: opts.from, url: appLink(`/invite/${opts.token}`) }),
  );
  after(() => flushOne(outboxId).catch(() => {}));
}

export async function inviteMember(spaceId: string, email: string): Promise<Result<Invite>> {
  return guard(async () => {
    const { user, space, owner } = await asOwner(spaceId);
    if (!space) return fail("Not found");
    if (!owner) return fail("Only the owner can invite people");
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return fail("Not a valid email");
    const to = parsed.data;
    if (to === user.email.toLowerCase()) return fail("That’s you");
    if (
      await one("select 1 from space_members m join auth_users u on u.id = m.user_id where m.space_id = $1 and lower(u.email) = $2", [
        spaceId,
        to,
      ])
    ) {
      return fail("Already a member");
    }
    const count = await one<{ n: number }>(
      `select (select count(*) from space_members where space_id = $1) + (select count(*) from space_invites where space_id = $1 and expires_at > now() and email <> $2) as n`,
      [spaceId, to],
    );
    if (Number(count?.n ?? 0) >= env.maxMembersPerSpace) return fail(`Up to ${env.maxMembersPerSpace} people per space`);
    if (!(await sendLimit(user.id, spaceId))) return fail("Too many invites. Try again later.");
    const { token, hash } = newInviteToken();
    // Inviting the same address again replaces the old link.
    const row = await one<Invite>(
      `insert into space_invites (id, space_id, email, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
       on conflict (space_id, email) do update set token_hash = excluded.token_hash, invited_by = excluded.invited_by,
         expires_at = excluded.expires_at, created_at = now()
       returning id, email, expires_at as "expiresAt"`,
      [newId(12), spaceId, to, hash, user.id, INVITE_DAYS],
    );
    await sendInvite({ email: to, token, space: space.name, from: user.name || user.email });
    await audit({ spaceId, actorId: user.id, action: "member.invite", target: row!.id });
    return ok(row!);
  });
}

export async function resendInvite(spaceId: string, inviteId: string): Promise<Result<Invite>> {
  return guard(async () => {
    const { user, space, owner } = await asOwner(spaceId);
    if (!space) return fail("Not found");
    if (!owner) return fail("Only the owner can invite people");
    if (!idSchema.safeParse(inviteId).success) return fail("Not found");
    if (!(await sendLimit(user.id, spaceId))) return fail("Too many invites. Try again later.");
    const { token, hash } = newInviteToken();
    const row = await one<Invite>(
      `update space_invites set token_hash = $3, invited_by = $4, expires_at = now() + make_interval(days => $5), created_at = now()
       where id = $1 and space_id = $2 returning id, email, expires_at as "expiresAt"`,
      [inviteId, spaceId, hash, user.id, INVITE_DAYS],
    );
    if (!row) return fail("Not found");
    await sendInvite({ email: row.email, token, space: space.name, from: user.name || user.email });
    return ok(row);
  });
}

export async function revokeInvite(spaceId: string, inviteId: string): Promise<Result> {
  return guard(async () => {
    const { user, space, owner } = await asOwner(spaceId);
    if (!space) return fail("Not found");
    if (!owner) return fail("Only the owner can manage members");
    if (!idSchema.safeParse(inviteId).success) return fail("Not found");
    if (!(await changeLimit(user.id))) return fail("Too many changes. Try again later.");
    await q("delete from space_invites where id = $1 and space_id = $2", [inviteId, spaceId]);
    return ok(null);
  });
}

// Hands the space to another member. They pay for it from now on (hosted); the old owner stays as an editor.
export async function makeOwner(spaceId: string, memberId: string): Promise<Result> {
  return guard(async () => {
    const { user, space, owner } = await asOwner(spaceId);
    if (!space) return fail("Not found");
    if (!owner) return fail("Only the owner can change roles");
    if (!userIdSchema.safeParse(memberId).success || memberId === user.id) return fail("Not found");
    if (!(await changeLimit(user.id))) return fail("Too many changes. Try again later.");
    if (!(await one("select 1 from space_members where space_id = $1 and user_id = $2", [spaceId, memberId]))) return fail("Not found");
    // The spaces trigger moves the 'owner' role along with owner_id (see migration 0010).
    const moved = await q("update spaces set owner_id = $2, updated_at = now() where id = $1 and owner_id = $3 returning id", [
      spaceId,
      memberId,
      user.id,
    ]);
    if (!moved.length) return fail("Not found");
    await audit({ spaceId, actorId: user.id, action: "member.owner", target: memberId });
    revalidatePath("/app", "layout");
    return ok(null);
  });
}

export async function removeMember(spaceId: string, memberId: string): Promise<Result> {
  return guard(async () => {
    const { user, space, owner } = await asOwner(spaceId);
    if (!space) return fail("Not found");
    if (!owner) return fail("Only the owner can remove people");
    if (!userIdSchema.safeParse(memberId).success || memberId === user.id) return fail("Not found");
    if (!(await changeLimit(user.id))) return fail("Too many changes. Try again later.");
    const rows = await q("delete from space_members where space_id = $1 and user_id = $2 and role <> 'owner' returning user_id", [
      spaceId,
      memberId,
    ]);
    if (!rows.length) return fail("Not found");
    // Access goes with the person: API keys they made for this space stop working too.
    await q("delete from api_keys where space_id = $1 and created_by = $2", [spaceId, memberId]);
    await audit({ spaceId, actorId: user.id, action: "member.remove", target: memberId });
    return ok(null);
  });
}

// Editors can leave any time, even when the space is locked. The owner hands the space over (or deletes it) instead.
export async function leaveSpace(spaceId: string): Promise<Result> {
  return guard(async () => {
    const user = await actionUser();
    const space = await getMemberSpace(user.id, spaceId);
    if (!space) return fail("Not found");
    if (space.role === "owner") return fail("Make someone else the owner first");
    if (!(await changeLimit(user.id))) return fail("Too many changes. Try again later.");
    await q("delete from space_members where space_id = $1 and user_id = $2 and role <> 'owner'", [spaceId, user.id]);
    await q("delete from api_keys where space_id = $1 and created_by = $2", [spaceId, user.id]);
    await audit({ spaceId, actorId: user.id, action: "member.leave", target: user.id });
    revalidatePath("/app", "layout");
    return ok(null);
  });
}

// Joining needs the invited address: the sign-in code proves the person owns it, so a forwarded or leaked link
// can't be used by anyone else. Each link works once.
export async function acceptInvite(token: string): Promise<Result<{ spaceId: string }>> {
  return guard(async () => {
    const user = await actionUser();
    const limit = await rateLimit(`invite-accept:${user.id}`, 20, 3600);
    if (!limit.ok) return fail("Too many tries. Try again later.");
    if (!TOKEN_RE.test(String(token))) return fail("This invite has expired");
    const invite = await findInvite(token);
    if (!invite) return fail("This invite has expired");
    if (invite.email !== user.email.toLowerCase()) return fail(`This invite is for ${invite.email}`);
    const joined = await tx(async (c) => {
      const used = await c.query("delete from space_invites where id = $1 and token_hash = $2 returning space_id", [
        invite.id,
        hashToken(token),
      ]);
      if (!used.rowCount) return false;
      await c.query(
        "insert into space_members (space_id, user_id, role) values ($1, $2, 'editor') on conflict (space_id, user_id) do nothing",
        [invite.spaceId, user.id],
      );
      return true;
    });
    if (!joined) return fail("This invite has expired");
    revalidatePath("/app", "layout");
    return ok({ spaceId: invite.spaceId });
  });
}
