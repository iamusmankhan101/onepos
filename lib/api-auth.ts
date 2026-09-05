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
import { COOKIE_NAME, LEGACY_COOKIE_NAME, verifySessionToken } from "./session";
import { getEffectivePlan, getUserById, type AuthUser } from "./auth-db";
import { supportsMultiBranch, type PlanId } from "./plans";

export interface ResolvedActor {
  /** The business-owner id that scopes the data (staff resolve to their owner's id). */
  userId: string;
  /** The caller's own login-account id (differs from userId for staff/manager). */
  actorId: string;
  locationId: string;
  role: "owner" | "manager" | "staff" | "admin";
  /** The business's subscription tier — staff inherit their owner's. */
  plan: PlanId;
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
 * Whatever location is arrived at is then run through the plan gate below:
 * branches are a Pro feature, so a Starter business always resolves to
 * "main".
 * Returns null when there's no valid session — callers must respond 401.
 */
export async function resolveActor(
  req: NextRequest,
  requestedLocationId = "main",
): Promise<ResolvedActor | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? req.cookies.get(LEGACY_COOKIE_NAME)?.value;
  const actorId = token ? verifySessionToken(token) : null;
  const actor = actorId ? await getUserById(actorId) : null;
  if (!actor) return null;
  if (actor.role !== "admin" && (actor.approvalStatus !== "approved" || actor.accountFrozen)) return null;

  const plan = await getEffectivePlan(actor);

  /**
   * Branches are a Pro entitlement, so a business that is not on a
   * multi-branch plan has exactly one data scope no matter what any client
   * asks for. Every route that reads or writes business data resolves its
   * location through here, which is what makes the gate real rather than
   * cosmetic: a hand-crafted request naming another branch, or a login left
   * pinned to a second branch after the account dropped back to Starter,
   * both land on Main Branch instead of opening a scope the plan doesn't
   * include.
   */
  const scopedLocation = (locationId: string) => (supportsMultiBranch(plan) ? locationId : "main");

  if (actor.role === "staff") {
    return {
      userId: actor.businessOwnerId || actor.id,
      actorId: actor.id,
      locationId: scopedLocation(actor.locationId || "main"),
      role: actor.role,
      plan,
    };
  }
  if (actor.role === "manager") {
    return {
      userId: actor.businessOwnerId || actor.id,
      actorId: actor.id,
      locationId: scopedLocation(actor.locationId || requestedLocationId),
      role: actor.role,
      plan,
    };
  }
  return {
    userId: actor.id,
    actorId: actor.id,
    locationId: scopedLocation(requestedLocationId),
    role: actor.role,
    plan,
  };
}

/**
 * For platform-admin-only endpoints that act on an arbitrary target user
 * (freezing another business's account, approving a signup, resetting a
 * password) — verifies the caller's own session has role "admin" and returns
 * that admin, so the route can attribute the action in the audit log. Returns
 * null for everyone else, in which case the route must respond 401/403.
 *
 * Unlike resolveActor, this does NOT resolve a data-owner id — the target user
 * id comes from the request body/query as an explicit admin action, not the
 * caller's own scope.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? req.cookies.get(LEGACY_COOKIE_NAME)?.value;
  const actorId = token ? verifySessionToken(token) : null;
  const actor = actorId ? await getUserById(actorId) : null;
  if (!actor || actor.role !== "admin") return null;

  const { password: _password, ...withoutPassword } = actor;
  void _password;
  return withoutPassword;
}
