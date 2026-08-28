import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getUserById, hashPassword } from "@/lib/auth-db";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";
import { pbkdf2Sync, timingSafeEqual } from "crypto";
import { rateLimit, rateLimitClear } from "@/lib/rate-limit";

function verifyPassword(plain: string, stored: string): boolean {
  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, expectedHash] = parts;
    const derived = pbkdf2Sync(plain, salt, 120_000, 64, "sha512").toString("hex");
    try {
      return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(expectedHash, "hex"));
    } catch { return false; }
  }
  return plain === stored;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return Response.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  const userId = verifySessionToken(token);
  if (!userId) {
    return Response.json({ ok: false, error: "Invalid or expired session." }, { status: 401 });
  }

  // Slow down repeated wrong-password guesses against a valid session.
  const limit = rateLimit("change-password", userId, { maxAttempts: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
  if (limit.blocked) {
    return Response.json(
      { ok: false, error: "Too many attempts. Please try again later.", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 0) } },
    );
  }

  let body: { currentPassword: string; newPassword: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return Response.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ ok: false, error: "New password must be at least 8 characters." }, { status: 400 });
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

    rateLimitClear("change-password", userId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[auth/change-password] Error:", err);
    return Response.json({ ok: false, error: "Failed to update password." }, { status: 500 });
  }
}
