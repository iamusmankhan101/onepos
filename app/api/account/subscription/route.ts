/**
 * GET /api/account/subscription
 *
 * The signed-in business's own subscription, for Settings → Subscription: its
 * plan, what it pays (custom price or list price) and how often, how long it
 * is paid up for, and its payments.
 *
 * Owner only. Staff and managers work inside the business but its pricing is
 * the owner's arrangement with Pointly, so they get a 403 rather than a view.
 */

import { NextRequest } from "next/server";
import { sessionUserId } from "@/lib/api-auth";
import { getUserById } from "@/lib/auth-db";
import { getOwnSubscription } from "@/lib/billing-db";

export async function GET(req: NextRequest) {
  const userId = await sessionUserId(req);
  const user = userId ? await getUserById(userId) : null;
  if (!user) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (user.role !== "owner" || user.businessOwnerId) {
    return Response.json({ ok: false, error: "Only the business owner can see the subscription." }, { status: 403 });
  }

  try {
    const subscription = await getOwnSubscription(user.id);
    return Response.json({ ok: true, subscription });
  } catch (err) {
    console.error("[account/subscription] GET error:", err);
    return Response.json({ ok: false, error: "Could not load your subscription." }, { status: 500 });
  }
}
