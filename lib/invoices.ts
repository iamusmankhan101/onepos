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
  taxAmount: number;        // 0 for now; ready for future
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
