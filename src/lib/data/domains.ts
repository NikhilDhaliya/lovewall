import "server-only";
import { createHmac } from "node:crypto";
import dns from "node:dns";
import { one, q } from "@/lib/db";
import { env } from "@/lib/env";

// `txt` proves the domain is this space's: a CNAME alone would let anyone claim a domain that points at us (one
// someone else is setting up, or one left pointing here after it was removed).
export type DomainInfo = { domain: string; verified: boolean; checkedAt: string | null; txt: { name: string; value: string } };

export function ownershipRecord(spaceId: string, domain: string) {
  const token = createHmac("sha256", process.env.BETTER_AUTH_SECRET || "lovewall")
    .update(`domain:${spaceId}:${domain}`)
    .digest("base64url")
    .slice(0, 32);
  return { name: `_lovewall.${domain}`, value: `lovewall-verify=${token}` };
}

export async function getDomain(spaceId: string): Promise<DomainInfo | null> {
  const row = await one<{ domain: string; verified_at: string | null; checked_at: string | null }>(
    "select domain, verified_at, checked_at from domains where space_id = $1",
    [spaceId],
  );
  return row
    ? {
        domain: row.domain,
        verified: Boolean(row.verified_at),
        checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
        txt: ownershipRecord(spaceId, row.domain),
      }
    : null;
}

// A DoH JSON query (DNS_OVER_HTTPS_URL replaces the system resolver when set).
async function doh(base: string, name: string, type: "CNAME" | "TXT", code: number): Promise<string[]> {
  const url = new URL(base);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const res = await fetch(url, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { Answer?: { type: number; data: string }[] };
  return (data.Answer ?? []).filter((a) => a.type === code).map((a) => String(a.data));
}

// The CNAME targets of a host.
export async function cnameTargets(domain: string): Promise<string[]> {
  const clean = (s: string) => s.toLowerCase().replace(/\.$/, "");
  if (process.env.DNS_OVER_HTTPS_URL) return (await doh(process.env.DNS_OVER_HTTPS_URL, domain, "CNAME", 5)).map(clean);
  try {
    return (await dns.promises.resolveCname(domain)).map(clean);
  } catch {
    return [];
  }
}

// The TXT strings of a name (each record's chunks joined, quotes removed).
export async function txtRecords(name: string): Promise<string[]> {
  if (process.env.DNS_OVER_HTTPS_URL)
    return (await doh(process.env.DNS_OVER_HTTPS_URL, name, "TXT", 16)).map((s) => s.replace(/"\s*"|"/g, ""));
  try {
    return (await dns.promises.resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

export async function verifyDns(spaceId: string, domain: string): Promise<boolean> {
  const proof = ownershipRecord(spaceId, domain);
  const [cname, txt] = await Promise.all([cnameTargets(domain), txtRecords(proof.name)]);
  const ok = cname.includes(env.customDomainTarget) && txt.includes(proof.value);
  await q(
    `update domains set checked_at = now(), verified_at = case when $3 then coalesce(verified_at, now()) else null end
     where space_id = $1 and domain = $2`,
    [spaceId, domain, ok],
  );
  return ok;
}

// ---------- Vercel (hosted): the domain must be added to the project so Vercel serves it and issues TLS ----------

function vercel() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  const team = process.env.VERCEL_TEAM_ID;
  const base = (process.env.VERCEL_API_URL || "https://api.vercel.com").replace(/\/$/, "");
  return { token, project: encodeURIComponent(project), query: team ? `?teamId=${encodeURIComponent(team)}` : "", base };
}

export const vercelEnabled = () => vercel() !== null;

// The token never leaves the server: errors carry only the status code.
export async function vercelAddDomain(domain: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = vercel();
  if (!v) return { ok: true };
  const res = await fetch(`${v.base}/v10/projects/${v.project}/domains${v.query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${v.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: domain }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) return { ok: false, error: "Couldn’t reach Vercel. Try again." };
  if (res.ok) return { ok: true };
  if (res.status === 409) {
    // Already on this project is fine; on another project it is not.
    const own = await fetch(`${v.base}/v9/projects/${v.project}/domains/${encodeURIComponent(domain)}${v.query}`, {
      headers: { Authorization: `Bearer ${v.token}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    return own?.ok ? { ok: true } : { ok: false, error: "That domain is in use elsewhere" };
  }
  return { ok: false, error: `Vercel refused the domain (${res.status})` };
}

export async function vercelRemoveDomain(domain: string) {
  const v = vercel();
  if (!v) return;
  await fetch(`${v.base}/v9/projects/${v.project}/domains/${encodeURIComponent(domain)}${v.query}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${v.token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}
