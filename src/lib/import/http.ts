import "server-only";
import { FetchBlockedError, safeFetch, type SafeResponse } from "@/lib/safe-fetch";
import { BlockedError, ImportError } from "./types";

// Requests to review sites and APIs. Every one goes through safeFetch (SSRF-safe, size and time caps) and says who
// we are; a site that answers with a bot wall is reported as blocked. API keys travel in headers, never in URLs, so
// they can't end up in an error or a log line.

// Tests send every request to a mock: https://host/path → <IMPORT_TEST_ENDPOINT>/host/path. Operator config only.
export function route(url: string): { url: string; trusted: boolean } {
  const base = process.env.IMPORT_TEST_ENDPOINT;
  if (!base) return { url, trusted: false };
  const u = new URL(url);
  return { url: `${base.replace(/\/$/, "")}/${u.host}${u.pathname}${u.search}`, trusted: true };
}

export type RequestOptions = {
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  // Keyed APIs answer 401/403 for a bad key: let the caller read those instead of calling it a block.
  raw?: boolean;
};

const WALL = /captcha|cf-chl|challenge-platform|Just a moment|Attention Required|Verifying Connection|datadome|enable JS and disable/i;

export async function request(site: string, url: string, opts: RequestOptions = {}): Promise<SafeResponse> {
  const r = route(url);
  let res: SafeResponse;
  try {
    res = await safeFetch(r.url, {
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxBytes: opts.maxBytes ?? 3 * 1024 * 1024,
      accept: opts.accept,
      method: opts.method,
      body: opts.body,
      headers: { "Accept-Language": "en", ...opts.headers },
      trusted: r.trusted,
    });
  } catch (error) {
    if (error instanceof FetchBlockedError && /too large/i.test(error.message)) throw new ImportError(`${site} sent too much`);
    throw new ImportError(`Couldn't reach ${site}. Try again.`);
  }
  if (opts.raw) return res;
  if (res.status === 401 || res.status === 403) throw new BlockedError(site);
  if (res.status === 429) throw new ImportError(`${site} is busy. Try again later.`);
  if (/html/i.test(res.contentType) && WALL.test(res.body.subarray(0, 6000).toString("utf8"))) throw new BlockedError(site);
  if (res.status === 404 || res.status === 410) throw new ImportError("Nothing found at that link");
  if (res.status < 200 || res.status >= 300) throw new ImportError(`${site} didn't answer. Try again.`);
  return res;
}

export async function getText(site: string, url: string, opts: RequestOptions = {}): Promise<string> {
  return (await request(site, url, { accept: "text/html,application/xhtml+xml,*/*;q=0.8", ...opts })).body.toString("utf8");
}

export async function getJson<T>(site: string, url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(site, url, { accept: "application/json", ...opts });
  return parseJson<T>(site, res.body.toString("utf8"));
}

export function parseJson<T>(site: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ImportError(`${site} sent something unexpected`);
  }
}
