/**
 * lib/auth-db.ts
 * Database-backed authentication using Turso (SQLite)
 */

import { db } from "@/lib/db";
import type { InValue } from "@libsql/client";
import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";

// ─── Password hashing ─────────────────────────────────────────────────────────

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(plain, salt, 120_000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, expectedHash] = parts;
    const derived = pbkdf2Sync(plain, salt, 120_000, 64, "sha512").toString("hex");
    // Constant-time comparison to prevent timing attacks
    try {
      return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(expectedHash, "hex"));
    } catch { return false; }
  }
  // Legacy plaintext — accept and caller upgrades on next login
  return plain === stored;
}

/**
 * A real pbkdf2 hash of a value nobody can supply, built once and reused.
 * When no user matches an email we still verify against this, so an unknown
 * address burns the same ~120k iterations as a known one. Without it the null
 * branch returns immediately and the response time alone tells an attacker
 * which emails are registered.
 */
let decoyHashCache: string | null = null;
function decoyHash(): string {
  if (!decoyHashCache) decoyHashCache = hashPassword(randomBytes(32).toString("hex"));
  return decoyHashCache;
}

export { hashPassword };
export type ApprovalStatus = "pending" | "approved" | "rejected";

// ─── Schema ───────────────────────────────────────────────────────────────────

let authTablesReady: Promise<void> | null = null;

async function ensureAuthTablesUncached(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id                TEXT PRIMARY KEY,
      email             TEXT NOT NULL UNIQUE,
      password          TEXT NOT NULL,
      owner_name        TEXT NOT NULL,
      business_name        TEXT NOT NULL,
      phone             TEXT,
      role              TEXT NOT NULL DEFAULT 'owner',
      email_verified    INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      google_id         TEXT
    )
  `);

  // Add google_id column to existing tables that were created before this column was added
  await db.execute("ALTER TABLE users ADD COLUMN google_id TEXT").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN business_owner_id TEXT").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN staff_id TEXT").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN permissions TEXT").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN location_id TEXT").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN account_frozen INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await db.execute("ALTER TABLE users ADD COLUMN freeze_reason TEXT").catch(() => {});

  // Create index for faster email lookups
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `).catch(() => { /* index already exists */ });

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)
  `).catch(() => {});
}

export async function ensureAuthTables(): Promise<void> {
  authTablesReady ||= ensureAuthTablesUncached().catch((error) => {
    authTablesReady = null;
    throw error;
  });
  return authTablesReady;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  password: string;
  ownerName: string;
  businessName: string;
  phone: string;
  role: "owner" | "manager" | "staff" | "admin";
  businessOwnerId?: string;
  staffId?: string;
  locationId?: string;
  permissions?: string[];
  emailVerified: boolean;
  approvalStatus: ApprovalStatus;
  accountFrozen: boolean;
  freezeReason: string | null;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  ownerName: string;
  businessName: string;
  phone: string;
  role: "owner" | "manager" | "staff" | "admin";
  businessOwnerId?: string;
  staffId?: string;
  locationId?: string;
  permissions?: string[];
  emailVerified: boolean;
  approvalStatus: ApprovalStatus;
  accountFrozen: boolean;
  freezeReason: string | null;
  createdAt: string;
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(r: any): User {
  return {
    id: r.id as string,
    email: r.email as string,
    password: r.password as string,
    ownerName: r.owner_name as string,
    businessName: r.business_name as string,
    phone: (r.phone as string) ?? "",
    role: r.role as User["role"],
    businessOwnerId: (r.business_owner_id as string) || undefined,
    staffId: (r.staff_id as string) || undefined,
    locationId: (r.location_id as string) || undefined,
    permissions: r.permissions ? JSON.parse(r.permissions as string) : undefined,
    emailVerified: (r.email_verified as number) === 1,
    approvalStatus: ((r.approval_status as string | undefined) || "approved") as ApprovalStatus,
    accountFrozen: (r.account_frozen as number) === 1,
    freezeReason: (r.freeze_reason as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function withoutPassword(user: User): AuthUser {
  const { password: _password, ...rest } = user;
  void _password;
  return rest;
}

// ─── User operations ──────────────────────────────────────────────────────────

export async function createUser(input: {
  email: string;
  password: string;
  ownerName: string;
  businessName: string;
  phone: string;
  role?: "owner" | "manager" | "staff" | "admin";
  emailVerified?: boolean;
  approvalStatus?: ApprovalStatus;
}): Promise<AuthUser> {
  await ensureAuthTables();

  const id = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  const createdAt = new Date().toISOString().split("T")[0];

  try {
    await db.execute({
      sql: `INSERT INTO users (id, email, password, owner_name, business_name, phone, role, email_verified, approval_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        input.email.trim().toLowerCase(),
        hashPassword(input.password),
        input.ownerName.trim(),
        input.businessName?.trim() || input.ownerName.trim(),
        input.phone?.trim() || "",
        input.role || "owner",
        input.emailVerified ? 1 : 0,
        input.approvalStatus ?? ((input.role || "owner") === "owner" ? "pending" : "approved"),
        createdAt,
      ],
    });

    const user = await getUserById(id);
    if (!user) throw new Error("Failed to create user");
    return withoutPassword(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      throw new Error("An account with this email already exists.");
    }
    throw err;
  }
}

