"use client";

/**
 * The public menu a table's QR code opens (no sign-in). With ordering on, the
 * guest builds a basket and sends it; it arrives on the Tables screen as unsent
 * lines that staff send to the kitchen. Data and prices: app/api/menu/[id].
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Minus, Plus, ShoppingBag, X, CheckCircle2 } from "lucide-react";
import CustomizeSheet from "@/components/customize-sheet";
import { defaultSelection, lineDescription, modifiersTotal, type ChosenModifier, type ModifierGroup } from "@/lib/menu";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  section: string;
  unavailable: boolean;
  groups: ModifierGroup[];
}

interface Menu {
  business: { name: string; logo: string; currency: string };
  table: { id: string; name: string } | null;
  ordering: boolean;
  items: MenuItem[];
}

interface BasketLine { key: string; item: MenuItem; modifiers: ChosenModifier[]; qty: number; note: string }

const ORANGE = "#EA580C";
const inp: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4",
  fontSize: 14, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box", fontFamily: "inherit",
};

export default function QrMenuPage() {
  const { id } = useParams<{ id: string }>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("");
  const [customize, setCustomize] = useState<MenuItem | null>(null);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [showBasket, setShowBasket] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState<{ number: string; table: string | null } | null>(null);

  useEffect(() => {
    fetch(`/api/menu/${encodeURIComponent(id)}?${new URLSearchParams(where())}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "This menu isn't available.");
        setMenu(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This menu isn't available."));
  }, [id]);

  const money = (n: number) => `${menu?.business.currency ?? "PKR"} ${Math.round(n).toLocaleString("en-PK")}`;
  const sections = useMemo(() => Array.from(new Set((menu?.items ?? []).map((i) => i.section))), [menu]);
  const shown = (menu?.items ?? []).filter((i) => !section || i.section === section);
  const count = basket.reduce((s, l) => s + l.qty, 0);
  const total = basket.reduce((s, l) => s + l.qty * (l.item.price + modifiersTotal(l.modifiers)), 0);

  function add(item: MenuItem, modifiers: ChosenModifier[] = [], qty = 1, note = "") {
    const key = `${item.id}|${modifiers.map((m) => m.optionId).sort().join(",")}|${note}`;
    setBasket((b) => b.some((l) => l.key === key)
      ? b.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
      : [...b, { key, item, modifiers, qty, note }]);
  }
  function changeQty(key: string, delta: number) {
    setBasket((b) => b.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }

  async function send() {
    if (!menu) return;
    setSending(true); setSendError("");
    try {
      const res = await fetch(`/api/menu/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...where(), name, phone, notes,
          lines: basket.map((l) => ({ itemId: l.item.id, qty: l.qty, optionIds: l.modifiers.map((m) => m.optionId), note: l.note })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send your order.");
      setSent({ number: data.number, table: data.table });
      setBasket([]); setNotes(""); setShowBasket(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send your order.");
    } finally {
      setSending(false);
    }
  }

  if (error) return <Centered>{error}</Centered>;
  if (!menu) return <Centered>Loading menu…</Centered>;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7fb", paddingBottom: 96 }}>
      <header style={{ background: "#fff", padding: "18px 16px 12px", borderBottom: "1px solid #ececf4", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 720, margin: "0 auto" }}>
          {menu.business.logo && <img src={menu.business.logo} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#1d1d2f" }}>{menu.business.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9999b0" }}>{menu.table ? `Table ${menu.table.name}` : "Menu"}</div>
          </div>
        </div>
        {sections.length > 1 && (
          <nav style={{ display: "flex", gap: 6, overflowX: "auto", maxWidth: 720, margin: "12px auto 0", paddingBottom: 2 }}>
            {["", ...sections].map((s) => (
              <button key={s || "all"} type="button" onClick={() => setSection(s)}
                style={{ flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 99, border: `1.5px solid ${section === s ? ORANGE : "#e6e6f0"}`, background: section === s ? "#fff7ed" : "#fff", color: section === s ? ORANGE : "#5a5a78", fontSize: 12, fontWeight: 750, fontFamily: "inherit", cursor: "pointer" }}>
                {s || "All"}
              </button>
            ))}
          </nav>
        )}
      </header>

      {sent && (
        <div role="status" style={{ maxWidth: 720, margin: "12px auto 0", padding: "0 16px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 14, padding: 14 }}>
            <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, color: "#065f46" }}>
              <b>Order #{sent.number} sent.</b> {sent.table ? "A waiter will confirm it shortly." : "We'll call your name when it's ready."} Pay at the counter or ask for the bill.
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => setSent(null)} style={{ border: "none", background: "none", color: "#059669", cursor: "pointer" }}><X size={16} /></button>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.length === 0 && <div style={{ fontSize: 14, color: "#9999b0", textAlign: "center", padding: 40 }}>Nothing on the menu yet.</div>}
        {shown.map((item) => {
          const fromPrice = item.groups.find((g) => g.id === "size")?.options.reduce((m, o) => Math.min(m, o.price), Infinity);
          return (
            <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center", background: "#fff", borderRadius: 14, padding: 10, border: "1px solid #ececf4", opacity: item.unavailable ? 0.5 : 1 }}>
              {item.image && <img src={item.image} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{item.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ORANGE, marginTop: 2 }}>
                  {item.unavailable ? "Sold out" : fromPrice !== undefined && Number.isFinite(fromPrice) ? `from ${money(fromPrice)}` : money(item.price)}
                </div>
              </div>
              {menu.ordering && !item.unavailable && (
                <button type="button" aria-label={`Add ${item.name}`}
                  onClick={() => (item.groups.length ? setCustomize(item) : add(item))}
                  style={{ width: 38, height: 38, borderRadius: 11, border: "none", background: ORANGE, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Plus size={18} />
                </button>
              )}
            </div>
          );
        })}
        {!menu.ordering && <div style={{ fontSize: 12, color: "#9999b0", textAlign: "center", marginTop: 8 }}>Ready to order? Call a waiter.</div>}
      </main>

      {count > 0 && (
        <button type="button" onClick={() => setShowBasket(true)}
          style={{ position: "fixed", left: 16, right: 16, bottom: 16, maxWidth: 688, margin: "0 auto", height: 52, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", cursor: "pointer", boxShadow: "0 10px 30px rgba(234,88,12,.35)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><ShoppingBag size={18} /> View order · {count}</span>
          <span>{money(total)}</span>
        </button>
      )}

      {customize && (
        <CustomizeSheet
          name={customize.name}
          basePrice={customize.price}
          groups={customize.groups}
          initial={defaultSelection(customize.groups)}
          noteLabel="Anything we should know? (optional)"
          money={money}
          onConfirm={(mods, qty, note) => { add(customize, mods, qty, note); setCustomize(null); }}
          onClose={() => setCustomize(null)}
        />
      )}

      {showBasket && (
        <div onClick={() => setShowBasket(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,15,30,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Your order"
            style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", background: "#fff", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #f2f2f8" }}>
              <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "#1d1d2f" }}>Your order{menu.table ? ` · Table ${menu.table.name}` : ""}</div>
              <button type="button" aria-label="Close" onClick={() => setShowBasket(false)} style={{ border: "none", background: "none", color: "#9999b0", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px" }}>
              {basket.map((l) => (
                <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f6f6fb" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 750, color: "#1d1d2f" }}>{lineDescription(l.item.name, l.modifiers)}</div>
                    {l.note && <div style={{ fontSize: 11.5, color: "#b45309" }}>{l.note}</div>}
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b6b8a", marginTop: 2 }}>{money(l.qty * (l.item.price + modifiersTotal(l.modifiers)))}</div>
                  </div>
                  <button type="button" aria-label="One less" onClick={() => changeQty(l.key, -1)} style={qtyBtn}><Minus size={14} /></button>
                  <span style={{ minWidth: 18, textAlign: "center", fontWeight: 800 }}>{l.qty}</span>
                  <button type="button" aria-label="One more" onClick={() => changeQty(l.key, 1)} style={qtyBtn}><Plus size={14} /></button>
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {!menu.table && <input style={inp} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />}
                {!menu.table && <input style={inp} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" autoComplete="tel" />}
                <input style={inp} placeholder="Note for the kitchen (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
              </div>
            </div>
            <div style={{ padding: "12px 18px 18px", borderTop: "1px solid #f2f2f8" }}>
              {sendError && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>{sendError}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 900, color: "#1d1d2f", marginBottom: 4 }}>
                <span>Total</span><span>{money(total)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9999b0", marginBottom: 10 }}>Tax and service charge, if any, are added to your bill.</div>
              <button type="button" disabled={sending || basket.length === 0 || (!menu.table && !name.trim())} onClick={send}
                style={{ width: "100%", height: 50, borderRadius: 13, border: "none", background: ORANGE, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", opacity: sending || (!menu.table && !name.trim()) ? 0.6 : 1 }}>
                {sending ? "Sending…" : "Send order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The branch (l) and table (t) printed into the QR code. */
function where() {
  const p = new URLSearchParams(window.location.search);
  return { l: p.get("l") ?? "", t: p.get("t") ?? "" };
}

const qtyBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 9, border: "1.5px solid #e6e6f0", background: "#fff", color: "#4a4a6a",
  display: "grid", placeItems: "center", cursor: "pointer",
};

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontSize: 15, fontWeight: 700, color: "#6b6b8a", background: "#f7f7fb" }}>{children}</div>;
}
