/**
 * POST /api/auth/signup
 * Create a new user account
 */

import { NextRequest } from "next/server";
import { createUser } from "@/lib/auth-db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limit = rateLimit("signup", clientIp(req), { maxAttempts: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
  if (limit.blocked) {
    return Response.json(
      { ok: false, error: "Too many signup attempts. Please try again later.", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 0) } },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const email = str(body.email).trim();
  const password = str(body.password);
  const ownerName = str(body.ownerName).trim();
  const businessName = str(body.businessName).trim();
  const phone = str(body.phone).trim();

  if (!email || !password || !ownerName) {
    return Response.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password.length > 128) {
    return Response.json({ ok: false, error: "Password must be 128 characters or fewer." }, { status: 400 });
  }

  if (ownerName.length > 100 || businessName.length > 120 || phone.length > 30) {
    return Response.json({ ok: false, error: "One of the fields is too long." }, { status: 400 });
  }

  try {
    const user = await createUser({
      email,
      password,
      ownerName,
      businessName: businessName || ownerName,
      phone: phone || "",
      role: "owner",
      emailVerified: true,
      // Every new business waits for a platform admin to approve it in
      // /admin. validateCredentials() refuses a pending account, so the
      // sign-up page must not try to sign them straight in — it shows the
      // "waiting for approval" panel instead.
      approvalStatus: "pending",
    });

    return Response.json({
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
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("[auth/signup] Error:", err);
    const message = err instanceof Error ? err.message : "Failed to create account.";

    // User-facing errors (email taken, etc.) → 400; server/DB errors → 500
    const isUserError = message.includes("already exists");
    return Response.json({ ok: false, error: isUserError ? message : "Failed to create account. Please try again." }, { status: isUserError ? 400 : 500 });
  }
}
