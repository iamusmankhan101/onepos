/**
 * lib/admin-db.ts
 *
 * Platform-admin data layer — everything the /admin console needs that is not
 * already in lib/auth-db.ts (which owns the users table, freeze/approval flags
 * and session revocation).
 *
 * Nothing here checks authorization: every export assumes the caller has
 * already passed requireAdmin() in lib/api-auth.ts. Keep it that way — these
 * helpers act on arbitrary user ids by design.
 */

import { randomBytes } from "crypto";

import { db } from "@/lib/db";
import {
  ensureAuthTables,
  getAllUsers,
  getUserById,
  hashPassword,
  revokeAllSessionsForUser,
  type AuthUser,
} from "@/lib/auth-db";

// ─── Audit log ────────────────────────────────────────────────────────────────

export type AdminAction =
  | "freeze" | "unfreeze"
  | "approve" | "reject"
  | "revoke-sessions"
  | "reset-password"
  | "delete"
  | "grant-admin" | "revoke-admin";

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetId: string | null;
  targetEmail: string | null;
  detail: string | null;
}

let auditTableReady: Promise<void> | null = null;

async function ensureAuditTableUncached(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      actor_id     TEXT NOT NULL,
      actor_email  TEXT NOT NULL,
      action       TEXT NOT NULL,
      target_id    TEXT,
      target_email TEXT,
      detail       TEXT
    )
  `);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log(created_at DESC)",
  ).catch(() => {});
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_id)",
  ).catch(() => {});
}

export async function ensureAuditTable(): Promise<void> {
  auditTableReady ||= ensureAuditTableUncached().catch((error) => {
    auditTableReady = null;
    throw error;
  });
  return auditTableReady;
}

/**
 * Records one admin action. Never throws — an audit write failing must not
 * roll back or hide the action the admin actually asked for, so it is logged
 * to the server console and swallowed.
 */
export async function logAdminAction(entry: {
  actorId: string;
  actorEmail: string;
  action: AdminAction | string;
  targetId?: string | null;
  targetEmail?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await ensureAuditTable();
    await db.execute({
      sql: `INSERT INTO admin_audit_log (id, created_at, actor_id, actor_email, action, target_id, target_email, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        new Date().toISOString(),
        entry.actorId,
        entry.actorEmail,
        entry.action,
        entry.targetId ?? null,
        entry.targetEmail ?? null,
        entry.detail ?? null,
      ],
    });
  } catch (err) {
    console.error("[admin-db] audit write failed:", err);
  }
}

export async function getAuditLog(limit = 200, targetId?: string): Promise<AuditEntry[]> {
  await ensureAuditTable();
  const res = targetId
    ? await db.execute({
        sql: "SELECT * FROM admin_audit_log WHERE target_id = ? ORDER BY created_at DESC LIMIT ?",
        args: [targetId, Math.min(limit, 500)],
      })
    : await db.execute({
        sql: "SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?",
        args: [Math.min(limit, 500)],
      });

  return res.rows.map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    actorId: r.actor_id as string,
    actorEmail: r.actor_email as string,
    action: r.action as string,
    targetId: (r.target_id as string) ?? null,
    targetEmail: (r.target_email as string) ?? null,
    detail: (r.detail as string) ?? null,
  }));
}

// ─── Business-data footprint ──────────────────────────────────────────────────

/**
 * Every entity name that can appear in a business_data key. Keys are
 * `{userId}_{entity}` for the main branch and `{userId}_{locationId}_{entity}`
 * for any other branch (see storageKey() in app/api/db/route.ts), so the entity
 * has to be matched as a suffix to recover the branch id in between.
 */
const DATA_ENTITIES = [
  "clients", "appointments", "staff", "services", "inventory", "invoices",
  "expenses", "attendance", "payouts", "cash_flow_income", "deleted_records",
  "loyalty_history", "settings",
] as const;

export interface BusinessFootprint {
  /** Total bytes of stored JSON across every branch. */
  bytes: number;
  /** Branch ids this business has written data under ("main" included). */
  branches: string[];
  /** Most recent write across all of their rows, or null if they have none. */
  lastActivity: string | null;
  /** Number of business_data rows. */
  rows: number;
}

/** Splits `{userId}_{...}` into its branch id and entity name. */
function parseDataKey(key: string, userId: string): { locationId: string; entity: string } | null {
  const prefix = `${userId}_`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);

  // Longest match first so "cash_flow_income" is never read as "income".
  const entities = [...DATA_ENTITIES].sort((a, b) => b.length - a.length);
  for (const entity of entities) {
    if (rest === entity) return { locationId: "main", entity };
    if (rest.endsWith(`_${entity}`)) {
      return { locationId: rest.slice(0, rest.length - entity.length - 1), entity };
    }
  }
  return null;
}

