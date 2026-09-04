#!/usr/bin/env node
/**
 * scripts/create-admin.mjs — bootstrap a platform admin.
 *
 * The console at /admin is only reachable by an account whose role is "admin",
 * and nothing in the app hands out that role: sign-up always creates an
 * "owner". That is deliberate — an HTTP endpoint that mints platform admins is
 * a permanent way in, whether or not it is guarded by a secret. So the first
 * admin is made here, from a machine that already has the database
 * credentials, and every one after that from the console itself.
 *
 * Usage (from the project root, with .env.local in place):
 *
 *   node scripts/create-admin.mjs --list
 *   node scripts/create-admin.mjs you@example.com                 # promote an existing account
 *   node scripts/create-admin.mjs you@example.com 'strong-pass'   # or create a new one
 *   node scripts/create-admin.mjs you@example.com --demote        # back to a normal owner
 *
 * Needs Node >= 20 — see the engines field in package.json.
 */

import { readFileSync } from "node:fs";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";

// ─── Env ──────────────────────────────────────────────────────────────────────

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (!process.env.TURSO_DATABASE_URL) {
  console.error("TURSO_DATABASE_URL is not set — run this from the project root with .env.local in place.");
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Must match hashPassword() in lib/auth-db.ts, or the account it writes can
// never sign in.
function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(plain, salt, 120_000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * The users table and its later columns are created lazily by
 * ensureAuthTables() in lib/auth-db.ts, which only runs once the app has
 * served a request. On a database that has never been used this mirrors it, so
 * bootstrapping works before the first sign-in.
 */
async function ensureSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id                TEXT PRIMARY KEY,
      email             TEXT NOT NULL UNIQUE,
      password          TEXT NOT NULL,
      owner_name        TEXT NOT NULL,
      business_name     TEXT NOT NULL,
      phone             TEXT,
      role              TEXT NOT NULL DEFAULT 'owner',
      email_verified    INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      google_id         TEXT
    )
  `);
  for (const column of [
    "ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'",
    "ALTER TABLE users ADD COLUMN account_frozen INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN freeze_reason TEXT",
  ]) {
    await db.execute(column).catch(() => { /* column already there */ });
  }
}

async function listAdmins() {
  const res = await db.execute("SELECT id, email, owner_name, created_at FROM users WHERE role = 'admin' ORDER BY created_at");
  if (res.rows.length === 0) {
    console.log("No platform admins yet. Run: node scripts/create-admin.mjs <email> [password]");
    return;
  }
  console.log(`${res.rows.length} platform admin(s):`);
  for (const row of res.rows) {
    console.log(`  ${row.email}  ${row.owner_name || ""}  (${row.id}, since ${row.created_at})`);
  }
}

async function demote(email) {
  const res = await db.execute({ sql: "SELECT id, role FROM users WHERE email = ?", args: [email] });
  if (res.rows.length === 0) throw new Error(`No account found for ${email}.`);
  if (res.rows[0].role !== "admin") throw new Error(`${email} is not a platform admin.`);

  const admins = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  if (Number(admins.rows[0].n) <= 1) throw new Error("That is the last platform admin — promote someone else first.");

  await db.execute({ sql: "UPDATE users SET role = 'owner' WHERE id = ?", args: [res.rows[0].id] });
  console.log(`${email} is now a normal business owner.`);
}

async function promoteOrCreate(email, password) {
  const existing = await db.execute({ sql: "SELECT id, role FROM users WHERE email = ?", args: [email] });

  if (existing.rows.length > 0) {
    const { id, role } = existing.rows[0];
    if (role === "admin") {
      console.log(`${email} is already a platform admin.`);
      return;
    }
    // An admin is also unfrozen and approved — a frozen or pending account
    // can't sign in at all, so promoting one without this leaves an admin who
    // is locked out of their own console.
    await db.execute({
      sql: "UPDATE users SET role = 'admin', approval_status = 'approved', account_frozen = 0, freeze_reason = NULL WHERE id = ?",
      args: [id],
    });
    console.log(`${email} is now a platform admin. Sign in as usual — you land on /admin.`);
    return;
  }

  if (!password) {
    throw new Error(`No account exists for ${email}. Pass a password to create one:\n  node scripts/create-admin.mjs ${email} 'a-strong-password'`);
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await db.execute({
    sql: `INSERT INTO users (id, email, password, owner_name, business_name, phone, role, email_verified, approval_status, created_at)
          VALUES (?, ?, ?, ?, ?, '', 'admin', 1, 'approved', ?)`,
    args: [id, email, hashPassword(password), "Platform Admin", "Pointly", new Date().toISOString().slice(0, 10)],
  });
  console.log(`Created platform admin ${email} (${id}). Sign in on the Admin tab of /sign-in.`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

try {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Usage:\n  node scripts/create-admin.mjs --list\n  node scripts/create-admin.mjs <email> [password]\n  node scripts/create-admin.mjs <email> --demote");
    process.exit(0);
  }

  await ensureSchema();

  if (args[0] === "--list") {
    await listAdmins();
  } else {
    const email = args[0].trim().toLowerCase();
    if (!email.includes("@")) throw new Error(`"${args[0]}" does not look like an email address.`);
    if (args[1] === "--demote") await demote(email);
    else await promoteOrCreate(email, args[1]);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
