import "server-only";
import { one, q } from "@/lib/db";
import { spaceLocked } from "@/lib/data/billing";
import type { Role, Space } from "@/lib/types";

// A space as one member sees it: the space plus their role in it.
export type MemberSpace = Space & { role: Role };
export type SpaceListItem = MemberSpace & { total: number; fresh: number };

// Every space the user is a member of (their own and the ones they were invited to), oldest first.
export async function listSpaces(userId: string): Promise<SpaceListItem[]> {
  return q<SpaceListItem>(
    `select s.*, m.role, coalesce(c.total, 0)::int as total, coalesce(c.fresh, 0)::int as fresh
     from space_members m
     join spaces s on s.id = m.space_id
     left join lateral (select count(*) as total, count(*) filter (where status = 'new') as fresh from testimonials t where t.space_id = s.id) c on true
     where m.user_id = $1 order by s.created_at`,
    [userId],
  );
}

// The space if the user is a member, with their role; someone else's space (or a bad id) is simply not found.
export async function getMemberSpace(userId: string, spaceId: string): Promise<MemberSpace | null> {
  if (!/^[0-9A-Za-z]{8,32}$/.test(spaceId)) return null;
  return one<MemberSpace>(
    "select s.*, m.role from space_members m join spaces s on s.id = m.space_id where m.space_id = $1 and m.user_id = $2",
    [spaceId, userId],
  );
}

// Every action goes through this: a space the user is a member of and may work in right now, with their role. Not a
// member (or a bad id) is not found; so is a space whose owner's hosted plan has ended (its dashboard is locked,
// while its public pages keep working). Owner-only actions also check requireRole().
export async function getOwnedSpace(userId: string, spaceId: string): Promise<MemberSpace | null> {
  const space = await getMemberSpace(userId, spaceId);
  if (!space || (await spaceLocked(space))) return null;
  return space;
}

// For owner-only actions (members, deleting the space): the space when the user has the role, else null.
export function requireRole<T extends { role: Role }>(space: T | null, role: Role): T | null {
  return space?.role === role ? space : null;
}

export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  return one<Space>("select * from spaces where slug = $1", [slug]);
}

export async function widgetIdsOf(spaceId: string): Promise<string[]> {
  const rows = await q<{ id: string }>("select id from widgets where space_id = $1", [spaceId]);
  return rows.map((r) => r.id);
}
