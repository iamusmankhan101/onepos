/**
 * lib/billing.ts
 *
 * Subscription billing shapes and date maths shared by the /admin console and
 * lib/billing-db.ts. Isomorphic like lib/plans.ts — no DB, no `window`.
 *
 * This build has no payment gateway: a business pays over WhatsApp, bank
 * transfer or cash, and a platform admin records the payment in the console.
 * Each payment buys whole months, and an account's "paid until" date is the end
 * of the latest payment's period. Nothing is locked automatically when that
 * date passes — the console surfaces it and the admin decides (a reminder, a
 * freeze, or a move to Basic).
 */

import type { PlanId } from "./plans";

export const PAYMENT_METHODS = [
  "Bank transfer", "JazzCash", "EasyPaisa", "Raast", "Cash", "Card", "Other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_MONTH_OPTIONS = [1, 3, 6, 12] as const;

/** Days before the paid-until date at which an account counts as "due soon". */
export const DUE_SOON_DAYS = 7;

export interface SubscriptionPayment {
  id: string;
  ownerId: string;
  /** Snapshots taken when the payment was recorded, so a deleted account's history still reads. */
  ownerEmail: string;
  businessName: string;
  plan: PlanId;
  amountPkr: number;
  months: number;
  method: string;
  reference: string | null;
  note: string | null;
  /** YYYY-MM-DD the money was received. */
  paidAt: string;
  /** YYYY-MM-DD, inclusive. */
  periodStart: string;
  /** YYYY-MM-DD, exclusive — the new paid-until date. */
  periodEnd: string;
  recordedByEmail: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export type BillingStatus = "paid" | "due-soon" | "overdue" | "never-paid";

export interface BillingAccount {
  id: string;
  email: string;
  ownerName: string;
  businessName: string;
  phone: string;
  plan: PlanId;
  accountFrozen: boolean;
  approvalStatus: string;
  createdAt: string;
  paidUntil: string | null;
  status: BillingStatus;
  /** Whole days until paidUntil — negative once overdue, null when never paid. */
  daysLeft: number | null;
  lastPayment: { paidAt: string; amountPkr: number; method: string } | null;
  totalPaidPkr: number;
}

export interface BillingSummary {
  /** Monthly price of every account whose subscription is currently paid up. */
  mrrPkr: number;
  /** Monthly price of every billable account, paid or not — the ceiling MRR could reach. */
  potentialMrrPkr: number;
  collectedThisMonthPkr: number;
  collectedLastMonthPkr: number;
  collectedAllTimePkr: number;
  payingByPlan: Record<PlanId, number>;
  paid: number;
  dueSoon: number;
  overdue: number;
  neverPaid: number;
}

// ─── Dates (all as YYYY-MM-DD, local calendar days) ───────────────────────────

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Calendar-month addition that clamps to the last day of the target month, so
 * 31 Jan + 1 month is 28/29 Feb rather than spilling into March.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Where a new payment's period begins: straight after the current one when the
 * account is still paid up (renewing early never loses days), otherwise on the
 * day the money arrived.
 */
export function nextPeriodStart(paidUntil: string | null, paidAt: string): string {
  return paidUntil && paidUntil > paidAt ? paidUntil : paidAt;
}

export function billingStatus(paidUntil: string | null, today = todayIso()): { status: BillingStatus; daysLeft: number | null } {
  if (!paidUntil) return { status: "never-paid", daysLeft: null };
  const daysLeft = daysBetween(today, paidUntil);
  if (daysLeft <= 0) return { status: "overdue", daysLeft };
  if (daysLeft <= DUE_SOON_DAYS) return { status: "due-soon", daysLeft };
  return { status: "paid", daysLeft };
}

/** "0300 1234567" / "+92 300…" → "923001234567", the digits-only form wa.me takes. */
export function whatsAppNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) digits = `92${digits}`;
  return digits.length >= 11 ? digits : null;
}
