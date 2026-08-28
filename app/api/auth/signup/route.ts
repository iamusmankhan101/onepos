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

  let body: {
    email: string;
    password: string;
    ownerName: string;
    businessName: string;
    phone: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { email, password, ownerName, businessName, phone } = body;

  if (!email || !password || !ownerName) {
    return Response.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
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
      // Self-serve: this build has no platform-admin console to approve from,
      // so a new business owner is usable the moment the account exists.
      approvalStatus: "approved",
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
