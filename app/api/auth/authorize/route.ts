/**
 * POST /api/auth/authorize
 *
 * A manager's sign-off at the till: someone with authority types their email
 * and password over a cashier's session to approve one action (voiding an item
 * the kitchen already has, cancelling an order). It checks the credentials and
 * answers yes or no — it never creates a session or touches cookies, so the
 * cashier stays signed in as themselves.
 *
 * The approver must be the business owner or one of its managers, and must
 * belong to the same business as the session making the request — a manager
 * from another Pointly business can't authorise anything here.
 */

import { NextRequest } from "next/server";
import { resolveActor } from "@/lib/api-auth";
import { validateCredentials } from "@/lib/auth-db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const actor = await resolveActor(req);
  if (!actor) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const limit = await rateLimit("authorize", `${clientIp(req)}:${actor.actorId}`, {
    maxAttempts: 8, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000,
  });
  if (limit.blocked) {
    return Response.json({ ok: false, error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ ok: false, error: "Enter the manager's email and password." }, { status: 400 });
  }

  try {
    const approver = await validateCredentials(email, password);
    const approverBusiness = approver.businessOwnerId || approver.id;
    const canApprove = approver.role === "owner" || approver.role === "manager";
    if (!canApprove || approverBusiness !== actor.userId) {
      return Response.json({ ok: false, error: "That account can't approve this — use an owner or manager login." }, { status: 403 });
    }
    return Response.json({ ok: true, approver: { id: approver.id, name: approver.ownerName, role: approver.role } });
  } catch {
    // Same message for a wrong password, a pending account, or a frozen one.
    return Response.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }
}
