/**
 * lib/ledger.ts
 *
 * The khata: what customers owe the business (udhaar) and what the business
 * owes its suppliers.
 *
 * Customers
 *   • A credit sale is an ordinary invoice left "unpaid" (Invoice.onCredit),
 *     possibly with part of it paid at the till (Invoice.amountPaid).
 *   • Money collected later is a CustomerLedgerEntry of kind "payment". It is
 *     applied to the customer's oldest unpaid invoices first; an invoice it
 *     covers in full becomes "paid" — which is also when Revenue counts it,
 *     as it always has. Anything left over stays on account as an advance.
 *   • A collection taken while the cash drawer is open carries the shift's id,
 *     so the Z report counts its cash (lib/shifts.ts).
 *   • "opening" brings over an old balance from the paper khata; "adjustment"
 *     corrects one (negative writes some off).
 *
 * Suppliers
 *   • Every received purchase order adds its total to what is owed.
 *   • Payments, goods sent back ("return") and adjustments take it down;
 *     "opening" brings over an old balance.
 *   • Cash Flow is cash-based: a supplier payment is entered there as an
 *     expense when it is made, not when the goods arrive.
 *
 * Balances are always worked out from the records, never stored, so two tills
 * editing the same customer can't leave a stale total behind.
 */

import { persistEntity } from "./turso-sync";
import { entityStorageKey } from "./sync-records";
import { getInvoices, isRefund, localDateKey, saveInvoices, type Invoice } from "./invoices";
import { getOpenShift } from "./shifts";
import { getPurchaseOrders, purchaseTotal, type PurchaseLine, type PurchaseOrder } from "./stock";
import type { Client, PaymentMethod } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerEntryKind = "payment" | "opening" | "adjustment";

export interface AppliedPayment {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export interface CustomerLedgerEntry {
  id: string;
  clientId: string;
  clientName: string;
  kind: CustomerEntryKind;
  /**
   * In rupees. A payment is money received (positive). Opening balances and
   * adjustments are added to what the customer owes (negative reduces it).
   */
  amount: number;
  method?: PaymentMethod;
  /** Local YYYY-MM-DD. */
  date: string;
  at: string;
  /** The cash drawer's shift open when the money was taken. */
  shiftId?: string;
  by?: string;
  note?: string;
  /** Payments: the invoices it settled, oldest first. What's left over is an advance. */
  applied?: AppliedPayment[];
}

export type SupplierEntryKind = "payment" | "return" | "opening" | "adjustment";

export interface SupplierLedgerEntry {
  id: string;
  supplierId: string;
  supplierName: string;
  kind: SupplierEntryKind;
  /**
   * In rupees. Payments and returns are what they took off the balance
   * (positive). Opening balances and adjustments are added to what is owed.
   */
  amount: number;
  method?: PaymentMethod;
  date: string;
  at: string;
  by?: string;
  note?: string;
  /** The purchase order a payment or return was against. */
  poId?: string;
  poNumber?: string;
  /** Returns: what went back, at what it cost. */
  lines?: PurchaseLine[];
  /** The Cash Flow expense a payment was entered as. */
  expenseId?: string;
  /** Paid out of the till: the shift whose drawer it came from. */
  shiftId?: string;
  /** Returns: the stock movement that took the goods out, so deleting the return puts them back. */
  movementId?: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const CUSTOMERS = "customer_ledger";
const SUPPLIERS = "supplier_ledger";

export const LEDGER_CHANGED_EVENT = "pointly_ledger_changed";

function readList<T>(entity: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(entityStorageKey(entity)) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LEDGER_CHANGED_EVENT));
}

function upsert<T extends { id: string }>(entity: typeof CUSTOMERS | typeof SUPPLIERS, record: T): Promise<boolean> {
  const current = readList<T>(entity);
  const next = current.some((r) => r.id === record.id) ? current.map((r) => (r.id === record.id ? record : r)) : [record, ...current];
  const saved = persistEntity(entity, next, { inferDeletes: false });
  announce();
  return saved;
}

