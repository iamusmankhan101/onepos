/**
 * /api/admin/users — platform-admin console.
 *
 * GET   → every login account on the platform plus the roll-up the console
 *         header shows.
 * POST  → one action applied to one or more accounts (freeze, unfreeze,
 *         approve, reject, force sign-out, reset password, delete, and
 *         granting/removing platform-admin rights), or one of two single-account
 *         actions: "create" (a new, already-approved business owner) and
 *         "update-profile" (name, business name, phone, email).
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
  adminUpdateProfile,
  createUser,
  getUserById,
  revokeAllSessionsForUser,
  setUserBusinessType,
  setUserPlan,
  updateAccountFreeze,
  updateUserApprovalStatus,
} from "@/lib/auth-db";
import { normalizePlanId, PLANS } from "@/lib/plans";
import { BUSINESS_TYPES, normalizeBusinessTypeId } from "@/lib/business-types";
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
  "reset-password", "delete", "grant-admin", "revoke-admin", "set-plan",
  "set-business-type",
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

  let body: { action?: string; userIds?: unknown; reason?: string; password?: string; plan?: string; businessType?: string } & Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (body.action === "create") return createAccount(admin, body);
  if (body.action === "update-profile") return updateProfile(admin, body);

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

  // A plan change has to name a tier this build actually has — normalizing an
  // unknown value silently to Starter would quietly downgrade a paying
  // business on a typo.
  if (action === "set-plan" && normalizePlanId(body.plan) !== body.plan) {
    return Response.json({ ok: false, error: "Unknown plan." }, { status: 400 });
  }
  const plan = normalizePlanId(body.plan);

  if (action === "set-business-type" && normalizeBusinessTypeId(body.businessType) !== body.businessType) {
    return Response.json({ ok: false, error: "Unknown business type." }, { status: 400 });
  }
  const businessType = normalizeBusinessTypeId(body.businessType);

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
        case "set-plan": {
          // Only a business owner carries a plan — staff and manager logins
          // inherit their owner's, so setting one on them would be a value
          // nothing ever reads.
          if (target.businessOwnerId) throw new Error("Team logins follow their business owner's plan.");
          await setUserPlan(id, plan);
          detail = `Plan set to ${PLANS[plan].name}.`;
          break;
        }
        case "set-business-type": {
          if (target.businessOwnerId) throw new Error("Team logins follow their business owner's type.");
          await setUserBusinessType(id, businessType);
          detail = `Business type set to ${BUSINESS_TYPES[businessType].name}.`;
          break;
        }
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

// ─── Single-account actions ───────────────────────────────────────────────────

type Admin = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function withList(extra: Record<string, unknown>, adminId: string) {
  const { users, stats } = await listPlatformUsers();
  return Response.json({ ok: true, ...extra, users, stats, adminId });
}

/**
 * Creates a business owner straight from the console — already approved, on
 * the chosen plan and business type. With no password given, one is generated
 * and returned once so the admin can pass it on.
 */
async function createAccount(admin: Admin, body: Record<string, unknown>) {
  const email = str(body.email).toLowerCase();
  const ownerName = str(body.ownerName);
  const businessName = str(body.businessName);
  const phone = str(body.phone);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!ownerName || ownerName.length > 100) return Response.json({ ok: false, error: "Enter the owner's name." }, { status: 400 });
  if (!businessName || businessName.length > 120) return Response.json({ ok: false, error: "Enter the business name." }, { status: 400 });
  if (phone.length > 30) return Response.json({ ok: false, error: "Phone number is too long." }, { status: 400 });
  if (normalizeBusinessTypeId(body.businessType) !== body.businessType) {
    return Response.json({ ok: false, error: "Choose a business type." }, { status: 400 });
  }
  if (normalizePlanId(body.plan) !== body.plan) return Response.json({ ok: false, error: "Unknown plan." }, { status: 400 });

  const password = str(body.password) || generatePassword();
  if (password.length < 8 || password.length > 128) {
    return Response.json({ ok: false, error: "Password must be 8–128 characters." }, { status: 400 });
  }

  try {
    const businessType = normalizeBusinessTypeId(body.businessType);
    const plan = normalizePlanId(body.plan);
    const user = await createUser({
      email, password, ownerName, businessName, phone,
      role: "owner", emailVerified: true, approvalStatus: "approved", businessType,
    });
    if (plan !== "starter") await setUserPlan(user.id, plan);
    await logAdminAction({
      actorId: admin.id, actorEmail: admin.email, action: "create-account",
      targetId: user.id, targetEmail: user.email,
      detail: `${businessName} — ${BUSINESS_TYPES[businessType].name}, ${PLANS[plan].name}. Approved on creation.`,
    });
    // The password only comes back when it was generated here; one the admin
    // typed is one they already have.
    return withList({ created: { id: user.id, email: user.email }, password: str(body.password) ? undefined : password }, admin.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create the account.";
    return Response.json({ ok: false, error: message }, { status: message.includes("already exists") ? 409 : 500 });
  }
}

async function updateProfile(admin: Admin, body: Record<string, unknown>) {
  const id = str(body.userId);
  const target = id ? await getUserById(id) : null;
  if (!target) return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
  if (target.role === "admin" && target.id !== admin.id) {
    return Response.json({ ok: false, error: "Another platform admin — they edit their own details." }, { status: 403 });
  }

  const email = str(body.email).toLowerCase();
  const ownerName = str(body.ownerName);
  const businessName = str(body.businessName);
  const phone = str(body.phone);
  if (!EMAIL_RE.test(email) || email.length > 254) return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  if (!ownerName || ownerName.length > 100) return Response.json({ ok: false, error: "Enter a name." }, { status: 400 });
  if (businessName.length > 120 || phone.length > 30) return Response.json({ ok: false, error: "One of the fields is too long." }, { status: 400 });

  try {
    const changes = ([
      ["name", target.ownerName, ownerName],
      ["business", target.businessName, businessName || target.businessName],
      ["phone", target.phone, phone],
      ["email", target.email, email],
    ] as const).filter(([, before, after]) => before !== after);
    if (changes.length === 0) return withList({}, admin.id);

    await adminUpdateProfile(target.id, {
      ownerName,
      businessName: businessName || undefined,
      phone,
      email,
    });
    await logAdminAction({
      actorId: admin.id, actorEmail: admin.email, action: "update-profile",
      targetId: target.id, targetEmail: email,
      detail: changes.map(([field, before, after]) => `${field}: ${before || "—"} → ${after || "—"}`).join("; "),
    });
    return withList({}, admin.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the changes.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
