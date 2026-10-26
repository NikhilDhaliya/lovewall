// Where to send someone after signing in: only a path on this site. Plain module: the unit tests import it.
// Browsers drop tabs and newlines inside URLs and treat "\" like "/", so "/\t/evil.com" or "/\evil.com" would turn
// into "//evil.com" (another site): anything but plain printable characters is refused before parsing.
export function safeNext(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string" || next.length > 2000) return fallback;
  if (!/^\/(?![/\\])[\x21-\x7e]*$/.test(next) || next.includes("\\")) return fallback;
  try {
    const base = "http://lovewall.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
