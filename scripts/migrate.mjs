// Applies db/migrations/*.sql in order, once each. Safe to run on every deploy: applied files are recorded in
// schema_migrations, an advisory lock stops two runs from racing, and each file runs in its own transaction.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const dir = join(root, "db", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const ssl = /sslmode=require/.test(url) || /supabase\.(co|com)/.test(url) ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: url, ssl });

await client.connect();
try {
  await client.query("select pg_advisory_lock(424242)");
  await client.query(
    "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await client.query("select filename from schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
      count++;
    } catch (error) {
      await client.query("rollback");
      console.error(`failed ${file}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (count === 0 && process.exitCode !== 1) console.log("database is up to date");
} finally {
  await client.query("select pg_advisory_unlock(424242)").catch(() => {});
  await client.end();
}
