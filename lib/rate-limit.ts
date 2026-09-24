/**
 * lib/rate-limit.ts
 *
 * Rate limiter for public/unauthenticated API routes (sign-in, sign-up,
 * password change) to slow down brute-force and spam-abuse attempts. Keyed by
 * (bucket, key) so different endpoints don't share a counter.
 *
 * Counters live in the Turso database, not in process memory: production runs
 * on Vercel, where every serverless instance has its own memory and is thrown
 * away at will, so an in-memory Map let an attacker reset their count just by
 * landing on a fresh instance. Each attempt is one atomic UPSERT, so parallel
 * requests across instances can't race past the limit.
 */

import { NextRequest } from "next/server";
import { db } from "./db";

export interface RateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
  blockMs?: number;
}

const DEFAULT_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BLOCK_MS     = 30 * 60 * 1000; // 30 minutes

/**
 * The caller's IP. Vercel overwrites x-real-ip and x-forwarded-for with the
 * address it actually saw, so a client can't choose its own. Off Vercel, the
 * right-most x-forwarded-for entry is the one the nearest proxy appended — the
 * left-most (what this used to read) is whatever the client chose to send.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return hops?.at(-1) ?? "unknown";
}

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  tableReady ??= db.execute(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket        TEXT    NOT NULL,
      key           TEXT    NOT NULL,
      attempts      INTEGER NOT NULL,
      window_start  INTEGER NOT NULL,
      blocked_until INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket, key)
    )
  `).catch((err) => { tableReady = null; throw err; });
  return tableReady;
}

/** Records one attempt for (bucket, key) and reports whether it should be blocked. */
export async function rateLimit(
  bucket: string,
  key: string,
  opts: RateLimitOptions = {},
): Promise<{ blocked: boolean; retryAfter?: number }> {
  const now = Date.now();
  try {
    await ensureTable();
    // SET expressions all see the row as it was before this statement, so the
    // three CASEs agree: still blocked → leave it; window over → start a new
    // one; otherwise count the attempt and block once it passes the limit.
    const res = await db.execute({
      sql: `
        INSERT INTO rate_limits (bucket, key, attempts, window_start, blocked_until)
        VALUES (:bucket, :key, 1, :now, 0)
        ON CONFLICT (bucket, key) DO UPDATE SET
          attempts = CASE
            WHEN blocked_until > :now THEN attempts
            WHEN :now - window_start > :win THEN 1
            ELSE attempts + 1 END,
          window_start = CASE
            WHEN blocked_until > :now THEN window_start
            WHEN :now - window_start > :win THEN :now
            ELSE window_start END,
          blocked_until = CASE
            WHEN blocked_until > :now THEN blocked_until
            WHEN :now - window_start > :win THEN 0
            WHEN attempts + 1 > :max THEN :now + :block
            ELSE blocked_until END
        RETURNING blocked_until`,
      args: {
        bucket, key, now,
        win:   opts.windowMs    ?? DEFAULT_WINDOW_MS,
        max:   opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        block: opts.blockMs     ?? DEFAULT_BLOCK_MS,
      },
    });

    // Now and then, sweep rows nobody has touched in a day so the table stays small.
    if (Math.random() < 0.01) {
      db.execute({
        sql: "DELETE FROM rate_limits WHERE window_start < ? AND blocked_until < ?",
        args: [now - 24 * 60 * 60 * 1000, now],
      }).catch(() => {});
    }

    const blockedUntil = Number(res.rows[0]?.blocked_until ?? 0);
    return blockedUntil > now
      ? { blocked: true, retryAfter: Math.ceil((blockedUntil - now) / 1000) }
      : { blocked: false };
  } catch (err) {
    // Fail open: a database hiccup shouldn't lock every owner out of their till.
    // The routes behind this need the same database anyway, so they'll fail on
    // their own if it's really down.
    console.error("[rate-limit] check failed:", err);
    return { blocked: false };
  }
}

/** Clear a (bucket, key) counter — call on success so legitimate users aren't penalized. */
export async function rateLimitClear(bucket: string, key: string): Promise<void> {
  try {
    await ensureTable();
    await db.execute({ sql: "DELETE FROM rate_limits WHERE bucket = ? AND key = ?", args: [bucket, key] });
  } catch (err) {
    console.error("[rate-limit] clear failed:", err);
  }
}
