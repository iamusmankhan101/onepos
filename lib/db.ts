import { createClient, type Client } from "@libsql/client";

// Create the client at module load time with a fallback URL so the module can
// be imported during `next build` without throwing.  No network connection is
// made until the first call to db.execute() / db.batch() etc., which only
// happens at request time when the real env vars are present.
export const db: Client = createClient({
  url:       process.env.TURSO_DATABASE_URL ?? "http://localhost:8080",
  authToken: process.env.TURSO_AUTH_TOKEN,
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
  const raw = process.env.TURSO_DATABASE_URL;
  let where = "(TURSO_DATABASE_URL not set)";
  if (raw) {
    try {
      const url = new URL(raw);
      where = url.protocol === "file:" ? `file:${url.pathname}` : `${url.protocol}//${url.host}`;
    } catch {
      where = "(unparseable TURSO_DATABASE_URL)";
    }
  }
  return { db: where, instance: INSTANCE_ID, bootedAt: BOOTED_AT, region: process.env.VERCEL_REGION ?? null };
}