export async function upsertStaffUser(input: {
  businessOwnerId: string;
  staffId: string;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  password?: string;
  role?: "manager" | "staff";
  permissions: string[];
  locationId: string;
}): Promise<AuthUser> {
  await ensureAuthTables();
  const existing = await db.execute({
    sql: "SELECT * FROM users WHERE staff_id = ? AND business_owner_id = ?",
    args: [input.staffId, input.businessOwnerId],
  });

  if (existing.rows.length) {
    const current = rowToUser(existing.rows[0]);
    const password = input.password ? hashPassword(input.password) : current.password;
    await db.execute({
      sql: `UPDATE users SET email = ?, password = ?, owner_name = ?, business_name = ?,
            phone = ?, role = ?, permissions = ?, location_id = ? WHERE id = ?`,
      args: [
        input.email.trim().toLowerCase(), password, input.name.trim(), input.businessName,
        input.phone, input.role || "staff", JSON.stringify(input.permissions), input.locationId, current.id,
      ],
    });
    const updated = await getUserById(current.id);
    if (!updated) throw new Error("Failed to update staff login.");
    return withoutPassword(updated);
  }

  if (!input.password || input.password.length < 8) {
    throw new Error("Staff password must be at least 8 characters.");
  }

  const id = `staff_user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.execute({
    sql: `INSERT INTO users
          (id, email, password, owner_name, business_name, phone, role, email_verified,
           approval_status, created_at, business_owner_id, staff_id, permissions, location_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'approved', ?, ?, ?, ?, ?)`,
    args: [
      id, input.email.trim().toLowerCase(), hashPassword(input.password), input.name.trim(),
      input.businessName, input.phone, input.role || "staff",
      new Date().toISOString().slice(0, 10), input.businessOwnerId, input.staffId,
      JSON.stringify(input.permissions), input.locationId,
    ],
  });
  const created = await getUserById(id);
  if (!created) throw new Error("Failed to create staff login.");
  return withoutPassword(created);
}

/** Every login account on the platform (business owners, managers, and staff) — admin use only. */
export async function getAllUsers(): Promise<AuthUser[]> {
  await ensureAuthTables();
  const res = await db.execute("SELECT * FROM users ORDER BY created_at DESC");
  return res.rows.map((row) => withoutPassword(rowToUser(row)));
}

export async function getStaffUsersForOwner(businessOwnerId: string): Promise<AuthUser[]> {
  await ensureAuthTables();
  const res = await db.execute({
    sql: "SELECT * FROM users WHERE business_owner_id = ? AND staff_id IS NOT NULL ORDER BY owner_name COLLATE NOCASE ASC",
    args: [businessOwnerId],
  });
  return res.rows.map((row) => withoutPassword(rowToUser(row)));
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureAuthTables();
  const res = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  return res.rows.length ? rowToUser(res.rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureAuthTables();
  const res = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });
  return res.rows.length ? rowToUser(res.rows[0]) : null;
}

export async function updateUserApprovalStatus(id: string, approvalStatus: ApprovalStatus): Promise<AuthUser> {
  await ensureAuthTables();
  const user = await getUserById(id);
  if (!user) throw new Error("User not found.");
  if (user.role === "admin") throw new Error("Admin accounts cannot be disapproved.");

  await db.execute({
    sql: "UPDATE users SET approval_status = ? WHERE id = ?",
    args: [approvalStatus, id],
  });

  const updated = await getUserById(id);
  if (!updated) throw new Error("Failed to update approval status.");
  return withoutPassword(updated);
}

/**
 * Freeze (or unfreeze) an account. A frozen account cannot log in and its
 * active sessions are revoked immediately so any already-open dashboard is
 * locked out. Retains an optional human-readable reason (e.g. "unpaid invoice").
 */
export async function updateAccountFreeze(
  id: string,
  frozen: boolean,
  reason: string | null = null,
): Promise<AuthUser> {
  await ensureAuthTables();
  const user = await getUserById(id);
  if (!user) throw new Error("User not found.");
  if (user.role === "admin") throw new Error("Admin accounts cannot be frozen.");

  await db.execute({
    sql: "UPDATE users SET account_frozen = ?, freeze_reason = ? WHERE id = ?",
    args: [frozen ? 1 : 0, frozen ? (reason ?? null) : null, id],
  });

  // Kick any already-active sessions so the freeze applies immediately.
  if (frozen) await revokeAllSessionsForUser(id);

  const updated = await getUserById(id);
  if (!updated) throw new Error("Failed to update account status.");
  return withoutPassword(updated);
}

/** Revoke every active session for a user (used when an account is frozen). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await ensureSessionsTable();
  await db.execute({
    sql: "UPDATE sessions SET revoked = 1 WHERE user_id = ?",
    args: [userId],
  });
}

export async function verifyUserEmail(email: string): Promise<AuthUser> {
  await ensureAuthTables();
  
  const user = await getUserByEmail(email);
  if (!user) throw new Error("Account not found.");

  await db.execute({
    sql: "UPDATE users SET email_verified = 1 WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });

  return withoutPassword({ ...user, emailVerified: true });
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, "ownerName" | "businessName" | "phone">>
): Promise<AuthUser> {
  await ensureAuthTables();

  const user = await getUserById(id);
  if (!user) throw new Error("User not found.");

  const fields: string[] = [];
  const args: InValue[] = [];

  if (updates.ownerName !== undefined) {
    fields.push("owner_name = ?");
    args.push(updates.ownerName.trim());
  }
  if (updates.businessName !== undefined) {
    fields.push("business_name = ?");
    args.push(updates.businessName.trim());
  }
  if (updates.phone !== undefined) {
    fields.push("phone = ?");
    args.push(updates.phone.trim());
  }

  if (fields.length === 0) return withoutPassword(user);

  args.push(id);
  await db.execute({
    sql: `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  const updated = await getUserById(id);
  if (!updated) throw new Error("Failed to update user");
  return withoutPassword(updated);
}

