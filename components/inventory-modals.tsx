"use client";

/**
 * The Inventory page's forms (lib/stock.ts): adding an ingredient, receiving
 * a delivery / purchase order, logging wastage, counting stock, suppliers.
 */

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  WASTE_REASONS, compatibleUnits, fmtQty, hasRecipe, localDate, newStockId, nextPurchaseNumber,
  portionUnit, purchaseTotal, recordMovement, refreshRecipeCosts, saleChanges, savePurchaseOrder,
  saveSuppliers, tracksStock, unitFactor,
  type PurchaseLine, type PurchaseOrder, type Supplier,
} from "@/lib/stock";
import { getModifierGroups } from "@/lib/menu";
import { addExpense } from "@/lib/expenses";
import { getStoredInventory, saveInventory } from "@/lib/storage";
import type { InventoryCategory, InventoryItem, InventoryUnit } from "@/lib/types";

export const UNITS: InventoryUnit[] = ["kg", "g", "l", "ml", "pcs", "pack", "box", "bottle"];

export const INP: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #e8e8f0",
  fontSize: 13, color: "#1a1a2e", outline: "none", background: "#fff", boxSizing: "border-box", minWidth: 0,
};

const PRIMARY: React.CSSProperties = {
  flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #9A3412, #F97316)",
  fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
};

const SECONDARY: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff",
  fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer",
};

export function Modal({ title, subtitle, onClose, wide, children }: { title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet" role="dialog" aria-label={title}
        style={{ background: "#fff", borderRadius: 20, width: wide ? 720 : 480, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2e" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "#9898b0", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}><X size={18} color="#9898b0" /></button>
        </div>
        <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "#9898b0" }}>{hint}</span>}
    </label>
  );
}

function Buttons({ onCancel, onSave, label, disabled, busy }: { onCancel: () => void; onSave: () => void; label: string; disabled?: boolean; busy?: boolean }) {
  const off = disabled || busy;
  return (
    <div style={{ display: "flex", gap: 10, paddingTop: 14, borderTop: "1px solid #f0f0f8" }}>
      <button type="button" onClick={onCancel} style={SECONDARY}>Cancel</button>
      <button type="button" onClick={onSave} disabled={off} style={{ ...PRIMARY, opacity: off ? 0.5 : 1, cursor: off ? "not-allowed" : "pointer" }}>{busy ? "Saving…" : label}</button>
    </div>
  );
}

// ─── Ingredient ───────────────────────────────────────────────────────────────

