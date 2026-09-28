/**
 * lib/invoice-audit.ts
 *
 * Changing or deleting an invoice after the sale, and the record of it.
 *
 *   • A paid sale can't be edited line by line or deleted — money back goes
 *     through a refund (createRefund in lib/invoices.ts), which is its own
 *     credit note. Only its payment method and notes can be corrected.
 *   • Every other change — an unpaid invoice's items, a paid one's payment
 *     method, deleting an unpaid invoice or a refund — needs a reason and a
 *     manager's approval (components/manager-approval.tsx), and is written to
 *     the "invoice_audit" log with a full copy of the invoice before and after.
 *     A deleted invoice survives there in full.
 *   • Taking items off an invoice puts their stock back (lib/stock.ts), the
 *     same way deleting the whole invoice always has.
 */

import { persistEntity } from "./turso-sync";
import { entityStorageKey } from "./sync-records";
import { getCurrentUser } from "./auth";
import { billCharges, getChargeSettings } from "./charges";
import { getInvoices, saveInvoices, type Invoice, type InvoiceEdit, type InvoiceItem } from "./invoices";
import { getModifierGroups, type ChosenModifier } from "./menu";
import { getOrders } from "./restaurant";
import { recordMovement, saleChanges, type StockChange } from "./stock";
import { getStoredInventory } from "./storage";
import type { Approval } from "./restaurant";

const AUDIT = "invoice_audit";

export interface InvoiceAuditEntry {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  action: "edit" | "delete";
  reason: string;
  approvedBy: string;
  /** The signed-in user who made the change. */
  by: string;
  at: string;
  before: Invoice;
  /** Edits only. */
  after?: Invoice;
}

export function getInvoiceAudit(): InvoiceAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(entityStorageKey(AUDIT)) || "[]");
    return (Array.isArray(parsed) ? parsed as InvoiceAuditEntry[] : []).sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

