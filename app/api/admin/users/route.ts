/**
 * /api/admin/users — platform-admin console.
 *
 * GET   → every login account on the platform plus the roll-up the console
 *         header shows.
 * POST  → one action applied to one or more accounts (freeze, unfreeze,
 *         approve, reject, force sign-out, reset password, delete, and
 *         granting/removing platform-admin rights).
 *
 * Every handler is gated on requireAdmin(): the caller's own session must
 * carry role "admin". Target ids come from the request body — that is the
 * point of an admin endpoint — so each action re-checks its own guards
 * (never yourself, never another admin, never the last admin) per target
 * rather than trusting the ids that were sent.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  getUserById,
  revokeAllSessionsForUser,
  updateAccountFreeze,
  updateUserApprovalStatus,
} from "@/lib/auth-db";
import {
  adminResetPassword,
  deleteUserAccount,
  generatePassword,
  listPlatformUsers,
  logAdminAction,
  setPlatformAdmin,
  type AdminAction,
} from "@/lib/admin-db";

const ACTIONS = new Set<AdminAction>([
  "freeze", "unfreeze", "approve", "reject", "revoke-sessions",
  "reset-password", "delete", "grant-admin", "revoke-admin",
]);

/** Actions that must never be pointed at the admin running them. */
const SELF_FORBIDDEN = new Set<AdminAction>(["freeze", "reject", "delete", "revoke-admin"]);

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const { users, stats } = await listPlatformUsers();
    return Response.json({ ok: true, users, stats, adminId: admin.id });
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    return Response.json({ ok: false, error: "Failed to load accounts." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: { action?: string; userIds?: unknown; reason?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const action = body.action as AdminAction;
  if (!action || !ACTIONS.has(action)) {
    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (userIds.length === 0) {
    return Response.json({ ok: false, error: "No accounts selected." }, { status: 400 });
  }
  if (userIds.length > 100) {
    return Response.json({ ok: false, error: "Too many accounts in one request." }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  // A reset with no password supplied mints one and hands it back, so the
  // admin has something to read out. Generated once for the whole request:
  // resetting a batch and getting a different password per row would be
  // unusable in the UI.
  const password = typeof body.password === "string" && body.password ? body.password : generatePassword();
  if (action === "reset-password" && password.length < 8) {
    return Response.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const results: { id: string; email?: string; ok: boolean; error?: string }[] = [];

  for (const id of userIds) {
    const target = await getUserById(id);
    if (!target) {
      results.push({ id, ok: false, error: "Account no longer exists." });
      continue;
    }
    if (id === admin.id && SELF_FORBIDDEN.has(action)) {
      results.push({ id, email: target.email, ok: false, error: "You can't do that to your own account." });
      continue;
    }
    // Another admin is off limits apart from removing their rights: letting one
    // admin reset another's password (or freeze them) is an account takeover,
    // not moderation. Demote them first, which is itself audit-logged.
    if (target.role === "admin" && id !== admin.id && action !== "revoke-admin") {
      results.push({ id, email: target.email, ok: false, error: "Another platform admin — remove their admin rights first." });
      continue;
    }

    try {
      let detail: string | null = reason || null;
      switch (action) {
        case "freeze":
          await updateAccountFreeze(id, true, reason || null);
          break;
        case "unfreeze":
          await updateAccountFreeze(id, false, null);
          break;
        case "approve":
          await updateUserApprovalStatus(id, "approved");
          break;
        case "reject":
          await updateUserApprovalStatus(id, "rejected");
          // A rejected account must not keep browsing on a session it already
          // holds — the approval check only runs on the next sign-in.
          await revokeAllSessionsForUser(id);
          break;
        case "revoke-sessions":
          await revokeAllSessionsForUser(id);
          break;
        case "reset-password":
          await adminResetPassword(id, password);
          detail = "Password reset; all sessions signed out.";
          break;
        case "delete": {
          const { deletedIds } = await deleteUserAccount(id);
          detail = deletedIds.length > 1
            ? `Deleted with ${deletedIds.length - 1} team login(s). Business data kept.`
            : "Business data kept.";
          break;
        }
        case "grant-admin":
          await setPlatformAdmin(id, true);
          break;
        case "revoke-admin":
          await setPlatformAdmin(id, false);
          break;
      }

      results.push({ id, email: target.email, ok: true });
      await logAdminAction({
        actorId: admin.id,
        actorEmail: admin.email,
        action,
        targetId: id,
        targetEmail: target.email,
        detail,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      console.error(`[admin/users] ${action} failed for ${id}:`, message);
      results.push({ id, email: target.email, ok: false, error: message });
    }
  }

  const { users, stats } = await listPlatformUsers();
  const succeeded = results.filter((r) => r.ok).length;

  return Response.json({
    ok: succeeded > 0,
    results,
    succeeded,
    failed: results.length - succeeded,
    // Only returned for a reset, and only so the admin can pass it on — it is
    // never stored anywhere in readable form.
    password: action === "reset-password" && succeeded > 0 ? password : undefined,
    users,
    stats,
    adminId: admin.id,
  });
}