export function IngredientModal({ item, suppliers, money, onClose }: {
  item?: InventoryItem;
  suppliers: Supplier[];
  money: (n: number) => string;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState<InventoryUnit>(item?.unit ?? "kg");
  const [category, setCategory] = useState<InventoryCategory>(item?.category ?? "supplies");
  const [opening, setOpening] = useState("");
  const [minStock, setMinStock] = useState(item ? String(item.minStock) : "");
  const [cost, setCost] = useState(item?.costPrice ? String(item.costPrice) : "");
  const [supplier, setSupplier] = useState(item?.supplier ?? "");
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? "");
  const [busy, setBusy] = useState(false);
  const usedIn = item ? getStoredInventory().filter((i) => i.recipe?.some((l) => l.itemId === item.id)) : [];

  async function save() {
    setBusy(true);
    try {
      const all = getStoredInventory();
      const base: InventoryItem = item
        ? { ...item }
        : { id: "i_" + Date.now(), name: "", brand: "", category, unit, currentStock: 0, minStock: 0, costPrice: 0, lastRestocked: localDate() };
      const next: InventoryItem = {
        ...base,
        name: name.trim(), category, unit,
        minStock: Number(minStock) || 0,
        costPrice: Number(cost) || 0,
        supplier: supplier.trim() || undefined,
        expiresOn: expiresOn || undefined,
      };
      const list = item ? all.map((i) => (i.id === item.id ? next : i)) : [next, ...all];
      saveInventory(refreshRecipeCosts(list));
      const openingQty = Number(opening) || 0;
      if (!item && openingQty > 0) await recordMovement("count", [{ itemId: next.id, qty: openingQty }], { note: "Opening stock" });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!item) return;
    const msg = usedIn.length
      ? `${item.name} is in the recipe for ${usedIn.map((i) => i.name).join(", ")}. Delete it anyway? Those recipes stop using it.`
      : `Delete ${item.name}?`;
    if (!window.confirm(msg)) return;
    saveInventory(refreshRecipeCosts(getStoredInventory().filter((i) => i.id !== item.id)));
    onClose();
  }

  // Changing an existing item's unit would silently reinterpret its stock and every recipe using it.
  const unitLocked = !!item && (item.currentStock > 0 || usedIn.length > 0);

  return (
    <Modal title={item ? `Edit — ${item.name}` : "Add ingredient"} subtitle={item ? undefined : "Something you stock and use: beans, milk, cups, lids…"} onClose={onClose}>
      <Field label="Name *"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee beans" style={INP} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Stock unit *" hint={unitLocked ? "Locked — stock and recipes are counted in it." : "Recipes can still use g for kg, ml for l."}>
          <select value={unit} onChange={(e) => setUnit(e.target.value as InventoryUnit)} disabled={unitLocked} style={INP}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)} style={INP}>
            <option value="food">Food</option>
            <option value="drinks">Drinks</option>
            <option value="supplies">Packaging & supplies</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: item ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
        {!item && <Field label={`Stock now (${unit})`}><input type="number" min={0} step="any" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" style={INP} /></Field>}
        <Field label={`Reorder at (${unit})`}><input type="number" min={0} step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" style={INP} /></Field>
        <Field label={`Cost per ${unit}`}><input type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" style={INP} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Supplier">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="inv-suppliers" placeholder="Optional" style={INP} />
          <datalist id="inv-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        <Field label="Expires on"><input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} style={INP} /></Field>
      </div>
      {Number(cost) > 0 && (unit === "kg" || unit === "l") && (
        <div style={{ fontSize: 12, color: "#6b6b8a" }}>
          So {unit === "kg" ? "18 g" : "250 ml"} in a recipe costs {money(Number(cost) * (unit === "kg" ? 0.018 : 0.25))}.
        </div>
      )}
      {item && usedIn.length > 0 && (
        <div style={{ fontSize: 12, color: "#6b6b8a" }}>Used in: {usedIn.map((i) => i.name).join(", ")}</div>
      )}
      {item && (
        <button type="button" onClick={remove} style={{ alignSelf: "flex-start", border: "none", background: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Delete ingredient</button>
      )}
      <Buttons onCancel={onClose} onSave={save} label={item ? "Save" : "Add ingredient"} disabled={!name.trim()} busy={busy} />
    </Modal>
  );
}

// ─── Purchase order / receive delivery ────────────────────────────────────────

interface DraftLine { key: string; itemId: string; qty: string; unitCost: string; expiresOn: string }

function draftLine(item?: InventoryItem, qty = ""): DraftLine {
  return { key: newStockId("l"), itemId: item?.id ?? "", qty, unitCost: item?.costPrice ? String(item.costPrice) : "", expiresOn: "" };
}

/**
 * New purchase order (save as ordered, or receive straight away), or receiving
 * an ordered one — quantities and costs can be corrected to what arrived.
 */
export function PurchaseModal({ po, prefill, items, suppliers, money, by, onClose }: {
  po?: PurchaseOrder;
  /** New order pre-filled with these items — "reorder low stock". */
  prefill?: { item: InventoryItem; qty: number }[];
  items: InventoryItem[];
  suppliers: Supplier[];
  money: (n: number) => string;
  by?: string;
  onClose: () => void;
}) {
  const stocked = useMemo(() => items.filter(tracksStock).sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const receiving = po?.status === "ordered";
  const [supplierName, setSupplierName] = useState(po?.supplierName ?? "");
  const [expectedOn, setExpectedOn] = useState(po?.expectedOn ?? "");
  const [notes, setNotes] = useState(po?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    po ? po.lines.map((l) => ({ key: newStockId("l"), itemId: l.itemId, qty: String(l.qty), unitCost: String(l.unitCost), expiresOn: l.expiresOn ?? "" }))
      : prefill?.length ? prefill.map((p) => draftLine(p.item, String(p.qty)))
      : [draftLine()],
  );
  const [asExpense, setAsExpense] = useState(true);
  const [paid, setPaid] = useState(true);
  const [busy, setBusy] = useState(false);

  const valid = lines.filter((l) => byId.get(l.itemId) && Number(l.qty) > 0);
  const total = valid.reduce((s, l) => s + Number(l.qty) * (Number(l.unitCost) || 0), 0);

  function patch(key: string, next: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  function toLines(): PurchaseLine[] {
    return valid.map((l) => {
      const item = byId.get(l.itemId)!;
      return { itemId: item.id, name: item.name, qty: Number(l.qty), unit: item.unit, unitCost: Number(l.unitCost) || 0, expiresOn: l.expiresOn || undefined };
    });
  }

  function supplierFor(name: string): Supplier | undefined {
    return suppliers.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  }

  async function ensureSupplier(name: string): Promise<Supplier | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const existing = supplierFor(trimmed);
    if (existing) return existing;
    const created: Supplier = { id: newStockId("sup"), name: trimmed };
    await saveSuppliers([...suppliers, created]);
    return created;
  }

  async function submit(receive: boolean) {
    if (valid.length === 0) return;
    setBusy(true);
    try {
      const supplier = await ensureSupplier(supplierName);
      const now = new Date().toISOString();
      const order: PurchaseOrder = {
        id: po?.id ?? newStockId("po"),
        number: po?.number ?? nextPurchaseNumber(),
        supplierId: supplier?.id,
        supplierName: supplier?.name ?? "",
        status: receive ? "received" : "ordered",
        lines: toLines(),
        notes: notes.trim() || undefined,
        createdAt: po?.createdAt ?? now,
        expectedOn: expectedOn || undefined,
        receivedAt: receive ? now : undefined,
      };
      if (receive) {
        await recordMovement(
          "purchase",
          order.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitCost: l.unitCost, expiresOn: l.expiresOn })),
          { ref: order.number, note: order.supplierName || undefined, by },
        );
        const amount = Math.round(purchaseTotal(order));
        if (asExpense && amount > 0) {
          await addExpense({
            date: localDate(),
            category: "supplies",
            description: `Stock purchase ${order.number}${order.supplierName ? ` — ${order.supplierName}` : ""}`,
            amount,
            paymentMethod: paid ? "cash" : "",
            paymentStatus: paid ? "paid" : "pending",
            notes: order.lines.map((l) => `${l.name} ${fmtQty(l.qty, l.unit)}`).join(", "),
          });
        }
      }
      await savePurchaseOrder(order);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const title = receiving ? `Receive ${po!.number}` : po ? po.number : "New purchase order";
  return (
    <Modal wide title={title} subtitle={receiving ? "Correct anything that arrived differently, then mark it received." : "Save it as ordered, or receive it now if the delivery is already here."} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Supplier">
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} list="po-suppliers" placeholder="e.g. Metro Cash & Carry" style={INP} />
          <datalist id="po-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        {!receiving && <Field label="Expected on"><input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} style={INP} /></Field>}
      </div>

      <div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 100px 130px 30px", gap: 6, fontSize: 10, fontWeight: 800, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          <span>Item</span><span>Qty</span><span>Cost / unit</span><span>Expires</span><span />
        </div>
        {lines.map((l) => {
          const item = byId.get(l.itemId);
          return (
            <div key={l.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 100px 130px 30px", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <select value={l.itemId} onChange={(e) => { const it = byId.get(e.target.value); patch(l.key, { itemId: e.target.value, unitCost: it?.costPrice ? String(it.costPrice) : l.unitCost }); }} style={INP} aria-label="Item">
                <option value="">Choose…</option>
                {stocked.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <input type="number" min={0} step="any" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} placeholder={item?.unit ?? "qty"} style={INP} aria-label="Quantity" />
              <input type="number" min={0} step="any" value={l.unitCost} onChange={(e) => patch(l.key, { unitCost: e.target.value })} placeholder="0" style={INP} aria-label="Cost per unit" />
              <input type="date" value={l.expiresOn} onChange={(e) => patch(l.key, { expiresOn: e.target.value })} style={INP} aria-label="Expiry date" />
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line"
                style={{ padding: 6, borderRadius: 7, border: "1px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "flex", justifyContent: "center" }}><Trash2 size={13} color="#dc2626" /></button>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
          <button type="button" onClick={() => setLines((ls) => [...ls, draftLine()])}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px dashed #d1d5db", background: "#fafafd", fontSize: 12, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
            <Plus size={13} /> Add item
          </button>
          <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>Total {money(total)}</span>
        </div>
        {stocked.length === 0 && <div style={{ fontSize: 12, color: "#9898b0", marginTop: 6 }}>Add ingredients first — they&apos;re what you order.</div>}
      </div>

      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" style={INP} /></Field>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#1a1a2e" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
          <input type="checkbox" checked={asExpense} onChange={(e) => setAsExpense(e.target.checked)} style={{ accentColor: "#EA580C" }} />
          On receipt, add to Cash Flow expenses
        </label>
        {asExpense && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} style={{ accentColor: "#EA580C" }} />
            Already paid
          </label>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, paddingTop: 14, borderTop: "1px solid #f0f0f8", flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} style={SECONDARY}>Cancel</button>
        {!receiving && (
          <button type="button" onClick={() => submit(false)} disabled={busy || valid.length === 0}
            style={{ ...SECONDARY, color: "#c2410c", borderColor: "#fed7aa", background: "#fff7ed", opacity: valid.length ? 1 : 0.5 }}>
            Save as ordered
          </button>
        )}
        <button type="button" onClick={() => submit(true)} disabled={busy || valid.length === 0}
          style={{ ...PRIMARY, opacity: busy || valid.length === 0 ? 0.5 : 1 }}>
          {busy ? "Saving…" : receiving ? "Mark received" : "Receive now"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Wastage ──────────────────────────────────────────────────────────────────

/**
 * Logs stock thrown away. A made-to-order item — a latte made wrong — is
 * wasted by the serving and takes its ingredients out.
 */
export function WasteModal({ items, initialItemId, money, by, onClose }: {
  items: InventoryItem[];
  initialItemId?: string;
  money: (n: number) => string;
  by?: string;
  onClose: () => void;
}) {
  const choices = useMemo(() => [...items].sort((a, b) => Number(hasRecipe(a)) - Number(hasRecipe(b)) || a.name.localeCompare(b.name)), [items]);
  const [itemId, setItemId] = useState(initialItemId ?? choices[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId);
  const recipe = hasRecipe(item);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>(item ? (recipe ? item.unit : portionUnit(item.unit)) : "pcs");
  const [reason, setReason] = useState(WASTE_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function pick(id: string) {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    if (it) setUnit(hasRecipe(it) ? it.unit : portionUnit(it.unit));
  }

  const amount = Number(qty) || 0;
  const changes = useMemo(() => {
    if (!item || amount <= 0) return [];
    if (recipe) return saleChanges([{ itemId: item.id, qty: amount }], items, getModifierGroups());
    const f = unitFactor(unit, item.unit) ?? 1;
    return [{ itemId: item.id, qty: -amount * f }];
  }, [item, amount, recipe, unit, items]);
  const value = changes.reduce((s, c) => s + Math.abs(c.qty) * (items.find((i) => i.id === c.itemId)?.costPrice ?? 0), 0);

  async function save() {
    setBusy(true);
    try {
      await recordMovement("waste", changes, {
        reason,
        note: [recipe && item ? `${amount} × ${item.name}` : "", note.trim()].filter(Boolean).join(" · ") || undefined,
        by,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Record wastage" subtitle="Takes it out of stock and counts it in wastage reports." onClose={onClose}>
      <Field label="What">
        <select value={itemId} onChange={(e) => pick(e.target.value)} style={INP}>
          {choices.map((i) => <option key={i.id} value={i.id}>{i.name}{hasRecipe(i) ? " (made to order)" : ""}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={recipe ? "Servings" : "Amount"}>
          <div style={{ display: "flex", gap: 6 }}>
            <input autoFocus type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" style={INP} />
            {!recipe && item && (
              <select value={unit} onChange={(e) => setUnit(e.target.value as InventoryUnit)} style={{ ...INP, width: 76 }} aria-label="Unit">
                {compatibleUnits(item.unit).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </div>
        </Field>
        <Field label="Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={INP}>
            {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" style={INP} /></Field>
      {changes.length > 0 && (
        <div style={{ fontSize: 12, color: "#6b6b8a", background: "#faf9fb", borderRadius: 9, padding: "9px 11px", lineHeight: 1.7 }}>
          {changes.map((c) => {
            const it = items.find((i) => i.id === c.itemId);
            return it ? <div key={c.itemId}>− {fmtQty(Math.abs(c.qty), it.unit)} {it.name}</div> : null;
          })}
          <div style={{ fontWeight: 800, color: "#1a1a2e" }}>Value lost: {money(value)}</div>
        </div>
      )}
      <Buttons onCancel={onClose} onSave={save} label="Record wastage" disabled={changes.length === 0} busy={busy} />
    </Modal>
  );
}

// ─── Stock count ──────────────────────────────────────────────────────────────

/** Enter what's actually on the shelf; the differences are recorded as a count adjustment. */
export function CountModal({ items, money, by, onClose }: { items: InventoryItem[]; money: (n: number) => string; by?: string; onClose: () => void }) {
  const stocked = useMemo(() => items.filter(tracksStock).sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const diffs = stocked
    .map((i) => ({ item: i, counted: counts[i.id] }))
    .filter((d) => d.counted !== undefined && d.counted !== "" && Number(d.counted) !== d.item.currentStock)
    .map((d) => ({ item: d.item, diff: Number(d.counted) - d.item.currentStock }));
  const value = diffs.reduce((s, d) => s + d.diff * d.item.costPrice, 0);

  async function save() {
    setBusy(true);
    try {
      await recordMovement("count", diffs.map((d) => ({ itemId: d.item.id, qty: d.diff })), { note: "Stock count", by });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide title="Stock count" subtitle="Type what's actually there. Leave a row empty if you didn't count it." onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {stocked.map((i) => {
          const counted = counts[i.id];
          const diff = counted !== undefined && counted !== "" ? Number(counted) - i.currentStock : 0;
          return (
            <div key={i.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px 120px 90px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f4f4f8" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
              <div style={{ fontSize: 12, color: "#9898b0" }}>System: {fmtQty(i.currentStock, i.unit)}</div>
              <input type="number" min={0} step="any" value={counted ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                placeholder={`Counted (${i.unit})`} style={INP} aria-label={`Counted ${i.name}`} />
              <div style={{ fontSize: 12, fontWeight: 800, textAlign: "right", color: diff < 0 ? "#dc2626" : diff > 0 ? "#059669" : "#c8c8d8" }}>
                {diff ? `${diff > 0 ? "+" : "−"}${fmtQty(Math.abs(diff), i.unit)}` : "—"}
              </div>
            </div>
          );
        })}
        {stocked.length === 0 && <div style={{ fontSize: 13, color: "#9898b0" }}>Nothing to count yet.</div>}
      </div>
      {diffs.length > 0 && (
        <div style={{ fontSize: 12.5, color: "#1a1a2e", fontWeight: 700 }}>
          {diffs.length} item{diffs.length === 1 ? "" : "s"} adjusted · {value < 0 ? "shortfall" : "surplus"} worth {money(Math.abs(value))}
        </div>
      )}
      <Buttons onCancel={onClose} onSave={save} label="Save count" disabled={diffs.length === 0} busy={busy} />
    </Modal>
  );
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export function SupplierModal({ supplier, suppliers, onClose }: { supplier?: Supplier; suppliers: Supplier[]; onClose: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const duplicate = suppliers.some((s) => s.id !== supplier?.id && s.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function save() {
    setBusy(true);
    try {
      const next: Supplier = { id: supplier?.id ?? newStockId("sup"), name: name.trim(), phone: phone.trim() || undefined, contact: contact.trim() || undefined, notes: notes.trim() || undefined };
      await saveSuppliers(supplier ? suppliers.map((s) => (s.id === supplier.id ? next : s)) : [...suppliers, next]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!supplier || !window.confirm(`Delete ${supplier.name}? Past purchase orders keep the name.`)) return;
    await saveSuppliers(suppliers.filter((s) => s.id !== supplier.id), [supplier.id]);
    onClose();
  }

  return (
    <Modal title={supplier ? `Edit — ${supplier.name}` : "Add supplier"} onClose={onClose}>
      <Field label="Name *"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metro Cash & Carry" style={INP} /></Field>
      {duplicate && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>There&apos;s already a supplier with that name.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Phone / WhatsApp"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx xxxxxxx" style={INP} /></Field>
        <Field label="Contact person"><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Optional" style={INP} /></Field>
      </div>
      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery days, payment terms…" style={INP} /></Field>
      {supplier && (
        <button type="button" onClick={remove} style={{ alignSelf: "flex-start", border: "none", background: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Delete supplier</button>
      )}
      <Buttons onCancel={onClose} onSave={save} label={supplier ? "Save" : "Add supplier"} disabled={!name.trim() || duplicate} busy={busy} />
    </Modal>
  );
}

