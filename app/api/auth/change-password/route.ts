import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createDbSession, getUserById, hashPassword, revokeAllSessionsForUser, verifyPassword } from "@/lib/auth-db";
import { sessionUserId } from "@/lib/api-auth";
import { createSessionToken, COOKIE_NAME, LEGACY_COOKIE_NAME, cookieOptions, tokenId } from "@/lib/session";
import { rateLimit, rateLimitClear } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const userId = await sessionUserId(req);
  if (!userId) {
    return Response.json({ ok: false, error: "Invalid or expired session." }, { status: 401 });
  }

  // Slow down repeated wrong-password guesses against a valid session.
  const limit = await rateLimit("change-password", userId, { maxAttempts: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
  if (limit.blocked) {
    return Response.json(
      { ok: false, error: "Too many attempts. Please try again later.", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 0) } },
    );
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
    return Response.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ ok: false, error: "New password must be at least 8 characters." }, { status: 400 });
  }
  if (newPassword.length > 128 || currentPassword.length > 1024) {
    return Response.json({ ok: false, error: "Password is too long." }, { status: 400 });
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return Response.json({ ok: false, error: "User not found." }, { status: 404 });
    }

    if (!verifyPassword(currentPassword, user.password)) {
      return Response.json({ ok: false, error: "Current password is incorrect." }, { status: 400 });
    }

    await db.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [hashPassword(newPassword), userId],
    });

    // A password change is usually a reaction to "someone else may be in my
    // account", so end every session — including any stolen one — and hand
    // this device a fresh cookie so it stays signed in.
    await revokeAllSessionsForUser(userId);
    const token = createSessionToken(userId);
    await createDbSession(tokenId(token), userId, new Date(Date.now() + cookieOptions.maxAge * 1000));

    await rateLimitClear("change-password", userId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    res.cookies.set(LEGACY_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("[auth/change-password] Error:", err);
    return Response.json({ ok: false, error: "Failed to update password." }, { status: 500 });
  }
}
