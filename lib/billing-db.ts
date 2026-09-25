/**
 * lib/billing-db.ts
 *
 * Subscription payments recorded by platform admins, and the per-account
 * billing picture derived from them. See lib/billing.ts for the model.
 *
 * Like lib/admin-db.ts, nothing here checks authorization — every export
 * assumes the caller already passed requireAdmin().
 */

import { db } from "@/lib/db";
import { ensureAuthTables, getAllUsers, getUserById, setUserPlan } from "@/lib/auth-db";
import { PLAN_IDS, PLANS, normalizePlanId, type PlanId } from "@/lib/plans";
import {
  addMonths,
  billingStatus,
  nextPeriodStart,
  todayIso,
  type BillingAccount,
  type BillingSummary,
  type SubscriptionPayment,
} from "@/lib/billing";

let billingTableReady: Promise<void> | null = null;

async function ensureBillingTableUncached(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id                 TEXT PRIMARY KEY,
      owner_id           TEXT NOT NULL,
      owner_email        TEXT NOT NULL,
      business_name      TEXT NOT NULL,
      plan               TEXT NOT NULL,
      amount_pkr         INTEGER NOT NULL,
      months             INTEGER NOT NULL,
      method             TEXT NOT NULL,
      reference          TEXT,
      note               TEXT,
      paid_at            TEXT NOT NULL,
      period_start       TEXT NOT NULL,
      period_end         TEXT NOT NULL,
      recorded_by_id     TEXT NOT NULL,
      recorded_by_email  TEXT NOT NULL,
      created_at         TEXT NOT NULL,
      voided_at          TEXT,
      void_reason        TEXT
    )
  `);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_payments_owner ON subscription_payments(owner_id, period_end DESC)",
  ).catch(() => {});
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON subscription_payments(paid_at DESC)",
  ).catch(() => {});
}

export async function ensureBillingTable(): Promise<void> {
  billingTableReady ||= ensureBillingTableUncached().catch((error) => {
    billingTableReady = null;
    throw error;
  });
  return billingTableReady;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPayment(r: any): SubscriptionPayment {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    ownerEmail: String(r.owner_email),
    businessName: String(r.business_name),
    plan: normalizePlanId(r.plan),
    amountPkr: Number(r.amount_pkr ?? 0),
    months: Number(r.months ?? 0),
    method: String(r.method),
    reference: (r.reference as string) || null,
    note: (r.note as string) || null,
    paidAt: String(r.paid_at),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    recordedByEmail: String(r.recorded_by_email),
    createdAt: String(r.created_at),
    voidedAt: (r.voided_at as string) || null,
    voidReason: (r.void_reason as string) || null,
  };
}

export async function listPayments(limit = 500): Promise<SubscriptionPayment[]> {
  await ensureBillingTable();
  const res = await db.execute({
    sql: "SELECT * FROM subscription_payments ORDER BY paid_at DESC, created_at DESC LIMIT ?",
    args: [Math.min(Math.max(limit, 1), 2000)],
  });
  return res.rows.map(rowToPayment);
}

async function livePaymentsFor(ownerId: string): Promise<SubscriptionPayment[]> {
  await ensureBillingTable();
  const res = await db.execute({
    sql: "SELECT * FROM subscription_payments WHERE owner_id = ? AND voided_at IS NULL ORDER BY period_end DESC, created_at DESC",
    args: [ownerId],
  });
  return res.rows.map(rowToPayment);
}

/**
 * Records a payment against a business owner, extends their paid-until date by
 * `months`, and moves the account onto the plan that was paid for.
 */
export async function recordPayment(input: {
  ownerId: string;
  plan: PlanId;
  amountPkr: number;
  months: number;
  method: string;
  reference: string | null;
  note: string | null;
  paidAt: string;
  recordedBy: { id: string; email: string };
}): Promise<{ payment: SubscriptionPayment; planChanged: boolean }> {
  await ensureAuthTables();
  const owner = await getUserById(input.ownerId);
  if (!owner) throw new Error("Account not found.");
  if (owner.businessOwnerId || owner.role !== "owner") {
    throw new Error("Payments are recorded against the business owner's account.");
  }

  const [latest] = await livePaymentsFor(owner.id);
  const periodStart = nextPeriodStart(latest?.periodEnd ?? null, input.paidAt);
  const payment: SubscriptionPayment = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ownerId: owner.id,
    ownerEmail: owner.email,
    businessName: owner.businessName,
    plan: input.plan,
    amountPkr: input.amountPkr,
    months: input.months,
    method: input.method,
    reference: input.reference,
    note: input.note,
    paidAt: input.paidAt,
    periodStart,
    periodEnd: addMonths(periodStart, input.months),
    recordedByEmail: input.recordedBy.email,
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
  };

  await db.execute({
    sql: `INSERT INTO subscription_payments
            (id, owner_id, owner_email, business_name, plan, amount_pkr, months, method, reference, note,
             paid_at, period_start, period_end, recorded_by_id, recorded_by_email, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      payment.id, payment.ownerId, payment.ownerEmail, payment.businessName, payment.plan,
      payment.amountPkr, payment.months, payment.method, payment.reference, payment.note,
      payment.paidAt, payment.periodStart, payment.periodEnd,
      input.recordedBy.id, input.recordedBy.email, payment.createdAt,
    ],
  });

  const planChanged = owner.plan !== input.plan;
  if (planChanged) await setUserPlan(owner.id, input.plan);
  return { payment, planChanged };
}

