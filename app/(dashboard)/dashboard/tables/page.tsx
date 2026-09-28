"use client";

/**
 * Floor plan. Every table shows its live state — free, seated, food ready at
 * the pass, bill asked for — and opens into its tab: add items (on the POS),
 * serve, print the bill, settle, move, merge, split, reassign or cancel.
 * Takeaway and delivery tabs have no table, so they are listed under the plan.
 *
 * "Edit layout" turns the plan into an editor: add tables, drag them where
 * they stand in the room, rename or remove them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid, Plus, Pencil, Check, X, Users, Clock, Printer, ArrowRightLeft, Merge,
  Split, Flame, Trash2, ReceiptText, UtensilsCrossed, BellRing, History, ShoppingBag, Bike,
} from "lucide-react";
import MobilePageHeader from "@/components/mobile-page-header";
import PageTitle from "@/components/page-title";
import KotPrint from "@/components/kot-print";
import ManagerApproval from "@/components/manager-approval";
import { useRestaurantData, chime } from "@/lib/use-restaurant";
import {
  ORDER_TYPE_LABEL, cancelOrder, deleteTable, liveLines, mergeOrders, minutesSince, moveOrder,
  newId, nextOrderNumber, orderLabel, orderSubtotal, saveOrder, saveTable, serveOrder, splitOrder,
  tableState, type DiningTable, type KitchenTicket, type RestaurantOrder, type TableState,
} from "@/lib/restaurant";
import { getStoredStaff } from "@/lib/storage";
import { fmtCurrency as fmt } from "@/lib/format";
import type { Staff } from "@/lib/types";

const STATE_STYLE: Record<TableState, { label: string; color: string; bg: string; border: string }> = {
  free:     { label: "Free",       color: "#059669", bg: "#ffffff", border: "#d1fae5" },
  occupied: { label: "Seated",     color: "#c2410c", bg: "#fff7ed", border: "#fdba74" },
  ready:    { label: "Food ready", color: "#047857", bg: "#ecfdf5", border: "#10b981" },
  bill:     { label: "Bill",       color: "#7c3aed", bg: "#f5f3ff", border: "#a78bfa" },
};

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, padding: "0 12px",
  borderRadius: 10, border: "1.5px solid #e6e6f0", background: "#fff", color: "#4a4a6a", fontSize: 12,
  fontWeight: 750, cursor: "pointer", fontFamily: "inherit",
};
const primary: React.CSSProperties = { ...btn, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff" };
const inp: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4",
  fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box",
};

export default function TablesPage() {
  const router = useRouter();
  const { tables, orders, tickets } = useRestaurantData(5000);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [area, setArea] = useState("all");
  const [editing, setEditing] = useState(false);
  const [editTable, setEditTable] = useState<DiningTable | "new" | null>(null);
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [historyTable, setHistoryTable] = useState<DiningTable | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Set once a drag actually moves a table, so the click that ends it doesn't also open the editor.
  const dragMoved = useRef(false);
  const readySeen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setStaff(getStoredStaff().filter((s) => s.isActive)), 0);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearTimeout(t); window.clearInterval(tick); };
  }, []);

  const openOrders = useMemo(() => orders.filter((o) => o.status === "open"), [orders]);
  const areas = useMemo(() => Array.from(new Set(tables.map((t) => t.area).filter(Boolean))).sort(), [tables]);
  const shownTables = tables.filter((t) => area === "all" || t.area === area);
  const counterOrders = openOrders.filter((o) => o.tableIds.length === 0);
  const openOrder = openOrderId ? orders.find((o) => o.id === openOrderId) ?? null : null;

  // Chime when food for a table comes up at the pass.
  useEffect(() => {
    const ready = new Set(tickets.filter((t) => t.status === "ready").map((t) => t.id));
    if (readySeen.current === null) { readySeen.current = ready; return; }
    const fresh = [...ready].some((id) => !readySeen.current!.has(id));
    readySeen.current = ready;
    if (fresh) chime("ready");
  }, [tickets]);

  const counts = useMemo(() => {
    const c: Record<TableState, number> = { free: 0, occupied: 0, ready: 0, bill: 0 };
    tables.forEach((t) => { c[tableState(t.id, openOrders, tickets).state] += 1; });
    return c;
  }, [tables, openOrders, tickets]);

  // ── Layout editing ────────────────────────────────────────────────────────
  function pointerToPercent(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(92, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100 - 4)),
      y: Math.min(88, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100 - 5)),
    };
  }

  function onTablePointerDown(e: React.PointerEvent, table: DiningTable) {
    if (!editing) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragMoved.current = false;
    setDrag({ id: table.id, x: table.x, y: table.y });
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    dragMoved.current = true;
    setDrag({ id: drag.id, ...pointerToPercent(e) });
  }
  async function onCanvasPointerUp() {
    if (!drag) return;
    const table = tables.find((t) => t.id === drag.id);
    const moved = drag;
    setDrag(null);
    if (table && dragMoved.current && (Math.abs(table.x - moved.x) > 0.5 || Math.abs(table.y - moved.y) > 0.5)) {
      await saveTable({ ...table, x: Math.round(moved.x), y: Math.round(moved.y) });
    }
  }

  function clickTable(table: DiningTable) {
    if (editing) { setEditTable(table); return; }
    const { order } = tableState(table.id, openOrders, tickets);
    if (order) setOpenOrderId(order.id);
    else setSeatTable(table);
  }

  async function seat(table: DiningTable, guests: number, waiterId: string) {
    const waiter = staff.find((s) => s.id === waiterId);
    const order: RestaurantOrder = {
      id: newId("ord"),
      number: nextOrderNumber(),
      type: "dine-in",
      status: "open",
      tableIds: [table.id],
      guests: guests || undefined,
      waiterId: waiter?.id,
      waiterName: waiter?.name,
      lines: [],
      createdAt: new Date().toISOString(),
    };
    await saveOrder(order);
    setSeatTable(null);
    router.push(`/dashboard/pos?order=${order.id}`);
  }

  return (
    <div className="dashboard-polish" style={{ minHeight: "100vh" }}>
      <MobilePageHeader
        title="Tables"
        subtitle={`${counts.free} free · ${counts.occupied + counts.ready + counts.bill} seated`}
        action={{ label: editing ? "Done" : "Edit", onClick: () => setEditing((v) => !v) }}
      />

      <div className="dash-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="desktop-only">
          <PageTitle
            icon={<LayoutGrid size={24} />}
            title="Tables"
            subtitle={`${tables.length} tables · ${counts.free} free · ${counts.occupied + counts.ready + counts.bill} seated · ${counts.ready} with food ready`}
            right={
              <div style={{ display: "flex", gap: 8 }}>
                {editing && <button type="button" style={btn} onClick={() => setEditTable("new")}><Plus size={14} /> Add table</button>}
                <button type="button" style={editing ? primary : btn} onClick={() => setEditing((v) => !v)}>
                  {editing ? <><Check size={14} /> Done</> : <><Pencil size={14} /> Edit layout</>}
                </button>
              </div>
            }
          />
        </div>

        {/* Area tabs + legend */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {["all", ...areas].map((a) => (
            <button key={a} type="button" onClick={() => setArea(a)}
              style={{ ...btn, height: 32, borderColor: area === a ? "#EA580C" : "#e6e6f0", background: area === a ? "#fff7ed" : "#fff", color: area === a ? "#EA580C" : "#5a5a78" }}>
              {a === "all" ? "All areas" : a}
            </button>
          ))}
          {editing && <button type="button" className="mobile-only-flex" style={{ ...btn, height: 32, display: "none" }} onClick={() => setEditTable("new")}><Plus size={13} /> Add table</button>}
          <div style={{ flex: 1 }} />
          {(Object.keys(STATE_STYLE) as TableState[]).map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#6b6b8a" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: STATE_STYLE[s].bg, border: `2px solid ${STATE_STYLE[s].border}` }} />
              {STATE_STYLE[s].label} {counts[s]}
            </span>
          ))}
        </div>

        {/* Floor */}
        <div
          ref={canvasRef}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          className="floor"
          style={{
            position: "relative", width: "100%", aspectRatio: "16 / 9", minHeight: 360, borderRadius: 18,
            border: editing ? "2px dashed #fdba74" : "1px solid #ececf4",
            background: editing
              ? "repeating-linear-gradient(0deg,#fff,#fff 23px,#f6f6fb 24px),repeating-linear-gradient(90deg,transparent,transparent 23px,#f6f6fb 24px)"
              : "rgba(255,255,255,.7)",
            touchAction: editing ? "none" : "auto", overflow: "hidden",
          }}
        >
          {shownTables.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
              <div>
                <UtensilsCrossed size={30} color="#d0d0e8" />
                <div style={{ fontSize: 15, fontWeight: 800, color: "#9999b0", marginTop: 10 }}>No tables yet</div>
                <div style={{ fontSize: 12, color: "#b0b0c8", marginTop: 4 }}>Add your tables, then drag them to where they are in the room.</div>
                <button type="button" style={{ ...primary, marginTop: 14 }} onClick={() => { setEditing(true); setEditTable("new"); }}>
                  <Plus size={14} /> Add table
                </button>
              </div>
            </div>
          )}
          {shownTables.map((table) => {
            const { state, order } = tableState(table.id, openOrders, tickets);
            const style = STATE_STYLE[state];
            const pos = drag?.id === table.id ? drag : table;
            const size = table.shape === "long" ? { w: "15%", h: "13%" } : { w: "10%", h: "15%" };
            return (
              <button
                key={table.id}
                type="button"
                onPointerDown={(e) => onTablePointerDown(e, table)}
                onClick={() => { if (dragMoved.current) { dragMoved.current = false; return; } clickTable(table); }}
                className={state === "ready" && !editing ? "table-ready" : undefined}
                style={{
                  position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, width: size.w, height: size.h,
                  minWidth: 74, minHeight: 64, borderRadius: table.shape === "round" ? "50%" : 14,
                  border: `2.5px solid ${editing ? "#fb923c" : style.border}`, background: style.bg,
                  cursor: editing ? "grab" : "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 1, padding: 4, fontFamily: "inherit",
                  boxShadow: drag?.id === table.id ? "0 12px 30px rgba(0,0,0,.18)" : "0 2px 8px rgba(0,0,0,.05)",
                  zIndex: drag?.id === table.id ? 5 : 1,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 900, color: "#1d1d2f", lineHeight: 1 }}>{table.name}</span>
                {order && !editing ? (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 800, color: style.color }}>{fmt(orderSubtotal(order))}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#9999b0", display: "flex", alignItems: "center", gap: 3 }}>
                      <Clock size={9} /> {minutesSince(order.createdAt, now)}m{order.guests ? ` · ${order.guests}p` : ""}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#9999b0", display: "flex", alignItems: "center", gap: 3 }}>
                    <Users size={9} /> {table.seats}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Counter orders (no table) */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Takeaway &amp; delivery · {counterOrders.length} open
          </div>
          {counterOrders.length === 0 ? (
            <div style={{ fontSize: 12, color: "#b0b0c8" }}>None right now. Start one from the POS by choosing Takeaway or Delivery.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
              {counterOrders.map((o) => {
                const ready = tickets.some((t) => t.orderId === o.id && t.status === "ready");
                const Icon = o.type === "delivery" ? Bike : ShoppingBag;
                return (
                  <button key={o.id} type="button" onClick={() => setOpenOrderId(o.id)}
                    style={{ textAlign: "left", padding: 12, borderRadius: 14, border: `2px solid ${ready ? "#10b981" : "#ececf4"}`, background: ready ? "#ecfdf5" : "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 900, color: "#1d1d2f" }}>
                      <Icon size={14} color="#EA580C" /> {ORDER_TYPE_LABEL[o.type]} #{o.number}
                      {ready && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, color: "#047857" }}>READY</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#9999b0", marginTop: 4 }}>
                      {o.clientName || "Walk-in"} · {liveLines(o).length} item{liveLines(o).length === 1 ? "" : "s"} · {fmt(orderSubtotal(o))} · {minutesSince(o.createdAt, now)}m
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editTable && (
        <TableEditor
          table={editTable === "new" ? null : editTable}
          defaultArea={area !== "all" ? area : areas[0] ?? "Main hall"}
          nextName={`T${tables.length + 1}`}
          onClose={() => setEditTable(null)}
          onHistory={(t) => { setEditTable(null); setHistoryTable(t); }}
          occupied={editTable !== "new" && tableState(editTable.id, openOrders, tickets).state !== "free"}
        />
      )}
      {seatTable && <SeatDialog table={seatTable} staff={staff} onClose={() => setSeatTable(null)} onSeat={seat} onHistory={() => { setHistoryTable(seatTable); setSeatTable(null); }} />}
      {openOrder && (
        <OrderPanel
          order={openOrder}
          tables={tables}
          openOrders={openOrders}
          staff={staff}
          readyCount={tickets.filter((t) => t.orderId === openOrder.id && t.status === "ready").length}
          tickets={tickets.filter((t) => t.orderId === openOrder.id)}
          now={now}
          onClose={() => setOpenOrderId(null)}
          onSelect={setOpenOrderId}
        />
      )}
      {historyTable && <TableHistory table={historyTable} orders={orders} onClose={() => setHistoryTable(null)} />}

      <style>{`
        .table-ready { animation: tableReady 1.4s ease-in-out infinite; }
        @keyframes tableReady { 50% { box-shadow: 0 0 0 6px rgba(16,185,129,.28); } }
        @media (max-width: 900px) { .floor { aspect-ratio: 3 / 4 !important; } }
      `}</style>
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,15,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: wide ? 520 : 380, maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 24px 60px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 900, color: "#1d1d2f" }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.06em", margin: "10px 0 5px" }}>{children}</div>;
}

function TableEditor({ table, defaultArea, nextName, occupied, onClose, onHistory }: {
  table: DiningTable | null; defaultArea: string; nextName: string; occupied: boolean;
  onClose: () => void; onHistory: (t: DiningTable) => void;
}) {
  const [name, setName] = useState(table?.name ?? nextName);
  const [areaName, setAreaName] = useState(table?.area ?? defaultArea);
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  const [shape, setShape] = useState<DiningTable["shape"]>(table?.shape ?? "square");

  async function save() {
    if (!name.trim()) return;
    await saveTable({
      id: table?.id ?? newId("tbl"),
      name: name.trim(),
      area: areaName.trim(),
      seats: Math.max(1, parseInt(seats, 10) || 1),
      shape,
      // New tables land in a free-ish spot; drag them into place after.
      x: table?.x ?? 6 + Math.random() * 70,
      y: table?.y ?? 8 + Math.random() * 60,
    });
    onClose();
  }

  return (
    <Modal title={table ? `Edit ${table.name}` : "Add table"} onClose={onClose}>
      <Label>Name</Label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inp} />
      <Label>Area</Label>
      <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Main hall, Terrace…" style={inp} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <Label>Seats</Label>
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} style={inp} />
        </div>
        <div>
          <Label>Shape</Label>
          <select value={shape} onChange={(e) => setShape(e.target.value as DiningTable["shape"])} style={inp}>
            <option value="square">Square</option>
            <option value="round">Round</option>
            <option value="long">Long</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {table && (
          <button type="button" style={{ ...btn, color: "#dc2626", borderColor: "#fecaca" }} disabled={occupied}
            title={occupied ? "Close this table's order first" : undefined}
            onClick={async () => { await deleteTable(table.id); onClose(); }}>
            <Trash2 size={14} />
          </button>
        )}
        {table && <button type="button" style={btn} onClick={() => onHistory(table)}><History size={14} /></button>}
        <div style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={onClose}>Cancel</button>
        <button type="button" style={primary} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

function SeatDialog({ table, staff, onClose, onSeat, onHistory }: {
  table: DiningTable; staff: Staff[]; onClose: () => void;
  onSeat: (t: DiningTable, guests: number, waiterId: string) => void; onHistory: () => void;
}) {
  const [guests, setGuests] = useState(String(Math.min(2, table.seats)));
  const [waiterId, setWaiterId] = useState("");
  return (
    <Modal title={`Seat ${table.name}`} onClose={onClose}>
      <div style={{ fontSize: 12, color: "#9999b0" }}>{table.area ? `${table.area} · ` : ""}{table.seats} seats</div>
      <Label>Guests</Label>
      <input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} style={inp} />
      <Label>Waiter</Label>
      <select value={waiterId} onChange={(e) => setWaiterId(e.target.value)} style={inp}>
        <option value="">Unassigned</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button type="button" style={btn} onClick={onHistory}><History size={14} /> History</button>
        <div style={{ flex: 1 }} />
        <button type="button" style={primary} onClick={() => onSeat(table, parseInt(guests, 10) || 0, waiterId)}>
          <UtensilsCrossed size={14} /> Seat &amp; take order
        </button>
      </div>
    </Modal>
  );
}

type PanelMode = null | "move" | "merge" | "split" | "cancel";

function OrderPanel({ order, tables, openOrders, staff, readyCount, tickets, now, onClose, onSelect }: {
  order: RestaurantOrder; tables: DiningTable[]; openOrders: RestaurantOrder[]; staff: Staff[];
  readyCount: number; tickets: KitchenTicket[]; now: number; onClose: () => void; onSelect: (id: string | null) => void;
}) {
  // Where each sent line has got to: the status of the kitchen ticket carrying it.
  const lineStatus = new Map<string, KitchenTicket["status"]>();
  for (const t of tickets) for (const i of t.items) lineStatus.set(i.lineId, t.status);
  const router = useRouter();
  const [mode, setMode] = useState<PanelMode>(null);
  const [splitIds, setSplitIds] = useState<Set<string>>(new Set());
  const [printBill, setPrintBill] = useState(false);
  const [error, setError] = useState("");
  const lines = order.lines;
  const occupiedIds = new Set(openOrders.flatMap((o) => o.tableIds));
  const freeTables = tables.filter((t) => !occupiedIds.has(t.id));
  const otherOrders = openOrders.filter((o) => o.id !== order.id);
  const hasFired = liveLines(order).some((l) => l.firedAt);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try { await action(); setMode(null); }
    catch (err) { setError(err instanceof Error ? err.message : "That didn't work."); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,15,30,.45)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-10px 0 40px rgba(0,0,0,.15)" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f2f2f8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, fontSize: 19, fontWeight: 900, color: "#1d1d2f" }}>{orderLabel(order, tables)}</div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0" }}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 12, color: "#9999b0", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>#{order.number}</span>
            <span>· {ORDER_TYPE_LABEL[order.type]}</span>
            <span>· {minutesSince(order.createdAt, now)} min</span>
            {order.guests ? <span>· {order.guests} guests</span> : null}
            {order.clientName && <span>· {order.clientName}</span>}
          </div>
          {order.type === "delivery" && (
            <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: order.deliveryAddress ? "#7c2d12" : "#dc2626", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 9, padding: "7px 10px", lineHeight: 1.45 }}>
              {order.deliveryAddress ? <>Deliver to: {order.deliveryAddress}</> : "No delivery address"}
              {order.clientPhone && <div style={{ fontWeight: 600 }}>{order.clientName ? `${order.clientName} · ` : ""}{order.clientPhone}</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <select value={order.waiterId ?? ""} aria-label="Waiter"
              onChange={(e) => { const w = staff.find((s) => s.id === e.target.value); saveOrder({ ...order, waiterId: w?.id, waiterName: w?.name }); }}
              style={{ ...inp, height: 34, flex: 1 }}>
              <option value="">No waiter</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" onClick={() => saveOrder({ ...order, rush: !order.rush })}
              style={{ ...btn, height: 34, borderColor: order.rush ? "#dc2626" : "#e6e6f0", color: order.rush ? "#dc2626" : "#6b6b8a", background: order.rush ? "#fef2f2" : "#fff" }}>
              <Flame size={13} /> Rush
            </button>
          </div>
        </div>

        {/* Lines */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {mode === "split" && (
            <div style={{ fontSize: 12, color: "#6b6b8a", marginBottom: 8 }}>Tick the items that go on the separate bill.</div>
          )}
          {lines.length === 0 && <div style={{ fontSize: 13, color: "#b0b0c8", padding: "20px 0" }}>Nothing ordered yet.</div>}
          {lines.map((l) => (
            <label key={l.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid #f6f6fb", opacity: l.voided ? 0.45 : 1, cursor: mode === "split" ? "pointer" : "default" }}>
              {mode === "split" && !l.voided && (
                <input type="checkbox" checked={splitIds.has(l.id)} style={{ marginTop: 3, accentColor: "#EA580C" }}
                  onChange={() => setSplitIds((prev) => { const n = new Set(prev); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 750, color: "#1d1d2f", textDecoration: l.voided ? "line-through" : "none" }}>{l.qty} × {l.name}</div>
                {l.modifiers && l.modifiers.length > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8" }}>{l.modifiers.map((m) => m.name).join(" · ")}</div>}
                {l.note && <div style={{ fontSize: 11, color: "#b45309" }}>{l.note}</div>}
                <div style={{ fontSize: 10, fontWeight: 700, color: l.voided ? "#dc2626" : !l.firedAt ? "#d97706" : lineStatus.get(l.id) === "ready" ? "#047857" : lineStatus.get(l.id) === "served" ? "#6b7280" : "#059669", marginTop: 2 }}>
                  {l.voided ? `Voided — ${l.voided.reason} (${l.voided.approvedBy})`
                    : !l.firedAt ? "Not sent yet"
                    : ({ new: "Sent to kitchen", preparing: "Being prepared", ready: "Ready to serve", served: "Served" } as const)[lineStatus.get(l.id) ?? "new"]}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#4a4a6a" }}>{fmt(l.qty * l.unitPrice)}</div>
            </label>
          ))}
        </div>

        {/* Mode pickers */}
        {mode === "move" && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f2f2f8" }}>
            <Label>Move to</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {freeTables.length === 0 && <span style={{ fontSize: 12, color: "#9999b0" }}>No free tables.</span>}
              {freeTables.map((t) => (
                <button key={t.id} type="button" style={btn} onClick={() => run(() => moveOrder(order, [t.id]))}>{t.name}</button>
              ))}
            </div>
          </div>
        )}
        {mode === "merge" && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f2f2f8" }}>
            <Label>Merge this order into</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {otherOrders.length === 0 && <span style={{ fontSize: 12, color: "#9999b0" }}>No other open orders.</span>}
              {otherOrders.map((o) => (
                <button key={o.id} type="button" style={btn}
                  onClick={() => run(async () => { const merged = await mergeOrders(o, order); onSelect(merged.id); })}>
                  {orderLabel(o, tables)}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === "split" && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f2f2f8", display: "flex", gap: 8 }}>
            <button type="button" style={btn} onClick={() => { setMode(null); setSplitIds(new Set()); }}>Cancel</button>
            <button type="button" style={{ ...primary, flex: 1 }} disabled={splitIds.size === 0}
              onClick={() => run(async () => { const { split } = await splitOrder(order, [...splitIds]); setSplitIds(new Set()); onSelect(split.id); })}>
              <Split size={14} /> Split {splitIds.size} item{splitIds.size === 1 ? "" : "s"} to a new bill
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "14px 20px 18px", borderTop: "1px solid #f2f2f8" }}>
          {error && <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#9999b0" }}>Total so far</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#1d1d2f" }}>{fmt(orderSubtotal(order))}</span>
          </div>
          {readyCount > 0 && (
            <button type="button" style={{ ...primary, width: "100%", marginBottom: 8, background: "#059669" }} onClick={() => run(() => serveOrder(order.id))}>
              <BellRing size={14} /> Food ready — mark {readyCount} ticket{readyCount === 1 ? "" : "s"} served
            </button>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <button type="button" style={btn} onClick={() => router.push(`/dashboard/pos?order=${order.id}`)}><Plus size={14} /> Add items</button>
            <button type="button" style={btn} onClick={() => { setPrintBill(true); if (!order.billRequested) saveOrder({ ...order, billRequested: true }); }}>
              <Printer size={14} /> Print bill
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 8 }}>
            <button type="button" style={{ ...btn, padding: 0 }} onClick={() => setMode(mode === "move" ? null : "move")} title="Move table"><ArrowRightLeft size={14} /></button>
            <button type="button" style={{ ...btn, padding: 0 }} onClick={() => setMode(mode === "merge" ? null : "merge")} title="Merge"><Merge size={14} /></button>
            <button type="button" style={{ ...btn, padding: 0 }} onClick={() => setMode(mode === "split" ? null : "split")} title="Split bill"><Split size={14} /></button>
            <button type="button" style={{ ...btn, padding: 0, color: "#dc2626", borderColor: "#fecaca" }} title="Cancel order"
              onClick={() => (hasFired ? setMode("cancel") : run(() => cancelOrder(order).then(onClose)))}><Trash2 size={14} /></button>
          </div>
          <button type="button" style={{ ...primary, width: "100%", height: 44, fontSize: 14 }} disabled={liveLines(order).length === 0}
            onClick={() => router.push(`/dashboard/pos?order=${order.id}&checkout=1`)}>
            <ReceiptText size={16} /> Settle bill
          </button>
        </div>
      </div>

      {mode === "cancel" && (
        <ManagerApproval
          title={`Cancel ${orderLabel(order, tables)}?`}
          detail="The kitchen already has items from this order. They will be marked void on the kitchen display."
          confirmLabel="Cancel order"
          onClose={() => setMode(null)}
          onApproved={(approval) => run(async () => { await cancelOrder(order, approval); onClose(); })}
        />
      )}
      {printBill && <KotPrint bill={order} onClose={() => setPrintBill(false)} />}
    </div>
  );
}

function TableHistory({ table, orders, onClose }: { table: DiningTable; orders: RestaurantOrder[]; onClose: () => void }) {
  const past = orders
    .filter((o) => o.status !== "open" && o.tableIds.includes(table.id))
    .sort((a, b) => (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt))
    .slice(0, 50);
  return (
    <Modal title={`${table.name} — history`} onClose={onClose} wide>
      {past.length === 0 && <div style={{ fontSize: 13, color: "#9999b0" }}>No closed orders on this table yet.</div>}
      {past.map((o) => (
        <div key={o.id} style={{ padding: "10px 0", borderBottom: "1px solid #f2f2f8" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f" }}>#{o.number}</span>
            <span style={{ fontSize: 11, color: "#9999b0" }}>
              {new Date(o.createdAt).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
              {o.waiterName ? ` · ${o.waiterName}` : ""}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: o.status === "paid" ? "#059669" : "#dc2626", textTransform: "capitalize" }}>
              {o.status}{o.invoiceNumber ? ` · ${o.invoiceNumber}` : ""}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#6b6b8a", marginTop: 3 }}>
            {liveLines(o).map((l) => `${l.qty}× ${l.name}`).join(", ") || "—"} · {fmt(orderSubtotal(o))}
          </div>
          {o.cancelled?.approvedBy && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>Cancelled: {o.cancelled.reason} ({o.cancelled.approvedBy})</div>}
        </div>
      ))}
    </Modal>
  );
}
