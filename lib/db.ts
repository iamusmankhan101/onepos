import { createClient, type Client } from "@libsql/client";

// Create the client at module load time with a fallback URL so the module can
// be imported during `next build` without throwing.  No network connection is
// made until the first call to db.execute() / db.batch() etc., which only
// happens at request time when the real env vars are present.
//
// POINTLY_DB_URL / POINTLY_DB_TOKEN win over the TURSO_* pair. The Vercel Turso
// integration injects TURSO_* per deployment, pointing each deployment at its
// own fresh branch of the database — so every deploy silently discarded what
// was saved since the last one. Setting POINTLY_DB_* pins the app to one DB.
const DB_URL   = process.env.POINTLY_DB_URL || process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.POINTLY_DB_URL ? process.env.POINTLY_DB_TOKEN : process.env.TURSO_AUTH_TOKEN;

export const db: Client = createClient({
  url:       DB_URL ?? "http://localhost:8080",
  authToken: DB_TOKEN,
});

// Convenience accessor — same instance, kept for symmetry with callers that
// already use getDb() after the lazy-singleton refactor.
export function getDb(): Client {
  return db;
}

// Which database and which server instance answered — shown on the admin
// Billing tab so writes that seem to "undo" can be traced to a mismatched
// TURSO_DATABASE_URL or an instance with its own database. Host only, never
// the token.
const INSTANCE_ID = Math.random().toString(36).slice(2, 8);
const BOOTED_AT = new Date().toISOString();

export function dbInfo(): { db: string; instance: string; bootedAt: string; region: string | null } {
  const raw = DB_URL;
  let where = "(database URL not set)";
  if (raw) {
    try {
      const url = new URL(raw);
      where = url.protocol === "file:" ? `file:${url.pathname}` : `${url.protocol}//${url.host}`;
    } catch {
      where = "(unparseable database URL)";
    }
  }
  return { db: where, instance: INSTANCE_ID, bootedAt: BOOTED_AT, region: process.env.VERCEL_REGION ?? null };
}
