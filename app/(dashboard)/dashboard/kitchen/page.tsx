"use client";

/**
 * Kitchen display (KDS). Every ticket fired from the till lands here within a
 * few seconds (see useRestaurantData), filed under its station. Cooks move it
 * New → Preparing → Ready; the waiter or the pass marks it Served. The screen
 * chimes for new tickets, ages each card by colour, and keeps the 86 list —
 * dishes switched off the menu for the rest of service.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChefHat, Maximize2, Printer, Volume2, VolumeX, Undo2, Flame, Ban, Clock, History, X,
} from "lucide-react";
import MobilePageHeader from "@/components/mobile-page-header";
import PageTitle from "@/components/page-title";
import KotPrint from "@/components/kot-print";
import { useRestaurantData, chime } from "@/lib/use-restaurant";
import {
  ORDER_TYPE_LABEL, STATION_LABEL, minutesSince, setTicketStatus,
  type KitchenTicket, type Station, type TicketStatus,
} from "@/lib/restaurant";
import { getStoredInventory, saveInventory } from "@/lib/storage";
import type { InventoryItem } from "@/lib/types";

type StationFilter = "all" | Station;

const COLUMNS: { status: TicketStatus; label: string; color: string; bg: string }[] = [
  { status: "new",       label: "New",       color: "#2563eb", bg: "#eff6ff" },
  { status: "preparing", label: "Preparing", color: "#d97706", bg: "#fffbeb" },
  { status: "ready",     label: "Ready",     color: "#059669", bg: "#ecfdf5" },
];

const NEXT: Partial<Record<TicketStatus, { to: TicketStatus; label: string }>> = {
  new:       { to: "preparing", label: "Start" },
  preparing: { to: "ready",     label: "Ready" },
  ready:     { to: "served",    label: "Served" },
};

const PREV: Partial<Record<TicketStatus, TicketStatus>> = {
  preparing: "new",
  ready: "preparing",
};

/** Green under 10 minutes, amber under 20, red after. */
function ageColor(mins: number) {
  if (mins < 10) return "#059669";
  if (mins < 20) return "#d97706";
  return "#dc2626";
}

