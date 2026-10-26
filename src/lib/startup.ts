// Settings the server refuses to start with in production. Plain module: the unit tests import it.

type Env = Record<string, string | undefined>;

// A secret that is missing, short or still the example value from .env.example.
export function weakSecret(value: string | undefined, min = 32): boolean {
  return !value || value.trim().length < min || /replace-with/i.test(value);
}

// Problems that stop a production server: everything signed with BETTER_AUTH_SECRET (sessions, form stamps, giver and
// spin tokens, IP hashes) would be forgeable with a weak one.
export function startupProblems(env: Env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (weakSecret(env.BETTER_AUTH_SECRET))
    problems.push("BETTER_AUTH_SECRET is missing, shorter than 32 characters or the example value. Set one: openssl rand -base64 32");
  if (env.CRON_SECRET && weakSecret(env.CRON_SECRET, 12))
    problems.push("CRON_SECRET is shorter than 12 characters or the example value. Set one: openssl rand -base64 32");
  return problems;
}

// Settings that are fine for tests or a private single-tenant install, and dangerous on a shared server: they send
// user-given URLs or API traffic to fixed test endpoints without the SSRF checks, or let webhooks reach private hosts.
export function startupWarnings(env: Env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const testing = [
    "IMPORT_TEST_ENDPOINT",
    "X_OEMBED_ENDPOINT",
    "X_SYNDICATION_ENDPOINT",
    "POLAR_API_URL",
    "ANTHROPIC_BASE_URL",
    "DEEPGRAM_API_URL",
  ];
  const warnings = testing.filter((name) => env[name]).map((name) => `${name} is set: it is for tests only. Unset it in production.`);
  if (env.WEBHOOKS_ALLOW_PRIVATE === "1" || env.WEBHOOKS_ALLOW_PRIVATE === "true")
    warnings.push("WEBHOOKS_ALLOW_PRIVATE is on: every space can send webhooks to your private network. Only for a single-tenant install.");
  return warnings;
}
