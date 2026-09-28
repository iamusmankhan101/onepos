"use client";

/**
 * Shifts (restaurant mode): the cash drawer — open with a float, pay in / out,
 * close with a count and a Z report — the staff time clock, and who sold what.
 * See lib/shifts.ts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Timer, Banknote, LogIn, LogOut, ArrowDownToLine, ArrowUpFromLine, Lock, FileText, Users,
} from "lucide-react";
import MobilePageHeader from "@/components/mobile-page-header";
import PageTitle from "@/components/page-title";
import ZReport from "@/components/z-report";
import {
  SHIFTS_CHANGED_EVENT, addCashMove, cashDifference, clockIn, clockOut, closeShift, entryHours,
  expectedCash, fmtHours, getShifts, getTimeEntries, openEntry, openShift, shiftSummary,
  type CashShift, type TimeEntry,
} from "@/lib/shifts";
import { getInvoices, localDateKey, type Invoice } from "@/lib/invoices";
import { getStoredStaff, subscribeToStoredData } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { fmtCurrency as fmt } from "@/lib/format";
import { roleLabel } from "@/lib/staff-roles";
import type { Staff } from "@/lib/types";

type Tab = "history" | "hours" | "sales";
type Range = "today" | "7d" | "30d" | "month";

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, padding: "0 12px",
  borderRadius: 10, border: "1.5px solid #e6e6f0", background: "#fff", color: "#4a4a6a", fontSize: 12,
  fontWeight: 750, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const primary: React.CSSProperties = { ...btn, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #ececf4", boxShadow: "0 2px 12px rgba(0,0,0,0.03)" };
const inp: React.CSSProperties = {
  height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13,
  color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box", minWidth: 0,
};

function rangeStart(range: Range): string {
  const d = new Date();
  if (range === "7d") d.setDate(d.getDate() - 6);
  if (range === "30d") d.setDate(d.getDate() - 29);
  if (range === "month") d.setDate(1);
  return localDateKey(d);
}

function time(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" });
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [me, setMe] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [floatInput, setFloatInput] = useState("");
  const [move, setMove] = useState<{ type: "in" | "out"; amount: string; reason: string } | null>(null);
  const [closing, setClosing] = useState<{ counted: string; notes: string } | null>(null);
  const [report, setReport] = useState<CashShift | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("history");
  const [range, setRange] = useState<Range>("7d");

  const refresh = useCallback(() => {
    setShifts(getShifts());
    setEntries(getTimeEntries());
    setStaff(getStoredStaff().filter((s) => s.isActive));
    setInvoices(getInvoices());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { refresh(); setMe(getCurrentUser()?.ownerName || "Staff"); }, 0);
    const unsubscribe = subscribeToStoredData(refresh);
    window.addEventListener(SHIFTS_CHANGED_EVENT, refresh);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearTimeout(t); window.clearInterval(tick); unsubscribe(); window.removeEventListener(SHIFTS_CHANGED_EVENT, refresh); };
  }, [refresh]);

  const current = shifts.find((s) => s.status === "open");
  const live = current ? shiftSummary(current, invoices) : null;
  const liveExpected = current ? expectedCash(current, invoices) : 0;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); } finally { setBusy(false); refresh(); }
  }

  // ── Hours & sales ────────────────────────────────────────────────────────
  const start = rangeStart(range);
  const hours = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; shifts: number; on: boolean }>();
    for (const e of entries) {
      if (localDateKey(new Date(e.clockIn)) < start) continue;
      const row = map.get(e.staffId) ?? { name: e.staffName, hours: 0, shifts: 0, on: false };
      row.hours += entryHours(e, now);
      row.shifts += 1;
      if (!e.clockOut) row.on = true;
      map.set(e.staffId, row);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [entries, start, now]);

  const salesByStaff = useMemo(() => {
    type Row = { name: string; count: number; sales: number; refunds: number };
    const credited = new Map<string, Row>();
    const cashiers = new Map<string, Row>();
    const add = (map: Map<string, Row>, name: string, inv: Invoice) => {
      const row = map.get(name) ?? { name, count: 0, sales: 0, refunds: 0 };
      if (inv.refundOf) row.refunds += -inv.total;
      else { row.count += 1; row.sales += inv.total; }
      map.set(name, row);
    };
    for (const inv of invoices) {
      if (inv.status !== "paid" || inv.date < start || (inv.source && inv.source !== "pos")) continue;
      add(credited, inv.staffName || "Not assigned", inv);
      if (inv.cashierName) add(cashiers, inv.cashierName, inv);
    }
    const sort = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.sales - a.sales);
    return { credited: sort(credited), cashiers: sort(cashiers) };
  }, [invoices, start]);

  const closedShifts = shifts.filter((s) => s.status === "closed" && localDateKey(new Date(s.openedAt)) >= start);
  const onNow = entries.filter((e) => !e.clockOut);
  const countedNum = closing ? Number(closing.counted) : NaN;

  const RangePicker = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {([["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"]] as [Range, string][]).map(([r, label]) => (
        <button key={r} type="button" onClick={() => setRange(r)}
          style={{ ...btn, height: 30, borderColor: range === r ? "#1d1d2f" : "#e6e6f0", background: range === r ? "#1d1d2f" : "#fff", color: range === r ? "#fff" : "#5a5a78" }}>{label}</button>
      ))}
    </div>
  );

  return (
    <div className="dashboard-polish" style={{ minHeight: "100vh" }}>
      <MobilePageHeader title="Shifts" subtitle={current ? `Drawer open since ${time(current.openedAt)}` : "Drawer closed"} />

      <div className="dash-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="desktop-only">
          <PageTitle icon={<Timer size={24} />} title="Shifts" subtitle="Cash drawer, time clock and sales by staff." />
        </div>

        <div className="shift-grid">
          {/* ── Cash drawer ── */}
          <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: current ? "#ecfdf5" : "#fef2f2", display: "grid", placeItems: "center" }}>
                <Banknote size={18} color={current ? "#059669" : "#dc2626"} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#1d1d2f" }}>Cash drawer</div>
                <div style={{ fontSize: 12, color: "#9898b0" }}>
                  {current ? `Opened ${day(current.openedAt)} ${time(current.openedAt)} by ${current.openedBy}` : "Closed — open it with the cash you're starting with."}
                </div>
              </div>
            </div>

            {!current ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input type="number" min={0} value={floatInput} onChange={(e) => setFloatInput(e.target.value)} placeholder="Opening float (cash in drawer)" aria-label="Opening float" style={{ ...inp, flex: "1 1 180px" }} />
                <button type="button" style={primary} disabled={busy} onClick={() => run(async () => { await openShift(Number(floatInput) || 0, me); setFloatInput(""); })}>
                  <LogIn size={14} /> Open shift
                </button>
              </div>
            ) : live && (
              <>
                <div className="shift-stats">
                  {[
                    ["Sales", fmt(live.sales), `${live.salesCount} sale${live.salesCount === 1 ? "" : "s"}`],
                    ["Refunds", fmt(live.refunds), `${live.refundCount}`],
                    ["Cash sales", fmt(live.cashSales), `float ${fmt(current.openingFloat)}`],
                    ["Expected cash", fmt(liveExpected), live.paidIn || live.paidOut ? `in ${fmt(live.paidIn)} · out ${fmt(live.paidOut)}` : "in the drawer now"],
                  ].map(([label, value, sub]) => (
                    <div key={label} style={{ padding: "10px 12px", borderRadius: 11, background: "#f7f7fb" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontSize: 17, fontWeight: 900, color: "#1d1d2f", marginTop: 2 }}>{value}</div>
                      <div style={{ fontSize: 11, color: "#9898b0" }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {move ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 10, borderRadius: 11, background: move.type === "in" ? "#f0fdf4" : "#fff7ed" }}>
                    <input autoFocus type="number" min={0} value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} placeholder="Amount" aria-label="Amount" style={{ ...inp, width: 110 }} />
                    <input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })}
                      placeholder={move.type === "in" ? "Why — e.g. change from bank" : "Why — e.g. paid milk supplier"} aria-label="Reason" style={{ ...inp, flex: "1 1 160px" }} />
                    <button type="button" style={btn} onClick={() => setMove(null)}>Cancel</button>
                    <button type="button" style={primary} disabled={busy || !(Number(move.amount) > 0) || !move.reason.trim()}
                      onClick={() => run(async () => { await addCashMove(current, { type: move.type, amount: Number(move.amount), reason: move.reason.trim(), by: me }); setMove(null); })}>
                      Save
                    </button>
                  </div>
                ) : closing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 11, background: "#fafafe", border: "1px solid #ececf4" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f" }}>Count the cash in the drawer</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input autoFocus type="number" min={0} value={closing.counted} onChange={(e) => setClosing({ ...closing, counted: e.target.value })} placeholder="Cash counted" aria-label="Cash counted" style={{ ...inp, width: 150 }} />
                      <input value={closing.notes} onChange={(e) => setClosing({ ...closing, notes: e.target.value })} placeholder="Notes (optional)" aria-label="Closing notes" style={{ ...inp, flex: "1 1 160px" }} />
                    </div>
                    {closing.counted !== "" && Number.isFinite(countedNum) && (
                      <div style={{ fontSize: 13, fontWeight: 800, color: countedNum === Math.round(liveExpected) ? "#059669" : "#b45309" }}>
                        Expected {fmt(liveExpected)} — {countedNum === Math.round(liveExpected) ? "balanced" : countedNum > liveExpected ? `${fmt(countedNum - liveExpected)} over` : `${fmt(liveExpected - countedNum)} short`}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" style={btn} onClick={() => setClosing(null)}>Cancel</button>
                      <button type="button" style={primary} disabled={busy || closing.counted === ""}
                        onClick={() => run(async () => { const closed = await closeShift(current, Number(closing.counted), me, closing.notes); setClosing(null); setReport(closed); })}>
                        <Lock size={14} /> Close shift & print Z report
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={btn} onClick={() => setMove({ type: "in", amount: "", reason: "" })}><ArrowDownToLine size={14} /> Pay in</button>
                    <button type="button" style={btn} onClick={() => setMove({ type: "out", amount: "", reason: "" })}><ArrowUpFromLine size={14} /> Pay out</button>
                    <button type="button" style={btn} onClick={() => setReport(current)}><FileText size={14} /> X report</button>
                    <button type="button" style={{ ...primary, marginLeft: "auto" }} onClick={() => setClosing({ counted: "", notes: "" })}><Lock size={14} /> Close shift</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Time clock ── */}
          <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "#eff6ff", display: "grid", placeItems: "center" }}><Users size={18} color="#2563eb" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#1d1d2f" }}>Time clock</div>
                <div style={{ fontSize: 12, color: "#9898b0" }}>{onNow.length} on shift now</div>
              </div>
            </div>
            {staff.length === 0 && <div style={{ fontSize: 13, color: "#9898b0" }}>Add your team on the Staff page first.</div>}
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 340, overflowY: "auto" }}>
              {staff.map((s) => {
                const entry = openEntry(s.id, entries);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #f4f4f8" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: entry ? "#10b981" : "#d4d4de", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#9898b0", textTransform: "capitalize" }}>
                        {roleLabel(s.role)}{entry ? ` · in since ${time(entry.clockIn)} (${fmtHours(entryHours(entry, now))})` : ""}
                      </div>
                    </div>
                    {entry ? (
                      <button type="button" style={{ ...btn, height: 32 }} disabled={busy} onClick={() => run(() => clockOut(s.id))}><LogOut size={13} /> Clock out</button>
                    ) : (
                      <button type="button" style={{ ...btn, height: 32, color: "#047857", borderColor: "#a7f3d0" }} disabled={busy} onClick={() => run(() => clockIn(s.id, s.name))}><LogIn size={13} /> Clock in</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Reports ── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {([["history", "Shift history"], ["hours", "Hours worked"], ["sales", "Sales by staff"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
              style={{ ...btn, height: 34, borderColor: tab === t ? "#EA580C" : "#e6e6f0", background: tab === t ? "#fff7ed" : "#fff", color: tab === t ? "#EA580C" : "#5a5a78" }}>{label}</button>
          ))}
          <div style={{ flex: 1 }} />
          {RangePicker}
        </div>

        {tab === "history" && (
          <div style={card}>
            {closedShifts.length === 0 && <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>No closed shifts in this period.</div>}
            {closedShifts.map((s) => {
              const diff = cashDifference(s);
              return (
                <div key={s.id} className="shift-row">
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{day(s.openedAt)} · {time(s.openedAt)} – {time(s.closedAt)}</div>
                    <div style={{ fontSize: 11.5, color: "#9898b0" }}>{s.openedBy}{s.closedBy && s.closedBy !== s.openedBy ? ` → ${s.closedBy}` : ""} · {s.summary?.salesCount ?? 0} sales</div>
                  </div>
                  <div style={{ flex: "0 0 auto", fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{fmt((s.summary?.sales ?? 0) - (s.summary?.refunds ?? 0))}</div>
                  <div style={{ flex: "0 0 auto", fontSize: 12, fontWeight: 800, color: diff === 0 ? "#059669" : diff !== null && diff < 0 ? "#dc2626" : "#b45309", minWidth: 110, textAlign: "right" }}>
                    {diff === null ? "—" : diff === 0 ? "Balanced" : `${fmt(Math.abs(diff))} ${diff < 0 ? "short" : "over"}`}
                  </div>
                  <button type="button" style={{ ...btn, height: 32 }} onClick={() => setReport(s)}><FileText size={13} /> Z report</button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "hours" && (
          <div style={card}>
            {hours.length === 0 && <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>Nobody clocked in during this period.</div>}
            {hours.map((h) => (
              <div key={h.name} className="shift-row">
                <div style={{ flex: "1 1 200px", fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>
                  {h.name} {h.on && <span style={{ fontSize: 10, fontWeight: 800, color: "#059669", marginLeft: 6 }}>ON NOW</span>}
                </div>
                <div style={{ fontSize: 12, color: "#9898b0" }}>{h.shifts} shift{h.shifts === 1 ? "" : "s"}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#1d1d2f", minWidth: 80, textAlign: "right" }}>{fmtHours(h.hours)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "sales" && (
          <div className="shift-grid">
            {([["Credited to (waiter / server)", salesByStaff.credited], ["Rung up by (cashier)", salesByStaff.cashiers]] as const).map(([title, rows]) => (
              <div key={title} style={card}>
                <div style={{ padding: "12px 14px", fontSize: 13, fontWeight: 800, color: "#1d1d2f", borderBottom: "1px solid #f2f2f8" }}>{title}</div>
                {rows.length === 0 && <div style={{ padding: 20, fontSize: 13, color: "#9898b0", textAlign: "center" }}>No sales in this period.</div>}
                {rows.map((r) => (
                  <div key={r.name} className="shift-row">
                    <div style={{ flex: "1 1 140px", fontSize: 13.5, fontWeight: 800, color: "#1d1d2f" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#9898b0" }}>{r.count} sale{r.count === 1 ? "" : "s"} · avg {fmt(r.count ? r.sales / r.count : 0)}{r.refunds ? ` · refunds ${fmt(r.refunds)}` : ""}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#1d1d2f", minWidth: 90, textAlign: "right" }}>{fmt(r.sales)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {report && <ZReport shift={report} onClose={() => setReport(null)} />}

      <style>{`
        .shift-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .shift-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .shift-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-top: 1px solid #f4f4f8; }
        .shift-row:first-of-type { border-top: none; }
        @media (max-width: 900px) {
          .shift-grid { grid-template-columns: 1fr; }
          .shift-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </div>
  );
}
