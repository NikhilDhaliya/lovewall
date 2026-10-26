// Server logs: the error's name, message, database error code and stack, with email addresses and keys masked.
// Never the database driver's `detail`/`where` (they quote row values) or request bodies.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const KEYS = /\b(lw_[0-9A-Za-z]{8})[0-9A-Za-z]{32}\b|\b(sk-ant-|polar_[a-z]+_|whsec_|Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g;

export function redact(text: string): string {
  return text
    .replace(EMAIL, "<email>")
    .replace(KEYS, (_m, prefix: string | undefined, kind: string | undefined) => `${prefix ?? kind ?? ""}<redacted>`);
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return redact(String(error));
  const code = (error as { code?: unknown }).code;
  const head = `${error.name}${typeof code === "string" ? ` [${code}]` : ""}: ${error.message}`;
  const stack = error.stack?.split("\n").slice(1, 8).join("\n");
  return redact(stack ? `${head}\n${stack}` : head);
}

export function logError(scope: string, error: unknown) {
  console.error(`[${scope}] ${describeError(error)}`);
}
