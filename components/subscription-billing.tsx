"use client";

/**
 * A business's own subscription with Pointly and its invoices — the Billing
 * page and Settings → Subscription & Billing. Read-only: payments are recorded
 * by a Pointly admin (Billing tab of the admin console). Owner only; the API
 * refuses staff and managers.
 *
 * Every recorded payment is an invoice. It opens in a preview and prints (or
 * saves as PDF) on its own, without the dashboard around it.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, CreditCard, Eye, FileText, Printer, X } from "lucide-react";
import { PLANS } from "@/lib/plans";
import { cycleLabel, durationLabel } from "@/lib/billing";
import type { OwnSubscription } from "@/lib/billing-db";

type Invoice = OwnSubscription["payments"][number];

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

/** "Paid until" is exclusive — the last day actually covered is the one before. */
function lastDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function pkrAmount(n: number) {
  return `PKR ${Math.round(n).toLocaleString("en-US")}`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** The invoice as a standalone page — previewed in an iframe and printed from it. */
function invoiceHtml(invoice: Invoice, sub: Pick<OwnSubscription, "account" | "billedFrom" | "payTo">): string {
  const { account, billedFrom: from, payTo } = sub;
  const plan = PLANS[invoice.plan];
  const free = invoice.amountPkr === 0;
  const period = `${fmtDay(invoice.periodStart)} – ${fmtDay(lastDay(invoice.periodEnd))}`;
  const row = (label: string, value: string) => `<div class="kv"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoice.invoiceNo)} · ${esc(from.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e; background: #fff; }
  .page { max-width: 760px; margin: 0 auto; padding: 44px 44px 36px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { font-size: 26px; font-weight: 900; letter-spacing: -0.03em; color: #EA580C; }
  .brand-sub { font-size: 12px; color: #8b8ba3; margin-top: 4px; }
  .brand-lines { font-size: 12px; color: #55556f; margin-top: 8px; line-height: 1.6; }
  .pay { margin-top: 30px; padding: 16px 18px; border: 1px solid #ececf3; border-radius: 12px; background: #fcfcfe; width: 360px; max-width: 100%; }
  .pay .kv b { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 28px; letter-spacing: 0.08em; font-weight: 900; }
  .title .no { font-size: 13px; color: #6b6b8a; margin-top: 4px; font-weight: 700; }
  .stamp { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 900; letter-spacing: 0.1em;
           color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 36px; }
  .label { font-size: 10.5px; font-weight: 800; color: #9898b0; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
  .who b { display: block; font-size: 15px; }
  .who div { font-size: 13px; color: #55556f; margin-top: 3px; }
  .kv { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; padding: 3px 0; }
  .kv span { color: #6b6b8a; } .kv b { font-weight: 700; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 34px; }
  th { text-align: left; font-size: 10.5px; font-weight: 800; color: #9898b0; text-transform: uppercase; letter-spacing: 0.1em; padding: 10px 0; border-bottom: 2px solid #1a1a2e; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 16px 0; border-bottom: 1px solid #ececf3; font-size: 14px; vertical-align: top; }
  td small { display: block; color: #8b8ba3; font-size: 12px; margin-top: 4px; }
  .totals { margin-left: auto; width: 300px; margin-top: 16px; }
  .totals .kv { padding: 6px 0; }
  .totals .grand { border-top: 2px solid #1a1a2e; margin-top: 6px; padding-top: 10px; font-size: 16px; }
  .totals .grand span { color: #1a1a2e; font-weight: 800; } .totals .grand b { font-weight: 900; }
  .foot { margin-top: 48px; padding-top: 18px; border-top: 1px solid #ececf3; font-size: 12px; color: #8b8ba3; line-height: 1.7; }
  @media print { .page { padding: 12mm 10mm; } @page { margin: 8mm; } }
</style></head><body><div class="page">
  <div class="top">
    <div>
      <div class="brand">${esc(from.name)}</div>
      ${from.tagline ? `<div class="brand-sub">${esc(from.tagline)}</div>` : ""}
      <div class="brand-lines">${[from.address, from.phone, from.email].filter(Boolean).map((line) => `<div>${esc(line)}</div>`).join("")}</div>
    </div>
    <div class="title"><h1>INVOICE</h1><div class="no">${esc(invoice.invoiceNo)}</div><div class="stamp">${free ? "COMPLIMENTARY" : "PAID"}</div></div>
  </div>
  <div class="meta">
    <div class="who">
      <div class="label">Billed to</div>
      <b>${esc(account.businessName)}</b>
      ${account.ownerName ? `<div>${esc(account.ownerName)}</div>` : ""}
      ${account.email ? `<div>${esc(account.email)}</div>` : ""}
      ${account.phone ? `<div>${esc(account.phone)}</div>` : ""}
    </div>
    <div>
      <div class="label">Details</div>
      ${row("Invoice date", fmtDay(invoice.paidAt))}
      ${row("Service period", period)}
      ${free ? "" : row("Paid on", fmtDay(invoice.paidAt))}
      ${free ? "" : row("Payment method", invoice.method)}
      ${invoice.reference ? row("Reference", invoice.reference) : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>Period</th><th>Amount</th></tr></thead>
    <tbody><tr>
      <td><b>Pointly ${esc(plan.name)} plan</b><small>Subscription · ${esc(durationLabel(invoice))}</small></td>
      <td>${esc(period)}</td>
      <td><b>${free ? "PKR 0" : esc(pkrAmount(invoice.amountPkr))}</b></td>
    </tr></tbody>
  </table>
  <div class="totals">
    ${row("Subtotal", pkrAmount(invoice.amountPkr))}
    <div class="kv grand"><span>Total</span><b>${esc(pkrAmount(invoice.amountPkr))}</b></div>
    ${row("Amount paid", pkrAmount(invoice.amountPkr))}
    ${row("Balance due", "PKR 0")}
  </div>
  <div class="pay">
    <div class="label">How to pay</div>
    ${payTo.bankName ? row("Bank", payTo.bankName) : ""}
    ${row("Account title", payTo.bankTitle)}
    ${row("Account number", payTo.accountNumber)}
    ${row("IBAN", payTo.iban)}
  </div>
  <div class="foot">Thank you for choosing ${esc(from.name)}. For questions about this invoice${from.phone ? `, call ${esc(from.phone)}` : ""}${from.email ? ` or email ${esc(from.email)}` : ""} and quote ${esc(invoice.invoiceNo)}.</div>
</div></body></html>`;
}

export default function SubscriptionBilling() {
  const [sub, setSub] = useState<OwnSubscription | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/subscription", { cache: "no-store", credentials: "same-origin" })
      .then((res) => res.json() as Promise<{ ok: boolean; error?: string; subscription?: OwnSubscription | null }>)
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) setError(data.error || "Could not load your subscription.");
        else setSub(data.subscription ?? null);
      })
      .catch(() => { if (!cancelled) setError("Could not load your subscription."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setViewing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  /** Prints the invoice on its own. With no preview open, a hidden frame does it. */
  function printInvoice(invoice: Invoice) {
    if (!sub) return;
    if (viewing?.id === invoice.id && frameRef.current?.contentWindow) {
      frameRef.current.contentWindow.print();
      return;
    }
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    frame.srcdoc = invoiceHtml(invoice, sub);
    frame.onload = () => {
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
  }

  if (loading) return <div style={{ fontSize: 13, color: "#9898b0" }}>Loading…</div>;
  if (error || !sub) return <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, fontSize: 13, color: "#991b1b" }}>{error || "No subscription found."}</div>;

  const plan = PLANS[sub.plan];
  const tone = {
    paid:         { label: "Active",     color: "#047857", bg: "#ecfdf5", border: "#a7f3d0" },
    "due-soon":   { label: "Renew soon", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
    overdue:      { label: "Overdue",    color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
    "never-paid": { label: "Not started", color: "#6b6b8a", bg: "#f6f6fa", border: "#e6e6ef" },
  }[sub.status];
  const statusLine = sub.paidUntil === null
    ? "No payment recorded yet."
    : sub.daysLeft !== null && sub.daysLeft <= 0
      ? `Your subscription ended on ${fmtDay(lastDay(sub.paidUntil))}.`
      : `Paid up to ${fmtDay(lastDay(sub.paidUntil))} — next payment due ${fmtDay(sub.nextDueDate)}, in ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"}.`;
  const nextAmount = sub.monthlyPricePkr * sub.billingCycleMonths;
  const totalPaid = sub.payments.reduce((sum, p) => sum + p.amountPkr, 0);
  const stat = (label: string, value: ReactNode, sub2?: ReactNode) => (
    <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid #ecebf3", background: "#fcfcfe" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 850, color: "#1a1a2e", marginTop: 6 }}>{value}</div>
      {sub2 && <div style={{ fontSize: 12, color: "#8b8ba3", marginTop: 3 }}>{sub2}</div>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{`
        .sb-inv-row { display: grid; grid-template-columns: 120px 110px minmax(0, 1fr) 120px 150px; gap: 12px; align-items: center; padding: 12px 16px; }
        .sb-inv-head { font-size: 10.5px; font-weight: 800; color: #9898b0; text-transform: uppercase; letter-spacing: 0.08em; background: #fafafd; }
        .sb-inv-btn { height: 32px; padding: 0 11px; border-radius: 9px; border: 1px solid #e6e6ef; background: #fff; color: #43435f;
                      font-size: 12px; font-weight: 750; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
        .sb-inv-btn:hover { border-color: #fdba74; color: #c2410c; background: #fff7ed; }
        @media (max-width: 760px) {
          .sb-inv-row { grid-template-columns: 1fr auto; row-gap: 4px; }
          .sb-inv-head { display: none; }
          .sb-inv-period { grid-column: 1 / -1; order: 3; }
          .sb-inv-actions { grid-column: 1 / -1; order: 4; justify-content: flex-start !important; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 16, background: tone.bg, border: `1px solid ${tone.border}` }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {sub.status === "overdue" ? <AlertTriangle size={20} color={tone.color} /> : <CreditCard size={20} color={tone.color} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 850, color: "#1a1a2e" }}>{plan.name} plan</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: tone.color, background: "#fff", borderRadius: 20, padding: "2px 9px" }}>{tone.label}</span>
          </div>
          <div style={{ fontSize: 13, color: tone.color, marginTop: 3, fontWeight: 600 }}>{statusLine}</div>
          <div style={{ fontSize: 11.5, color: "#8b8ba3", marginTop: 2 }}>Subscribed since {fmtDay(sub.startDate)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {stat(
          "Your price",
          <>
            {pkrAmount(sub.monthlyPricePkr)}<span style={{ fontSize: 12, fontWeight: 600, color: "#8b8ba3" }}>/month</span>
          </>,
          sub.customPrice
            ? <span style={{ color: "#7c3aed", fontWeight: 700 }}>
                Special rate{sub.monthlyPricePkr < sub.listPricePkr && <> · <s style={{ fontWeight: 500, color: "#a5a5bb" }}>{pkrAmount(sub.listPricePkr)}</s></>}
              </span>
            : "Standard price",
        )}
        {stat(
          "Billing cycle",
          sub.billingCycleMonths === 1 ? "Monthly" : `Every ${sub.billingCycleMonths} months`,
          cycleLabel(sub.monthlyPricePkr, sub.billingCycleMonths),
        )}
        {stat(
          "Next invoice",
          pkrAmount(nextAmount),
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>Issued {fmtDay(sub.nextIssueDate)}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: sub.status === "overdue" ? "#b91c1c" : "#43435f" }}>
              <CalendarClock size={12} /> Due {fmtDay(sub.nextDueDate)}
            </span>
          </span>,
        )}
        {stat("Total paid", pkrAmount(totalPaid), `${sub.payments.length} invoice${sub.payments.length === 1 ? "" : "s"}`)}
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 750, color: "#1a1a2e", marginBottom: 10 }}>Invoices</div>
        {sub.payments.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "34px 16px", border: "1.5px dashed #ecebf3", borderRadius: 14, textAlign: "center" }}>
            <FileText size={22} color="#c8c8d8" />
            <div style={{ fontSize: 13, fontWeight: 750, color: "#6b6b8a" }}>No invoices yet</div>
            <div style={{ fontSize: 12, color: "#9898b0" }}>Your invoices appear here as soon as a payment is recorded.</div>
          </div>
        ) : (
          <div style={{ border: "1px solid #ecebf3", borderRadius: 14, overflow: "hidden" }}>
            <div className="sb-inv-row sb-inv-head">
              <span>Invoice</span><span>Date</span><span>Period</span><span>Amount</span><span />
            </div>
            {sub.payments.map((p) => (
              <div key={p.id} className="sb-inv-row" style={{ borderTop: "1px solid #f2f1f7" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1a1a2e" }}>{p.invoiceNo}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#43435f" }}>{fmtDay(p.paidAt)}</div>
                <div className="sb-inv-period" style={{ fontSize: 12.5, color: "#6b6b8a", minWidth: 0 }}>
                  {PLANS[p.plan].name} · {durationLabel(p)} · {fmtDay(p.periodStart)} – {fmtDay(lastDay(p.periodEnd))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 850, color: p.amountPkr > 0 ? "#1a1a2e" : "#047857" }}>
                  {p.amountPkr > 0 ? pkrAmount(p.amountPkr) : "Free"}
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#047857", background: "#ecfdf5", borderRadius: 20, padding: "2px 7px" }}>Paid</span>
                </div>
                <div className="sb-inv-actions" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button type="button" className="sb-inv-btn" onClick={() => setViewing(p)}><Eye size={13} /> View</button>
                  <button type="button" className="sb-inv-btn" onClick={() => printInvoice(p)} title="Print or save as PDF"><Printer size={13} /> PDF</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#9898b0", lineHeight: 1.6 }}>
        Payments are recorded by the Pointly team. To renew, change your plan or ask about a payment, get in touch with Pointly.
      </div>

      {viewing && (
        <div role="dialog" aria-label={`Invoice ${viewing.invoiceNo}`} onClick={() => setViewing(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,20,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "min(820px, 100%)", height: "min(92vh, 1000px)", background: "#fff", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid #f0eff6" }}>
              <FileText size={16} color="#EA580C" />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>Invoice {viewing.invoiceNo}</span>
              <button type="button" className="sb-inv-btn" onClick={() => printInvoice(viewing)}><Printer size={13} /> Print / Save PDF</button>
              <button type="button" className="sb-inv-btn" onClick={() => setViewing(null)} aria-label="Close"><X size={14} /></button>
            </div>
            <iframe ref={frameRef} title={`Invoice ${viewing.invoiceNo}`} srcDoc={invoiceHtml(viewing, sub)} style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
          </div>
        </div>
      )}
    </div>
  );
}
