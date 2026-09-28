// ─── Customer Invoicing ────────────────────────────────────────────────────────
// These invoices are issued by the business TO its clients (distinct from the
// platform subscription invoices of the upstream product, which this build dropped
// TO the business owner).

import type { PaymentMethod } from "@/lib/types";
import { persistEntity, recordDeletions } from "@/lib/turso-sync";
import { locationUserKey } from "@/lib/locations";

export type InvoiceStatus = "paid" | "unpaid";

export type InvoiceItemType = "service" | "product";

export interface InvoiceItem {
  id: string;
  type: InvoiceItemType;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  number: string;           // e.g. "SI-2026-0001"
  appointmentId?: string;   // optional link to an appointment
  clientId?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  staffName: string;
  items: InvoiceItem[];
  subtotal: number;
  discountAmount: number;   // flat discount in PKR (primary discount + loyalty redemption combined)
  discount2Amount?: number; // flat discount in PKR — separate, additional discount stacked on top of discountAmount
  taxAmount: number;
  /** What the tax line is called on the receipt ("GST"); unset reads as "Tax". */
  taxLabel?: string;
  /** Service charge in PKR, added before tax (lib/charges.ts). Counted in `total`. */
  serviceChargeAmount?: number;
  total: number;
  paymentMethod: PaymentMethod | "";
  date: string;             // YYYY-MM-DD — when the invoice was issued
  paidDate?: string;        // YYYY-MM-DD — when it was actually marked paid; unset while unpaid
  status: InvoiceStatus;
  notes?: string;
  createdAt: string;        // ISO timestamp
  source?: "pos" | "manual";
  /** Which business section this sale belongs to (e.g. "Men's", "Women's"). Free text, cosmetic only. */
  section?: string;
  /** Restaurant mode: the order (lib/restaurant.ts) this invoice settled, and how it was served. */
  orderId?: string;
  orderType?: "dine-in" | "takeaway" | "delivery";
  tableNames?: string;
  /** Delivery orders: printed on the receipt so the rider has it. */
  deliveryAddress?: string;
  /**
   * Split payment: how the total was actually paid. `paymentMethod` then holds
   * the largest part, so anything that reads only it still sees a real method.
   * Totals by method should go through paymentParts().
   */
  payments?: { method: PaymentMethod; amount: number }[];
  /** Who rang it up (the signed-in user) — `staffName` is who it's credited to (waiter, stylist). */
  cashierName?: string;
  /** The cash-drawer shift (lib/shifts.ts) open when it was rung up. */
  shiftId?: string;
  /**
   * A refund is a credit note: its own invoice, dated the day of the refund,
   * with negative quantities and total, pointing at the sale it refunds. Every
   * revenue and cash total that adds up invoices subtracts it automatically.
   */
  refundOf?: string;
  refundOfNumber?: string;
  refundReason?: string;
  approvedBy?: string;
  /** On a sale: how much of it has been refunded so far (positive). */
  refundedAmount?: number;
}

/** The invoice's payment split into methods — one part unless it was a split payment. */
export function paymentParts(inv: Pick<Invoice, "payments" | "paymentMethod" | "total">): { method: string; amount: number }[] {
  if (inv.payments?.length) return inv.payments;
  return [{ method: inv.paymentMethod || "", amount: inv.total }];
}

export function isRefund(inv: Pick<Invoice, "refundOf">): boolean {
  return !!inv.refundOf;
}

/** What's left to refund on a sale. */
export function refundable(inv: Invoice): number {
  if (isRefund(inv) || inv.status !== "paid") return 0;
  return Math.max(0, inv.total - (inv.refundedAmount ?? 0));
}

/**
 * What refunding these quantities of a sale's lines comes to: each line's
 * share of the amount actually charged, so discounts, tax and service charge
 * are refunded in proportion. Capped at what's still refundable.
 */
export function refundAmount(inv: Invoice, qtyByItemId: Record<string, number>): number {
  const ratio = inv.subtotal > 0 ? inv.total / inv.subtotal : 1;
  const gross = inv.items.reduce((sum, item) => {
    const qty = Math.min(item.qty, Math.max(0, qtyByItemId[item.id] ?? 0));
    return sum + (item.qty > 0 ? (item.total / item.qty) * qty : 0);
  }, 0);
  return Math.min(refundable(inv), Math.round(gross * ratio));
}

