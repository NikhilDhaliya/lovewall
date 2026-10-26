import { createHash } from "node:crypto";
import { THEME_BOOT } from "./theme-boot";
import { WIDGET_SCRIPT } from "./widget/render";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
export const THEME_HASH = sha(THEME_BOOT);
export const WIDGET_HASH = sha(WIDGET_SCRIPT);

function storage(): string {
  const endpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET ?? "";
  if (!endpoint) return "https://*.amazonaws.com";
  try {
    const url = new URL(endpoint);
    const list = [url.origin];
    if (process.env.S3_FORCE_PATH_STYLE !== "true" && bucket) list.push(`${url.protocol}//${bucket}.${url.host}`);
    return list.join(" ");
  } catch {
    return "";
  }
}

const dev = process.env.NODE_ENV === "development";

// Files are served from the app's own origin (/api/files). Pages on a custom domain load them from there.
function appOrigin(): string {
  try {
    return new URL(process.env.APP_URL ?? "").origin;
  } catch {
    return "";
  }
}
const https = (process.env.APP_URL ?? "").startsWith("https://");

// App pages (dynamic): per-request nonce + strict-dynamic. Marketing and wall pages (static/ISR): no nonce exists
// at build time, so inline scripts are allowed there; they render no user HTML.
export function pageCsp(opts: { nonce?: string; framable?: boolean }) {
  const s = `${storage()} ${appOrigin()}`.trim();
  const script = opts.nonce
    ? `'self' 'nonce-${opts.nonce}' 'strict-dynamic' ${THEME_HASH} ${WIDGET_HASH}${dev ? " 'unsafe-eval'" : ""}`
    : `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${s}`,
    `media-src 'self' blob: ${s}`,
    "font-src 'self' data:",
    `connect-src 'self' ${s}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${opts.framable ? "*" : "'none'"}`,
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

// The embed document: only its own script (by hash), its inline styles, files, and its analytics beacon.
export function embedCsp() {
  const s = storage();
  return [
    "default-src 'none'",
    `script-src ${WIDGET_HASH}`,
    "style-src 'unsafe-inline'",
    `img-src 'self' data: ${s}`,
    `media-src 'self' ${s}`,
    // The analytics beacon (/api/e) is on this origin.
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors *",
  ].join("; ");
}