// ─── Sessions table ───────────────────────────────────────────────────────────

async function ensureSessionsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked    INTEGER NOT NULL DEFAULT 0
    )
  `);
}

/** Persist a new session. `id` should be SHA-256(token) — never the raw token. */
export async function createDbSession(id: string, userId: string, expiresAt: Date): Promise<void> {
  await ensureSessionsTable();
  await db.execute({
    sql: "INSERT OR REPLACE INTO sessions (id, user_id, expires_at, revoked) VALUES (?, ?, ?, 0)",
    args: [id, userId, expiresAt.toISOString()],
  });
}

/** Immediately revoke a session so it can never be reused. */
export async function revokeDbSession(id: string): Promise<void> {
  await ensureSessionsTable();
  await db.execute({
    sql: "UPDATE sessions SET revoked = 1 WHERE id = ?",
    args: [id],
  });
}

/** Returns true if the session exists AND is not revoked AND has not expired. */
export async function isSessionValid(id: string): Promise<boolean> {
  await ensureSessionsTable();
  const res = await db.execute({
    sql: "SELECT revoked, expires_at FROM sessions WHERE id = ?",
    args: [id],
  });
  if (!res.rows.length) return false;
  const row = res.rows[0];
  if ((row.revoked as number) === 1) return false;
  if (new Date(row.expires_at as string) < new Date()) return false;
  return true;
}

// ─── Periodic cleanup (call from a cron or on-demand) ────────────────────────
export async function pruneExpiredSessions(): Promise<void> {
  await ensureSessionsTable();
  await db.execute({
    sql: "DELETE FROM sessions WHERE expires_at < ?",
    args: [new Date().toISOString()],
  });
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export async function findOrCreateGoogleUser(profile: {
  googleId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}): Promise<AuthUser> {
  await ensureAuthTables();

  // 1. Find by google_id (returning user)
  const byGoogle = await db.execute({
    sql: "SELECT * FROM users WHERE google_id = ?",
    args: [profile.googleId],
  });
  if (byGoogle.rows.length) return withoutPassword(rowToUser(byGoogle.rows[0]));

  // 2. Find by email (existing account — link google_id)
  const existing = await getUserByEmail(profile.email);
  if (existing) {
    await db.execute({
      sql: "UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?",
      args: [profile.googleId, existing.id],
    });
    return withoutPassword({ ...existing, emailVerified: true });
  }

  // 3. Create new account (Google accounts always have verified email)
  const id = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  const createdAt = new Date().toISOString().split("T")[0];
  const unusablePassword = hashPassword(randomBytes(32).toString("hex"));

  await db.execute({
    // 'approved', matching /api/auth/signup: this build has no platform-admin
    // console to approve from, so 'pending' would lock the account out forever
    // (validateCredentials rejects pending accounts with a 403).
    sql: `INSERT INTO users (id, email, password, owner_name, business_name, phone, role, email_verified, approval_status, created_at, google_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'approved', ?, ?)`,
    args: [
      id,
      profile.email.trim().toLowerCase(),
      unusablePassword,
      profile.name.trim(),
      profile.name.trim(),
      "",
      "owner",
      createdAt,
      profile.googleId,
    ],
  });

  const user = await getUserById(id);
  if (!user) throw new Error("Failed to create Google user");
  return withoutPassword(user);
}

export async function validateCredentials(
  email: string,
  password: string
): Promise<AuthUser> {
  const user = await getUserByEmail(email);
  // Always run a full verify, even when user is null, to prevent timing-based
  // user-enumeration (attacker measuring response time to detect valid emails).
  // The decoy never matches, so the result is always false — it is computed
  // purely so the unknown-email path costs the same as the known-email one.
  const valid = verifyPassword(password, user ? user.password : decoyHash());
  if (!user || !valid) throw new Error("Invalid email or password.");
  if (user.approvalStatus === "pending") {
    throw new Error("Your account has been created and is waiting for admin approval.");
  }
  if (user.approvalStatus === "rejected") {
    throw new Error("Your account request was not approved. Please contact Pointly support.");
  }
  if (user.accountFrozen) {
    const reason = user.freezeReason
      ? ` Reason given: ${user.freezeReason}.`
      : "";
    throw new Error(`Your account has been frozen by Pointly.${reason} Please contact support to resolve this.`);
  }
  // Upgrade legacy plaintext password to hashed format on first successful login
  if (!user.password.startsWith("pbkdf2:")) {
    await db.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [hashPassword(password), user.id],
    });
  }
  return withoutPassword(user);
}
