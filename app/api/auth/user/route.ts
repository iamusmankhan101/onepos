/**
 * GET /api/auth/user
 * Returns user data either by ?userId=... or from the session cookie.
 */

import { NextRequest } from "next/server";
import { getUserById } from "@/lib/auth-db";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

export async function GET(req: NextRequest) {
  let userId = req.nextUrl.searchParams.get("userId");

  // If no userId param, derive it from the session cookie
  if (!userId) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return Response.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    userId = verifySessionToken(token);
    if (!userId) {
      return Response.json({ ok: false, error: "Invalid or expired session." }, { status: 401 });
    }
  }

  try {
    const user = await getUserById(userId);

    if (!user) {
      return Response.json({ ok: false, error: "User not found." }, { status: 404 });
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
