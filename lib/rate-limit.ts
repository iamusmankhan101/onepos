/**
 * lib/rate-limit.ts
 *
 * Small in-memory, per-IP rate limiter for public/unauthenticated API routes
 * (signup, password change, public booking) to slow down brute-force and
 * spam-abuse attempts. Keyed by (bucket, ip) so different endpoints don't
 * share a counter. Resets on server restart — for multi-instance deployments
 * replace with Redis / Upstash.
 */

import { NextRequest } from "next/server";

interface RateEntry {
  attempts: number;
  windowStart: number;
  blockedUntil?: number;
}

export interface RateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
  blockMs?: number;
}

const DEFAULT_WINDOW_MS   = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BLOCK_MS    = 30 * 60 * 1000; // 30 minutes

const buckets = new Map<string, Map<string, RateEntry>>();

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Records one attempt for (bucket, key) and reports whether it should be blocked. */
export function rateLimit(
  bucket: string,
  key: string,
  opts: RateLimitOptions = {},
): { blocked: boolean; retryAfter?: number } {
  const windowMs    = opts.windowMs    ?? DEFAULT_WINDOW_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const blockMs     = opts.blockMs     ?? DEFAULT_BLOCK_MS;

  let store = buckets.get(bucket);
  if (!store) { store = new Map(); buckets.set(bucket, store); }

  const now = Date.now();
  const e = store.get(key);

  if (!e) {
    store.set(key, { attempts: 1, windowStart: now });
    return { blocked: false };
  }

  if (e.blockedUntil && now < e.blockedUntil) {
    return { blocked: true, retryAfter: Math.ceil((e.blockedUntil - now) / 1000) };
  }

  if (now - e.windowStart > windowMs) {
    store.set(key, { attempts: 1, windowStart: now });
    return { blocked: false };
  }

  e.attempts++;
  if (e.attempts > maxAttempts) {
    e.blockedUntil = now + blockMs;
    return { blocked: true, retryAfter: Math.ceil(blockMs / 1000) };
  }

  return { blocked: false };
}

/** Clear a (bucket, key) counter — call on success so legitimate users aren't penalized. */
export function rateLimitClear(bucket: string, key: string) {
  buckets.get(bucket)?.delete(key);
}

// Periodically prune stale entries across all buckets so the maps don't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const store of buckets.values()) {
    for (const [k, e] of store) {
      const expired   = now - e.windowStart > DEFAULT_WINDOW_MS * 2;
      const unblocked = !e.blockedUntil || now > e.blockedUntil;
      if (expired && unblocked) store.delete(k);
    }
  }
}, 10 * 60 * 1000);