function readPref<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export default function KitchenPage() {
  const { tickets } = useRestaurantData(4000);
  const [station, setStation] = useState<StationFilter>("all");
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [printTickets, setPrintTickets] = useState<KitchenTicket[] | null>(null);
  const [showRecall, setShowRecall] = useState(false);
  const [show86, setShow86] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setStation(readPref<StationFilter>("pointly_kds_station", "all"));
      setSound(readPref("pointly_kds_sound", "on") === "on");
    }, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearTimeout(t); window.clearInterval(tick); };
  }, []);

  const visible = useMemo(
    () => tickets.filter((t) => station === "all" || t.station === station),
    [tickets, station],
  );

  // Chime and flash for tickets this screen hasn't seen before. The first load
  // only records what's already there — a refresh mid-service shouldn't ring
  // for every ticket on the board.
  useEffect(() => {
    const active = visible.filter((t) => t.status === "new");
    if (seen.current === null) {
      seen.current = new Set(visible.map((t) => t.id));
      return;
    }
    const fresh = active.filter((t) => !seen.current!.has(t.id));
    visible.forEach((t) => seen.current!.add(t.id));
    if (fresh.length === 0) return;
    if (sound) chime("new");
    const ids = new Set(fresh.map((t) => t.id));
    const on = window.setTimeout(() => setFlash((prev) => new Set([...prev, ...ids])), 0);
    const off = window.setTimeout(() => setFlash((prev) => new Set([...prev].filter((id) => !ids.has(id)))), 6000);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, [visible, sound]);

  const byStatus = useMemo(() => {
    const sorted = [...visible].sort((a, b) =>
      Number(!!b.rush) - Number(!!a.rush) || a.createdAt.localeCompare(b.createdAt));
    return Object.fromEntries(COLUMNS.map((c) => [c.status, sorted.filter((t) => t.status === c.status)])) as Record<TicketStatus, KitchenTicket[]>;
  }, [visible]);

  const recentlyServed = useMemo(
    () => visible.filter((t) => t.status === "served")
      .sort((a, b) => (b.servedAt ?? "").localeCompare(a.servedAt ?? ""))
      .slice(0, 15),
    [visible],
  );

  // Average fire-to-ready time for today's tickets on this station.
  const avgPrep = useMemo(() => {
    const today = new Date().toDateString();
    const done = visible.filter((t) => t.readyAt && new Date(t.createdAt).toDateString() === today);
    if (done.length === 0) return null;
    const total = done.reduce((sum, t) => sum + (new Date(t.readyAt!).getTime() - new Date(t.createdAt).getTime()), 0);
    return Math.round(total / done.length / 60000);
  }, [visible]);

  function pickStation(next: StationFilter) {
    setStation(next);
    writePref("pointly_kds_station", next);
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    writePref("pointly_kds_sound", next ? "on" : "off");
    if (next) chime("new");
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  const openCount = byStatus.new.length + byStatus.preparing.length;

  return (
    <div className="dashboard-polish kds" style={{ minHeight: "100vh" }}>
      <MobilePageHeader title="Kitchen" subtitle={`${openCount} open · ${byStatus.ready.length} ready`} />

      <div className="dash-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="desktop-only">
          <PageTitle
            icon={<ChefHat size={24} />}
            title="Kitchen Display"
            subtitle={`${openCount} open ticket${openCount === 1 ? "" : "s"} · ${byStatus.ready.length} ready to serve${avgPrep !== null ? ` · avg ${avgPrep} min to ready today` : ""}`}
          />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(["all", "kitchen", "bar"] as StationFilter[]).map((s) => (
            <button key={s} type="button" onClick={() => pickStation(s)} className={`kds-chip${station === s ? " on" : ""}`}>
              {s === "all" ? "All stations" : STATION_LABEL[s]}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button type="button" className="kds-chip" onClick={() => setShow86(true)}><Ban size={13} /> 86 list</button>
          <button type="button" className="kds-chip" onClick={() => setShowRecall(true)}><History size={13} /> Recall</button>
          <button type="button" className="kds-chip" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Volume2 size={13} /> : <VolumeX size={13} />} {sound ? "Sound on" : "Muted"}
          </button>
          <button type="button" className="kds-chip" onClick={fullscreen}><Maximize2 size={13} /> Full screen</button>
        </div>

        {/* Board */}
        <div className="kds-board">
          {COLUMNS.map((col) => (
            <section key={col.status} className="kds-col">
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 10px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f" }}>{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: col.color, background: col.bg, borderRadius: 20, padding: "1px 9px" }}>{byStatus[col.status].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {byStatus[col.status].length === 0 && (
                  <div style={{ padding: "28px 12px", textAlign: "center", fontSize: 12, color: "#b0b0c8", border: "1.5px dashed #e4e4ef", borderRadius: 12 }}>
                    Nothing {col.label.toLowerCase()}
                  </div>
                )}
                {byStatus[col.status].map((t) => (
                  <TicketCard key={t.id} ticket={t} now={now} flash={flash.has(t.id)} accent={col.color}
                    onPrint={() => setPrintTickets([t])} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {printTickets && <KotPrint tickets={printTickets} onClose={() => setPrintTickets(null)} />}

      {showRecall && (
        <Sheet title="Recently served" onClose={() => setShowRecall(false)}>
          {recentlyServed.length === 0 && <div style={{ fontSize: 13, color: "#9999b0" }}>Nothing served yet.</div>}
          {recentlyServed.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f2f2f8" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f" }}>{where(t)} · #{t.orderNumber}</div>
                <div style={{ fontSize: 11, color: "#9999b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </div>
              </div>
              <button type="button" className="kds-chip" onClick={() => setTicketStatus(t, "ready")}><Undo2 size={13} /> Back to ready</button>
            </div>
          ))}
        </Sheet>
      )}

      {show86 && <EightySixSheet onClose={() => setShow86(false)} />}

      <style>{`
        .kds-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
        .kds-col { background: rgba(255,255,255,.6); border: 1px solid #ececf4; border-radius: 16px; padding: 12px; min-height: 60vh; }
        .kds-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 10px; border: 1.5px solid #e6e6f0; background: #fff; color: #5a5a78; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .kds-chip.on { border-color: #EA580C; background: #fff7ed; color: #EA580C; }
        .kds-card { background: #fff; border-radius: 14px; border: 1.5px solid #ececf4; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.04); }
        .kds-card.flash { animation: kdsFlash 1s ease-in-out 5; }
        @keyframes kdsFlash { 50% { box-shadow: 0 0 0 4px rgba(37,99,235,.45); } }
        @media (max-width: 900px) {
          .kds-board { grid-template-columns: 1fr; }
          .kds-col { min-height: 0; }
        }
      `}</style>
    </div>
  );
}

function where(t: KitchenTicket) {
  return t.tableNames.length ? t.tableNames.join(" + ") : ORDER_TYPE_LABEL[t.orderType];
}

function TicketCard({ ticket, now, flash, accent, onPrint }: {
  ticket: KitchenTicket; now: number; flash: boolean; accent: string; onPrint: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const mins = minutesSince(ticket.createdAt, now);
  const next = NEXT[ticket.status];
  const prev = PREV[ticket.status];
  const allVoided = ticket.items.every((i) => i.voided);

  async function move(to: TicketStatus) {
    setBusy(true);
    try { await setTicketStatus(ticket, to); } finally { setBusy(false); }
  }

  return (
    <div className={`kds-card${flash ? " flash" : ""}`} style={{ borderColor: ticket.rush ? "#dc2626" : undefined }}>
      <div style={{ height: 4, background: ticket.rush ? "#dc2626" : accent }} />
      <div style={{ padding: "11px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#1d1d2f", lineHeight: 1.15 }}>
              {where(ticket)} <span style={{ color: "#9999b0", fontWeight: 800 }}>#{ticket.orderNumber}</span>
            </div>
            <div style={{ fontSize: 11, color: "#9999b0", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>{ORDER_TYPE_LABEL[ticket.orderType]}</span>
              <span>· {STATION_LABEL[ticket.station]}</span>
              {ticket.waiterName && <span>· {ticket.waiterName}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 900, color: ageColor(mins) }}>
              <Clock size={12} /> {mins}m
            </div>
            {ticket.rush && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 900, color: "#dc2626", marginTop: 3 }}>
                <Flame size={11} /> RUSH
              </div>
            )}
          </div>
        </div>

        <div style={{ margin: "10px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {ticket.items.map((item) => (
            <div key={item.lineId} style={{ opacity: item.voided ? 0.5 : 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: item.voided ? "#dc2626" : "#1d1d2f", textDecoration: item.voided ? "line-through" : "none" }}>
                <span style={{ color: accent }}>{item.qty}×</span> {item.name}{item.voided && " — VOID"}
              </div>
              {item.note && !item.voided && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", background: "#fffbeb", borderRadius: 6, padding: "2px 7px", marginTop: 3, display: "inline-block" }}>
                  {item.note}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {prev && (
            <button type="button" onClick={() => move(prev)} disabled={busy} aria-label="Move back"
              style={{ width: 38, borderRadius: 10, border: "1.5px solid #e6e6f0", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#9999b0" }}>
              <Undo2 size={14} />
            </button>
          )}
          <button type="button" onClick={onPrint} aria-label="Print ticket"
            style={{ width: 38, borderRadius: 10, border: "1.5px solid #e6e6f0", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#6b6b8a" }}>
            <Printer size={14} />
          </button>
          {allVoided ? (
            <button type="button" onClick={() => move("served")} disabled={busy}
              style={{ flex: 1, height: 38, borderRadius: 10, border: "none", background: "#fef2f2", color: "#dc2626", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              Voided — clear
            </button>
          ) : next && (
            <button type="button" onClick={() => move(next.to)} disabled={busy}
              style={{ flex: 1, height: 38, borderRadius: 10, border: "none", background: accent, color: "#fff", fontSize: 13, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              {next.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,15,30,.45)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, height: "100%", background: "#fff", padding: 20, overflowY: "auto", boxShadow: "-10px 0 40px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 900, color: "#1d1d2f" }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The 86 list: every dish on sale, with a switch to take it off the menu for
 * now. Writes the product record itself, so the POS on every terminal greys
 * it out on its next sync.
 */
function EightySixSheet({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setItems(getStoredInventory().filter((i) => (i.retailPrice ?? 0) > 0 || i.variablePrice)), 0);
    return () => window.clearTimeout(t);
  }, []);

  function toggle(id: string) {
    const fresh = getStoredInventory();
    const updated = fresh.map((i) => (i.id === id ? { ...i, unavailable: !i.unavailable } : i));
    saveInventory(updated);
    setItems(updated.filter((i) => (i.retailPrice ?? 0) > 0 || i.variablePrice));
  }

  const shown = items
    .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!b.unavailable) - Number(!!a.unavailable) || a.name.localeCompare(b.name));

  return (
    <Sheet title="86 list — off the menu" onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes…"
        style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
      {shown.length === 0 && <div style={{ fontSize: 13, color: "#9999b0" }}>No menu items with a price yet.</div>}
      {shown.map((i) => (
        <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f2f2f8", cursor: "pointer" }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: i.unavailable ? "#dc2626" : "#1d1d2f", textDecoration: i.unavailable ? "line-through" : "none" }}>{i.name}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: i.unavailable ? "#dc2626" : "#059669" }}>{i.unavailable ? "86'd" : "Available"}</span>
          <input type="checkbox" checked={!i.unavailable} onChange={() => toggle(i.id)} style={{ width: 18, height: 18, accentColor: "#059669" }} />
        </label>
      ))}
    </Sheet>
  );
}
