import { legalEnabledFor } from "@/lib/legal/config";

// Which mail driver runs, and whether the server may start with it. Plain module: the unit tests import it.

export type Driver = "zeptomail" | "smtp" | "log";
type MailEnv = Record<string, string | undefined>;

export function mailDriver(env: MailEnv): Driver {
  const d = env.MAIL_DRIVER;
  if (d === "zeptomail" || d === "smtp" || d === "log") return d;
  if (env.ZEPTOMAIL_API_KEY) return "zeptomail";
  if (env.SMTP_HOST) return "smtp";
  return "log";
}

// The "log" driver prints whole emails (sign-in codes included) to the server log. In production it is refused when
// asked for by name, and on the hosted service (billing on, or the legal pages' domain) whatever picked it. A
// self-hosted first run that has no mail set up yet only gets a warning.
export function mailStartupCheck(env: MailEnv): "ok" | "warn" | "fail" {
  if (env.NODE_ENV !== "production" || mailDriver(env) !== "log") return "ok";
  const hosted = Boolean(env.POLAR_ACCESS_TOKEN) || legalEnabledFor({ APP_URL: env.APP_URL, LEGAL_PAGES: "" });
  return env.MAIL_DRIVER === "log" || hosted ? "fail" : "warn";
}
