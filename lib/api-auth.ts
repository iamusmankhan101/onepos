/**
 * lib/api-auth.ts
 *
 * Shared server-side authorization helper for API routes that read/write
 * per-business data. Resolves which business's data the caller may access from
 * their own session cookie — never from a client-supplied userId/businessId —
 * so one tenant can't read or overwrite another tenant's data by passing a
 * different id in the query string or request body.
 */

import { NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "./session";
import { getUserById } from "./auth-db";

export interface ResolvedActor {
  /** The business-owner id that scopes the data (staff resolve to their owner's id). */
  userId: string;
  /** The caller's own login-account id (differs from userId for staff/manager). */
  actorId: string;
  locationId: string;
  role: "owner" | "manager" | "staff" | "admin";
}

/**
 * Verifies the session cookie and resolves the caller's data scope.
 * Staff are pinned to their business owner's id and their assigned location.
 * Managers resolve to their owner's id the same way — a manager row has its
 * own distinct id (upsertStaffUser mints "staff_user_...", separate from the
 * owner's id), so falling through to `actor.id` here would scope every read
 * and write to an empty business under the manager's own account instead of the
 * real one. A manager assigned a specific branch is likewise pinned to it,
 * exactly like staff — only when a manager has no assigned branch (a
 * cross-branch manager, if that's ever configured) is the client-requested
 * location honored. Only an actual owner/admin can freely browse branches.
 * Returns null when there's no valid session — callers must respond 401.
 */
export async function resolveActor(
  req: NextRequest,
  requestedLocationId = "main",
): Promise<ResolvedActor | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const actorId = token ? verifySessionToken(token) : null;
  const actor = actorId ? await getUserById(actorId) : null;
  if (!actor) return null;
  if (actor.role !== "admin" && (actor.approvalStatus !== "approved" || actor.accountFrozen)) return null;

  if (actor.role === "staff") {
    return {
      userId: actor.businessOwnerId || actor.id,
      actorId: actor.id,
      locationId: actor.locationId || "main",
      role: actor.role,
    };
  }
  if (actor.role === "manager") {
    return {
      userId: actor.businessOwnerId || actor.id,
      actorId: actor.id,
      locationId: actor.locationId || requestedLocationId,
      role: actor.role,
    };
  }
  return { userId: actor.id, actorId: actor.id, locationId: requestedLocationId, role: actor.role };
}

/**
 * For platform-admin-only endpoints that act on an arbitrary target user
 * (e.g. approving another business's payment, changing their plan) — verifies
 * the caller's own session has role "admin". Returns null otherwise, in
 * which case the route must respond 401/403. Unlike resolveActor, this does
 * NOT resolve a data-owner id — the target user id comes from the request
 * body/query as an explicit admin action, not the caller's own scope.
 */
export async function requireAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const actorId = token ? verifySessionToken(token) : null;
  const actor = actorId ? await getUserById(actorId) : null;
  return actor?.role === "admin";
}
