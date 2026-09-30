/**
 * lib/invoice-settings-db.ts
 *
 * Storage for the invoice's "Billed From" block and the library of bank
 * accounts (payment methods) businesses can be pointed at. Types and defaults
 * are in lib/invoice-settings.ts.
 *
 * Like lib/admin-db.ts, nothing here checks authorization — every write
 * assumes the caller already passed requireAdmin().
 */

import { db } from "@/lib/db";
import { ensureAuthTables } from "@/lib/auth-db";
import {
  DEFAULT_BANK_DETAILS, DEFAULT_BILLED_FROM,
  type BilledFrom, type PayTo, type PaymentMethod,
} from "@/lib/invoice-settings";

let ready: Promise<void> | null = null;

async function ensureTablesUncached(): Promise<void> {
  await ensureAuthTables();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id             TEXT PRIMARY KEY,
      label          TEXT NOT NULL,
      bank_name      TEXT NOT NULL DEFAULT '',
      bank_title     TEXT NOT NULL,
      account_number TEXT NOT NULL,
      iban           TEXT NOT NULL,
      created_at     TEXT NOT NULL
    )
  `);
  // Which payment_methods row a business's invoice shows — null = DEFAULT_BANK_DETAILS.
  await db.execute("ALTER TABLE users ADD COLUMN payment_method_id TEXT").catch(() => {});
}

export async function ensureInvoiceSettingsTables(): Promise<void> {
  ready ||= ensureTablesUncached().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

// ── Billed From ──────────────────────────────────────────────────────────────

export async function getBilledFrom(): Promise<BilledFrom> {
  await ensureInvoiceSettingsTables();
  const res = await db.execute({ sql: "SELECT value FROM platform_settings WHERE key = 'billed_from'", args: [] });
  if (res.rows.length === 0) return DEFAULT_BILLED_FROM;
  try {
    return { ...DEFAULT_BILLED_FROM, ...(JSON.parse(String(res.rows[0].value)) as Partial<BilledFrom>) };
  } catch {
    return DEFAULT_BILLED_FROM;
  }
}

export async function setBilledFrom(input: BilledFrom): Promise<BilledFrom> {
  await ensureInvoiceSettingsTables();
  const value: BilledFrom = {
    name: input.name.trim().slice(0, 120),
    tagline: input.tagline.trim().slice(0, 160),
    phone: input.phone.trim().slice(0, 60),
    email: input.email.trim().slice(0, 160),
    address: input.address.trim().slice(0, 240),
  };
  await db.execute({
    sql: `INSERT INTO platform_settings (key, value, updated_at) VALUES ('billed_from', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [JSON.stringify(value), new Date().toISOString()],
  });
  return value;
}

// ── Payment methods ──────────────────────────────────────────────────────────

export type PaymentMethodInput = Pick<PaymentMethod, "label" | "bankName" | "bankTitle" | "accountNumber" | "iban">;

function rowToMethod(r: Record<string, unknown>): PaymentMethod {
  return {
    id: String(r.id),
    label: String(r.label),
    bankName: String(r.bank_name ?? ""),
    bankTitle: String(r.bank_title),
    accountNumber: String(r.account_number),
    iban: String(r.iban),
    createdAt: String(r.created_at),
  };
}

function clean(input: PaymentMethodInput): PaymentMethodInput {
  return {
    label: input.label.trim().slice(0, 80),
    bankName: input.bankName.trim().slice(0, 80),
    bankTitle: input.bankTitle.trim().slice(0, 120),
    accountNumber: input.accountNumber.trim().slice(0, 40),
    iban: input.iban.trim().replace(/\s+/g, "").toUpperCase().slice(0, 40),
  };
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  await ensureInvoiceSettingsTables();
  const res = await db.execute("SELECT * FROM payment_methods ORDER BY created_at ASC");
  return res.rows.map((r) => rowToMethod(r as unknown as Record<string, unknown>));
}

export async function createPaymentMethod(input: PaymentMethodInput): Promise<PaymentMethod> {
  await ensureInvoiceSettingsTables();
  const method: PaymentMethod = {
    id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...clean(input),
    createdAt: new Date().toISOString(),
  };
  await db.execute({
    sql: "INSERT INTO payment_methods (id, label, bank_name, bank_title, account_number, iban, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [method.id, method.label, method.bankName, method.bankTitle, method.accountNumber, method.iban, method.createdAt],
  });
  return method;
}

export async function updatePaymentMethod(id: string, input: PaymentMethodInput): Promise<PaymentMethod> {
  await ensureInvoiceSettingsTables();
  const value = clean(input);
  const res = await db.execute({
    sql: "UPDATE payment_methods SET label = ?, bank_name = ?, bank_title = ?, account_number = ?, iban = ? WHERE id = ?",
    args: [value.label, value.bankName, value.bankTitle, value.accountNumber, value.iban, id],
  });
  if (res.rowsAffected === 0) throw new Error("Payment method not found.");
  const row = await db.execute({ sql: "SELECT * FROM payment_methods WHERE id = ?", args: [id] });
  return rowToMethod(row.rows[0] as unknown as Record<string, unknown>);
}

/** Deletes a method; businesses pointed at it fall back to DEFAULT_BANK_DETAILS. */
export async function deletePaymentMethod(id: string): Promise<PaymentMethod> {
  await ensureInvoiceSettingsTables();
  const row = await db.execute({ sql: "SELECT * FROM payment_methods WHERE id = ?", args: [id] });
  if (row.rows.length === 0) throw new Error("Payment method not found.");
  await db.batch([
    { sql: "UPDATE users SET payment_method_id = NULL WHERE payment_method_id = ?", args: [id] },
    { sql: "DELETE FROM payment_methods WHERE id = ?", args: [id] },
  ], "write");
  return rowToMethod(row.rows[0] as unknown as Record<string, unknown>);
}

/** Points a business's invoices at one of the methods, or back at the default with null. */
export async function setPaymentMethodForUser(userId: string, paymentMethodId: string | null): Promise<void> {
  await ensureInvoiceSettingsTables();
  if (paymentMethodId) {
    const found = await db.execute({ sql: "SELECT id FROM payment_methods WHERE id = ?", args: [paymentMethodId] });
    if (found.rows.length === 0) throw new Error("Payment method not found.");
  }
  await db.execute({ sql: "UPDATE users SET payment_method_id = ? WHERE id = ?", args: [paymentMethodId, userId] });
}

/** Every business's assigned method id (only the ones that have one). */
export async function paymentMethodAssignments(): Promise<Map<string, string>> {
  await ensureInvoiceSettingsTables();
  const res = await db.execute("SELECT id, payment_method_id FROM users WHERE payment_method_id IS NOT NULL");
  return new Map(res.rows.map((r) => [String(r.id), String(r.payment_method_id)]));
}

/** The bank details a business's invoice tells it to pay into. */
export async function payToFor(userId: string): Promise<PayTo> {
  await ensureInvoiceSettingsTables();
  const res = await db.execute({
    sql: `SELECT pm.bank_name, pm.bank_title, pm.account_number, pm.iban
            FROM users u JOIN payment_methods pm ON pm.id = u.payment_method_id
           WHERE u.id = ?`,
    args: [userId],
  });
  if (res.rows.length === 0) return DEFAULT_BANK_DETAILS;
  const r = res.rows[0];
  return { bankName: String(r.bank_name ?? ""), bankTitle: String(r.bank_title), accountNumber: String(r.account_number), iban: String(r.iban) };
}
