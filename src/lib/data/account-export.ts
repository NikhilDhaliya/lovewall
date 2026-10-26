import "server-only";
import { q } from "@/lib/db";
import { presignDownload, storageConfigured } from "@/lib/storage";

// Everything an account holds, as one JSON document (the privacy policy's "export everything"): the account, its
// sign-in methods and sessions, the plan, every space it owns with all of that space's rows, its memberships in
// other spaces, and a manifest of files with download links that work for a day. Secrets never leave: key and token
// hashes, webhook secrets.

// By name, so a secret column added later is left out too: hashes, secrets, tokens, passwords, encrypted values.
const SECRET_COLUMN = /(^|_)(hash|secret|password|token|enc|encrypted|cipher|iv)$|^(secret|token|password)_/;
const FILE_LINK_SECONDS = 24 * 3600;

const clean = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLUMN.test(k))));

// Every table that hangs off a space (found from the schema, so tables added later are exported too).
async function spaceTables(): Promise<string[]> {
  const rows = await q<{ table_name: string }>(
    `select c.table_name from information_schema.columns c join information_schema.tables t
       on t.table_name = c.table_name and t.table_schema = c.table_schema
     where c.table_schema = current_schema() and c.column_name = 'space_id' and t.table_type = 'BASE TABLE'
     order by c.table_name`,
  );
  return rows.map((r) => r.table_name).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n));
}

export async function accountExport(user: { id: string; email: string }) {
  const [account] = await q(`select id, email, name, image, "emailVerified", "createdAt", "updatedAt" from auth_users where id = $1`, [
    user.id,
  ]);
  const signIns = await q(
    `select "providerId" as provider, "accountId" as account_id, scope, "createdAt" from auth_accounts where "userId" = $1`,
    [user.id],
  );
  const sessions = await q(
    `select "createdAt", "updatedAt", "expiresAt", "ipAddress" as ip_hash, "userAgent" from auth_sessions where "userId" = $1 order by "createdAt" desc`,
    [user.id],
  );
  const subscriptions = clean(await q("select * from subscriptions where user_id = $1", [user.id]));
  const memberships = await q(
    `select s.id as space_id, s.name, m.role, m.created_at as joined_at from space_members m join spaces s on s.id = m.space_id
     where m.user_id = $1 and s.owner_id <> $1 order by m.created_at`,
    [user.id],
  );
  const owned = await q<{ id: string }>("select * from spaces where owner_id = $1 order by created_at", [user.id]);
  const tables = (await spaceTables()).filter((t) => t !== "spaces");
  const spaces = [];
  for (const space of owned) {
    const data: Record<string, unknown> = {};
    for (const table of tables) data[table] = clean(await q(`select * from "${table}" where space_id = $1`, [space.id]));
    data.form_views = await q("select v.* from form_views v join forms f on f.id = v.form_id where f.space_id = $1", [space.id]);
    spaces.push({ space: clean([space])[0], ...data });
  }
  const files: { key: string; kind: string; content_type: string; size: number; url: string | null }[] = [];
  if (owned.length) {
    const uploads = await q<{ key: string; kind: string; content_type: string; size: number }>(
      "select key, kind, content_type, size from uploads where space_id = any($1) and claimed_at is not null order by created_at",
      [owned.map((s) => s.id)],
    );
    for (const u of uploads) {
      const url = storageConfigured()
        ? await presignDownload(u.key, u.key.split("/").pop() ?? "file", FILE_LINK_SECONDS).catch(() => null)
        : null;
      files.push({ ...u, url });
    }
  }
  const activity = await q(
    "select space_id, action, target, detail, created_at from audit_log where actor_id = $1 order by created_at desc",
    [user.id],
  );
  return {
    exported_at: new Date().toISOString(),
    format: "lovewall-account-export/1",
    account,
    sign_in_methods: signIns,
    sessions,
    subscriptions,
    spaces,
    memberships,
    activity,
    files: { links_valid_hours: FILE_LINK_SECONDS / 3600, items: files },
  };
}
