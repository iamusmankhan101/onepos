"use client";

/**
 * Printable kitchen order tickets (KOT) and the pre-payment guest bill, on the
 * same 80mm till-roll layout as components/invoice-print.tsx. Printed through
 * the browser, so it goes to whatever printer the terminal has installed —
 * a kitchen thermal printer set as that PC's default is the usual setup.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import {
  ORDER_TYPE_LABEL, STATION_LABEL, liveLines, orderLabel, orderSubtotal,
  type KitchenTicket, type RestaurantOrder,
} from "@/lib/restaurant";
import { settingsStore } from "@/lib/settings-store";
import { fmtCurrency as fmt } from "@/lib/format";
import { modifierSummary } from "@/lib/menu";
import { billCharges, getChargeSettings } from "@/lib/charges";

const PRINT_STYLES = `
  @media print {
    body > *:not(#kot-print-portal) { display: none !important; }
    #kot-print-portal {
      display: block !important; position: fixed !important;
      inset: 0 !important; background: #fff !important;
      z-index: 99999 !important; overflow: visible !important;
    }
    .kot-overlay  { background: transparent !important; padding: 0 !important; overflow: visible !important; }
    .kot-no-print { display: none !important; }
    .kot-sheet    { border-radius: 0 !important; box-shadow: none !important; width: 72mm !important; margin: 0 !important; }
    .kot-page     { break-after: page; }
    @page { size: 80mm auto; margin: 4mm; }
  }
`;

const DASH: React.CSSProperties = { borderBottom: "1px dashed #000", margin: "8px 0" };

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
}

function TicketSlip({ ticket }: { ticket: KitchenTicket }) {
  const where = ticket.tableNames.length ? ticket.tableNames.join(" + ") : ORDER_TYPE_LABEL[ticket.orderType];
  return (
    <div className="kot-page" style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "#000", fontSize: 13 }}>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: 15 }}>{STATION_LABEL[ticket.station].toUpperCase()} ORDER</div>
      {ticket.rush && <div style={{ textAlign: "center", fontWeight: 900, fontSize: 16, marginTop: 4 }}>*** RUSH ***</div>}
      <div style={DASH} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16 }}>
        <span>{where}</span>
        <span>#{ticket.orderNumber}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 3 }}>
        <span>{ORDER_TYPE_LABEL[ticket.orderType]}{ticket.waiterName ? ` · ${ticket.waiterName}` : ""}</span>
        <span>{time(ticket.createdAt)}</span>
      </div>
      <div style={DASH} />
      {ticket.items.map((item) => (
        <div key={item.lineId} style={{ marginBottom: 6, textDecoration: item.voided ? "line-through" : "none" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{item.qty} × {item.name}{item.voided ? "  (VOID)" : ""}</div>
          {item.modifiers?.map((m, i) => <div key={i} style={{ fontSize: 13, fontWeight: 700, paddingLeft: 14 }}>+ {m}</div>)}
          {item.note && <div style={{ fontSize: 12, paddingLeft: 14 }}>» {item.note}</div>}
        </div>
      ))}
      <div style={DASH} />
    </div>
  );
}

function BillSlip({ order }: { order: RestaurantOrder }) {
  const business = settingsStore.business as { name?: string; phone?: string; address?: string };
  const lines = liveLines(order);
  const subtotal = orderSubtotal(order);
  const charges = getChargeSettings();
  const { serviceCharge, tax } = billCharges(subtotal, order.type, charges);
  return (
    <div style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "#000", fontSize: 12 }}>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: 15 }}>{business.name || "Bill"}</div>
      {business.address && <div style={{ textAlign: "center", fontSize: 11 }}>{business.address}</div>}
      {business.phone && <div style={{ textAlign: "center", fontSize: 11 }}>{business.phone}</div>}
      <div style={DASH} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
        <span>{orderLabel(order)}</span>
        <span>#{order.number}</span>
      </div>
      <div style={{ fontSize: 11, marginTop: 2 }}>
        {new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
        {order.waiterName ? ` · Served by ${order.waiterName}` : ""}
        {order.guests ? ` · ${order.guests} guests` : ""}
      </div>
      <div style={DASH} />
      {lines.map((l) => (
        <div key={l.id} style={{ marginBottom: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{l.qty} × {l.name}</span>
            <span style={{ whiteSpace: "nowrap" }}>{fmt(l.qty * l.unitPrice)}</span>
          </div>
          {l.modifiers && l.modifiers.length > 0 && <div style={{ fontSize: 11, paddingLeft: 14 }}>{modifierSummary(l.modifiers, ", ")}</div>}
        </div>
      ))}
      <div style={DASH} />
      {(serviceCharge > 0 || tax > 0) && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          {serviceCharge > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Service charge ({charges.serviceChargeRate}%)</span><span>{fmt(serviceCharge)}</span></div>}
          {tax > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{charges.taxLabel} ({charges.taxRate}%)</span><span>{fmt(tax)}</span></div>}
        </>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 15 }}>
        <span>TOTAL</span>
        <span>{fmt(subtotal + serviceCharge + tax)}</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, marginTop: 10 }}>This is not a receipt — please pay at the counter.</div>
    </div>
  );
}

export default function KotPrint({ tickets, bill, onClose }: {
  tickets?: KitchenTicket[];
  bill?: RestaurantOrder;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setMounted(true), 0); return () => window.clearTimeout(t); }, []);
  if (!mounted) return null;

  return createPortal(
    <div id="kot-print-portal">
      <style>{PRINT_STYLES}</style>
      <div className="kot-overlay" onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,15,30,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div className="kot-no-print" style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => window.print()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              <Printer size={15} /> Print
            </button>
            <button type="button" onClick={onClose}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", color: "#6b6b8a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <X size={15} /> Close
            </button>
          </div>
          <div className="kot-sheet" style={{ width: 300, background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
            {bill && <BillSlip order={bill} />}
            {tickets?.map((t) => <TicketSlip key={t.id} ticket={t} />)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
