"use server";

import { z } from "zod";
import { fail, guard, ok, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { getDomain, vercelAddDomain, vercelRemoveDomain, verifyDns, type DomainInfo } from "@/lib/data/domains";
import { getOwnedSpace, requireRole } from "@/lib/data/spaces";
import { isPlatformHost, normalizeDomain } from "@/lib/domains";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";

async function owned(spaceId: string, action: string, max: number) {
  const user = await actionUser();
  // Owner only: integrations send the space's data elsewhere; a domain changes where the space lives.
  const space = requireRole(await getOwnedSpace(user.id, spaceId), "owner");
  const limit = space ? await rateLimit(`domains:${action}:${user.id}`, max, 3600) : null;
  return { space, limited: limit ? !limit.ok : false };
}

export async function saveDomain(spaceId: string, input: string): Promise<Result<DomainInfo>> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "save", 20);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many changes. Try again later.");
    const raw = z.string().max(300).safeParse(input);
    const domain = raw.success ? normalizeDomain(raw.data) : null;
    if (!domain) return fail("A domain like love.acme.com");
    const appHost = new URL(env.appUrl).host;
    if (isPlatformHost(domain, appHost) || domain.endsWith(`.${new URL(env.appUrl).hostname}`)) return fail("Use a domain you own");
    // A verified domain belongs to its space. An unverified claim holds nothing: only the space whose TXT record is in
    // the domain's DNS can verify, so a claim made to block the real owner is simply replaced.
    if (await one("select 1 from domains where domain = $1 and space_id <> $2 and verified_at is not null", [domain, spaceId]))
      return fail("That domain is taken");
    const current = await getDomain(spaceId);
    if (current?.domain === domain) return ok(current);
    const added = await vercelAddDomain(domain);
    if (!added.ok) return fail(added.error);
    if (current) await vercelRemoveDomain(current.domain);
    await q("delete from domains where domain = $1 and space_id <> $2 and verified_at is null", [domain, spaceId]);
    await q(
      `insert into domains (domain, space_id) values ($1, $2)
       on conflict (space_id) do update set domain = excluded.domain, verified_at = null, checked_at = null, created_at = now()`,
      [domain, spaceId],
    );
    return ok((await getDomain(spaceId))!);
  });
}

export async function checkDomain(spaceId: string): Promise<Result<DomainInfo>> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "verify", 60);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many checks. Try again later.");
    const current = await getDomain(spaceId);
    if (!current) return fail("Add a domain first");
    await verifyDns(spaceId, current.domain);
    return ok((await getDomain(spaceId))!);
  });
}

export async function removeDomain(spaceId: string): Promise<Result> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "remove", 20);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many changes. Try again later.");
    const current = await getDomain(spaceId);
    if (current) await vercelRemoveDomain(current.domain);
    await q("delete from domains where space_id = $1", [spaceId]);
    return ok(null);
  });
}