/**
 * One pass over business_data for the whole platform, bucketed by owner id.
 * Only key names, payload sizes and timestamps are read — never the JSON
 * itself, which on a busy business is megabytes the admin list has no use for.
 */
async function loadFootprints(ownerIds: string[]): Promise<Map<string, BusinessFootprint>> {
  const footprints = new Map<string, BusinessFootprint>();
  for (const id of ownerIds) {
    footprints.set(id, { bytes: 0, branches: [], lastActivity: null, rows: 0 });
  }

  let rows: { entity: string; bytes: number; updatedAt: string }[];
  try {
    const res = await db.execute("SELECT entity, length(data) AS bytes, updated_at FROM business_data");
    rows = res.rows.map((r) => ({
      entity: String(r.entity),
      bytes: Number(r.bytes ?? 0),
      updatedAt: String(r.updated_at ?? ""),
    }));
  } catch {
    // business_data is created lazily on first save — a brand-new deployment
    // has no table yet, which is an empty footprint, not an error.
    return footprints;
  }

  // Longest id first: an id is never a prefix of another in practice, but
  // matching the longest keeps that assumption from mattering.
  const sortedIds = [...ownerIds].sort((a, b) => b.length - a.length);
  const branchSets = new Map<string, Set<string>>();

  for (const row of rows) {
    const ownerId = sortedIds.find((id) => row.entity.startsWith(`${id}_`));
    if (!ownerId) continue;
    const footprint = footprints.get(ownerId)!;
    footprint.bytes += row.bytes;
    footprint.rows += 1;
    if (row.updatedAt && (!footprint.lastActivity || row.updatedAt > footprint.lastActivity)) {
      footprint.lastActivity = row.updatedAt;
    }
    const parsed = parseDataKey(row.entity, ownerId);
    // The settings row is business-wide, not per branch — counting it would
    // show a branch-less business as having one.
    if (parsed && parsed.entity !== "settings") {
      if (!branchSets.has(ownerId)) branchSets.set(ownerId, new Set());
      branchSets.get(ownerId)!.add(parsed.locationId);
    }
  }

  for (const [ownerId, branches] of branchSets) {
    footprints.get(ownerId)!.branches = [...branches].sort();
  }
  return footprints;
}

/** Per-entity record counts for a single business — parses JSON, so one user at a time. */
export async function getBusinessBreakdown(ownerId: string): Promise<
  { locationId: string; entity: string; records: number; bytes: number; updatedAt: string }[]
> {
  let res;
  try {
    res = await db.execute({
      sql: "SELECT entity, data, updated_at FROM business_data WHERE entity LIKE ?",
      args: [`${ownerId}_%`],
    });
  } catch {
    return [];
  }

  const breakdown: { locationId: string; entity: string; records: number; bytes: number; updatedAt: string }[] = [];
  for (const row of res.rows) {
    const key = String(row.entity);
    const parsed = parseDataKey(key, ownerId);
    if (!parsed) continue;
    const raw = String(row.data ?? "");
    let records = 0;
    try {
      const value = JSON.parse(raw) as unknown;
      records = Array.isArray(value) ? value.length : 1;
    } catch { /* unparseable row — reported with a 0 count rather than dropped */ }
    breakdown.push({
      locationId: parsed.locationId,
      entity: parsed.entity,
      records,
      bytes: raw.length,
      updatedAt: String(row.updated_at ?? ""),
    });
  }
  return breakdown.sort(
    (a, b) => a.locationId.localeCompare(b.locationId) || a.entity.localeCompare(b.entity),
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** Live (unrevoked, unexpired) session count per user id. */
export async function getActiveSessionCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const res = await db.execute({
      sql: `SELECT user_id, COUNT(*) AS n FROM sessions
            WHERE revoked = 0 AND expires_at > ? GROUP BY user_id`,
      args: [new Date().toISOString()],
    });
    for (const row of res.rows) counts.set(String(row.user_id), Number(row.n ?? 0));
  } catch {
    // sessions is created on first sign-in — no table means nobody is signed in.
  }
  return counts;
}

// ─── Platform user list ───────────────────────────────────────────────────────

export interface PlatformUser extends AuthUser {
  /** Login accounts (manager + staff) that belong to this business owner. */
  teamSize: number;
  /** Business name of the owner this account belongs to (staff/manager only). */
  ownerBusinessName?: string;
  activeSessions: number;
  storageBytes: number;
  branches: string[];
  lastActivity: string | null;
}

export interface PlatformStats {
  total: number;
  owners: number;
  managers: number;
  staff: number;
  admins: number;
  pending: number;
  rejected: number;
  frozen: number;
  newThisWeek: number;
  activeSessions: number;
  storageBytes: number;
}

/**
 * Every login account on the platform, enriched with the numbers the console
 * shows: team size, live sessions, and how much data the business is holding.
 */
