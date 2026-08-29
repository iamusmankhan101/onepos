"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, CheckCircle, Pencil } from "lucide-react";
import type { Invoice } from "@/lib/invoices";
import { settingsStore } from "@/lib/settings-store";
import Wordmark from "@/components/wordmark";
import { fmtCurrency as fmt } from "@/lib/format";
import { code39 } from "@/lib/barcode";

/** The dashed separators a till receipt is divided by. */
const DASH: React.CSSProperties = { borderBottom: "1px dashed #000", margin: "10px 0" };

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PK", {
    year: "numeric", month: "short", day: "numeric",
  });
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", jazzcash: "JazzCash", easypaisa: "EasyPaisa",
  raast: "Raast", card: "Card", bank: "Bank Transfer", "": "—",
};

const PRINT_STYLES = `
  @media print {
    body > *:not(#business-invoice-portal) { display: none !important; }
    #business-invoice-portal {
      display: block !important; position: fixed !important;
      inset: 0 !important; background: #fff !important;
      z-index: 99999 !important; overflow: visible !important;
    }
    .sip-overlay  { background: transparent !important; padding: 0 !important; overflow: visible !important; }
    .sip-no-print { display: none !important; }
    .sip-sheet    { border-radius: 0 !important; box-shadow: none !important; width: 72mm !important; margin: 0 !important; }
    /* A till roll: 80mm wide, cut where the receipt ends. */
    @page { size: 80mm auto; margin: 4mm; }
  }
`;

interface Props {
  invoice: Invoice;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  onClose: () => void;
  onMarkPaid?: () => void;
  onEdit?: () => void;
}

