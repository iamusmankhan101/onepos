"use client";

/**
 * Refunding a paid sale (lib/invoices.ts createRefund): pick what's coming
 * back, how the money goes back, and get a manager to approve it. The refund
 * is its own credit-note invoice, so every revenue and cash total picks it up.
 */

import { useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import ManagerApproval from "@/components/manager-approval";
import { createRefund, refundable, refundAmount, type Invoice } from "@/lib/invoices";
import { getOpenShift } from "@/lib/shifts";
import { getCurrentUser } from "@/lib/auth";
import { getStoredClients, saveClients } from "@/lib/storage";
import { fmtCurrency as fmt } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "EasyPaisa" },
  { value: "raast", label: "Raast" },
  { value: "bank", label: "Bank" },
];

export default function RefundModal({ invoice, onClose, onDone }: {
  invoice: Invoice;
  onClose: () => void;
  onDone: (refund: Invoice) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(invoice.items.map((i) => [i.id, Math.max(0, i.qty)])));
  const [method, setMethod] = useState<PaymentMethod>((invoice.payments?.[0]?.method ?? invoice.paymentMethod) || "cash");
  const [custom, setCustom] = useState("");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  const left = refundable(invoice);
  const computed = refundAmount(invoice, qty);
  const amount = custom ? Math.min(left, Math.max(0, Math.round(Number(custom) || 0))) : computed;
  const already = invoice.refundedAmount ?? 0;

  function bump(id: string, delta: number, max: number) {
    setQty((q) => ({ ...q, [id]: Math.min(max, Math.max(0, (q[id] ?? 0) + delta)) }));
    setCustom("");
  }

  async function approve(approval: { reason: string; approvedBy: string }) {
    setError("");
    try {
      const { refund } = await createRefund(invoice, {
        qtyByItemId: qty,
        method,
        reason: approval.reason,
        approvedBy: approval.approvedBy,
        cashierName: getCurrentUser()?.ownerName || undefined,
        shiftId: getOpenShift()?.id,
        amount: custom ? amount : undefined,
      });
      // The customer spent that much less with us.
      if (invoice.clientId) {
        const clients = getStoredClients();
        const updated = clients.map((c) => (c.id === invoice.clientId ? { ...c, totalSpend: Math.max(0, c.totalSpend - amount) } : c));
        saveClients(updated);
      }
      setApproving(false);
      onDone(refund);
    } catch (err) {
      setApproving(false);
      setError(err instanceof Error ? err.message : "The refund didn't go through.");
    }
  }

  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 360 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet" role="dialog" aria-label={`Refund ${invoice.number}`}
        style={{ background: "#fff", borderRadius: 18, width: 460, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
        <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>Refund {invoice.number}</div>
            <div style={{ fontSize: 12, color: "#9898b0", marginTop: 3 }}>
              {invoice.clientName} · paid {fmt(invoice.total)}{already > 0 ? ` · ${fmt(already)} already refunded` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}><X size={18} color="#9898b0" /></button>
        </div>

        <div style={{ padding: "14px 22px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>What&apos;s being refunded</div>
            {invoice.items.filter((i) => i.qty > 0).map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f4f4f8" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{item.description}</div>
                  <div style={{ fontSize: 11, color: "#9898b0" }}>{item.qty} × {fmt(item.unitPrice)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8f4", borderRadius: 9, overflow: "hidden" }}>
                  <button type="button" onClick={() => bump(item.id, -1, item.qty)} aria-label={`One less ${item.description}`} style={{ width: 30, height: 30, border: "none", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}><Minus size={12} /></button>
                  <div style={{ width: 28, textAlign: "center", fontSize: 13, fontWeight: 800 }}>{qty[item.id] ?? 0}</div>
                  <button type="button" onClick={() => bump(item.id, 1, item.qty)} aria-label={`One more ${item.description}`} style={{ width: 30, height: 30, border: "none", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}><Plus size={12} /></button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Give back by</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                style={{ height: 38, borderRadius: 9, border: "1px solid #e8e8f0", padding: "0 10px", fontSize: 13, background: "#fff" }}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Different amount</span>
              <input type="number" min={0} max={left} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={String(computed)}
                style={{ height: 38, borderRadius: 9, border: "1px solid #e8e8f0", padding: "0 10px", fontSize: 13, boxSizing: "border-box" }} />
            </label>
          </div>
          <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: -6 }}>
            Worked out from what was charged for those items, so any discount, tax and service charge come back in proportion.
          </div>

          {error && <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>{error}</div>}

          <button type="button" disabled={amount <= 0} onClick={() => setApproving(true)}
            style={{ height: 44, borderRadius: 11, border: "none", background: amount > 0 ? "#dc2626" : "#e8e8f0", color: amount > 0 ? "#fff" : "#9999b0", fontSize: 14, fontWeight: 800, cursor: amount > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <RotateCcw size={15} /> Refund {fmt(amount)}
          </button>
        </div>
      </div>

      {approving && (
        <ManagerApproval
          title={`Refund ${fmt(amount)}?`}
          detail={`Back to ${invoice.clientName} by ${METHODS.find((m) => m.value === method)?.label}. Recorded as a credit note against ${invoice.number}.`}
          confirmLabel="Approve refund"
          onClose={() => setApproving(false)}
          onApproved={approve}
        />
      )}
    </div>
  );
}