export async function listPlatformUsers(): Promise<{ users: PlatformUser[]; stats: PlatformStats }> {
  await ensureAuthTables();
  const users = await getAllUsers();

  const ownerIds = users.filter((u) => !u.businessOwnerId).map((u) => u.id);
  const [footprints, sessionCounts] = await Promise.all([
    loadFootprints(ownerIds),
    getActiveSessionCounts(),
  ]);

  const teamSizes = new Map<string, number>();
  const businessNames = new Map(users.map((u) => [u.id, u.businessName]));
  for (const user of users) {
    if (!user.businessOwnerId) continue;
    teamSizes.set(user.businessOwnerId, (teamSizes.get(user.businessOwnerId) ?? 0) + 1);
  }

  const enriched: PlatformUser[] = users.map((user) => {
    const footprint = footprints.get(user.id);
    return {
      ...user,
      teamSize: teamSizes.get(user.id) ?? 0,
      ownerBusinessName: user.businessOwnerId ? businessNames.get(user.businessOwnerId) : undefined,
      activeSessions: sessionCounts.get(user.id) ?? 0,
      storageBytes: footprint?.bytes ?? 0,
      branches: footprint?.branches ?? [],
      lastActivity: footprint?.lastActivity ?? null,
    };
  });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const stats: PlatformStats = {
    total: enriched.length,
    owners: enriched.filter((u) => u.role === "owner").length,
    managers: enriched.filter((u) => u.role === "manager").length,
    staff: enriched.filter((u) => u.role === "staff").length,
    admins: enriched.filter((u) => u.role === "admin").length,
    pending: enriched.filter((u) => u.approvalStatus === "pending").length,
    rejected: enriched.filter((u) => u.approvalStatus === "rejected").length,
    frozen: enriched.filter((u) => u.accountFrozen).length,
    newThisWeek: enriched.filter((u) => u.createdAt >= weekAgo).length,
    activeSessions: enriched.reduce((sum, u) => sum + u.activeSessions, 0),
    storageBytes: enriched.reduce((sum, u) => sum + u.storageBytes, 0),
  };

  return { users: enriched, stats };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function countAdmins(): Promise<number> {
  await ensureAuthTables();
  const res = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Sets a new password for any account and signs every device out, so the old
 * password can't stay in use on a till that is already logged in.
 */
export async function adminResetPassword(id: string, newPassword: string): Promise<void> {
  await ensureAuthTables();
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  const user = await getUserById(id);
  if (!user) throw new Error("User not found.");

  await db.execute({
    sql: "UPDATE users SET password = ? WHERE id = ?",
    args: [hashPassword(newPassword), id],
  });
  await revokeAllSessionsForUser(id);
}

/**
 * Grants or removes platform-admin rights. Only a business owner can be
 * promoted (a staff/manager login is scoped to someone else's business and has
 * no meaning as a platform account), and the last remaining admin can't be
 * demoted or the console locks everyone out.
 */
export async function setPlatformAdmin(id: string, isAdmin: boolean): Promise<void> {
  await ensureAuthTables();
  const user = await getUserById(id);
  if (!user) throw new Error("User not found.");

  if (isAdmin) {
    if (user.role === "admin") return;
    if (user.role !== "owner") throw new Error("Only a business owner can be made a platform admin.");
    await db.execute({
      sql: "UPDATE users SET role = 'admin', approval_status = 'approved', account_frozen = 0, freeze_reason = NULL WHERE id = ?",
      args: [id],
    });
    return;
  }

  if (user.role !== "admin") return;
  if ((await countAdmins()) <= 1) throw new Error("This is the last platform admin — promote someone else first.");
  await db.execute({ sql: "UPDATE users SET role = 'owner' WHERE id = ?", args: [id] });
}

/**
 * Deletes a login account. Deleting a business owner also deletes the staff and
 * manager logins under them — those accounts exist only to sign in to that
 * business and would otherwise be orphaned rows nobody can reach.
 *
 * Business data in business_data is deliberately left in place: it is keyed by
 * owner id, it is what the daily backup protects, and an account deleted by
 * mistake is recoverable only for as long as that data survives. Purging a
 * business's records stays a separate, explicit action (DELETE /api/db).
 */
export async function deleteUserAccount(id: string): Promise<{ deletedIds: string[] }> {
  await ensureAuthTables();
  const user = await getUserById(id);
  if (!user) throw new Error("User not found.");
  if (user.role === "admin") throw new Error("Remove platform-admin rights before deleting this account.");

  const deletedIds = [id];
  if (!user.businessOwnerId) {
    const team = await db.execute({
      sql: "SELECT id FROM users WHERE business_owner_id = ?",
      args: [id],
    });
    deletedIds.push(...team.rows.map((row) => String(row.id)));
  }

  for (const targetId of deletedIds) {
    await revokeAllSessionsForUser(targetId);
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [targetId] });
  }
  return { deletedIds };
}

/** A readable temporary password an admin can hand over verbally. */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");
}