function recordAudit(entry: Omit<InvoiceAuditEntry, "id" | "by" | "at">): Promise<boolean> {
  const full: InvoiceAuditEntry = {
    ...entry,
    id: `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    by: getCurrentUser()?.ownerName || "Unknown",
    at: new Date().toISOString(),
  };
  return persistEntity(AUDIT, [full, ...getInvoiceAudit()], { inferDeletes: false });
}

// ─── What may change ──────────────────────────────────────────────────────────

/** A paid sale's lines are final: it can only be refunded. */
export function itemsLocked(inv: Invoice): boolean {
  return inv.status === "paid" && !inv.refundOf;
}

/** Paid sales are refunded, never deleted. Unpaid invoices and refund notes can go, with approval. */
export function canDelete(inv: Invoice): boolean {
  return inv.status !== "paid" || !!inv.refundOf;
}

// ─── Totals ───────────────────────────────────────────────────────────────────

/**
 * Re-prices an invoice whose lines or discounts changed. Service charge and
 * tax are worked out again at today's rates, but only the ones the invoice
 * was charged in the first place — a takeaway that had no service charge
 * doesn't gain one.
 */
export function repriceInvoice(original: Invoice, items: InvoiceItem[], discount: number, discount2: number): Pick<
  Invoice, "items" | "subtotal" | "discountAmount" | "discount2Amount" | "serviceChargeAmount" | "taxAmount" | "total"
> {
  const subtotal = Math.max(0, Math.round(items.reduce((s, i) => s + i.total, 0)));
  const d1 = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const d2 = Math.min(Math.max(0, Math.round(discount2)), subtotal - d1);
  const net = subtotal - d1 - d2;
  const rates = getChargeSettings();
  const { serviceCharge, tax } = billCharges(net, undefined, {
    ...rates,
    serviceChargeRate: (original.serviceChargeAmount ?? 0) > 0 ? rates.serviceChargeRate : 0,
    taxRate: original.taxAmount > 0 ? rates.taxRate : 0,
  });
  return {
    items, subtotal, discountAmount: d1, discount2Amount: d2 || undefined,
    serviceChargeAmount: serviceCharge || undefined, taxAmount: tax, total: net + serviceCharge + tax,
  };
}

// ─── Stock ────────────────────────────────────────────────────────────────────

/**
 * Which menu item or product an invoice line was, for stock. Lines rung up
 * since itemId was recorded carry it; a restaurant invoice's lines share their
 * ids with the order's lines; older retail lines are matched by name.
 */
function stockSource(inv: Invoice, item: InvoiceItem): { itemId: string; modifiers?: ChosenModifier[] } | null {
  if (item.type !== "product") return null;
  if (item.itemId) return { itemId: item.itemId, modifiers: item.modifiers };
  if (inv.orderId) {
    const line = getOrders().find((o) => o.id === inv.orderId)?.lines.find((l) => l.id === item.id);
    if (line) return { itemId: line.itemId, modifiers: line.modifiers };
  }
  const name = item.description.trim().toLowerCase();
  const match = getStoredInventory().find((i) =>
    [i.name, `${i.brand ? i.brand + " " : ""}${i.name}`].some((n) => n.trim().toLowerCase() === name));
  return match ? { itemId: match.id } : null;
}

/**
 * Stock changes for a change in how many of each line were sold: `delta` is
 * new qty − old qty per invoice line id. Fewer sold puts stock back.
 */
function stockChangesFor(inv: Invoice, delta: Map<string, number>): StockChange[] {
  const inventory = getStoredInventory();
  const groups = getModifierGroups();
  const more: { itemId: string; qty: number; modifiers?: ChosenModifier[] }[] = [];
  const fewer: typeof more = [];
  for (const item of inv.items) {
    const d = delta.get(item.id) ?? 0;
    const source = d !== 0 ? stockSource(inv, item) : null;
    if (!source) continue;
    (d > 0 ? more : fewer).push({ ...source, qty: Math.abs(d) });
  }
  const back = saleChanges(fewer, inventory, groups).map((c) => ({ ...c, qty: -c.qty }));
  const out = saleChanges(more, inventory, groups);
  const byItem = new Map<string, number>();
  for (const c of [...back, ...out]) byItem.set(c.itemId, (byItem.get(c.itemId) ?? 0) + c.qty);
  return [...byItem].map(([itemId, qty]) => ({ itemId, qty }));
}

/** Puts refunded items back on the shelf, recorded against the refund so deleting it undoes this too. */
export async function restockRefund(sale: Invoice, refund: Invoice, qtyByItemId: Record<string, number>): Promise<void> {
  const delta = new Map(Object.entries(qtyByItemId).filter(([, q]) => q > 0).map(([id, q]) => [id, -q] as [string, number]));
  const changes = stockChangesFor(sale, delta);
  await recordMovement("sale", changes, {
    ref: refund.number, refId: refund.id, note: `Returned to stock — refund of ${sale.number}`,
    by: getCurrentUser()?.ownerName || undefined,
  });
}

// ─── Changing ─────────────────────────────────────────────────────────────────

/**
 * Saves an approved edit: the invoice, the stock its changed quantities
 * free up or use, and the audit record.
 */
export async function saveInvoiceEdit(original: Invoice, next: Invoice, approval: Approval): Promise<Invoice> {
  if (itemsLocked(original)) {
    // Belt and braces: whatever the form sent, a paid sale's money stays as it was.
    next = { ...original, paymentMethod: next.paymentMethod, notes: next.notes };
  }
  const edit: InvoiceEdit = { at: approval.at, by: getCurrentUser()?.ownerName || "Unknown", approvedBy: approval.approvedBy, reason: approval.reason };
  const updated: Invoice = { ...next, edits: [...(original.edits ?? []), edit] };

  await saveInvoices(getInvoices().map((inv) => (inv.id === updated.id ? updated : inv)));

  const delta = new Map<string, number>();
  for (const item of original.items) delta.set(item.id, (updated.items.find((i) => i.id === item.id)?.qty ?? 0) - item.qty);
  const changes = stockChangesFor(original, delta);
  if (changes.length) {
    await recordMovement("sale", changes, {
      ref: original.number, refId: original.id, note: `Invoice edited — ${approval.reason}`, by: edit.by,
    });
  }

  await recordAudit({
    invoiceId: original.id, invoiceNumber: original.number, action: "edit",
    reason: approval.reason, approvedBy: approval.approvedBy, before: original, after: updated,
  });
  return updated;
}

/** Records an approved delete, with the whole invoice, before the caller removes it. */
export function recordInvoiceDelete(invoice: Invoice, approval: Approval): Promise<boolean> {
  return recordAudit({
    invoiceId: invoice.id, invoiceNumber: invoice.number, action: "delete",
    reason: approval.reason, approvedBy: approval.approvedBy, before: invoice,
  });
}
