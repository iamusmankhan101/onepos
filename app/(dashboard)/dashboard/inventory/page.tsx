"use client";

/**
 * Inventory (restaurant mode): ingredient stock, deliveries and purchase
 * orders, wastage, stock counts, suppliers, and what was used — see
 * lib/stock.ts. Menu items made from a recipe don't appear here; their
 * ingredients do.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes, Plus, Truck, Trash2, ClipboardCheck, Search, AlertTriangle, CalendarClock,
  Pencil, MessageCircle, PackageCheck, XCircle, Users,
} from "lucide-react";
import MobilePageHeader from "@/components/mobile-page-header";
import PageTitle from "@/components/page-title";
import {
  CountModal, IngredientModal, PurchaseModal, SupplierModal, WasteModal,
} from "@/components/inventory-modals";
import {
  STOCK_CHANGED_EVENT, deletePurchaseOrder, expiryState, fmtQty, getMovements, getPurchaseOrders, getSuppliers,
  localDate, purchaseTotal, savePurchaseOrder, saveSuppliers, stockLevel, tracksStock, undoMovement,
  type MovementType, type PurchaseOrder, type StockMovement, type Supplier,
} from "@/lib/stock";
import { getStoredInventory, subscribeToStoredData } from "@/lib/storage";
import { deleteExpense, getExpenses } from "@/lib/expenses";
import { getCurrentUser } from "@/lib/auth";
import { fmtCurrency as fmt } from "@/lib/format";
import { openWhatsAppChat } from "@/lib/whatsapp-link";
import { settingsStore } from "@/lib/settings-store";
import type { InventoryItem } from "@/lib/types";

type Tab = "stock" | "orders" | "suppliers" | "history";
type StockFilter = "all" | "low" | "expiring";
type Range = "today" | "7d" | "30d" | "month";

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, padding: "0 12px",
  borderRadius: 10, border: "1.5px solid #e6e6f0", background: "#fff", color: "#4a4a6a", fontSize: 12,
  fontWeight: 750, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const primary: React.CSSProperties = { ...btn, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #ececf4", boxShadow: "0 2px 12px rgba(0,0,0,0.03)" };

const MOVE_LABEL: Record<MovementType, { label: string; color: string; bg: string }> = {
  sale:     { label: "Used in sales", color: "#1d4ed8", bg: "#eff6ff" },
  purchase: { label: "Received",      color: "#047857", bg: "#ecfdf5" },
  waste:    { label: "Wasted",        color: "#b91c1c", bg: "#fef2f2" },
  count:    { label: "Count / adjust", color: "#6b21a8", bg: "#faf5ff" },
};

function rangeStart(range: Range): string {
  const d = new Date();
  if (range === "7d") d.setDate(d.getDate() - 6);
  if (range === "30d") d.setDate(d.getDate() - 29);
  if (range === "month") d.setDate(1);
  return localDate(d);
}

function useInventoryData() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const refresh = useCallback(() => {
    setItems(getStoredInventory());
    setMovements(getMovements());
    setSuppliers(getSuppliers());
    setOrders(getPurchaseOrders());
  }, []);
  useEffect(() => {
    const t = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToStoredData(refresh);
    window.addEventListener(STOCK_CHANGED_EVENT, refresh);
    return () => { window.clearTimeout(t); unsubscribe(); window.removeEventListener(STOCK_CHANGED_EVENT, refresh); };
  }, [refresh]);
  return { items, movements, suppliers, orders, refresh };
}

export default function InventoryPage() {
  const { items, movements, suppliers, orders, refresh } = useInventoryData();
  const [tab, setTab] = useState<Tab>("stock");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<Range>("7d");
  const [typeFilter, setTypeFilter] = useState<MovementType | "all">("all");
  const [by, setBy] = useState<string | undefined>();

  // Which pop-up is open.
  const [editIngredient, setEditIngredient] = useState<InventoryItem | "new" | null>(null);
  const [purchase, setPurchase] = useState<{ po?: PurchaseOrder; prefill?: { item: InventoryItem; qty: number }[] } | null>(null);
  const [waste, setWaste] = useState<{ itemId?: string } | null>(null);
  const [counting, setCounting] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | "new" | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; body?: string; confirmLabel?: string; onConfirm: () => Promise<void> } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setBy(getCurrentUser()?.ownerName || undefined), 0);
    return () => window.clearTimeout(t);
  }, []);

  const currency = (settingsStore.business as { currency?: string }).currency || "PKR";
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString("en-PK")}`;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** Closes whichever pop-up is open and re-reads; a save passes what to confirm. */
  function closeAll(message?: string) {
    setEditIngredient(null); setPurchase(null); setWaste(null); setCounting(false); setEditSupplier(null);
    refresh();
    if (typeof message === "string") setNotice(message);
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  const stocked = useMemo(() => items.filter(tracksStock).sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const lowItems = stocked.filter((i) => stockLevel(i) !== "ok");
  const expiring = stocked.filter((i) => expiryState(i) !== null);
  const stockValue = stocked.reduce((s, i) => s + (i.currentStock || 0) * (i.costPrice || 0), 0);
  const monthStart = rangeStart("month");
  const wasteThisMonth = movements.filter((m) => m.type === "waste" && m.date >= monthStart)
    .reduce((s, m) => s + m.lines.reduce((x, l) => x + l.cost, 0), 0);

  const shown = stocked.filter((i) => {
    if (filter === "low" && stockLevel(i) === "ok") return false;
    if (filter === "expiring" && expiryState(i) === null) return false;
    if (search && !`${i.name} ${i.supplier ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function reorderLow() {
    const prefill = lowItems.map((item) => ({ item, qty: Math.max(item.minStock * 2 - item.currentStock, item.minStock || 1) }));
    setPurchase({ prefill });
  }

  // ── Orders ───────────────────────────────────────────────────────────────
  const openOrders = orders.filter((o) => o.status === "ordered");

  function sendToSupplier(po: PurchaseOrder) {
    const supplier = suppliers.find((s) => s.id === po.supplierId);
    if (!supplier?.phone) return;
    const business = (settingsStore.business as { name?: string }).name || "";
    const message = [
      `Purchase order ${po.number}${business ? ` from ${business}` : ""}`,
      ...po.lines.map((l) => `- ${l.name}: ${fmtQty(l.qty, l.unit)}`),
      po.expectedOn ? `Needed by ${po.expectedOn}` : "",
      po.notes ?? "",
    ].filter(Boolean).join("\n");
    openWhatsAppChat(supplier.phone, message);
  }

  function removeOrder(po: PurchaseOrder) {
    const expense = po.status === "received"
      ? getExpenses().find((e) => e.description.startsWith(`Stock purchase ${po.number}`))
      : undefined;
    const effects = [
      po.status === "received" ? "take its delivery back out of stock" : "",
      expense ? `delete its ${money(expense.amount)} expense on Cash Flow` : "",
    ].filter(Boolean);
    setConfirmAction({
      title: `Delete ${po.number}?`,
      body: effects.length ? `This will also ${effects.join(" and ")}.` : undefined,
      confirmLabel: "Delete PO",
      onConfirm: async () => {
        await deletePurchaseOrder(po);
        if (expense) await deleteExpense(expense.id);
        refresh();
        setNotice(`${po.number} deleted`);
      },
    });
  }

  function removeSupplier(s: Supplier) {
    setConfirmAction({
      title: `Delete ${s.name}?`,
      body: "Past purchase orders keep the name.",
      confirmLabel: "Delete Supplier",
      onConfirm: async () => {
        await saveSuppliers(suppliers.filter((x) => x.id !== s.id), [s.id]);
        refresh();
        setNotice(`${s.name} deleted`);
      },
    });
  }

  function undo(m: StockMovement) {
    const what = m.type === "waste" ? "wastage entry" : "stock count";
    setConfirmAction({
      title: `Undo this ${what}?`,
      body: "The stock goes back to what it was before it.",
      confirmLabel: "Undo",
      onConfirm: async () => {
        await undoMovement(m);
        refresh();
        setNotice(`${what === "wastage entry" ? "Wastage" : "Stock count"} undone — stock put back`);
      },
    });
  }

  function cancelOrder(po: PurchaseOrder) {
    setConfirmAction({
      title: `Cancel ${po.number}?`,
      confirmLabel: "Cancel Order",
      onConfirm: async () => {
        await savePurchaseOrder({ ...po, status: "cancelled" });
        refresh();
        setNotice(`${po.number} cancelled`);
      },
    });
  }

  // ── History ──────────────────────────────────────────────────────────────
  const start = rangeStart(range);
  const inRange = movements.filter((m) => m.date >= start && (typeFilter === "all" || m.type === typeFilter));
  const usage = useMemo(() => {
    const map = new Map<string, { name: string; unit: InventoryItem["unit"]; used: number; wasted: number; received: number; adjusted: number; usedCost: number; wastedCost: number }>();
    for (const m of movements.filter((mv) => mv.date >= start)) {
      for (const l of m.lines) {
        const row = map.get(l.itemId) ?? { name: l.name, unit: l.unit, used: 0, wasted: 0, received: 0, adjusted: 0, usedCost: 0, wastedCost: 0 };
        if (m.type === "sale") { row.used += -l.qty; row.usedCost += l.cost; }
        if (m.type === "waste") { row.wasted += -l.qty; row.wastedCost += l.cost; }
        if (m.type === "purchase") row.received += l.qty;
        // Opening stock isn't a correction of anything — leave it out of adjustments.
        if (m.type === "count" && m.note !== "Opening stock") row.adjusted += l.qty;
        map.set(l.itemId, row);
      }
    }
    return [...map.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.usedCost + b.wastedCost - (a.usedCost + a.wastedCost));
  }, [movements, start]);
  const usedTotal = usage.reduce((s, r) => s + r.usedCost, 0);
  const wastedTotal = usage.reduce((s, r) => s + r.wastedCost, 0);

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "stock", label: "Stock", badge: lowItems.length || undefined },
    { id: "orders", label: "Purchase orders", badge: openOrders.length || undefined },
    { id: "suppliers", label: "Suppliers" },
    { id: "history", label: "Usage & wastage" },
  ];

  const actions = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={btn} onClick={() => setWaste({})} disabled={items.length === 0}><Trash2 size={14} /> Wastage</button>
      <button type="button" style={btn} onClick={() => setCounting(true)} disabled={stocked.length === 0}><ClipboardCheck size={14} /> Stock count</button>
      <button type="button" style={btn} onClick={() => setPurchase({})}><Truck size={14} /> Receive / order</button>
      <button type="button" style={primary} onClick={() => setEditIngredient("new")}><Plus size={14} /> Ingredient</button>
    </div>
  );

  return (
    <div className="dashboard-polish" style={{ minHeight: "100vh" }}>
      <MobilePageHeader title="Inventory" subtitle={`${stocked.length} items · ${money(stockValue)}`} action={{ label: "+ Add", onClick: () => setEditIngredient("new") }} />

      <div className="dash-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="desktop-only">
          <PageTitle icon={<Boxes size={24} />} title="Inventory"
            subtitle="Ingredients and supplies — sales take them out through each item's recipe." right={actions} />
        </div>
        <div className="mobile-only" style={{ padding: "0 2px" }}>{actions}</div>

        {/* Summary */}
        <div className="inv-cards">
          {[
            { label: "Stock value", value: money(stockValue), icon: Boxes, color: "#EA580C", onClick: () => { setTab("stock"); setFilter("all"); } },
            { label: "Low / out", value: String(lowItems.length), icon: AlertTriangle, color: lowItems.length ? "#dc2626" : "#9898b0", onClick: () => { setTab("stock"); setFilter("low"); } },
            { label: "Expiring soon", value: String(expiring.length), icon: CalendarClock, color: expiring.length ? "#d97706" : "#9898b0", onClick: () => { setTab("stock"); setFilter("expiring"); } },
            { label: "Wasted this month", value: money(wasteThisMonth), icon: Trash2, color: wasteThisMonth ? "#b91c1c" : "#9898b0", onClick: () => { setTab("history"); setRange("month"); setTypeFilter("waste"); } },
          ].map((c) => (
            <button key={c.label} type="button" onClick={c.onClick} style={{ ...card, padding: "14px 16px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: c.color + "14", display: "grid", placeItems: "center", flexShrink: 0 }}><c.icon size={18} color={c.color} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#1d1d2f" }}>{c.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
              style={{ ...btn, height: 34, borderColor: tab === t.id ? "#EA580C" : "#e6e6f0", background: tab === t.id ? "#fff7ed" : "#fff", color: tab === t.id ? "#EA580C" : "#5a5a78" }}>
              {t.label}
              {t.badge ? <span style={{ background: "#EA580C", color: "#fff", borderRadius: 20, padding: "0 7px", fontSize: 11 }}>{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* ── Stock ── */}
        {tab === "stock" && (
          <div style={card}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#b0b0c8" }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients or supplier…"
                  style={{ width: "100%", height: 36, padding: "0 10px 0 32px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              {(["all", "low", "expiring"] as StockFilter[]).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  style={{ ...btn, height: 34, borderColor: filter === f ? "#1d1d2f" : "#e6e6f0", background: filter === f ? "#1d1d2f" : "#fff", color: filter === f ? "#fff" : "#5a5a78" }}>
                  {f === "all" ? "All" : f === "low" ? `Low / out (${lowItems.length})` : `Expiring (${expiring.length})`}
                </button>
              ))}
              {lowItems.length > 0 && (
                <button type="button" style={{ ...btn, height: 34, color: "#c2410c", borderColor: "#fed7aa", background: "#fff7ed" }} onClick={reorderLow}>
                  <Truck size={13} /> Reorder low stock
                </button>
              )}
            </div>
            {stocked.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                <Boxes size={30} color="#d0d0e8" />
                <div style={{ fontSize: 15, fontWeight: 800, color: "#9999b0", marginTop: 10 }}>No ingredients yet</div>
                <div style={{ fontSize: 12, color: "#b0b0c8", marginTop: 4, maxWidth: 420, marginInline: "auto", lineHeight: 1.6 }}>
                  Add what you stock — coffee beans, milk, syrups, cups, lids. Then give each menu item a recipe on the Menu page, and every sale takes its ingredients out.
                </div>
                <button type="button" style={{ ...primary, marginTop: 14 }} onClick={() => setEditIngredient("new")}><Plus size={14} /> Add ingredient</button>
              </div>
            ) : shown.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>Nothing matches.</div>
            ) : shown.map((i) => {
              const level = stockLevel(i);
              const exp = expiryState(i);
              const pct = Math.min(100, Math.round(((i.currentStock || 0) / Math.max(i.minStock * 3, i.currentStock || 0, 1)) * 100));
              return (
                <div key={i.id} className="inv-row">
                  <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{i.name}</div>
                    <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: 2 }}>
                      {money(i.costPrice)} / {i.unit}{i.supplier ? ` · ${i.supplier}` : ""}
                    </div>
                  </div>
                  <div style={{ flex: "1 1 150px", minWidth: 130 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: level === "out" ? "#dc2626" : level === "low" ? "#d97706" : "#1d1d2f" }}>
                      {fmtQty(i.currentStock || 0, i.unit)}
                      {level !== "ok" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: level === "out" ? "#dc2626" : "#d97706" }}>{level === "out" ? "OUT" : "LOW"}</span>}
                    </div>
                    <div style={{ height: 5, borderRadius: 9, background: "#f1f1f6", marginTop: 5, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: level === "out" ? "#dc2626" : level === "low" ? "#f59e0b" : "#10b981" }} />
                    </div>
                    <div style={{ fontSize: 10.5, color: "#b0b0c8", marginTop: 3 }}>Reorder at {fmtQty(i.minStock, i.unit)}</div>
                  </div>
                  <div style={{ flex: "0 1 120px", fontSize: 12, color: "#6b6b8a" }}>
                    <div style={{ fontWeight: 800, color: "#1d1d2f" }}>{money((i.currentStock || 0) * i.costPrice)}</div>
                    {exp ? (
                      <div style={{ fontSize: 11, fontWeight: 800, color: exp === "expired" ? "#dc2626" : "#d97706" }}>{exp === "expired" ? "Expired" : "Expires"} {i.expiresOn}</div>
                    ) : i.expiresOn ? <div style={{ fontSize: 11 }}>Expires {i.expiresOn}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                    <button type="button" style={{ ...btn, height: 32 }} onClick={() => setPurchase({ prefill: [{ item: i, qty: Math.max(i.minStock * 2 - i.currentStock, i.minStock || 1) }] })} title="Receive or order more"><Truck size={13} /></button>
                    <button type="button" style={{ ...btn, height: 32 }} onClick={() => setWaste({ itemId: i.id })} title="Record wastage"><Trash2 size={13} /></button>
                    <button type="button" style={{ ...btn, height: 32 }} onClick={() => setEditIngredient(i)} title="Edit"><Pencil size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Purchase orders ── */}
        {tab === "orders" && (
          <div style={card}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, fontSize: 13, color: "#6b6b8a" }}>{openOrders.length} waiting for delivery</div>
              <button type="button" style={primary} onClick={() => setPurchase({})}><Plus size={14} /> New order</button>
            </div>
            {orders.length === 0 && <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>No purchase orders yet.</div>}
            {[...orders].sort((a, b) => Number(b.status === "ordered") - Number(a.status === "ordered") || b.createdAt.localeCompare(a.createdAt)).map((po) => {
              const supplier = suppliers.find((s) => s.id === po.supplierId);
              const color = po.status === "ordered" ? "#c2410c" : po.status === "received" ? "#047857" : "#9898b0";
              return (
                <div key={po.id} className="inv-row">
                  <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>
                      {po.number} <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "capitalize", marginLeft: 4 }}>{po.status}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: 2 }}>
                      {po.supplierName || "No supplier"} · {new Date(po.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                      {po.status === "ordered" && po.expectedOn ? ` · due ${po.expectedOn}` : ""}
                      {po.receivedAt ? ` · received ${new Date(po.receivedAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b6b8a", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {po.lines.map((l) => `${l.name} ${fmtQty(l.qty, l.unit)}`).join(" · ")}
                    </div>
                  </div>
                  <div style={{ flex: "0 0 auto", fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{money(purchaseTotal(po))}</div>
                  <button type="button" style={{ ...btn, height: 32, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => removeOrder(po)} title="Delete purchase order" aria-label={`Delete ${po.number}`}><Trash2 size={13} /></button>
                  {po.status === "ordered" && (
                    <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                      {supplier?.phone && <button type="button" style={{ ...btn, height: 32, color: "#059669" }} onClick={() => sendToSupplier(po)} title="Send to supplier on WhatsApp"><MessageCircle size={13} /></button>}
                      <button type="button" style={{ ...btn, height: 32 }} onClick={() => cancelOrder(po)} title="Cancel order"><XCircle size={13} /></button>
                      <button type="button" style={{ ...primary, height: 32 }} onClick={() => setPurchase({ po })}><PackageCheck size={13} /> Receive</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Suppliers ── */}
        {tab === "suppliers" && (
          <div style={card}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, fontSize: 13, color: "#6b6b8a" }}>{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}</div>
              <button type="button" style={primary} onClick={() => setEditSupplier("new")}><Plus size={14} /> Supplier</button>
            </div>
            {suppliers.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 13, color: "#9898b0" }}>
                <Users size={26} color="#d0d0e8" />
                <div style={{ marginTop: 8 }}>No suppliers yet. They&apos;re also added when you type a new one on a purchase order.</div>
              </div>
            )}
            {suppliers.map((s) => {
              const theirs = orders.filter((o) => o.supplierId === s.id && o.status === "received");
              const supplies = stocked.filter((i) => i.supplier?.trim().toLowerCase() === s.name.trim().toLowerCase());
              return (
                <div key={s.id} className="inv-row">
                  <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: 2 }}>
                      {[s.contact, s.phone].filter(Boolean).join(" · ") || "No contact details"}
                      {supplies.length ? ` · supplies ${supplies.map((i) => i.name).join(", ")}` : ""}
                    </div>
                    {s.notes && <div style={{ fontSize: 12, color: "#6b6b8a", marginTop: 2 }}>{s.notes}</div>}
                  </div>
                  <div style={{ flex: "0 0 auto", textAlign: "right", fontSize: 12, color: "#6b6b8a" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{money(theirs.reduce((x, o) => x + purchaseTotal(o), 0))}</div>
                    {theirs.length} deliver{theirs.length === 1 ? "y" : "ies"}
                  </div>
                  <button type="button" style={{ ...btn, height: 32 }} onClick={() => setEditSupplier(s)} title="Edit"><Pencil size={13} /></button>
                  <button type="button" style={{ ...btn, height: 32, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => removeSupplier(s)} title="Delete supplier" aria-label={`Delete ${s.name}`}><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Usage & wastage ── */}
        {tab === "history" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"]] as [Range, string][]).map(([r, label]) => (
                <button key={r} type="button" onClick={() => setRange(r)}
                  style={{ ...btn, height: 32, borderColor: range === r ? "#1d1d2f" : "#e6e6f0", background: range === r ? "#1d1d2f" : "#fff", color: range === r ? "#fff" : "#5a5a78" }}>{label}</button>
              ))}
            </div>
            <div style={card}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: "#1d1d2f" }}>Ingredient consumption</span>
                <span style={{ color: "#1d4ed8", fontWeight: 700 }}>Used in sales {money(usedTotal)}</span>
                <span style={{ color: "#b91c1c", fontWeight: 700 }}>Wasted {money(wastedTotal)}</span>
                {usedTotal + wastedTotal > 0 && <span style={{ color: "#6b6b8a" }}>Waste is {Math.round((wastedTotal / (usedTotal + wastedTotal)) * 1000) / 10}% of what went out</span>}
              </div>
              {usage.length === 0 && <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>No stock moved in this period.</div>}
              {usage.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#9898b0", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {["Item", "Used", "Wasted", "Received", "Count adj.", "Cost used", "Cost wasted"].map((h) => <th key={h} style={{ padding: "9px 14px", fontWeight: 800 }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid #f4f4f8" }}>
                          <td style={{ padding: "9px 14px", fontWeight: 800, color: "#1d1d2f" }}>{r.name}</td>
                          <td style={{ padding: "9px 14px" }}>{r.used ? fmtQty(r.used, r.unit) : "—"}</td>
                          <td style={{ padding: "9px 14px", color: r.wasted ? "#b91c1c" : undefined }}>{r.wasted ? fmtQty(r.wasted, r.unit) : "—"}</td>
                          <td style={{ padding: "9px 14px", color: r.received ? "#047857" : undefined }}>{r.received ? fmtQty(r.received, r.unit) : "—"}</td>
                          <td style={{ padding: "9px 14px" }}>{r.adjusted ? `${r.adjusted > 0 ? "+" : "−"}${fmtQty(Math.abs(r.adjusted), r.unit)}` : "—"}</td>
                          <td style={{ padding: "9px 14px" }}>{r.usedCost ? money(r.usedCost) : "—"}</td>
                          <td style={{ padding: "9px 14px" }}>{r.wastedCost ? money(r.wastedCost) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f", marginRight: 6 }}>Stock log</span>
                {(["all", "sale", "purchase", "waste", "count"] as (MovementType | "all")[]).map((t) => (
                  <button key={t} type="button" onClick={() => setTypeFilter(t)}
                    style={{ ...btn, height: 30, borderColor: typeFilter === t ? "#EA580C" : "#e6e6f0", background: typeFilter === t ? "#fff7ed" : "#fff", color: typeFilter === t ? "#EA580C" : "#5a5a78" }}>
                    {t === "all" ? "All" : MOVE_LABEL[t].label}
                  </button>
                ))}
              </div>
              {inRange.length === 0 && <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>Nothing in this period.</div>}
              {inRange.slice(0, 200).map((m) => {
                const style = MOVE_LABEL[m.type];
                const value = m.lines.reduce((s, l) => s + l.cost, 0);
                return (
                  <div key={m.id} className="inv-row" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: "0 0 auto" }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: style.color, background: style.bg, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{style.label}</span>
                    </div>
                    <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                      <div style={{ fontSize: 12.5, color: "#1d1d2f", lineHeight: 1.5 }}>
                        {m.lines.map((l) => `${l.name} ${l.qty > 0 ? "+" : "−"}${fmtQty(Math.abs(l.qty), l.unit)}`).join(" · ")}
                      </div>
                      <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>
                        {new Date(m.at).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {m.ref ? ` · ${m.ref}` : ""}{m.reason ? ` · ${m.reason}` : ""}{m.note ? ` · ${m.note}` : ""}{m.by ? ` · ${m.by}` : ""}
                      </div>
                    </div>
                    <div style={{ flex: "0 0 auto", fontSize: 12.5, fontWeight: 800, color: "#4a4a6a" }}>{fmt(value)}</div>
                    {(m.type === "waste" || m.type === "count") && (
                      <button type="button" style={{ ...btn, height: 30 }} onClick={() => undo(m)} title="Undo — put the stock back">Undo</button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {editIngredient && <IngredientModal item={editIngredient === "new" ? undefined : editIngredient} suppliers={suppliers} money={money} onClose={closeAll} />}
      {purchase && <PurchaseModal po={purchase.po} prefill={purchase.prefill} items={items} suppliers={suppliers} money={money} by={by} onClose={closeAll} />}
      {waste && <WasteModal items={items} initialItemId={waste.itemId} money={money} by={by} onClose={closeAll} />}
      {counting && <CountModal items={items} money={money} by={by} onClose={closeAll} />}
      {notice && (
        <div role="status" aria-live="polite"
          style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 450, display: "flex", alignItems: "center", gap: 8, background: "#1d1d2f", color: "#fff", borderRadius: 14, padding: "12px 18px", fontSize: 13, fontWeight: 700, boxShadow: "0 12px 32px rgba(0,0,0,0.25)", maxWidth: "calc(100vw - 32px)" }}>
          <PackageCheck size={15} color="#6ee7b7" /> {notice}
        </div>
      )}
      {editSupplier && <SupplierModal supplier={editSupplier === "new" ? undefined : editSupplier} suppliers={suppliers} onClose={closeAll} />}

      {confirmAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 18, fontWeight: 600, color: "#111" }}>{confirmAction.title}</h3>
            {confirmAction.body && (
              <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#666", lineHeight: 1.5 }}>
                {confirmAction.body}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const act = confirmAction;
                  setConfirmAction(null);
                  await act.onConfirm();
                }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 500, fontSize: 13 }}
              >
                {confirmAction.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .inv-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .inv-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 14px; border-top: 1px solid #f4f4f8; }
        .inv-row:first-of-type { border-top: none; }
        @media (max-width: 900px) { .inv-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </div>
  );
}
