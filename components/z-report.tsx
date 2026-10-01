"use client";

/**
 * The end-of-shift (Z) report: what the till took during a cash-drawer shift
 * (lib/shifts.ts), by payment method and cashier, and whether the drawer
 * balanced. Same 80mm till-roll layout as components/kot-print.tsx.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { cashDifference, expectedCash, shiftSummary, type CashShift } from "@/lib/shifts";
import { settingsStore } from "@/lib/settings-store";
import { fmtCurrency as fmt } from "@/lib/format";

const PRINT_STYLES = `
  @media print {
    body > *:not(#z-print-portal) { display: none !important; }
    #z-print-portal { display: block !important; position: fixed !important; inset: 0 !important; background: #fff !important; z-index: 99999 !important; }
    .z-overlay  { background: transparent !important; padding: 0 !important; }
    .z-no-print { display: none !important; }
    .z-sheet    { border-radius: 0 !important; box-shadow: none !important; width: 72mm !important; margin: 0 !important; }
    @page { size: 80mm auto; margin: 4mm; }
  }
`;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", jazzcash: "JazzCash", easypaisa: "EasyPaisa", raast: "Raast", bank: "Bank",
};

const DASH: React.CSSProperties = { borderBottom: "1px dashed #000", margin: "8px 0" };

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 900 : 400, marginTop: 2 }}>
      <span>{label}</span><span style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function when(iso?: string) {
  return iso ? new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function ZReport({ shift, autoPrint, onClose }: {
  shift: CashShift;
  /** Opens the print dialog as soon as the report is on screen — closing a shift prints its Z report. */
  autoPrint?: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setMounted(true), 0); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    if (!mounted || !autoPrint) return;
    // After the portal has painted, or the browser prints an empty page.
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, [mounted, autoPrint]);
  if (!mounted) return null;

  const open = shift.status === "open";
  // A closed shift reports what was frozen at close; an open one is a live X report.
  const s = shift.summary ?? shiftSummary(shift);
  const expected = shift.expectedCash ?? expectedCash(shift);
  const diff = cashDifference(shift);
  const business = (settingsStore.business as { name?: string }).name || "";

  return createPortal(
    <div id="z-print-portal">
      <style>{PRINT_STYLES}</style>
      <div className="z-overlay" onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,15,30,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div className="z-no-print" style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => window.print()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              <Printer size={15} /> Print
            </button>
            <button type="button" onClick={onClose}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", color: "#6b6b8a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <X size={15} /> Close
            </button>
          </div>
          <div className="z-sheet" style={{ width: 300, background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,0.3)", fontFamily: "ui-monospace, Menlo, monospace", color: "#000", fontSize: 12 }}>
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: 15 }}>{business}</div>
            <div style={{ textAlign: "center", fontWeight: 900, marginTop: 2 }}>{open ? "X REPORT (SHIFT OPEN)" : "Z REPORT — SHIFT CLOSE"}</div>
            <div style={DASH} />
            <Row label="Opened" value={`${when(shift.openedAt)} · ${shift.openedBy}`} />
            <Row label="Closed" value={open ? "still open" : `${when(shift.closedAt)} · ${shift.closedBy ?? ""}`} />
            <div style={DASH} />
            <Row label={`Sales (${s.salesCount})`} value={fmt(s.sales)} bold />
            {s.discounts > 0 && <Row label="  of which discounts" value={`-${fmt(s.discounts)}`} />}
            <Row label={`Refunds (${s.refundCount})`} value={`-${fmt(s.refunds)}`} />
            <Row label="Net takings" value={fmt(s.sales - s.refunds)} bold />
            {(s.collected ?? 0) > 0 && <Row label={`Udhaar collected (${s.collectedCount ?? 0})`} value={fmt(s.collected ?? 0)} />}
            <div style={DASH} />
            <div style={{ fontWeight: 800 }}>By payment method</div>
            {Object.entries(s.byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => <Row key={m} label={METHOD_LABELS[m] ?? m} value={fmt(v)} />)}
            {Object.keys(s.byMethod).length === 0 && <div>No sales.</div>}
            {Object.keys(s.byCashier).length > 0 && (
              <>
                <div style={DASH} />
                <div style={{ fontWeight: 800 }}>By cashier</div>
                {Object.entries(s.byCashier).map(([name, v]) => <Row key={name} label={`${name} (${v.count})`} value={fmt(v.total)} />)}
              </>
            )}
            <div style={DASH} />
            <div style={{ fontWeight: 800 }}>Cash drawer</div>
            <Row label="Opening float" value={fmt(shift.openingFloat)} />
            <Row label="+ Cash sales" value={fmt(s.cashSales)} />
            {s.cashRefunds > 0 && <Row label="- Cash refunds" value={fmt(s.cashRefunds)} />}
            {(s.collectedCash ?? 0) > 0 && <Row label="+ Udhaar collected" value={fmt(s.collectedCash ?? 0)} />}
            {s.paidIn > 0 && <Row label="+ Paid in" value={fmt(s.paidIn)} />}
            {s.paidOut > 0 && <Row label="- Paid out" value={fmt(s.paidOut)} />}
            <Row label="Expected in drawer" value={fmt(expected)} bold />
            {!open && <Row label="Counted" value={fmt(shift.countedCash ?? 0)} bold />}
            {diff !== null && <Row label={diff === 0 ? "Balanced" : diff > 0 ? "Over" : "Short"} value={diff === 0 ? "✓" : fmt(Math.abs(diff))} bold />}
            {shift.moves.length > 0 && (
              <>
                <div style={DASH} />
                <div style={{ fontWeight: 800 }}>Paid in / out</div>
                {shift.moves.map((m) => <Row key={m.id} label={`${m.type === "in" ? "+" : "-"} ${m.reason}`} value={fmt(m.amount)} />)}
              </>
            )}
            {shift.notes && <><div style={DASH} /><div>{shift.notes}</div></>}
            <div style={DASH} />
            <div style={{ textAlign: "center", fontSize: 10 }}>Printed {when(new Date().toISOString())}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
