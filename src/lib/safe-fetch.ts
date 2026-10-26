import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { isPrivateAddress, isPrivateLiteral } from "@/lib/net";

// Server-side fetch for user-supplied URLs. Every DNS answer is checked at connect time (so DNS rebinding can't
// swap in a private address), redirects are followed by hand and re-checked, and time and size are capped.

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      const e = new Error(`Blocked address for ${hostname}`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e, "");
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

export type SafeResponse = { status: number; contentType: string; body: Buffer; url: string };

export class FetchBlockedError extends Error {}

type Request = { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> };

function once(
  url: URL,
  opts: {
    timeoutMs: number;
    maxBytes: number;
    accept?: string;
    trusted?: boolean;
    post?: { body: string; headers: Record<string, string> };
  } & Request,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const body = opts.post?.body ?? opts.body;
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: opts.post ? "POST" : (opts.method ?? "GET"),
        lookup: opts.trusted ? undefined : (safeLookup as unknown as typeof dns.lookup),
        timeout: opts.timeoutMs,
        headers: {
          ...opts.headers,
          ...opts.post?.headers,
          "User-Agent": "LovewallBot/1.0 (+https://github.com/NikhilDhaliya/lovewall)",
          Accept: opts.accept ?? "*/*",
          ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
        },
      },
      (res) => {
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > opts.maxBytes) {
          req.destroy();
          return reject(new FetchBlockedError("Response too large"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            req.destroy();
            reject(new FetchBlockedError("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Timed out")), opts.timeoutMs);
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    // The address actually connected to, checked once more: Node skips `lookup` for IP literals ("http://127.0.0.1",
    // "http://[::1]", "http://2130706433"), so this is the check that catches them, on every hop.
    if (!opts.trusted) {
      req.on("socket", (socket) => {
        const check = () => {
          const address = socket.remoteAddress;
          if (!address || isPrivateAddress(address)) req.destroy(Object.assign(new Error("Blocked address"), { code: "EBLOCKED" }));
        };
        if (socket.remoteAddress) check();
        else socket.once("connect", check);
      });
    }
    req.on("error", (e) => {
      clearTimeout(timer);
      reject((e as NodeJS.ErrnoException).code === "EBLOCKED" ? new FetchBlockedError(e.message) : e);
    });
    req.on("close", () => clearTimeout(timer));
    req.end(body);
  });
}

function withoutCredentials(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !/^(authorization|cookie|proxy-authorization)$|key|token|secret/i.test(name)),
  );
}

// `trusted` skips the address checks; only for endpoints that come from operator config, never from users.
// POST requests (APIs with fixed hosts) don't follow redirects.
export async function safeFetch(
  input: string,
  opts: {
    timeoutMs?: number;
    maxBytes?: number;
    accept?: string;
    maxRedirects?: number;
    trusted?: boolean;
    // A POST with this body (webhooks). Redirects are never followed for a POST: the 3xx is the answer.
    post?: { body: string; headers: Record<string, string> };
  } & Request = {},
): Promise<SafeResponse> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchBlockedError("Invalid URL");
  }
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlockedError("Only http and https");
    if (url.username || url.password) throw new FetchBlockedError("No credentials in URLs");
    if (!opts.trusted && url.port && url.port !== "80" && url.port !== "443") throw new FetchBlockedError("Port not allowed");
    if (!opts.trusted && isPrivateLiteral(url)) throw new FetchBlockedError("Blocked address");
    const res = await once(url, { ...opts, timeoutMs, maxBytes });
    if (!opts.post && (opts.method ?? "GET") === "GET" && res.status >= 300 && res.status < 400 && res.headers.location) {
      const next = new URL(res.headers.location, url);
      // Keys and credentials meant for one API never follow a redirect to another host.
      if (next.host !== url.host && opts.headers) opts = { ...opts, headers: withoutCredentials(opts.headers) };
      url = next;
      continue;
    }
    return { status: res.status, contentType: String(res.headers["content-type"] ?? ""), body: res.body, url: url.toString() };
  }
  throw new FetchBlockedError("Too many redirects");
}