function nextRefundNumber(existing: Invoice[]): string {
  const prefix = `RF-${new Date().getFullYear()}-`;
  const highest = existing.reduce((max, inv) => {
    if (typeof inv?.number !== "string" || !inv.number.startsWith(prefix)) return max;
    const seq = parseInt(inv.number.slice(prefix.length), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

/**
 * Refunds part or all of a paid sale: writes the credit note and adds its
 * amount to the sale's refundedAmount, in one save.
 */
export async function createRefund(original: Invoice, input: {
  qtyByItemId: Record<string, number>;
  method: PaymentMethod;
  reason: string;
  approvedBy: string;
  cashierName?: string;
  shiftId?: string;
  /** Override the proportional amount (a goodwill partial refund). */
  amount?: number;
}): Promise<{ refund: Invoice; dbSaved: boolean }> {
  const existing = getInvoices();
  const fresh = existing.find((i) => i.id === original.id) ?? original;
  const amount = Math.min(refundable(fresh), Math.round(input.amount ?? refundAmount(fresh, input.qtyByItemId)));
  if (!(amount > 0)) throw new Error("Nothing to refund.");
  // Lines are scaled to what was actually charged for them (their share of
  // discounts, tax and service charge), so the credit note's lines add up to
  // its total exactly — the rounding remainder goes on the last line.
  const picked = fresh.items.filter((item) => (input.qtyByItemId[item.id] ?? 0) > 0 && item.qty > 0);
  const gross = picked.reduce((s, item) => s + (item.total / item.qty) * Math.min(item.qty, input.qtyByItemId[item.id]), 0);
  const scale = gross > 0 ? amount / gross : 0;
  let running = 0;
  const items: InvoiceItem[] = picked.map((item, index) => {
    const qty = Math.min(item.qty, input.qtyByItemId[item.id]);
    const last = index === picked.length - 1;
    const lineTotal = last ? amount - running : Math.round((item.total / item.qty) * qty * scale);
    running += lineTotal;
    return { ...item, id: crypto.randomUUID(), qty: -qty, unitPrice: Math.round(lineTotal / qty), total: -lineTotal };
  });
  const now = new Date();
  const refund: Invoice = {
    id: crypto.randomUUID(),
    number: nextRefundNumber(existing),
    clientId: fresh.clientId,
    clientName: fresh.clientName,
    clientPhone: fresh.clientPhone,
    staffName: fresh.staffName,
    section: fresh.section,
    items: items.length ? items : [{ id: crypto.randomUUID(), type: "product", description: `Refund on ${fresh.number}`, qty: -1, unitPrice: amount, total: -amount }],
    subtotal: -amount,
    discountAmount: 0,
    taxAmount: 0,
    total: -amount,
    paymentMethod: input.method,
    date: localDateKey(now),
    paidDate: localDateKey(now),
    status: "paid",
    notes: `Refund of ${fresh.number} — ${input.reason}`,
    createdAt: now.toISOString(),
    source: fresh.source ?? "pos",
    orderType: fresh.orderType,
    refundOf: fresh.id,
    refundOfNumber: fresh.number,
    refundReason: input.reason,
    approvedBy: input.approvedBy,
    cashierName: input.cashierName,
    shiftId: input.shiftId,
  };
  const updatedOriginal: Invoice = { ...fresh, refundedAmount: (fresh.refundedAmount ?? 0) + amount };
  const list = [refund, ...existing.map((i) => (i.id === fresh.id ? updatedOriginal : i))];
  const dbSaved = await saveInvoices(list);
  return { refund, dbSaved };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const BASE_KEY     = "pointly_invoices";
const BASE_COUNTER = "pointly_invoice_counter";

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getInvoices(): Invoice[] {
  if (typeof window === "undefined") return [];
  try {
    const key = locationUserKey(BASE_KEY);
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as Invoice[];
    let migrated = false;
    const invoices = parsed.map((invoice) => {
      if (invoice.source !== "pos" || !invoice.createdAt) return invoice;
      const createdAt = new Date(invoice.createdAt);
      if (Number.isNaN(createdAt.getTime())) return invoice;
      const utcDate = invoice.createdAt.slice(0, 10);
      const localDate = localDateKey(createdAt);
      if (invoice.date !== utcDate || invoice.date === localDate) return invoice;
      migrated = true;
      return { ...invoice, date: localDate };
    });
    if (migrated) {
      persistEntity("invoices", invoices);
    }
    return invoices;
  } catch {
    return [];
  }
}

/**
 * Saves locally (always) and returns the Turso write's outcome so a caller
 * that needs to know whether the save actually reached the shared database
 * (POS checkout) can await it. Callers that don't care can call this without
 * awaiting — same fire-and-forget behavior as before.
 */
export function saveInvoices(list: Invoice[]): Promise<boolean> {
  if (typeof window !== "undefined") {
    return persistEntity("invoices", list);
  }
  return Promise.resolve(false);
}

/**
 * The counter behind an invoice number lives in this browser's localStorage, so
 * on its own two terminals signed into the same business hand out the *same*
 * number — each one only ever sees its own tally. Every invoice either terminal
 * has issued is synced into the list below, so the highest number already in it
 * is the real high-water mark; taking whichever of the two is greater keeps the
 * sequence unique across devices instead of restarting it on each one.
 *
 * Two checkouts rung up on separate terminals in the same instant (before
 * either sync lands) can still collide — the id, not the number, is what keeps
 * those two invoices distinct records.
 */
function nextInvoiceNumber(existing: Invoice[]): string {
  if (typeof window === "undefined") return "SI-0001";
  const counterKey = locationUserKey(BASE_COUNTER);
  const year = new Date().getFullYear();
  const prefix = `SI-${year}-`;

  const highestIssued = existing.reduce((max, invoice) => {
    if (typeof invoice?.number !== "string" || !invoice.number.startsWith(prefix)) return max;
    const seq = parseInt(invoice.number.slice(prefix.length), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);

  const counter = parseInt(localStorage.getItem(counterKey) || "0", 10);
  const n = Math.max(Number.isNaN(counter) ? 0 : counter, highestIssued) + 1;
  localStorage.setItem(counterKey, String(n));
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Creates the invoice and awaits the Turso write, reporting whether it
 * actually landed — checkout can then warn the cashier on failure instead of
 * silently leaving the sale invisible on every device but the one that rang
 * it up (the previous fire-and-forget save could fail with nothing but a
 * console warning, which is how invoices went missing from the shared DB
 * while their WhatsApp receipts still sent).
 */
export async function createInvoice(
  draft: Omit<Invoice, "id" | "number" | "createdAt">
): Promise<{ invoice: Invoice; dbSaved: boolean }> {
  const existing = getInvoices();
  const invoice: Invoice = {
    ...draft,
    id: crypto.randomUUID(),
    number: nextInvoiceNumber(existing),
    createdAt: new Date().toISOString(),
  };
  const list = [invoice, ...existing];
  const dbSaved = await saveInvoices(list);
  return { invoice, dbSaved };
}

export function updateInvoice(updated: Invoice): void {
  const list = getInvoices().map((inv) => (inv.id === updated.id ? updated : inv));
  saveInvoices(list);
}

/**
 * Removing the invoice from the list is not enough on its own to make the
 * delete stick — the queued WhatsApp receipt and other devices' localStorage
 * both merge it back (see lib/deleted-records.ts), which is why deleted
 * invoices used to reappear minutes later. The tombstone is what makes it
 * permanent, so it is recorded first and awaited by callers that care.
 */
export async function deleteInvoice(id: string): Promise<void> {
  const tombstoned = recordDeletions("invoices", [id]);
  saveInvoices(getInvoices().filter((inv) => inv.id !== id));
  await tombstoned;
}

export function markInvoicePaid(id: string, paymentMethod: PaymentMethod, paidDate?: string): void {
  const list = getInvoices().map((inv) =>
    inv.id === id ? { ...inv, status: "paid" as InvoiceStatus, paymentMethod, paidDate: paidDate || localDateKey() } : inv
  );
  saveInvoices(list);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcTotals(
  items: InvoiceItem[],
  discountAmount: number,
  taxRate = 0
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = Math.round(items.reduce((s, i) => s + i.total, 0));
  const discount = Math.min(Math.max(0, Math.round(discountAmount)), subtotal);
  const taxAmount = Math.round((subtotal - discount) * taxRate);
  const total = Math.max(0, Math.round(subtotal - discount + taxAmount));
  return { subtotal, taxAmount, total };
}

export function newBlankItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    type: "service",
    description: "",
    qty: 1,
    unitPrice: 0,
    total: 0,
  };
}
