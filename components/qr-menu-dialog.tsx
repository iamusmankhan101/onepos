"use client";

/**
 * Tables → QR menu: switch the public menu (app/menu/[id]) on, choose whether
 * guests can order from it, and print a QR card for every table plus one for
 * the counter (takeaway — the guest gives a name instead of a table).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Printer, X, ExternalLink } from "lucide-react";
import { settingsStore, saveSettings } from "@/lib/settings-store";
import { getCurrentUser } from "@/lib/auth";
import { getActiveLocationFilter } from "@/lib/locations";
import type { DiningTable } from "@/lib/restaurant";

const PRINT_STYLES = `
  @media print {
    body > *:not(#qr-print-portal) { display: none !important; }
    #qr-print-portal { position: static !important; }
    .qr-overlay { position: static !important; background: none !important; padding: 0 !important; display: block !important; }
    .qr-sheet { box-shadow: none !important; max-height: none !important; overflow: visible !important; max-width: none !important; }
    .qr-no-print { display: none !important; }
    .qr-card { break-inside: avoid; }
  }
`;

type QrSettings = { enabled: boolean; ordering: boolean };

export default function QrMenuDialog({ tables, onClose }: { tables: DiningTable[]; onClose: () => void }) {
  const store = settingsStore as { qrMenu?: QrSettings };
  const [qr, setQr] = useState<QrSettings>({ enabled: store.qrMenu?.enabled === true, ordering: store.qrMenu?.ordering === true });
  const [codes, setCodes] = useState<{ label: string; url: string; img: string }[]>([]);
  const businessName = settingsStore.business.name;

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) return;
    const base = `${window.location.origin}/menu/${encodeURIComponent(user.businessOwnerId || user.id)}`;
    const l = getActiveLocationFilter();
    const link = (t?: string) => {
      const q = new URLSearchParams();
      if (l && l !== "main") q.set("l", l);
      if (t) q.set("t", t);
      return q.size ? `${base}?${q}` : base;
    };
    const targets = [...tables.map((t) => ({ label: `Table ${t.name}`, url: link(t.id) })), { label: "Counter · Takeaway", url: link() }];
    Promise.all(targets.map(async (t) => ({ ...t, img: await QRCode.toDataURL(t.url, { margin: 1, width: 360 }) })))
      .then(setCodes)
      .catch(() => setCodes([]));
  }, [tables]);

  function update(next: QrSettings) {
    setQr(next);
    store.qrMenu = next;
    saveSettings();
  }

  return createPortal(
    <div id="qr-print-portal">
      <style>{PRINT_STYLES}</style>
      <div className="qr-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,15,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div className="qr-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="QR menu"
          style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto", background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
          <div className="qr-no-print">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, fontSize: 18, fontWeight: 900, color: "#1d1d2f" }}>QR menu &amp; ordering</div>
              <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0" }}><X size={18} /></button>
            </div>
            <Toggle checked={qr.enabled} onChange={(v) => update({ enabled: v, ordering: v && qr.ordering })}
              label="Show my menu when a guest scans a table's QR code" />
            <Toggle checked={qr.ordering} disabled={!qr.enabled} onChange={(v) => update({ ...qr, ordering: v })}
              label="Guests can order from it — orders show on the table as “QR order” and you send them to the kitchen" />
            <div style={{ display: "flex", gap: 8, margin: "14px 0 16px", flexWrap: "wrap" }}>
              <button type="button" disabled={!qr.enabled || codes.length === 0} onClick={() => window.print()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff", fontSize: 13, fontWeight: 750, cursor: "pointer", opacity: qr.enabled ? 1 : 0.5, fontFamily: "inherit" }}>
                <Printer size={14} /> Print QR codes
              </button>
              {codes.at(-1) && qr.enabled && (
                <a href={codes.at(-1)!.url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px", borderRadius: 10, border: "1.5px solid #e6e6f0", color: "#4a4a6a", fontSize: 13, fontWeight: 750, textDecoration: "none" }}>
                  <ExternalLink size={14} /> Preview menu
                </a>
              )}
            </div>
            {!qr.enabled && <div style={{ fontSize: 12.5, color: "#9999b0", marginBottom: 12 }}>Switch the menu on first — until then the codes open a “menu not available” page.</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {codes.map((c) => (
              <div key={c.url} className="qr-card" style={{ border: "1.5px solid #ececf4", borderRadius: 14, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6b6b8a" }}>{businessName}</div>
                <img src={c.img} alt={`QR code for ${c.label}`} style={{ width: "100%", maxWidth: 180, aspectRatio: "1", margin: "8px auto" }} />
                <div style={{ fontSize: 16, fontWeight: 900, color: "#1d1d2f" }}>{c.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#EA580C", marginTop: 2 }}>{qr.ordering ? "Scan to see the menu & order" : "Scan to see the menu"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", fontSize: 13, fontWeight: 650, color: disabled ? "#b0b0c8" : "#1d1d2f", cursor: disabled ? "default" : "pointer" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, accentColor: "#EA580C", width: 16, height: 16 }} />
      {label}
    </label>
  );
}
