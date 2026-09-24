/**
 * POST /api/auth/signin
 * Authenticate user with rate limiting and account lockout.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateCredentials } from "@/lib/auth-db";
import { createSessionToken, COOKIE_NAME, cookieOptions, tokenId } from "@/lib/session";
import { createDbSession, getEffectivePlan } from "@/lib/auth-db";
import { clientIp, rateLimit, rateLimitClear } from "@/lib/rate-limit";

const BLOCK_MS = 30 * 60 * 1000; // 30-minute lockout

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Check rate limit before doing any work
  const limit = await rateLimit("signin", ip, { maxAttempts: 10, blockMs: BLOCK_MS });
  if (limit.blocked) {
    const minutes = Math.ceil((limit.retryAfter ?? BLOCK_MS / 1000) / 60);
    return Response.json(
      { ok: false, error: `Too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`, retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 0) } },
    );
  }

  let body: { email?: unknown; password?: unknown; portal?: "admin" | "staff" };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { email, password } = body;

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return Response.json({ ok: false, error: "Missing email or password." }, { status: 400 });
  }
  // Nothing legitimate is this long; refusing early keeps a giant body from
  // being fed through 120k rounds of pbkdf2.
  if (email.length > 254 || password.length > 1024) {
    return Response.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }

  // A second counter per account, so guesses spread across many IPs still
  // slow down on the account they target. Looser than the per-IP limit and a
  // shorter block, so it can't be used to keep a real owner locked out for long.
  const emailKey = email.trim().toLowerCase();
  const accountLimit = await rateLimit("signin-email", emailKey, { maxAttempts: 15, blockMs: 15 * 60 * 1000 });
  if (accountLimit.blocked) {
    const minutes = Math.ceil((accountLimit.retryAfter ?? 900) / 60);
    return Response.json(
      { ok: false, error: `Too many failed attempts on this account. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`, retryAfter: accountLimit.retryAfter },
      { status: 429, headers: { "Retry-After": String(accountLimit.retryAfter ?? 0) } },
    );
  }

  try {
    const user = await validateCredentials(email, password);
    const isStaff = user.role === "staff";
    if ((body.portal === "staff" && !isStaff) || (body.portal === "admin" && isStaff)) {
      return Response.json(
        { ok: false, error: `This account belongs to the ${isStaff ? "Staff" : "Admin"} login.` },
        { status: 403 },
      );
    }

    // Success — clear the rate-limit counters for this IP and account
    await rateLimitClear("signin", ip);
    await rateLimitClear("signin-email", emailKey);

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        ownerName: user.ownerName,
        businessName: user.businessName,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        approvalStatus: user.approvalStatus,
        accountFrozen: user.accountFrozen,
        freezeReason: user.freezeReason,
        createdAt: user.createdAt,
        businessOwnerId: user.businessOwnerId,
        staffId: user.staffId,
        locationId: user.locationId,
        permissions: user.permissions,
        plan: await getEffectivePlan(user),
      },
    });

    // Persist session in DB so it can be immediately revoked on signout
    const token = createSessionToken(user.id);
    const expiresAt = new Date(Date.now() + cookieOptions.maxAge * 1000);
    await createDbSession(tokenId(token), user.id, expiresAt);

    // Set HTTP-only cookie — not readable by JavaScript
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed.";

    if (message === "Invalid email or password.") {
      return Response.json({ ok: false, error: message }, { status: 401 });
    }
    if (message.includes("waiting for admin approval") || message.includes("not approved") || message.includes("has been frozen")) {
      return Response.json({ ok: false, error: message }, { status: 403 });
    }

    console.error("[auth/signin] Unexpected error:", message);
    return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