/**
 * Voids a payment recorded by mistake. Only an account's most recent live
 * payment can be voided: each period is chained onto the end of the one before
 * it, so pulling one out of the middle would leave the later periods pointing
 * at dates nobody paid for. Void the newer ones first, then re-record.
 */
export async function voidPayment(id: string, reason: string | null): Promise<SubscriptionPayment> {
  await ensureBillingTable();
  const res = await db.execute({ sql: "SELECT * FROM subscription_payments WHERE id = ?", args: [id] });
  if (res.rows.length === 0) throw new Error("Payment not found.");
  const payment = rowToPayment(res.rows[0]);
  if (payment.voidedAt) throw new Error("That payment is already void.");

  const [latest] = await livePaymentsFor(payment.ownerId);
  if (latest && latest.id !== payment.id) {
    throw new Error("Only the latest payment on an account can be voided — void the newer one first.");
  }

  const voidedAt = new Date().toISOString();
  await db.execute({
    sql: "UPDATE subscription_payments SET voided_at = ?, void_reason = ? WHERE id = ?",
    args: [voidedAt, reason, id],
  });
  return { ...payment, voidedAt, voidReason: reason };
}

/**
 * Every billable business (owner accounts that weren't rejected) with its
 * paid-until date and status, plus the revenue roll-up the Billing tab shows.
 */
export async function getBillingOverview(): Promise<{
  accounts: BillingAccount[];
  summary: BillingSummary;
  payments: SubscriptionPayment[];
}> {
  const [users, payments] = await Promise.all([getAllUsers(), listPayments(2000)]);
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(`${thisMonth}-01`, -1).slice(0, 7);

  const byOwner = new Map<string, SubscriptionPayment[]>();
  for (const payment of payments) {
    if (payment.voidedAt) continue;
    const list = byOwner.get(payment.ownerId) ?? [];
    list.push(payment);
    byOwner.set(payment.ownerId, list);
  }

  const accounts: BillingAccount[] = users
    .filter((u) => u.role === "owner" && !u.businessOwnerId && u.approvalStatus !== "rejected")
    .map((u) => {
      const own = byOwner.get(u.id) ?? [];
      const paidUntil = own.reduce<string | null>((max, p) => (!max || p.periodEnd > max ? p.periodEnd : max), null);
      const last = own.reduce<SubscriptionPayment | null>(
        (latest, p) => (!latest || p.paidAt > latest.paidAt || (p.paidAt === latest.paidAt && p.createdAt > latest.createdAt) ? p : latest),
        null,
      );
      const { status, daysLeft } = billingStatus(paidUntil, today);
      return {
        id: u.id,
        email: u.email,
        ownerName: u.ownerName,
        businessName: u.businessName,
        phone: u.phone,
        plan: u.plan,
        accountFrozen: u.accountFrozen,
        approvalStatus: u.approvalStatus,
        createdAt: u.createdAt,
        paidUntil,
        status,
        daysLeft,
        lastPayment: last ? { paidAt: last.paidAt, amountPkr: last.amountPkr, method: last.method } : null,
        totalPaidPkr: own.reduce((sum, p) => sum + p.amountPkr, 0),
      };
    });

  const live = payments.filter((p) => !p.voidedAt);
  const payingByPlan = Object.fromEntries(PLAN_IDS.map((id) => [id, 0])) as Record<PlanId, number>;
  let mrrPkr = 0;
  for (const account of accounts) {
    if (account.status === "paid" || account.status === "due-soon") {
      payingByPlan[account.plan] += 1;
      mrrPkr += PLANS[account.plan].pricePkr;
    }
  }

  const summary: BillingSummary = {
    mrrPkr,
    potentialMrrPkr: accounts.reduce((sum, a) => sum + PLANS[a.plan].pricePkr, 0),
    collectedThisMonthPkr: live.filter((p) => p.paidAt.startsWith(thisMonth)).reduce((s, p) => s + p.amountPkr, 0),
    collectedLastMonthPkr: live.filter((p) => p.paidAt.startsWith(lastMonth)).reduce((s, p) => s + p.amountPkr, 0),
    collectedAllTimePkr: live.reduce((s, p) => s + p.amountPkr, 0),
    payingByPlan,
    paid: accounts.filter((a) => a.status === "paid").length,
    dueSoon: accounts.filter((a) => a.status === "due-soon").length,
    overdue: accounts.filter((a) => a.status === "overdue").length,
    neverPaid: accounts.filter((a) => a.status === "never-paid").length,
  };

  return { accounts, summary, payments: payments.slice(0, 500) };
}
