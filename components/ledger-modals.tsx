"use client";

/**
 * The khata's forms (lib/ledger.ts): taking a payment from a customer,
 * bringing over or correcting a balance, paying a supplier, and sending goods
 * back to one. Built on the Inventory page's modal pieces.
 */

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Buttons, Field, INP, Modal, PAY_METHOD_OPTIONS } from "@/components/inventory-modals";
import {
  addCustomerEntry, addSupplierEntry, applyPayment, purchaseDue, receiveCustomerPayment, supplierPurchases,
  type SupplierLedgerEntry,
} from "@/lib/ledger";
import { getInvoices, localDateKey } from "@/lib/invoices";
import { addExpense } from "@/lib/expenses";
import { addCashMove, getOpenShift } from "@/lib/shifts";
import { fmtQty, newStockId, purchaseTotal, recordMovement, tracksStock, type PurchaseLine, type PurchaseOrder, type Supplier } from "@/lib/stock";
import type { Client, InventoryItem, PaymentMethod } from "@/lib/types";

type Close = (message?: string) => void;

function MethodSelect({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as PaymentMethod)} style={INP} aria-label="Payment method">
      {PAY_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13, color: "#1a1a2e" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "#EA580C" }} />
      {children}
    </label>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────

export function CustomerPaymentModal({ client, balance, money, by, onClose }: {
  client: Pick<Client, "id" | "name">;
  balance: number;
  money: (n: number) => string;
  by?: string;
  onClose: Close;
}) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Math.round(Number(amount) || 0);
  // Which invoices this would settle, worked out the same way the save will.
  const preview = useMemo(() => value > 0 ? applyPayment(getInvoices(), client.id, value, method, date).applied : [], [value, client.id, method, date]);
  const usedOnInvoices = preview.reduce((s, a) => s + a.amount, 0);
  const shift = typeof window === "undefined" ? undefined : getOpenShift();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await receiveCustomerPayment({ client, amount: value, method, date, note, by });
      onClose(`${money(value)} received from ${client.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Receive payment — ${client.name}`} subtitle={balance > 0 ? `Owes ${money(balance)}` : balance < 0 ? `Has ${money(-balance)} on account` : "Nothing owed"} onClose={() => onClose()}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Amount *"><input autoFocus type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={INP} /></Field>
        <Field label="Paid by"><MethodSelect value={method} onChange={setMethod} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INP} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" style={INP} /></Field>
      </div>
      {value > 0 && (
        <div style={{ fontSize: 12, color: "#6b6b8a", background: "#faf9fb", borderRadius: 9, padding: "9px 11px", lineHeight: 1.7 }}>
          {preview.map((a) => <div key={a.invoiceId}>{a.invoiceNumber}: {money(a.amount)}</div>)}
          {value - usedOnInvoices > 0 && <div>{money(value - usedOnInvoices)} {preview.length ? "left over — " : ""}kept on account</div>}
          <div style={{ fontWeight: 800, color: "#1a1a2e" }}>Will owe {money(balance - value)}</div>
          {method === "cash" && <div>{shift ? "Counted in the open cash drawer." : "No shift is open — this won't be in any drawer count."}</div>}
        </div>
      )}
      {error && <div style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
      <Buttons onCancel={() => onClose()} onSave={save} label="Receive payment" disabled={value <= 0} busy={busy} />
    </Modal>
  );
}

