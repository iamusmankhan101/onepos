/**
 * POST /api/auth/signup
 * Create a new user account
 */

import { NextRequest } from "next/server";
import { createUser } from "@/lib/auth-db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * The one success reply, identical for a new account and an email that's
 * already taken. The sign-up page only needs approvalStatus to show its
 * "waiting for approval" panel.
 */
const PENDING_RESPONSE = { ok: true, user: { approvalStatus: "pending" } } as const;

export async function POST(req: NextRequest) {
  const limit = await rateLimit("signup", clientIp(req), { maxAttempts: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
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
    await createUser({
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

    return Response.json(PENDING_RESPONSE);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create account.";

    // An email that's already registered gets exactly the reply a new sign-up
    // gets, so this form can't be used to find out who has a Pointly account.
    // (createUser hashes the password before the insert fails, so the two
    // paths take the same time too.) The real owner can still just sign in.
    if (message.includes("already exists")) {
      return Response.json(PENDING_RESPONSE);
    }

    console.error("[auth/signup] Error:", err);
    return Response.json({ ok: false, error: "Failed to create account. Please try again." }, { status: 500 });
  }
}
