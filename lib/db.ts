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
