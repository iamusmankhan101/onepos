/**
 * GET /api/auth/user
 *
 * Returns the signed-in user, resolved from the session cookie only. This is
 * also the liveness probe the dashboard polls (see checkServerSession in
 * lib/auth.ts): a 401 with reason "session_expired" is what tells an open tab
 * that its 4-day session has run out, so it can say so and send the user back
 * to sign in instead of quietly 401-ing every background save.
 *
 * It used to accept ?userId=... and answer for that user without checking any
 * session, which handed anyone who could guess an id another account's profile
 * and made the expiry above trivially bypassable. Nothing called it that way.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserById, isSessionRevoked } from "@/lib/auth-db";
import { verifySessionToken, COOKIE_NAME, LEGACY_COOKIE_NAME, tokenId } from "@/lib/session";

/** 401 that also clears the dead cookie, so the browser stops re-sending it. */
function expired(error: string) {
  const res = NextResponse.json({ ok: false, error, reason: "session_expired" }, { status: 401 });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  res.cookies.set(LEGACY_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? req.cookies.get(LEGACY_COOKIE_NAME)?.value;
  if (!token) {
    return Response.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  const userId = verifySessionToken(token);
  if (!userId) {
    return expired("Your session has expired. Please sign in again.");
  }

  // Signed out on another device, or revoked by an admin, while this tab sat open.
  if (await isSessionRevoked(tokenId(token))) {
    return expired("Your session has ended. Please sign in again.");
  }

  try {
    const user = await getUserById(userId);

    if (!user) {
      return expired("Your session is no longer valid. Please sign in again.");
    }

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
        accountFrozen: user.accountFrozen,
        freezeReason: user.freezeReason,
        createdAt: user.createdAt,
        businessOwnerId: user.businessOwnerId,
        staffId: user.staffId,
        locationId: user.locationId,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    console.error("[auth/user] Error:", err);
    return Response.json({ ok: false, error: "Failed to fetch user." }, { status: 500 });
  }
}
