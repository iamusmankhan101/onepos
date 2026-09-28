"use client";

/**
 * Changing an invoice after the sale (rules in lib/invoice-audit.ts): an
 * unpaid invoice's lines and discounts can be corrected — tax and service
 * charge are worked out again and removed items go back into stock — while a
 * paid sale is final apart from its payment method and notes; money back is a
 * refund. Every save needs a reason and a manager's approval, and is logged.
 */

import { useState } from "react";
import { X, Plus, Trash2, Save, Lock, RotateCcw } from "lucide-react";
import ManagerApproval from "@/components/manager-approval";
import { newBlankItem, refundable, type Invoice, type InvoiceItem } from "@/lib/invoices";
import { itemsLocked, repriceInvoice, saveInvoiceEdit } from "@/lib/invoice-audit";
import { getStoredClients, saveClients } from "@/lib/storage";
import type { Approval } from "@/lib/restaurant";
import type { PaymentMethod } from "@/lib/types";
import { fmtCurrency as fmt } from "@/lib/format";

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash",      label: "Cash" },
  { value: "jazzcash",  label: "JazzCash" },
  { value: "easypaisa", label: "EasyPaisa" },
  { value: "raast",     label: "Raast" },
  { value: "card",      label: "Card" },
  { value: "bank",      label: "Bank Transfer" },
];

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (updated: Invoice) => void;
  /** Offered on a paid sale in place of editing its lines. */
  onRefund?: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e",
  background: "#fff", outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6,
};

function Line({ label, value, strong, green }: { label: string; value: string; strong?: boolean; green?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", marginBottom: 4,
      fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : green ? 700 : 400,
      color: strong ? "#1a1a2e" : green ? "#059669" : "#6b6b8a",
      ...(strong ? { paddingTop: 6, borderTop: "1px solid #eae7f5", marginTop: 4, marginBottom: 0 } : {}),
    }}>
      <span>{label}</span><span style={{ fontWeight: strong ? 800 : 700, color: green ? "#059669" : "#1a1a2e" }}>{value}</span>
    </div>
  );
}

