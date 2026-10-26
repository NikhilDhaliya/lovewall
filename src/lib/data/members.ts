import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fileUrl } from "@/lib/data/files";
import { one, q } from "@/lib/db";
import type { Role } from "@/lib/types";

export type Member = { id: string; name: string; email: string; image: string | null; role: Role };
export type Invite = { id: string; email: string; expiresAt: string };

export const INVITE_DAYS = 7;

export async function listMembers(spaceId: string): Promise<Member[]> {
  return q<Member>(
    `select u.id, u.name, u.email, u.image, m.role from space_members m join auth_users u on u.id = m.user_id
     where m.space_id = $1 order by m.role = 'owner' desc, m.created_at`,
    [spaceId],
  );
}

export async function listInvites(spaceId: string): Promise<Invite[]> {
  return q<Invite>(
    `select id, email, expires_at as "expiresAt" from space_invites where space_id = $1 and expires_at > now() order by created_at`,
    [spaceId],
  );
}

// Invite links carry 256 random bits; only the SHA-256 is stored, so a database leak can't be turned into links.
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type InviteView = { id: string; spaceId: string; spaceName: string; logo: string | null; email: string; from: string };

// A live (unexpired, unused) invite by its token, with what the invite page shows.
export async function findInvite(token: string): Promise<InviteView | null> {
  if (!TOKEN_RE.test(token)) return null;
  const row = await one<{
    id: string;
    space_id: string;
    space_name: string;
    logo_key: string | null;
    email: string;
    from_name: string | null;
  }>(
    `select i.id, i.space_id, s.name as space_name, s.logo_key, i.email, coalesce(nullif(u.name, ''), u.email) as from_name
     from space_invites i join spaces s on s.id = i.space_id left join auth_users u on u.id = i.invited_by
     where i.token_hash = $1 and i.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) return null;
  return {
    id: row.id,
    spaceId: row.space_id,
    spaceName: row.space_name,
    logo: fileUrl(row.logo_key),
    email: row.email,
    from: row.from_name ?? "Someone",
  };
}
