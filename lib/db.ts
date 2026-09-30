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