export default function InvoicePrint({
  invoice, businessName, businessPhone, businessEmail, businessAddress,
  onClose, onMarkPaid, onEdit,
}: Props) {
  const [mounted, setMounted]           = useState(false);
  const [thermalStatus, setThermalStatus] = useState<"idle" | "printing" | "ok" | "error">("idle");
  const [thermalError, setThermalError]   = useState("");

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const isPaid   = invoice.status === "paid";
  const logo     = (settingsStore.business as { logo?: string }).logo || "";
  const initials = businessName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const printer  = settingsStore.printer as { enabled: boolean; ip: string; port: number };
  const itemCount = invoice.items.reduce((sum, item) => sum + item.qty, 0);
  const barcode   = code39(invoice.number);

  async function thermalPrint() {
    if (!printer.ip) {
      setThermalError("No printer IP set. Go to Settings → Thermal Printer.");
      setThermalStatus("error");
      return;
    }
    setThermalStatus("printing");
    setThermalError("");
    try {
      const res = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printerIp: printer.ip,
          printerPort: printer.port || 9100,
          businessName,
          businessPhone,
          businessAddress,
          currency: "PKR",
          invoice,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Print failed");
      setThermalStatus("ok");
      setTimeout(() => setThermalStatus("idle"), 3000);
    } catch (e: unknown) {
      setThermalError(e instanceof Error ? e.message : "Print failed");
      setThermalStatus("error");
    }
  }

  const content = (
    <div id="business-invoice-portal">
      <style>{PRINT_STYLES}</style>

      <div
        className="sip-overlay"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}
      >
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Toolbar */}
          <div className="sip-no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", opacity: 0.9 }}>{invoice.number} · {invoice.clientName}</span>
            <div style={{ display: "flex", gap: 8 }}>
              {invoice.status === "unpaid" && onMarkPaid && (
                <button onClick={e => { e.stopPropagation(); onMarkPaid(); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid #6ee7b7", background: "rgba(5,150,105,0.25)", fontSize: 12, fontWeight: 700, color: "#6ee7b7", cursor: "pointer" }}>
                  <CheckCircle size={13} /> Mark Paid
                </button>
              )}
              {printer.enabled && (
                <button onClick={thermalPrint} disabled={thermalStatus === "printing"}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    background: thermalStatus === "ok" ? "rgba(5,150,105,0.35)" : thermalStatus === "error" ? "rgba(220,38,38,0.35)" : "rgba(234,88,12,0.35)",
                    color: "#fff", opacity: thermalStatus === "printing" ? 0.6 : 1,
                  }}>
                  <Printer size={14} />
                  {thermalStatus === "printing" ? "Printing…" : thermalStatus === "ok" ? "Sent!" : thermalStatus === "error" ? "Failed" : "Thermal Print"}
                </button>
              )}
              {thermalStatus === "error" && thermalError && (
                <span style={{ fontSize: 11, color: "#fca5a5", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={thermalError}>
                  {thermalError}
                </span>
              )}
              {onEdit && (
                <button onClick={e => { e.stopPropagation(); onEdit(); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  <Pencil size={14} /> Edit
                </button>
              )}
              <button onClick={() => window.print()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                <Printer size={14} /> Print / Save PDF
              </button>
              <button type="button" onClick={onClose} aria-label="Close invoice"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", cursor: "pointer" }}>
                <X size={16} color="#fff" />
              </button>
            </div>
          </div>

          {/* Receipt — sized to an 80mm till roll */}
          <div className="sip-sheet" style={{ background: "#fff", width: 302, margin: "0 auto", padding: "18px 14px 20px", boxShadow: "0 24px 80px rgba(0,0,0,0.3)", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#000" }}>

            {/* ── SHOP ── */}
            <div style={{ textAlign: "center" }}>
              {logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logo} alt={businessName} style={{ maxHeight: 54, maxWidth: 150, objectFit: "contain", margin: "0 auto 6px" }} />
                : <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, margin: "0 auto 8px" }}>{initials}</div>}
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{businessName}</div>
              {businessAddress && <div style={{ fontSize: 10, color: "#333", marginTop: 3 }}>{businessAddress}</div>}
              {businessPhone   && <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{businessPhone}</div>}
              {businessEmail   && <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{businessEmail}</div>}
            </div>

            <div style={DASH} />
            <div style={{ fontSize: 12, fontWeight: 800, textAlign: "center", letterSpacing: "0.16em" }}>SALES RECEIPT</div>
            <div style={{ borderBottom: "1px solid #ddd", margin: "8px 0" }} />

            {/* ── SALE DETAILS ── */}
            {([
              ["Receipt No", invoice.number],
              ["Date", fmtDate(invoice.date)],
              ["Customer", invoice.clientName],
              ...(invoice.staffName ? [["Served by", invoice.staffName]] : []),
              ["Payment", isPaid ? (METHOD_LABELS[invoice.paymentMethod ?? ""] ?? "—") : "UNPAID"],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 10, marginTop: 3 }}>
                <span style={{ color: "#555" }}>{label}</span>
                <span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
              </div>
            ))}

            <div style={DASH} />

            {/* ── ITEMS ── */}
            <div style={{ display: "flex", fontSize: 9, fontWeight: 800, color: "#555", letterSpacing: "0.06em" }}>
              <span style={{ width: 30 }}>QTY</span>
              <span style={{ flex: 1 }}>ITEM</span>
              <span style={{ width: 76, textAlign: "right" }}>AMOUNT</span>
            </div>
            {invoice.items.map((item) => (
              <div key={item.id} style={{ display: "flex", fontSize: 11, marginTop: 6 }}>
                <span style={{ width: 30 }}>{item.qty}x</span>
                <span style={{ flex: 1, paddingRight: 6 }}>
                  {item.description}
                  {item.qty > 1 && <div style={{ fontSize: 9, color: "#666", marginTop: 1 }}>@ {fmt(item.unitPrice)}</div>}
                </span>
                <span style={{ width: 76, textAlign: "right" }}>{fmt(item.total)}</span>
              </div>
            ))}
            {invoice.items.length === 0 && (
              <div style={{ fontSize: 11, color: "#999", textAlign: "center", padding: "10px 0" }}>No items</div>
            )}

            <div style={DASH} />

            {/* ── TOTALS ── */}
            {([
              [`Subtotal (${itemCount} item${itemCount === 1 ? "" : "s"})`, fmt(invoice.subtotal)],
              ...(invoice.discountAmount > 0 ? [["Discount", `-${fmt(invoice.discountAmount)}`]] : []),
              ...((invoice.discount2Amount ?? 0) > 0 ? [["Discount 2", `-${fmt(invoice.discount2Amount!)}`]] : []),
              ...(invoice.taxAmount > 0 ? [["Tax", fmt(invoice.taxAmount)]] : []),
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                <span>{label}</span><span style={{ fontWeight: 700 }}>{value}</span>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1.5px solid #000", marginTop: 8, paddingTop: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 900 }}>TOTAL</span>
              <span style={{ fontSize: 15, fontWeight: 900 }}>{fmt(invoice.total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
              <span>{isPaid ? (METHOD_LABELS[invoice.paymentMethod ?? ""] ?? "Paid") : "Balance due"}</span>
              <span style={{ fontWeight: 700 }}>{fmt(invoice.total)}</span>
            </div>

            {invoice.notes && (
              <div style={{ fontSize: 10, color: "#444", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>{invoice.notes}</div>
            )}

            <div style={{ borderBottom: "1px solid #ddd", margin: "12px 0 10px" }} />
            <div style={{ fontSize: 12, fontWeight: 800, textAlign: "center", letterSpacing: "0.2em" }}>THANK YOU</div>
            <div style={{ fontSize: 10, color: "#444", textAlign: "center", marginTop: 4 }}>Please keep this receipt for exchanges.</div>

            {/* ── BARCODE ── */}
            {barcode.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "stretch", height: 38, width: "100%" }}>
                  {barcode.map((element, i) => (
                    <div key={i} style={{ flexGrow: element.units, background: element.bar ? "#000" : "transparent" }} />
                  ))}
                </div>
                <div style={{ fontSize: 9, letterSpacing: "0.18em", textAlign: "center", color: "#333", marginTop: 3 }}>{invoice.number}</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <Wordmark tone="dark" height={13} />
            </div>

          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
