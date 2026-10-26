import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { pgConnection } from "../../scripts/db-ssl.mjs";

// One pool per server instance (kept across hot reloads in dev). Small, because serverless functions are many.
const globalForDb = globalThis as unknown as { lovewallPool?: Pool };

// Created lazily and never connects at import time, so `next build` works without a database.
export function pool(): Pool {
  if (!globalForDb.lovewallPool) {
    // TLS follows sslmode in DATABASE_URL, as in libpq (see scripts/db-ssl.mjs).
    const { connectionString, ssl } = pgConnection(process.env.DATABASE_URL ?? "");
    globalForDb.lovewallPool = new Pool({
      connectionString,
      ssl,
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForDb.lovewallPool;
}

function check() {
  if (!process.env.DATABASE_URL) throw new Error("Missing env DATABASE_URL");
}

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  check();
  const { rows } = await pool().query<T>(sql, params);
  return rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  check();
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
