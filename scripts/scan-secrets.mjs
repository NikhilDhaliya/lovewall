// Scans the build output that reaches browsers (.next/static, prerendered HTML/RSC) and, optionally, live responses
// for server env values. Prints variable names only, never values. Usage: node scripts/scan-secrets.mjs [baseUrl ...paths]
import fs from "node:fs";
import path from "node:path";

// Values that are public by design (they appear in pages, CSP headers or URLs).
const PUBLIC = new Set([
  "APP_URL",
  "NODE_ENV",
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_BUCKET",
  "S3_REGION",
  "S3_FORCE_PATH_STYLE",
  "MAIL_FROM",
  "LEGAL_PAGES",
  "CUSTOM_DOMAIN_TARGET",
  "POLAR_SERVER",
  "MAIL_DRIVER",
  "SMTP_PORT",
  "SMTP_SECURE",
  "TRUST_PROXY",
  "TRUST_PROXY_HEADER",
  // A host name, not a secret (and "localhost" in development, which every page mentions).
  "SMTP_HOST",
]);

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnv(".env.local"), ...process.env };
const names = new Set(
  [
    ...fs.readFileSync(".env.example", "utf8").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm),
    ...fs.readFileSync("src/lib/env.ts", "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g),
  ].map((m) => m[1]),
);
// Short or common values (ports, "true", "1") would match everywhere and prove nothing.
const secrets = [...names].filter((n) => !PUBLIC.has(n) && env[n] && env[n].length >= 8).map((n) => [n, env[n]]);

function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(js|css|html|rsc|json|txt|body|meta|map)$/.test(e.name)) yield p;
  }
}

let leaks = 0;
function check(where, text) {
  for (const [name, value] of secrets) {
    if (text.includes(value)) {
      leaks++;
      console.log(`LEAK ${name} in ${where}`);
    }
  }
  // Server-only names showing up in client code at all (process.env.X left in a client chunk).
  if (where.includes("static")) {
    for (const n of names) if (!PUBLIC.has(n) && text.includes(`process.env.${n}`)) console.log(`NAME process.env.${n} in ${where}`);
  }
}

let count = 0;
for (const dir of [".next/static", ".next/server/app"]) {
  for (const f of files(dir)) {
    // Server bundles are not sent to browsers; only prerendered output in server/app is (html, rsc, body, meta).
    if (dir.endsWith("app") && !/\.(html|rsc|body|meta)$/.test(f)) continue;
    count++;
    check(f, fs.readFileSync(f, "utf8"));
  }
}

const [base, ...paths] = process.argv.slice(2);
if (base) {
  for (const p of paths) {
    const res = await fetch(base + p, { redirect: "manual" });
    const text = (await res.text()) + JSON.stringify([...res.headers]);
    count++;
    check(`${p} (${res.status})`, text);
  }
}
console.log(`checked ${secrets.length} secret values against ${count} files/responses: ${leaks} leaks`);
process.exit(leaks ? 1 : 0);
