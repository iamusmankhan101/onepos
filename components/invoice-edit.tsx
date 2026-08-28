"use client";

import { useState } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";
import {
  updateInvoice, newBlankItem,
  type Invoice, type InvoiceItem,
} from "@/lib/invoices";
import type { PaymentMethod } from "@/lib/types";
import { fmtCurrency as fmt } from "@/lib/format";

const METHOD_OPTIONS: { value: PaymentMethod | ""; label: string }[] = [
  { value: "",          label: "— Not set —" },
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
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e",
  background: "#fff", outline: "none", boxSizing: "border-box",
};

export default function InvoiceEdit({ invoice, onClose, onSaved }: Props) {
  const [items,          setItems]          = useState<InvoiceItem[]>(invoice.items.map(i => ({ ...i })));
  const [discount,       setDiscount]       = useState<number>(invoice.discountAmount || 0);
  const [discount2,      setDiscount2]      = useState<number>(invoice.discount2Amount || 0);
  const [notes,          setNotes]          = useState(invoice.notes || "");
  const [paymentMethod,  setPaymentMethod]  = useState<PaymentMethod | "">(invoice.paymentMethod || "");
  const [saving,         setSaving]         = useState(false);

  const subtotal = Math.max(0, Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0)));
  const clampedDiscount  = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const clampedDiscount2 = Math.min(Math.max(0, Math.round(discount2)), Math.max(0, subtotal - clampedDiscount));
  const total = Math.max(0, subtotal - clampedDiscount - clampedDiscount2 + invoice.taxAmount);

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems(list => list.map(i => {
      if (i.id !== id) return i;
      const next = { ...i, ...patch };
      next.total = Math.round(next.qty * next.unitPrice);
      return next;
    }));
  }

  function removeItem(id: string) {
    setItems(list => list.filter(i => i.id !== id));
  }

  function addItem() {
    setItems(list => [...list, newBlankItem()]);
  }

  function handleSave() {
    if (saving || items.length === 0) return;
    setSaving(true);
    const updated: Invoice = {
      ...invoice,
      items,
      subtotal,
      discountAmount: clampedDiscount,
      discount2Amount: clampedDiscount2,
      total,
      paymentMethod,
      notes: notes.trim(),
    };
    updateInvoice(updated);
    onSaved(updated);
    setSaving(false);
    onClose();
  }

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

          {/* Items */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Items</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 56px 90px 90px 28px", gap: 6, alignItems: "center" }}>
                  <input value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })}
                    placeholder="Description" style={inputStyle} />
                  <input type="number" min={0} value={item.qty} onChange={e => updateItem(item.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                    style={{ ...inputStyle, textAlign: "right" }} />
                  <input type="number" min={0} value={item.unitPrice} onChange={e => updateItem(item.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                    style={{ ...inputStyle, textAlign: "right" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", textAlign: "right" }}>{fmt(item.total)}</div>
                  <button type="button" onClick={() => removeItem(item.id)} title="Remove item"
                    style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Trash2 size={12} color="#dc2626" />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <div style={{ fontSize: 12, color: "#c8c8e0", textAlign: "center", padding: "12px 0" }}>No items — add at least one below.</div>
              )}
            </div>
            <button type="button" onClick={addItem}
              style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px dashed #e6ded6", background: "#faf9fd", fontSize: 12, fontWeight: 700, color: "#EA580C", cursor: "pointer" }}>
              <Plus size={13} /> Add Item
            </button>
          </div>

          {/* Discounts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Discount (PKR)</label>
              <input type="number" min={0} value={discount || ""} onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Discount 2 (PKR)</label>
              <input type="number" min={0} value={discount2 || ""} onChange={e => setDiscount2(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0" style={inputStyle} />
            </div>
          </div>

          {/* Payment method */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod | "")} style={inputStyle}>
              {METHOD_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {/* Totals preview */}
          <div style={{ borderRadius: 12, background: "#faf9fd", border: "1px solid #f0f0f8", padding: "12px 14px", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b6b8a", marginBottom: 4 }}>
              <span>Subtotal</span><span style={{ fontWeight: 700, color: "#1a1a2e" }}>{fmt(subtotal)}</span>
            </div>
            {clampedDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#059669", marginBottom: 4, fontWeight: 700 }}>
                <span>Discount</span><span>−{fmt(clampedDiscount)}</span>
              </div>
            )}
            {clampedDiscount2 > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#059669", marginBottom: 4, fontWeight: 700 }}>
                <span>Discount 2</span><span>−{fmt(clampedDiscount2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, color: "#1a1a2e", paddingTop: 6, borderTop: "1px solid #eae7f5", marginTop: 4 }}>
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose}
              style={{ padding: "10px 18px", borderRadius: 9, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving || items.length === 0}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 9, border: "none", background: "#EA580C", fontSize: 13, fontWeight: 700, color: "#fff", cursor: items.length === 0 ? "not-allowed" : "pointer", opacity: items.length === 0 ? 0.6 : 1 }}>
              <Save size={14} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