/** An opening balance from the paper khata, or a correction. */
export function CustomerEntryModal({ client, money, by, onClose }: {
  client: Pick<Client, "id" | "name">;
  money: (n: number) => string;
  by?: string;
  onClose: Close;
}) {
  const [kind, setKind] = useState<"opening" | "adjustment">("opening");
  const [direction, setDirection] = useState<"add" | "reduce">("add");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const value = Math.round(Number(amount) || 0);
  const signed = kind === "adjustment" && direction === "reduce" ? -value : value;

  async function save() {
    setBusy(true);
    try {
      await addCustomerEntry({ client, kind, amount: signed, note, by, date });
      onClose(kind === "opening" ? `Opening balance of ${money(value)} added` : "Balance adjusted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Balance — ${client.name}`} subtitle="Bring over what they owed before, or correct the account." onClose={() => onClose()}>
      <div style={{ display: "flex", gap: 6 }}>
        {([["opening", "Opening balance"], ["adjustment", "Adjustment"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${kind === k ? "#EA580C" : "#e6e6f0"}`, background: kind === k ? "#fff7ed" : "#fff", color: kind === k ? "#c2410c" : "#5a5a78", fontSize: 12, fontWeight: 750, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: kind === "adjustment" ? "1fr 1fr" : "1fr", gap: 12 }}>
        {kind === "adjustment" && (
          <Field label="Direction">
            <select value={direction} onChange={(e) => setDirection(e.target.value as "add" | "reduce")} style={INP}>
              <option value="add">They owe more</option>
              <option value="reduce">They owe less (write off)</option>
            </select>
          </Field>
        )}
        <Field label="Amount *"><input autoFocus type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={INP} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INP} /></Field>
        <Field label={kind === "adjustment" ? "Reason *" : "Note"}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "adjustment" ? "e.g. Settled with discount" : "e.g. From the old register"} style={INP} /></Field>
      </div>
      <Buttons onCancel={() => onClose()} onSave={save} label="Save" disabled={value <= 0 || (kind === "adjustment" && !note.trim())} busy={busy} />
    </Modal>
  );
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export function SupplierPaymentModal({ supplier, balance, orders, entries, money, by, onClose }: {
  supplier: Supplier;
  balance: number;
  orders: PurchaseOrder[];
  entries: SupplierLedgerEntry[];
  money: (n: number) => string;
  by?: string;
  onClose: Close;
}) {
  const unpaid = useMemo(() => supplierPurchases(supplier, orders).filter((po) => purchaseDue(po, entries) > 0), [supplier, orders, entries]);
  const [poId, setPoId] = useState("");
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [asExpense, setAsExpense] = useState(true);
  const shift = typeof window === "undefined" ? undefined : getOpenShift();
  const [fromTill, setFromTill] = useState(false);
  const [busy, setBusy] = useState(false);
  const value = Math.round(Number(amount) || 0);
  const po = unpaid.find((p) => p.id === poId);

  async function save() {
    setBusy(true);
    try {
      let expenseId: string | undefined;
      if (asExpense) {
        const { expense } = await addExpense({
          date, category: "supplies",
          description: `Supplier payment — ${supplier.name}${po ? ` (${po.number})` : ""}`,
          amount: value, paymentMethod: method, paymentStatus: "paid",
          ...(note.trim() ? { notes: note.trim() } : {}),
        });
        expenseId = expense.id;
      }
      const till = fromTill && method === "cash" ? getOpenShift() : undefined;
      if (till) await addCashMove(till, { type: "out", amount: value, reason: `Paid ${supplier.name}`, by });
      await addSupplierEntry({
        supplierId: supplier.id, supplierName: supplier.name, kind: "payment", amount: value, method, date,
        ...(po ? { poId: po.id, poNumber: po.number } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(by ? { by } : {}),
        ...(expenseId ? { expenseId } : {}),
        ...(till ? { shiftId: till.id } : {}),
      });
      onClose(`${money(value)} paid to ${supplier.name}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Pay ${supplier.name}`} subtitle={balance > 0 ? `You owe ${money(balance)}` : balance < 0 ? `They owe you ${money(-balance)}` : "Nothing owed"} onClose={() => onClose()}>
      {unpaid.length > 0 && (
        <Field label="Against">
          <select value={poId} onChange={(e) => { setPoId(e.target.value); const p = unpaid.find((x) => x.id === e.target.value); if (p) setAmount(String(purchaseDue(p, entries))); }} style={INP}>
            <option value="">The account in general</option>
            {unpaid.map((p) => <option key={p.id} value={p.id}>{p.number}{p.billNumber ? ` · bill ${p.billNumber}` : ""} — {money(purchaseDue(p, entries))} due</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Amount *"><input autoFocus type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={INP} /></Field>
        <Field label="Paid by"><MethodSelect value={method} onChange={setMethod} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INP} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cheque no., reference…" style={INP} /></Field>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Check checked={asExpense} onChange={setAsExpense}>Enter in Cash Flow expenses</Check>
        {shift && method === "cash" && <Check checked={fromTill} onChange={setFromTill}>Taken from the till</Check>}
      </div>
      {value > 0 && <div style={{ fontSize: 12, color: "#6b6b8a" }}>You&apos;ll owe {money(balance - value)} after this.</div>}
      <Buttons onCancel={() => onClose()} onSave={save} label="Record payment" disabled={value <= 0} busy={busy} />
    </Modal>
  );
}

/** An opening balance or a correction on a supplier's account. */
export function SupplierEntryModal({ supplier, money, by, onClose }: {
  supplier: Supplier;
  money: (n: number) => string;
  by?: string;
  onClose: Close;
}) {
  const [kind, setKind] = useState<"opening" | "adjustment">("opening");
  const [direction, setDirection] = useState<"add" | "reduce">("add");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const value = Math.round(Number(amount) || 0);

  async function save() {
    setBusy(true);
    try {
      await addSupplierEntry({
        supplierId: supplier.id, supplierName: supplier.name, kind, date,
        amount: kind === "adjustment" && direction === "reduce" ? -value : value,
        ...(note.trim() ? { note: note.trim() } : {}), ...(by ? { by } : {}),
      });
      onClose(kind === "opening" ? `Opening balance of ${money(value)} added` : "Balance adjusted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Balance — ${supplier.name}`} subtitle="What you owed them before, or a correction." onClose={() => onClose()}>
      <div style={{ display: "flex", gap: 6 }}>
        {([["opening", "Opening balance"], ["adjustment", "Adjustment"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${kind === k ? "#EA580C" : "#e6e6f0"}`, background: kind === k ? "#fff7ed" : "#fff", color: kind === k ? "#c2410c" : "#5a5a78", fontSize: 12, fontWeight: 750, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: kind === "adjustment" ? "1fr 1fr" : "1fr", gap: 12 }}>
        {kind === "adjustment" && (
          <Field label="Direction">
            <select value={direction} onChange={(e) => setDirection(e.target.value as "add" | "reduce")} style={INP}>
              <option value="add">You owe more</option>
              <option value="reduce">You owe less</option>
            </select>
          </Field>
        )}
        <Field label="Amount *"><input autoFocus type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={INP} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INP} /></Field>
        <Field label={kind === "adjustment" ? "Reason *" : "Note"}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" style={INP} /></Field>
      </div>
      <Buttons onCancel={() => onClose()} onSave={save} label="Save" disabled={value <= 0 || (kind === "adjustment" && !note.trim())} busy={busy} />
    </Modal>
  );
}

interface ReturnDraft { key: string; itemId: string; qty: string; unitCost: string }

/**
 * Sends goods back to a supplier: takes them out of stock and off what is
 * owed. Picking the delivery they came in fills in its lines and costs.
 */
export function PurchaseReturnModal({ supplier, suppliers, items, orders, money, by, onClose }: {
  supplier?: Supplier;
  suppliers: Supplier[];
  items: InventoryItem[];
  orders: PurchaseOrder[];
  money: (n: number) => string;
  by?: string;
  onClose: Close;
}) {
  const stocked = useMemo(() => items.filter(tracksStock).sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const [supplierId, setSupplierId] = useState(supplier?.id ?? suppliers[0]?.id ?? "");
  const chosen = suppliers.find((s) => s.id === supplierId);
  const deliveries = useMemo(() => chosen ? supplierPurchases(chosen, orders) : [], [chosen, orders]);
  const [poId, setPoId] = useState("");
  const [lines, setLines] = useState<ReturnDraft[]>([{ key: newStockId("r"), itemId: "", qty: "", unitCost: "" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function patch(key: string, next: Partial<ReturnDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  function pickDelivery(id: string) {
    setPoId(id);
    const po = deliveries.find((p) => p.id === id);
    if (po) setLines(po.lines.map((l) => ({ key: newStockId("r"), itemId: l.itemId, qty: "", unitCost: String(l.unitCost) })));
  }

  const valid = lines.filter((l) => byId.get(l.itemId) && Number(l.qty) > 0);
  const total = Math.round(valid.reduce((s, l) => s + Number(l.qty) * (Number(l.unitCost) || 0), 0));
  const short = valid.filter((l) => Number(l.qty) > (byId.get(l.itemId)?.currentStock ?? 0));

  async function save() {
    if (!chosen || valid.length === 0) return;
    setBusy(true);
    try {
      const po = deliveries.find((p) => p.id === poId);
      const returned: PurchaseLine[] = valid.map((l) => {
        const item = byId.get(l.itemId)!;
        return { itemId: item.id, name: item.name, qty: Number(l.qty), unit: item.unit, unitCost: Number(l.unitCost) || 0 };
      });
      const movement = await recordMovement("return", returned.map((l) => ({ itemId: l.itemId, qty: -l.qty })), {
        ref: po?.number, refId: po?.id, note: [chosen.name, note.trim()].filter(Boolean).join(" · "), by,
      });
      await addSupplierEntry({
        supplierId: chosen.id, supplierName: chosen.name, kind: "return", amount: total, lines: returned,
        ...(po ? { poId: po.id, poNumber: po.number } : {}),
        ...(note.trim() ? { note: note.trim() } : {}), ...(by ? { by } : {}),
        ...(movement ? { movementId: movement.id } : {}),
      });
      onClose(`Returned to ${chosen.name} — ${money(total)} off the account`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide title="Return to supplier" subtitle="Takes the goods out of stock and their cost off what you owe." onClose={() => onClose()}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Supplier *">
          <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPoId(""); }} style={INP} disabled={!!supplier}>
            {suppliers.length === 0 && <option value="">Add a supplier first</option>}
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="From delivery">
          <select value={poId} onChange={(e) => pickDelivery(e.target.value)} style={INP}>
            <option value="">Not tied to one</option>
            {deliveries.map((p) => <option key={p.id} value={p.id}>{p.number}{p.billNumber ? ` · bill ${p.billNumber}` : ""} — {money(purchaseTotal(p))}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 110px 30px", gap: 6, fontSize: 10, fontWeight: 800, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          <span>Item</span><span>Qty back</span><span>Cost / unit</span><span />
        </div>
        {lines.map((l) => {
          const item = byId.get(l.itemId);
          return (
            <div key={l.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 110px 30px", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <select value={l.itemId} onChange={(e) => { const it = byId.get(e.target.value); patch(l.key, { itemId: e.target.value, unitCost: it?.costPrice ? String(it.costPrice) : l.unitCost }); }} style={INP} aria-label="Item">
                <option value="">Choose…</option>
                {stocked.map((i) => <option key={i.id} value={i.id}>{i.name} ({fmtQty(i.currentStock || 0, i.unit)} in stock)</option>)}
              </select>
              <input type="number" min={0} step="any" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} placeholder={item?.unit ?? "qty"} style={INP} aria-label="Quantity returned" />
              <input type="number" min={0} step="any" value={l.unitCost} onChange={(e) => patch(l.key, { unitCost: e.target.value })} placeholder="0" style={INP} aria-label="Cost per unit" />
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line"
                style={{ padding: 6, borderRadius: 7, border: "1px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "flex", justifyContent: "center" }}><Trash2 size={13} color="#dc2626" /></button>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
          <button type="button" onClick={() => setLines((ls) => [...ls, { key: newStockId("r"), itemId: "", qty: "", unitCost: "" }])}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px dashed #d1d5db", background: "#fafafd", fontSize: 12, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
            <Plus size={13} /> Add item
          </button>
          <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>Credit {money(total)}</span>
        </div>
      </div>
      {short.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>
          More than is in stock: {short.map((l) => byId.get(l.itemId)?.name).join(", ")}. Stock can&apos;t go below zero.
        </div>
      )}
      <Field label="Reason"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Expired, damaged in transit" style={INP} /></Field>
      <Buttons onCancel={() => onClose()} onSave={save} label="Return goods" disabled={!chosen || valid.length === 0} busy={busy} />
    </Modal>
  );
}
