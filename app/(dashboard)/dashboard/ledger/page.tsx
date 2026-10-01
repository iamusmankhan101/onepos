"use client";

/**
 * Khata: what customers owe on credit (udhaar) and what the business owes its
 * suppliers — balances, statements, payments, returns (lib/ledger.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Search, HandCoins, FileText, MessageCircle, Truck, Undo2, Users, AlertTriangle, Printer, Trash2, Plus, X,
} from "lucide-react";
import MobilePageHeader from "@/components/mobile-page-header";
import PageTitle from "@/components/page-title";
import {
  CustomerEntryModal, CustomerPaymentModal, PurchaseReturnModal, SupplierEntryModal, SupplierPaymentModal,
} from "@/components/ledger-modals";
import {
  LEDGER_CHANGED_EVENT, customerBalances, customerStatement, deleteCustomerEntry, deleteSupplierEntry,
  getCustomerLedger, getSupplierLedger, supplierBalance, supplierStatement,
  type CustomerLedgerEntry, type SupplierLedgerEntry,
} from "@/lib/ledger";
import { getInvoices, localDateKey, type Invoice } from "@/lib/invoices";
import { STOCK_CHANGED_EVENT, getMovements, getPurchaseOrders, getSuppliers, undoMovement, type PurchaseOrder, type Supplier } from "@/lib/stock";
import { deleteExpense } from "@/lib/expenses";
import { getStoredClients, getStoredInventory, saveClients, subscribeToStoredData } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { openWhatsAppChat } from "@/lib/whatsapp-link";
import { settingsStore } from "@/lib/settings-store";
import { useBusinessType } from "@/lib/use-business-type";
import type { Client, InventoryItem } from "@/lib/types";

type Tab = "customers" | "suppliers";

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, padding: "0 12px",
  borderRadius: 10, border: "1.5px solid #e6e6f0", background: "#fff", color: "#4a4a6a", fontSize: 12,
  fontWeight: 750, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const primary: React.CSSProperties = { ...btn, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #ececf4", boxShadow: "0 2px 12px rgba(0,0,0,0.03)" };

function useLedgerData() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [customerEntries, setCustomerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [supplierEntries, setSupplierEntries] = useState<SupplierLedgerEntry[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const refresh = useCallback(() => {
    setInvoices(getInvoices());
    setClients(getStoredClients());
    setCustomerEntries(getCustomerLedger());
    setSuppliers(getSuppliers());
    setOrders(getPurchaseOrders());
    setSupplierEntries(getSupplierLedger());
    setItems(getStoredInventory());
  }, []);
  useEffect(() => {
    const t = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToStoredData(refresh);
    window.addEventListener(LEDGER_CHANGED_EVENT, refresh);
    window.addEventListener(STOCK_CHANGED_EVENT, refresh);
    return () => {
      window.clearTimeout(t); unsubscribe();
      window.removeEventListener(LEDGER_CHANGED_EVENT, refresh);
      window.removeEventListener(STOCK_CHANGED_EVENT, refresh);
    };
  }, [refresh]);
  return { invoices, clients, customerEntries, suppliers, orders, supplierEntries, items, refresh };
}

/** A statement in a new window, laid out for A4, printed straight away. */
function printStatement(title: string, subtitle: string, rows: { date: string; label: string; detail?: string; debit: number; credit: number; balance: number }[], money: (n: number) => string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const business = (settingsStore.business as { name?: string; phone?: string; address?: string });
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body { font: 12px/1.5 system-ui, sans-serif; color: #111; margin: 24px; }
      h1 { font-size: 18px; margin: 0; } h2 { font-size: 14px; margin: 16px 0 2px; }
      .muted { color: #666; } table { width: 100%; border-collapse: collapse; margin-top: 14px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
      th { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #666; }
      td.n, th.n { text-align: right; white-space: nowrap; }
      tfoot td { font-weight: 800; border-top: 2px solid #111; }
    </style></head><body>
    <h1>${esc(business.name || "")}</h1>
    <div class="muted">${esc([business.address, business.phone].filter(Boolean).join(" · "))}</div>
    <h2>${esc(title)}</h2><div class="muted">${esc(subtitle)}</div>
    <table><thead><tr><th>Date</th><th>Details</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.label)}${r.detail ? `<div class="muted">${esc(r.detail)}</div>` : ""}</td>
      <td class="n">${r.debit ? esc(money(r.debit)) : ""}</td><td class="n">${r.credit ? esc(money(r.credit)) : ""}</td><td class="n">${esc(money(r.balance))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="4">Balance</td><td class="n">${esc(money(rows.length ? rows[rows.length - 1].balance : 0))}</td></tr></tfoot></table>
    <div class="muted" style="margin-top:18px">Printed ${esc(new Date().toLocaleString("en-PK"))}</div>
    <script>window.onload = () => { window.print(); };</script></body></html>`);
  w.document.close();
}

export default function LedgerPage() {
  const { invoices, clients, customerEntries, suppliers, orders, supplierEntries, items, refresh } = useLedgerData();
  const businessType = useBusinessType();
  const [tab, setTab] = useState<Tab>("customers");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [by, setBy] = useState<string | undefined>();
  const [canDelete, setCanDelete] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const user = getCurrentUser();
      setBy(user?.ownerName || undefined);
      // Payments are money in the drawer: only an owner or manager takes one back out of the books.
      setCanDelete(!!user && user.role !== "staff");
      if (new URLSearchParams(window.location.search).get("tab") === "suppliers") setTab("suppliers");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const currency = (settingsStore.business as { currency?: string }).currency || "PKR";
  const money = (n: number) => `${n < 0 ? "−" : ""}${currency} ${Math.abs(Math.round(n)).toLocaleString("en-PK")}`;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Which pop-up is open.
  const [receiveFrom, setReceiveFrom] = useState<Client | null>(null);
  const [balanceFor, setBalanceFor] = useState<Client | null>(null);
  const [statementFor, setStatementFor] = useState<Client | null>(null);
  const [payTo, setPayTo] = useState<Supplier | null>(null);
  const [supplierBalanceFor, setSupplierBalanceFor] = useState<Supplier | null>(null);
  const [supplierStatementFor, setSupplierStatementFor] = useState<Supplier | null>(null);
  const [returning, setReturning] = useState<{ supplier?: Supplier } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; body?: string; confirmLabel: string; onConfirm: () => Promise<void> } | null>(null);

  function closeAll(message?: string) {
    setReceiveFrom(null); setBalanceFor(null); setPayTo(null); setSupplierBalanceFor(null); setReturning(null);
    refresh();
    if (typeof message === "string") setNotice(message);
  }

  const businessName = (settingsStore.business as { name?: string }).name || "us";
  const today = localDateKey();
  const monthStart = today.slice(0, 8) + "01";

  // ── Customers ────────────────────────────────────────────────────────────
  const balances = useMemo(() => customerBalances(invoices, customerEntries), [invoices, customerEntries]);
  const lastActivity = useMemo(() => {
    const map = new Map<string, string>();
    const bump = (id: string | undefined, d: string) => { if (id && d > (map.get(id) ?? "")) map.set(id, d); };
    for (const inv of invoices) if (inv.onCredit || inv.status === "unpaid") bump(inv.clientId, inv.date);
    for (const e of customerEntries) bump(e.clientId, e.date);
    return map;
  }, [invoices, customerEntries]);
  const customerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .map((c) => ({ client: c, balance: balances.get(c.id) ?? 0, last: lastActivity.get(c.id) }))
      .filter((r) => showAll || r.balance !== 0)
      .filter((r) => !q || r.client.name.toLowerCase().includes(q) || r.client.phone.includes(q))
      .sort((a, b) => b.balance - a.balance || a.client.name.localeCompare(b.client.name));
  }, [clients, balances, lastActivity, search, showAll]);
  const receivable = [...balances.values()].filter((b) => b > 0).reduce((s, b) => s + b, 0);
  const owingCount = [...balances.values()].filter((b) => b > 0).length;
  const collectedThisMonth = customerEntries.filter((e) => e.kind === "payment" && e.date >= monthStart).reduce((s, e) => s + e.amount, 0);
  const overLimit = clients.filter((c) => (c.creditLimit ?? 0) > 0 && (balances.get(c.id) ?? 0) > (c.creditLimit ?? 0)).length;

  function remind(client: Client, balance: number) {
    if (!client.phone) return;
    const message = [
      `Dear ${client.name},`,
      `This is a friendly reminder from ${businessName}: your outstanding balance is ${money(balance)} as of ${new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}.`,
      "Please clear it at your earliest convenience. Thank you!",
    ].join("\n");
    openWhatsAppChat(client.phone, message);
  }

  async function saveCreditLimit(client: Client, limit: number) {
    const next = getStoredClients().map((c) => c.id === client.id ? { ...c, creditLimit: limit > 0 ? Math.round(limit) : undefined } : c);
    await saveClients(next);
    refresh();
    setStatementFor((s) => s && s.id === client.id ? { ...s, creditLimit: limit > 0 ? Math.round(limit) : undefined } : s);
    setNotice(limit > 0 ? `Credit limit set to ${money(limit)}` : "Credit limit removed");
  }

  function removeCustomerEntry(entry: CustomerLedgerEntry) {
    setConfirmAction({
      title: entry.kind === "payment" ? `Delete this ${money(entry.amount)} payment?` : "Delete this entry?",
      body: entry.kind === "payment"
        ? `The invoices it paid (${entry.applied?.map((a) => a.invoiceNumber).join(", ") || "none"}) will be owed again. Any cash it put in a drawer stays in that shift's count.`
        : undefined,
      confirmLabel: "Delete",
      onConfirm: async () => { await deleteCustomerEntry(entry); refresh(); setNotice("Entry deleted"); },
    });
  }

  // ── Suppliers ────────────────────────────────────────────────────────────
  const supplierRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers
      .map((s) => ({ supplier: s, balance: supplierBalance(s, orders, supplierEntries) }))
      .filter((r) => showAll || r.balance !== 0)
      .filter((r) => !q || r.supplier.name.toLowerCase().includes(q) || (r.supplier.phone ?? "").includes(q))
      .sort((a, b) => b.balance - a.balance || a.supplier.name.localeCompare(b.supplier.name));
  }, [suppliers, orders, supplierEntries, search, showAll]);
  const supplierBalances = suppliers.map((s) => supplierBalance(s, orders, supplierEntries));
  const payable = supplierBalances.filter((b) => b > 0).reduce((s, b) => s + b, 0);
  const owedCount = supplierBalances.filter((b) => b > 0).length;
  const paidThisMonth = supplierEntries.filter((e) => e.kind === "payment" && e.date >= monthStart).reduce((s, e) => s + e.amount, 0);
  const returnsThisMonth = supplierEntries.filter((e) => e.kind === "return" && e.date >= monthStart).reduce((s, e) => s + e.amount, 0);

  function removeSupplierEntry(entry: SupplierLedgerEntry) {
    const effects = [
      entry.expenseId ? "delete its expense on Cash Flow" : "",
      entry.movementId ? "put the returned goods back in stock" : "",
    ].filter(Boolean);
    setConfirmAction({
      title: entry.kind === "payment" ? `Delete this ${money(entry.amount)} payment?` : entry.kind === "return" ? "Delete this return?" : "Delete this entry?",
      body: effects.length ? `This will also ${effects.join(" and ")}.` : undefined,
      confirmLabel: "Delete",
      onConfirm: async () => {
        if (entry.expenseId) await deleteExpense(entry.expenseId);
        if (entry.movementId) {
          const movement = getMovements().find((m) => m.id === entry.movementId);
          if (movement) await undoMovement(movement);
        }
        await deleteSupplierEntry(entry);
        refresh();
        setNotice("Entry deleted");
      },
    });
  }

  const cards = tab === "customers"
    ? [
        { label: "Customers owe", value: money(receivable), icon: HandCoins, color: receivable ? "#c2410c" : "#9898b0" },
        { label: "On udhaar", value: String(owingCount), icon: Users, color: "#1d4ed8" },
        { label: "Collected this month", value: money(collectedThisMonth), icon: BookOpen, color: "#047857" },
        { label: "Over credit limit", value: String(overLimit), icon: AlertTriangle, color: overLimit ? "#dc2626" : "#9898b0" },
      ]
    : [
        { label: "You owe suppliers", value: money(payable), icon: Truck, color: payable ? "#c2410c" : "#9898b0" },
        { label: "Suppliers owed", value: String(owedCount), icon: Users, color: "#1d4ed8" },
        { label: "Paid this month", value: money(paidThisMonth), icon: HandCoins, color: "#047857" },
        { label: "Returned this month", value: money(returnsThisMonth), icon: Undo2, color: returnsThisMonth ? "#b45309" : "#9898b0" },
      ];

  const actions = tab === "suppliers" ? (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={btn} onClick={() => setReturning({})} disabled={suppliers.length === 0}><Undo2 size={14} /> Return goods</button>
    </div>
  ) : null;

  const statementRows = statementFor ? customerStatement(statementFor.id, invoices, customerEntries) : [];
  const statementBalance = statementFor ? balances.get(statementFor.id) ?? 0 : 0;
  const sStatementRows = supplierStatementFor ? supplierStatement(supplierStatementFor, orders, supplierEntries) : [];
  const sStatementBalance = supplierStatementFor ? supplierBalance(supplierStatementFor, orders, supplierEntries) : 0;

  return (
    <div className="dashboard-polish" style={{ minHeight: "100vh" }}>
      <MobilePageHeader title="Khata" subtitle={tab === "customers" ? `${owingCount} owe ${money(receivable)}` : `You owe ${money(payable)}`} />

      <div className="dash-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="desktop-only">
          <PageTitle icon={<BookOpen size={24} />} title="Khata"
            subtitle={`Udhaar ${businessType.clientsLabel.toLowerCase()} owe you, and what you owe your suppliers.`} right={actions} />
        </div>
        {actions && <div className="mobile-only" style={{ padding: "0 2px" }}>{actions}</div>}

        <div style={{ display: "flex", gap: 6 }}>
          {([["customers", businessType.clientsLabel], ["suppliers", "Suppliers"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => { setTab(t); setSearch(""); }} aria-pressed={tab === t}
              style={{ ...btn, height: 34, borderColor: tab === t ? "#EA580C" : "#e6e6f0", background: tab === t ? "#fff7ed" : "#fff", color: tab === t ? "#EA580C" : "#5a5a78" }}>
              {label}
            </button>
          ))}
        </div>

        <div className="ledger-cards">
          {cards.map((c) => (
            <div key={c.label} style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: c.color + "14", display: "grid", placeItems: "center", flexShrink: 0 }}><c.icon size={18} color={c.color} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#1d1d2f" }}>{c.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#b0b0c8" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "customers" ? "Search by name or phone…" : "Search suppliers…"}
                aria-label="Search"
                style={{ width: "100%", height: 36, padding: "0 10px 0 32px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            {([[false, "With a balance"], [true, "Everyone"]] as const).map(([all, label]) => (
              <button key={label} type="button" onClick={() => setShowAll(all)} aria-pressed={showAll === all}
                style={{ ...btn, height: 34, borderColor: showAll === all ? "#1d1d2f" : "#e6e6f0", background: showAll === all ? "#1d1d2f" : "#fff", color: showAll === all ? "#fff" : "#5a5a78" }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "customers" && (
            customerRows.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <BookOpen size={28} color="#d0d0e8" />
                <div style={{ fontSize: 14, fontWeight: 800, color: "#9999b0", marginTop: 8 }}>{showAll || search ? "Nobody matches." : "Nobody owes you anything."}</div>
                <div style={{ fontSize: 12, color: "#b0b0c8", marginTop: 4, maxWidth: 420, marginInline: "auto", lineHeight: 1.6 }}>
                  Sell on credit with <b>Pay later</b> at the POS, or switch to <b>Everyone</b> to add an opening balance from your old register.
                </div>
              </div>
            ) : customerRows.map(({ client, balance, last }) => {
              const limit = client.creditLimit ?? 0;
              return (
                <div key={client.id} className="ledger-row">
                  <button type="button" onClick={() => setStatementFor(client)} style={{ minWidth: 0, flex: "1 1 200px", textAlign: "left", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{client.name}</div>
                    <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: 2 }}>
                      {client.phone || "No phone"}{last ? ` · last ${last}` : ""}{limit ? ` · limit ${money(limit)}` : ""}
                    </div>
                  </button>
                  <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 110 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: balance > 0 ? (limit && balance > limit ? "#dc2626" : "#c2410c") : balance < 0 ? "#047857" : "#9898b0" }}>{money(Math.abs(balance))}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9898b0" }}>{balance > 0 ? (limit && balance > limit ? "over limit" : "owes") : balance < 0 ? "advance" : "settled"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                    <button type="button" style={{ ...primary, height: 32 }} onClick={() => setReceiveFrom(client)}><HandCoins size={13} /> Receive</button>
                    <button type="button" style={{ ...btn, height: 32 }} onClick={() => setStatementFor(client)} title="Statement" aria-label={`Statement for ${client.name}`}><FileText size={13} /></button>
                    {client.phone && balance > 0 && (
                      <button type="button" style={{ ...btn, height: 32, color: "#047857", borderColor: "#a7f3d0" }} onClick={() => remind(client, balance)} title="Send a WhatsApp reminder" aria-label={`Remind ${client.name} on WhatsApp`}><MessageCircle size={13} /></button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {tab === "suppliers" && (
            supplierRows.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <Truck size={28} color="#d0d0e8" />
                <div style={{ fontSize: 14, fontWeight: 800, color: "#9999b0", marginTop: 8 }}>{suppliers.length === 0 ? "No suppliers yet." : showAll || search ? "Nobody matches." : "You don't owe any supplier."}</div>
                <div style={{ fontSize: 12, color: "#b0b0c8", marginTop: 4, maxWidth: 420, marginInline: "auto", lineHeight: 1.6 }}>
                  Receive a delivery <b>On credit</b> on the Inventory page and it shows up here. Add suppliers there too.
                </div>
              </div>
            ) : supplierRows.map(({ supplier, balance }) => (
              <div key={supplier.id} className="ledger-row">
                <button type="button" onClick={() => setSupplierStatementFor(supplier)} style={{ minWidth: 0, flex: "1 1 200px", textAlign: "left", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{supplier.name}</div>
                  <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: 2 }}>{[supplier.contact, supplier.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
                </button>
                <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 110 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: balance > 0 ? "#c2410c" : balance < 0 ? "#047857" : "#9898b0" }}>{money(Math.abs(balance))}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9898b0" }}>{balance > 0 ? "you owe" : balance < 0 ? "they owe you" : "settled"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                  <button type="button" style={{ ...primary, height: 32 }} onClick={() => setPayTo(supplier)}><HandCoins size={13} /> Pay</button>
                  <button type="button" style={{ ...btn, height: 32 }} onClick={() => setReturning({ supplier })} title="Return goods" aria-label={`Return goods to ${supplier.name}`}><Undo2 size={13} /></button>
                  <button type="button" style={{ ...btn, height: 32 }} onClick={() => setSupplierStatementFor(supplier)} title="Statement" aria-label={`Statement for ${supplier.name}`}><FileText size={13} /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Customer statement ── */}
      {statementFor && (
        <Statement
          title={statementFor.name}
          subtitle={[statementFor.phone, statementBalance > 0 ? `Owes ${money(statementBalance)}` : statementBalance < 0 ? `${money(-statementBalance)} advance` : "Settled"].filter(Boolean).join(" · ")}
          rows={statementRows}
          money={money}
          onClose={() => setStatementFor(null)}
          onPrint={() => printStatement(`Account statement — ${statementFor.name}`, `${statementFor.phone || ""} · as of ${today}`, statementRows, money)}
          canDeleteRow={(r) => canDelete && !!r.entry}
          onDeleteRow={(r) => r.entry && removeCustomerEntry(r.entry as CustomerLedgerEntry)}
          actions={<>
            <button type="button" style={primary} onClick={() => setReceiveFrom(statementFor)}><HandCoins size={14} /> Receive payment</button>
            <button type="button" style={btn} onClick={() => setBalanceFor(statementFor)}><Plus size={14} /> Opening / adjust</button>
            {statementFor.phone && statementBalance > 0 && (
              <button type="button" style={{ ...btn, color: "#047857", borderColor: "#a7f3d0" }} onClick={() => remind(statementFor, statementBalance)}><MessageCircle size={14} /> Remind</button>
            )}
          </>}
          footer={<CreditLimit key={statementFor.id} client={statementFor} money={money} onSave={(n) => saveCreditLimit(statementFor, n)} />}
        />
      )}

      {/* ── Supplier statement ── */}
      {supplierStatementFor && (
        <Statement
          title={supplierStatementFor.name}
          subtitle={sStatementBalance > 0 ? `You owe ${money(sStatementBalance)}` : sStatementBalance < 0 ? `They owe you ${money(-sStatementBalance)}` : "Settled"}
          rows={sStatementRows}
          money={money}
          onClose={() => setSupplierStatementFor(null)}
          onPrint={() => printStatement(`Supplier account — ${supplierStatementFor.name}`, `as of ${today}`, sStatementRows, money)}
          canDeleteRow={(r) => canDelete && !!r.entry}
          onDeleteRow={(r) => r.entry && removeSupplierEntry(r.entry as SupplierLedgerEntry)}
          actions={<>
            <button type="button" style={primary} onClick={() => setPayTo(supplierStatementFor)}><HandCoins size={14} /> Pay</button>
            <button type="button" style={btn} onClick={() => setReturning({ supplier: supplierStatementFor })}><Undo2 size={14} /> Return goods</button>
            <button type="button" style={btn} onClick={() => setSupplierBalanceFor(supplierStatementFor)}><Plus size={14} /> Opening / adjust</button>
          </>}
        />
      )}

      {receiveFrom && <CustomerPaymentModal client={receiveFrom} balance={balances.get(receiveFrom.id) ?? 0} money={money} by={by} onClose={closeAll} />}
      {balanceFor && <CustomerEntryModal client={balanceFor} money={money} by={by} onClose={closeAll} />}
      {payTo && <SupplierPaymentModal supplier={payTo} balance={supplierBalance(payTo, orders, supplierEntries)} orders={orders} entries={supplierEntries} money={money} by={by} onClose={closeAll} />}
      {supplierBalanceFor && <SupplierEntryModal supplier={supplierBalanceFor} money={money} by={by} onClose={closeAll} />}
      {returning && <PurchaseReturnModal supplier={returning.supplier} suppliers={suppliers} items={items} orders={orders} money={money} by={by} onClose={closeAll} />}

      {notice && (
        <div role="status" aria-live="polite"
          style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 450, display: "flex", alignItems: "center", gap: 8, background: "#1d1d2f", color: "#fff", borderRadius: 14, padding: "12px 18px", fontSize: 13, fontWeight: 700, boxShadow: "0 12px 32px rgba(0,0,0,0.25)", maxWidth: "calc(100vw - 32px)" }}>
          <BookOpen size={15} color="#6ee7b7" /> {notice}
        </div>
      )}

      {confirmAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="dialog" aria-label={confirmAction.title} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 18, fontWeight: 600, color: "#111" }}>{confirmAction.title}</h3>
            {confirmAction.body && <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#666", lineHeight: 1.5 }}>{confirmAction.body}</p>}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmAction(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, fontSize: 13 }}>Cancel</button>
              <button type="button" onClick={async () => { const act = confirmAction; setConfirmAction(null); await act.onConfirm(); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 500, fontSize: 13 }}>{confirmAction.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ledger-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .ledger-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 14px; border-top: 1px solid #f4f4f8; }
        .ledger-row:first-of-type { border-top: none; }
        .ledger-st-row { display: grid; grid-template-columns: 86px minmax(0, 1fr) 96px 96px 104px 30px; gap: 8px; align-items: start; padding: 9px 14px; border-top: 1px solid #f4f4f8; font-size: 12.5px; }
        .ledger-st-head { font-size: 10.5px; font-weight: 800; color: #9898b0; text-transform: uppercase; letter-spacing: .05em; border-top: none; }
        .ledger-st-row .n { text-align: right; white-space: nowrap; }
        @media (max-width: 900px) { .ledger-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) {
          .ledger-st-row { grid-template-columns: 1fr auto; }
          .ledger-st-row .st-date { grid-column: 1 / -1; font-size: 11px; color: #9898b0; }
          .ledger-st-head { display: none; }
          .ledger-st-row .st-debit:empty, .ledger-st-row .st-credit:empty { display: none; }
        }
      `}</style>
    </div>
  );
}

interface Row { id: string; date: string; label: string; detail?: string; debit: number; credit: number; balance: number; entry?: unknown }

function Statement({ title, subtitle, rows, money, actions, footer, onClose, onPrint, canDeleteRow, onDeleteRow }: {
  title: string;
  subtitle: string;
  rows: Row[];
  money: (n: number) => string;
  actions: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  onPrint: () => void;
  canDeleteRow: (r: Row) => boolean;
  onDeleteRow: (r: Row) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 90 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet" role="dialog" aria-label={`Statement — ${title}`}
        style={{ background: "#fff", borderRadius: 20, width: 860, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a2e" }}>{title}</div>
            <div style={{ fontSize: 12.5, color: "#6b6b8a", marginTop: 3 }}>{subtitle}</div>
          </div>
          <button type="button" onClick={onPrint} style={{ ...btn, height: 34 }}><Printer size={14} /> Print</button>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}><X size={18} color="#9898b0" /></button>
        </div>
        <div style={{ padding: "12px 22px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #f0f0f8" }}>{actions}</div>
        <div className="ledger-st-row ledger-st-head">
          <span>Date</span><span>Details</span><span className="n">Debit</span><span className="n">Credit</span><span className="n">Balance</span><span />
        </div>
        {rows.length === 0 && <div style={{ padding: 24, fontSize: 13, color: "#9898b0", textAlign: "center" }}>Nothing on this account yet.</div>}
        {rows.map((r) => (
          <div key={r.id} className="ledger-st-row">
            <span className="st-date" style={{ color: "#6b6b8a" }}>{r.date}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 750, color: "#1d1d2f" }}>{r.label}</span>
              {r.detail && <span style={{ display: "block", fontSize: 11.5, color: "#9898b0", marginTop: 1 }}>{r.detail}</span>}
            </span>
            <span className="n st-debit" style={{ color: "#c2410c", fontWeight: 700 }}>{r.debit ? money(r.debit) : ""}</span>
            <span className="n st-credit" style={{ color: "#047857", fontWeight: 700 }}>{r.credit ? money(r.credit) : ""}</span>
            <span className="n" style={{ fontWeight: 900, color: "#1d1d2f" }}>{money(r.balance)}</span>
            <span>
              {canDeleteRow(r) && (
                <button type="button" onClick={() => onDeleteRow(r)} aria-label={`Delete ${r.label}`} title="Delete"
                  style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={12} color="#dc2626" />
                </button>
              )}
            </span>
          </div>
        ))}
        {footer && <div style={{ padding: "14px 22px", borderTop: "1px solid #f0f0f8" }}>{footer}</div>}
      </div>
    </div>
  );
}

function CreditLimit({ client, money, onSave }: { client: Client; money: (n: number) => string; onSave: (n: number) => void }) {
  const [value, setValue] = useState(client.creditLimit ? String(client.creditLimit) : "");
  const changed = (Number(value) || 0) !== (client.creditLimit ?? 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#6b6b8a" }}>Credit limit</span>
      <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="No limit" aria-label="Credit limit"
        style={{ width: 140, height: 34, padding: "0 10px", borderRadius: 9, border: "1.5px solid #e8e8f4", fontSize: 13, outline: "none" }} />
      <button type="button" style={{ ...btn, height: 34 }} disabled={!changed} onClick={() => onSave(Number(value) || 0)}>Save</button>
      <span style={{ fontSize: 11.5, color: "#9898b0" }}>{client.creditLimit ? `The POS warns past ${money(client.creditLimit)}.` : "The POS warns when a credit sale goes past it."}</span>
    </div>
  );
}
