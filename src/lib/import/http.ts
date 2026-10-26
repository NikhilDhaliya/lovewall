import "server-only";
import { FetchBlockedError, safeFetch, type SafeResponse } from "@/lib/safe-fetch";
import { GoneError, ImportError } from "./types";

// Requests to official feeds, APIs and oEmbed endpoints. Every one goes through safeFetch (SSRF-safe, size and time
// caps) and says who we are.

// Tests send every request to a mock: https://host/path → <IMPORT_TEST_ENDPOINT>/host/path. Operator config only.
export function route(url: string): { url: string; trusted: boolean } {
  const base = process.env.IMPORT_TEST_ENDPOINT;
  if (!base) return { url, trusted: false };
  const u = new URL(url);
  return { url: `${base.replace(/\/$/, "")}/${u.host}${u.pathname}${u.search}`, trusted: true };
}

// gone: the statuses that mean the thing isn't there (404 and 410; oEmbed endpoints add 401 and 403 for private posts).
export type RequestOptions = { accept?: string; maxBytes?: number; timeoutMs?: number; gone?: number[] };

export async function request(site: string, url: string, opts: RequestOptions = {}): Promise<SafeResponse> {
  const r = route(url);
  let res: SafeResponse;
  try {
    res = await safeFetch(r.url, {
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxBytes: opts.maxBytes ?? 3 * 1024 * 1024,
      accept: opts.accept,
      headers: { "Accept-Language": "en" },
      trusted: r.trusted,
    });
  } catch (error) {
    if (error instanceof FetchBlockedError && /too large/i.test(error.message)) throw new ImportError(`${site} sent too much`);
    throw new ImportError(`Couldn't reach ${site}. Try again.`);
  }
  if (res.status === 429) throw new ImportError(`${site} is busy. Try again later.`);
  if ((opts.gone ?? [404, 410]).includes(res.status)) throw new GoneError("Nothing found at that link");
  if (res.status < 200 || res.status >= 300) throw new ImportError(`${site} didn't answer. Try again.`);
  return res;
}

export async function getText(site: string, url: string, opts: RequestOptions = {}): Promise<string> {
  return (await request(site, url, { accept: "application/xml,text/xml,*/*;q=0.8", ...opts })).body.toString("utf8");
}

export async function getJson<T>(site: string, url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(site, url, { accept: "application/json", ...opts });
  try {
    return JSON.parse(res.body.toString("utf8")) as T;
  } catch {
    throw new ImportError(`${site} sent something unexpected`);
  }
}