function remove(entity: typeof CUSTOMERS | typeof SUPPLIERS, id: string): Promise<boolean> {
  const saved = persistEntity(entity, readList<{ id: string }>(entity).filter((r) => r.id !== id), { inferDeletes: false, deletedIds: [id] });
  announce();
  return saved;
}

export function newLedgerId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function getCustomerLedger(): CustomerLedgerEntry[] {
  return readList<CustomerLedgerEntry>(CUSTOMERS);
}

export function getSupplierLedger(): SupplierLedgerEntry[] {
  return readList<SupplierLedgerEntry>(SUPPLIERS);
}

// ─── Customers ────────────────────────────────────────────────────────────────

/** What is still owed on one invoice: nothing once it's paid, and never on a refund note. */
export function invoiceDue(inv: Invoice): number {
  if (inv.status !== "unpaid" || isRefund(inv)) return 0;
  return Math.max(0, Math.round(inv.total - (inv.amountPaid || 0)));
}

/** Unpaid invoices on a customer's account, oldest first — the order payments settle them in. */
export function openInvoices(clientId: string, invoices: Invoice[] = getInvoices()): Invoice[] {
  return invoices
    .filter((inv) => inv.clientId === clientId && invoiceDue(inv) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** Money received that no invoice has used up yet — an advance on the account. */
export function unappliedAmount(entry: CustomerLedgerEntry): number {
  if (entry.kind !== "payment") return 0;
  return Math.max(0, entry.amount - (entry.applied ?? []).reduce((s, a) => s + a.amount, 0));
}

/** What a customer owes now. Negative means they have money on account. */
export function customerBalance(
  clientId: string,
  invoices: Invoice[] = getInvoices(),
  entries: CustomerLedgerEntry[] = getCustomerLedger(),
): number {
  const due = invoices.reduce((s, inv) => s + (inv.clientId === clientId ? invoiceDue(inv) : 0), 0);
  const mine = entries.filter((e) => e.clientId === clientId);
  const added = mine.filter((e) => e.kind !== "payment").reduce((s, e) => s + e.amount, 0);
  const advance = mine.reduce((s, e) => s + unappliedAmount(e), 0);
  return Math.round(due + added - advance);
}

/** Every customer's balance at once, for lists. */
export function customerBalances(
  invoices: Invoice[] = getInvoices(),
  entries: CustomerLedgerEntry[] = getCustomerLedger(),
): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (id: string | undefined, n: number) => { if (id && n) out.set(id, (out.get(id) ?? 0) + n); };
  for (const inv of invoices) bump(inv.clientId, invoiceDue(inv));
  for (const e of entries) bump(e.clientId, e.kind === "payment" ? -unappliedAmount(e) : e.amount);
  for (const [id, n] of out) out.set(id, Math.round(n));
  return out;
}

/**
 * Settles `amount` against a customer's unpaid invoices, oldest first (or the
 * ones in `firstInvoiceIds` before the rest). Returns the invoices as they are
 * after it and what went where. Nothing is saved.
 */
export function applyPayment(
  invoices: Invoice[],
  clientId: string,
  amount: number,
  method: PaymentMethod,
  date: string,
  firstInvoiceIds: string[] = [],
): { invoices: Invoice[]; applied: AppliedPayment[] } {
  const queue = openInvoices(clientId, invoices);
  queue.sort((a, b) => Number(firstInvoiceIds.includes(b.id)) - Number(firstInvoiceIds.includes(a.id)));
  let left = Math.round(amount);
  const applied: AppliedPayment[] = [];
  const changed = new Map<string, Invoice>();
  for (const inv of queue) {
    if (left <= 0) break;
    const take = Math.min(left, invoiceDue(inv));
    left -= take;
    applied.push({ invoiceId: inv.id, invoiceNumber: inv.number, amount: take });
    const paidSoFar = (inv.amountPaid || 0) + take;
    const payments = [...(inv.payments ?? []), { method, amount: take }];
    const settled = paidSoFar >= inv.total - 0.5;
    changed.set(inv.id, {
      ...inv,
      amountPaid: paidSoFar,
      payments,
      ...(settled ? {
        status: "paid" as const,
        paidDate: date,
        // The largest part, so anything that reads only paymentMethod sees a real one.
        paymentMethod: [...payments].sort((a, b) => b.amount - a.amount)[0].method,
      } : {}),
    });
  }
  return { invoices: invoices.map((inv) => changed.get(inv.id) ?? inv), applied };
}

/**
 * Takes a payment from a customer: settles their oldest unpaid invoices and
 * records it in the khata, against the open cash drawer.
 */
export async function receiveCustomerPayment(input: {
  client: Pick<Client, "id" | "name">;
  amount: number;
  method: PaymentMethod;
  by?: string;
  note?: string;
  date?: string;
  /** Settle these before anything older — "Mark paid" on one invoice. */
  invoiceIds?: string[];
}): Promise<CustomerLedgerEntry> {
  const date = input.date || localDateKey();
  const amount = Math.round(input.amount);
  if (!(amount > 0)) throw new Error("Enter the amount received.");
  const { invoices, applied } = applyPayment(getInvoices(), input.client.id, amount, input.method, date, input.invoiceIds);
  if (applied.length) await saveInvoices(invoices);
  const shift = getOpenShift();
  const entry: CustomerLedgerEntry = {
    id: newLedgerId("cp"),
    clientId: input.client.id,
    clientName: input.client.name,
    kind: "payment",
    amount,
    method: input.method,
    date,
    at: new Date().toISOString(),
    ...(shift ? { shiftId: shift.id } : {}),
    ...(input.by ? { by: input.by } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    applied,
  };
  await upsert(CUSTOMERS, entry);
  return entry;
}

/** An opening balance or a correction on a customer's account. */
export async function addCustomerEntry(input: {
  client: Pick<Client, "id" | "name">;
  kind: Exclude<CustomerEntryKind, "payment">;
  amount: number;
  note?: string;
  by?: string;
  date?: string;
}): Promise<CustomerLedgerEntry> {
  const entry: CustomerLedgerEntry = {
    id: newLedgerId("ce"),
    clientId: input.client.id,
    clientName: input.client.name,
    kind: input.kind,
    amount: Math.round(input.amount),
    date: input.date || localDateKey(),
    at: new Date().toISOString(),
    ...(input.by ? { by: input.by } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  await upsert(CUSTOMERS, entry);
  return entry;
}

/**
 * Deletes a khata entry. A payment's invoices go back to owing what it had
 * settled on them.
 */
export async function deleteCustomerEntry(entry: CustomerLedgerEntry): Promise<void> {
  if (entry.kind === "payment" && entry.applied?.length) {
    const back = new Map(entry.applied.map((a) => [a.invoiceId, a.amount]));
    const invoices = getInvoices().map((inv) => {
      const amount = back.get(inv.id);
      if (amount === undefined) return inv;
      const paidSoFar = Math.max(0, (inv.amountPaid || 0) - amount);
      // Take one matching part off the payment list.
      const payments = [...(inv.payments ?? [])];
      const idx = payments.findIndex((p) => p.method === entry.method && p.amount === amount);
      if (idx >= 0) payments.splice(idx, 1);
      const reopened: Invoice = { ...inv, amountPaid: paidSoFar, status: "unpaid", payments: payments.length ? payments : undefined };
      delete reopened.paidDate;
      if (!payments.length) reopened.paymentMethod = "";
      return reopened;
    });
    await saveInvoices(invoices);
  }
  await remove(CUSTOMERS, entry.id);
}

export interface StatementRow {
  id: string;
  date: string;
  at: string;
  /** "Credit sale SI-2026-0012", "Payment — cash". */
  label: string;
  detail?: string;
  /** Adds to the balance (they owe more) — a credit sale, an opening balance. */
  debit: number;
  /** Takes it down — a payment. */
  credit: number;
  balance: number;
  invoice?: Invoice;
  entry?: CustomerLedgerEntry;
}

/**
 * The customer's khata as a statement, oldest first with a running balance.
 * Only credit sales belong on it — a sale paid in full at the till never
 * touched the account.
 */
export function customerStatement(
  clientId: string,
  invoices: Invoice[] = getInvoices(),
  entries: CustomerLedgerEntry[] = getCustomerLedger(),
): StatementRow[] {
  const mine = entries.filter((e) => e.clientId === clientId);
  const appliedTo = new Set(mine.flatMap((e) => e.applied ?? []).map((a) => a.invoiceId));
  const rows: Omit<StatementRow, "balance">[] = [];
  for (const inv of invoices) {
    if (inv.clientId !== clientId || isRefund(inv)) continue;
    if (!(inv.onCredit || inv.status === "unpaid" || appliedTo.has(inv.id))) continue;
    // Money paid toward it outside the khata (an older "Mark paid") still has to show.
    const viaKhata = mine.flatMap((e) => e.applied ?? []).filter((a) => a.invoiceId === inv.id).reduce((s, a) => s + a.amount, 0);
    const paidElsewhere = inv.status === "paid" ? Math.max(0, inv.total - viaKhata) : Math.max(0, (inv.amountPaid || 0) - viaKhata);
    rows.push({
      id: inv.id, date: inv.date, at: inv.createdAt,
      label: `Credit sale ${inv.number}`,
      detail: inv.items.map((i) => `${i.description}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", "),
      debit: inv.total, credit: 0, invoice: inv,
    });
    if (paidElsewhere > 0) {
      rows.push({
        id: `${inv.id}_paid`, date: inv.paidDate || inv.date, at: inv.createdAt,
        label: `Paid on ${inv.number}`, debit: 0, credit: paidElsewhere, invoice: inv,
      });
    }
  }
  for (const e of mine) {
    const applied = e.applied?.map((a) => a.invoiceNumber).join(", ");
    if (e.kind === "payment") {
      rows.push({
        id: e.id, date: e.date, at: e.at,
        label: `Payment${e.method ? ` — ${e.method}` : ""}`,
        detail: [applied ? `For ${applied}` : "", unappliedAmount(e) > 0 ? "Part kept as advance" : "", e.note ?? ""].filter(Boolean).join(" · ") || undefined,
        debit: 0, credit: e.amount, entry: e,
      });
    } else {
      rows.push({
        id: e.id, date: e.date, at: e.at,
        label: e.kind === "opening" ? "Opening balance" : "Adjustment",
        detail: e.note,
        debit: Math.max(0, e.amount), credit: Math.max(0, -e.amount), entry: e,
      });
    }
  }
  // An opening balance was owed before anything else that day.
  const opening = (r: Omit<StatementRow, "balance">) => Number(r.entry?.kind !== "opening");
  rows.sort((a, b) => a.date.localeCompare(b.date) || opening(a) - opening(b) || a.at.localeCompare(b.at) || (b.debit - a.debit));
  let balance = 0;
  return rows.map((r) => {
    balance += r.debit - r.credit;
    return { ...r, balance: Math.round(balance) };
  });
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

function sameSupplier(po: Pick<PurchaseOrder, "supplierId" | "supplierName">, supplier: { id: string; name: string }): boolean {
  if (po.supplierId) return po.supplierId === supplier.id;
  return !!po.supplierName && po.supplierName.trim().toLowerCase() === supplier.name.trim().toLowerCase();
}

/** Received purchase orders from this supplier, newest first. */
export function supplierPurchases(supplier: { id: string; name: string }, orders: PurchaseOrder[] = getPurchaseOrders()): PurchaseOrder[] {
  return orders
    .filter((po) => po.status === "received" && sameSupplier(po, supplier))
    .sort((a, b) => (b.receivedAt ?? b.createdAt).localeCompare(a.receivedAt ?? a.createdAt));
}

/** What the business owes a supplier now. Negative means the supplier owes it (an overpayment, a big return). */
export function supplierBalance(
  supplier: { id: string; name: string },
  orders: PurchaseOrder[] = getPurchaseOrders(),
  entries: SupplierLedgerEntry[] = getSupplierLedger(),
): number {
  const bought = supplierPurchases(supplier, orders).reduce((s, po) => s + purchaseTotal(po), 0);
  const mine = entries.filter((e) => e.supplierId === supplier.id);
  const off = mine.filter((e) => e.kind === "payment" || e.kind === "return").reduce((s, e) => s + e.amount, 0);
  const added = mine.filter((e) => e.kind === "opening" || e.kind === "adjustment").reduce((s, e) => s + e.amount, 0);
  return Math.round(bought + added - off);
}

/** What is still owed on one purchase order, counting only payments and returns made against it. */
export function purchaseDue(po: PurchaseOrder, entries: SupplierLedgerEntry[] = getSupplierLedger()): number {
  if (po.status !== "received") return 0;
  const off = entries.filter((e) => e.poId === po.id && (e.kind === "payment" || e.kind === "return")).reduce((s, e) => s + e.amount, 0);
  return Math.max(0, Math.round(purchaseTotal(po) - off));
}

export async function addSupplierEntry(input: Omit<SupplierLedgerEntry, "id" | "at" | "date"> & { date?: string }): Promise<SupplierLedgerEntry> {
  const entry: SupplierLedgerEntry = {
    ...input,
    id: newLedgerId(input.kind === "payment" ? "sp" : input.kind === "return" ? "sr" : "se"),
    amount: Math.round(input.amount),
    date: input.date || localDateKey(),
    at: new Date().toISOString(),
  };
  await upsert(SUPPLIERS, entry);
  return entry;
}

export function deleteSupplierEntry(entry: SupplierLedgerEntry): Promise<boolean> {
  return remove(SUPPLIERS, entry.id);
}

export interface SupplierStatementRow {
  id: string;
  date: string;
  at: string;
  label: string;
  detail?: string;
  /** Adds to what is owed — a delivery, an opening balance. */
  debit: number;
  /** Takes it down — a payment, a return. */
  credit: number;
  balance: number;
  po?: PurchaseOrder;
  entry?: SupplierLedgerEntry;
}

/** The supplier's account, oldest first, with what is owed after each line. */
export function supplierStatement(
  supplier: { id: string; name: string },
  orders: PurchaseOrder[] = getPurchaseOrders(),
  entries: SupplierLedgerEntry[] = getSupplierLedger(),
): SupplierStatementRow[] {
  const rows: Omit<SupplierStatementRow, "balance">[] = [];
  for (const po of supplierPurchases(supplier, orders)) {
    const at = po.receivedAt ?? po.createdAt;
    rows.push({
      id: po.id, date: at.slice(0, 10), at,
      label: `Purchase ${po.number}${po.billNumber ? ` · bill ${po.billNumber}` : ""}`,
      detail: po.lines.map((l) => `${l.name} ×${l.qty}`).join(", "),
      debit: Math.round(purchaseTotal(po)), credit: 0, po,
    });
  }
  for (const e of entries.filter((x) => x.supplierId === supplier.id)) {
    const against = e.poNumber ? ` for ${e.poNumber}` : "";
    const label = e.kind === "payment" ? `Payment${e.method ? ` — ${e.method}` : ""}${against}`
      : e.kind === "return" ? `Goods returned${against}`
      : e.kind === "opening" ? "Opening balance" : "Adjustment";
    const detail = e.kind === "return" ? [e.lines?.map((l) => `${l.name} ×${l.qty}`).join(", "), e.note].filter(Boolean).join(" · ") : e.note;
    const adds = e.kind === "opening" || e.kind === "adjustment";
    rows.push({
      id: e.id, date: e.date, at: e.at, label, detail: detail || undefined,
      debit: adds ? Math.max(0, e.amount) : 0,
      credit: adds ? Math.max(0, -e.amount) : e.amount,
      entry: e,
    });
  }
  const opening = (r: Omit<SupplierStatementRow, "balance">) => Number(r.entry?.kind !== "opening");
  rows.sort((a, b) => a.date.localeCompare(b.date) || opening(a) - opening(b) || a.at.localeCompare(b.at));
  let balance = 0;
  return rows.map((r) => {
    balance += r.debit - r.credit;
    return { ...r, balance: Math.round(balance) };
  });
}
