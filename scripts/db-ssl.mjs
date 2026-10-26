// TLS for Postgres connections, with libpq's meaning of sslmode (in DATABASE_URL, else PGSSLMODE). Used by the app
// (src/lib/db.ts) and by scripts/migrate.mjs, so both connect the same way.
//   no sslmode, disable  plain connection
//   require              encrypted, the server's certificate is not checked (stops eavesdropping, not impersonation)
//   verify-ca            encrypted, the certificate must chain to the CA
//   verify-full          verify-ca, and the certificate must name the host (recommended)
// The CA is DATABASE_CA_CERT (PEM text, or the path of a PEM file), else sslrootcert in the URL, else the system's CAs.
// allow and prefer (try one, fall back to the other) are refused: node-postgres can't fall back, so they would quietly
// mean something else.
import { readFileSync } from "node:fs";

const TLS_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl", "uselibpqcompat"];

/** @param {string} value PEM text or a file path */
function pem(value) {
  return value.includes("-----BEGIN") ? value.replace(/\\n/g, "\n") : readFileSync(value, "utf8");
}

/**
 * @param {string} url DATABASE_URL
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ connectionString: string | undefined, ssl: false | import("node:tls").ConnectionOptions }}
 */
export function pgConnection(url, env = process.env) {
  if (!url) return { connectionString: undefined, ssl: false };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL (a key=value string): pg reads it as it is.
    return { connectionString: url, ssl: false };
  }
  const params = parsed.searchParams;
  const mode = (params.get("sslmode") || env.PGSSLMODE || "disable").toLowerCase();
  const rootcert = params.get("sslrootcert");
  const cert = params.get("sslcert");
  const key = params.get("sslkey");
  // Our settings below replace these: pg would otherwise let the URL override them, with its own meanings.
  for (const name of TLS_PARAMS) params.delete(name);
  const connectionString = parsed.toString();

  if (mode === "disable") return { connectionString, ssl: false };
  if (!["require", "verify-ca", "verify-full"].includes(mode))
    throw new Error(`DATABASE_URL: sslmode=${mode} isn't supported. Use verify-full (recommended), verify-ca, require or disable.`);

  /** @type {import("node:tls").ConnectionOptions} */
  const ssl = {};
  const ca = env.DATABASE_CA_CERT?.trim() || (rootcert && rootcert !== "system" ? rootcert : "");
  if (ca) ssl.ca = pem(ca);
  if (cert) ssl.cert = readFileSync(cert, "utf8");
  if (key) ssl.key = readFileSync(key, "utf8");
  if (mode === "require") ssl.rejectUnauthorized = false;
  else {
    ssl.rejectUnauthorized = true;
    // verify-ca checks the chain only; verify-full also checks the host name (Node's default).
    if (mode === "verify-ca") ssl.checkServerIdentity = () => undefined;
  }
  return { connectionString, ssl };
}