export default function InvoiceEdit({ invoice, onClose, onSaved, onRefund }: Props) {
  const locked = itemsLocked(invoice);
  const splitPaid = !!invoice.payments?.length;
  const [items,          setItems]          = useState<InvoiceItem[]>(invoice.items.map(i => ({ ...i })));
  const [discount,       setDiscount]       = useState<number>(invoice.discountAmount || 0);
  const [discount2,      setDiscount2]      = useState<number>(invoice.discount2Amount || 0);
  const [notes,          setNotes]          = useState(invoice.notes || "");
  const [paymentMethod,  setPaymentMethod]  = useState<PaymentMethod | "">(invoice.paymentMethod || "");
  const [approving,      setApproving]      = useState(false);
  const [error,          setError]          = useState("");

  const linesChanged = !locked && (
    JSON.stringify(items) !== JSON.stringify(invoice.items)
    || discount !== (invoice.discountAmount || 0)
    || discount2 !== (invoice.discount2Amount || 0)
  );
  // Only re-priced when its lines or discounts change — correcting a note never moves the total.
  const priced = linesChanged ? { ...invoice, ...repriceInvoice(invoice, items, discount, discount2) } : invoice;
  const changed = linesChanged
    || paymentMethod !== (invoice.paymentMethod || "")
    || notes.trim() !== (invoice.notes || "").trim();
  const canSave = changed && items.length > 0;

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems(list => list.map(i => {
      if (i.id !== id) return i;
      const next = { ...i, ...patch };
      next.total = Math.round(next.qty * next.unitPrice);
      return next;
    }));
  }

  async function save(approval: Approval) {
    setError("");
    try {
      const next: Invoice = { ...priced, paymentMethod, notes: notes.trim() };
      const updated = await saveInvoiceEdit(invoice, next, approval);
      // The sale added its total to the customer's spend; keep that in step.
      const diff = updated.total - invoice.total;
      if (invoice.clientId && diff !== 0) {
        saveClients(getStoredClients().map(c => c.id === invoice.clientId ? { ...c, totalSpend: Math.max(0, c.totalSpend + diff) } : c));
      }
      setApproving(false);
      onSaved(updated);
      onClose();
    } catch (err) {
      setApproving(false);
      setError(err instanceof Error ? err.message : "The change didn't save.");
    }
  }

  const removedLines = invoice.items.filter(o => {
    const now = items.find(i => i.id === o.id);
    return !now || now.qty < o.qty;
  });

  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 320 }}>
      <div onClick={e => e.stopPropagation()} className="modal-sheet" style={{ background: "#fff", borderRadius: 16, maxWidth: 620, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 16px 50px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f5", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>Edit Invoice</div>
            <div style={{ fontSize: 12, color: "#9898b0", marginTop: 2 }}>{invoice.number} · {invoice.clientName}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e8e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} color="#9898b0" />
          </button>
        </div>

        <div style={{ padding: "18px 24px 24px" }}>

          {locked && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", marginBottom: 18 }}>
              <Lock size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
                This sale is paid, so its items and prices are final. To take something off the bill or give money back, refund it. The refund is saved as a separate credit note, so the original sale stays on record.
                {onRefund && refundable(invoice) > 0 && (
                  <button type="button" onClick={onRefund}
                    style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    <RotateCcw size={13} /> Refund instead
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ ...labelStyle, fontWeight: 800, letterSpacing: "0.06em", marginBottom: 8 }}>Items</div>
            {locked ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {invoice.items.map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#1a1a2e", padding: "4px 0" }}>
                    <span>{item.qty} × {item.description}</span><span style={{ fontWeight: 700 }}>{fmt(item.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map(item => (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 56px 90px 90px 28px", gap: 6, alignItems: "center" }}>
                      <input value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })}
                        placeholder="Description" style={inputStyle} />
                      <input type="number" min={0} value={item.qty} onChange={e => updateItem(item.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                        style={{ ...inputStyle, textAlign: "right" }} aria-label="Quantity" />
                      <input type="number" min={0} value={item.unitPrice} onChange={e => updateItem(item.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                        style={{ ...inputStyle, textAlign: "right" }} aria-label="Unit price" />
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", textAlign: "right" }}>{fmt(item.total)}</div>
                      <button type="button" onClick={() => setItems(list => list.filter(i => i.id !== item.id))} title="Remove item"
                        style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Trash2 size={12} color="#dc2626" />
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{ fontSize: 12, color: "#c8c8e0", textAlign: "center", padding: "12px 0" }}>No items — add at least one below.</div>
                  )}
                </div>
                <button type="button" onClick={() => setItems(list => [...list, newBlankItem()])}
                  style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px dashed #e6ded6", background: "#faf9fd", fontSize: 12, fontWeight: 700, color: "#EA580C", cursor: "pointer" }}>
                  <Plus size={13} /> Add Item
                </button>
                {removedLines.length > 0 && (
                  <div style={{ fontSize: 11, color: "#6b6b8a", marginTop: 8 }}>
                    Stock for {removedLines.map(l => l.description).join(", ")} goes back into inventory when you save.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Discounts */}
          {!locked && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Discount (PKR)</label>
                <input type="number" min={0} value={discount || ""} onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Discount 2 (PKR)</label>
                <input type="number" min={0} value={discount2 || ""} onChange={e => setDiscount2(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0" style={inputStyle} />
              </div>
            </div>
          )}

          {/* Payment method — only a paid sale has one to correct */}
          {invoice.status === "paid" && (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Payment Method</label>
              {splitPaid ? (
                <div style={{ fontSize: 13, color: "#6b6b8a" }}>
                  Split payment: {invoice.payments!.map(p => `${METHOD_OPTIONS.find(m => m.value === p.method)?.label ?? p.method} ${fmt(p.amount)}`).join(" + ")}
                </div>
              ) : (
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} style={inputStyle}>
                  {!paymentMethod && <option value="">— Not set —</option>}
                  {METHOD_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {/* Totals preview */}
          <div style={{ borderRadius: 12, background: "#faf9fd", border: "1px solid #f0f0f8", padding: "12px 14px", marginBottom: 16 }}>
            <Line label="Subtotal" value={fmt(priced.subtotal)} />
            {priced.discountAmount > 0 && <Line label="Discount" value={`−${fmt(priced.discountAmount)}`} green />}
            {(priced.discount2Amount ?? 0) > 0 && <Line label="Discount 2" value={`−${fmt(priced.discount2Amount!)}`} green />}
            {(priced.serviceChargeAmount ?? 0) > 0 && <Line label="Service charge" value={fmt(priced.serviceChargeAmount!)} />}
            {priced.taxAmount > 0 && <Line label={invoice.taxLabel || "Tax"} value={fmt(priced.taxAmount)} />}
            <Line label="Total" value={fmt(priced.total)} strong />
            {!locked && priced.total !== invoice.total && (
              <div style={{ fontSize: 11, color: "#9898b0", marginTop: 6 }}>Was {fmt(invoice.total)}</div>
            )}
          </div>

          {(invoice.edits?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Earlier changes</div>
              {invoice.edits!.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "#6b6b8a", marginBottom: 3 }}>
                  {new Date(e.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })} · {e.by}
                  {e.approvedBy && e.approvedBy !== e.by ? ` (approved by ${e.approvedBy})` : ""} — {e.reason}
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 12 }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose}
              style={{ padding: "10px 18px", borderRadius: 9, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={() => setApproving(true)} disabled={!canSave}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 9, border: "none", background: "#EA580C", fontSize: 13, fontWeight: 700, color: "#fff", cursor: canSave ? "pointer" : "not-allowed", opacity: canSave ? 1 : 0.6 }}>
              <Save size={14} /> Save Changes
            </button>
          </div>
        </div>
      </div>

      {approving && (
        <ManagerApproval
          title={`Change ${invoice.number}?`}
          detail={priced.total !== invoice.total
            ? `The total goes from ${fmt(invoice.total)} to ${fmt(priced.total)}. The reason and the invoice before and after are kept in the change log.`
            : "The reason and the invoice before and after are kept in the change log."}
          confirmLabel="Approve change"
          onClose={() => setApproving(false)}
          onApproved={save}
        />
      )}
    </div>
  );
}
