"use client";

// Ported from Salon Central's loyalty page. Everything here reads and writes
// through lib/storage + lib/loyalty, both of which key by the active branch
// (locationUserKey), so each branch runs its own leaderboard and history.
// The public QR claim page and Apple/Google Wallet passes are not part of this
// build — there is no unauthenticated loyalty-card route to point them at.

import { useState, useEffect, useMemo, useRef } from "react";
import { getStoredClients, saveClients, getStoredAppointments } from "@/lib/storage";
import { getInvoices } from "@/lib/invoices";
import type { Client } from "@/lib/types";
import {
  getTier, TIER_META, nextTierThreshold, pointsToRupees,
  getClientHistory, adjustPoints, redeemPoints,
  type LoyaltySettings,
} from "@/lib/loyalty";
import { settingsStore, saveSettings } from "@/lib/settings-store";
import { getActiveSection, inSection } from "@/lib/sections";
import { locationName } from "@/lib/locations";
import { fmtCurrency as fmt } from "@/lib/format";
import {
  Gift, Star, Search, Settings2, ChevronRight, TrendingUp,
  Award, Users, Plus, Minus, X, CreditCard, Printer, Share2,
} from "lucide-react";
import PageTitle from "@/components/page-title";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TierBadge({ tier }: { tier: ReturnType<typeof getTier> }) {
  const m = TIER_META[tier];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20,
      background: m.bg, color: m.color,
      fontSize: 11, fontWeight: 700,
    }}>
      {m.emoji} {m.label}
    </span>
  );
}

function StatCard({ icon, label, value, sub, color, bg }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string; bg?: string;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(226,223,235,0.8)", padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.02)", flex: 1 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: bg || (color + "18"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 850, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2, fontWeight: 500 }}>{sub}</div>}
      </div>
    </div>
  );
}

/**
 * A client's loyalty figures, floor-reconciled upward from what they have
 * actually spent. Same formula as the Clients list panel and the client detail
 * page, so the leaderboard never disagrees with either of them.
 */
function liveLoyalty(
  c: Client,
  appts: ReturnType<typeof getStoredAppointments>,
  invoices: ReturnType<typeof getInvoices>,
  ls: LoyaltySettings,
) {
  const apptSpend = appts
    .filter((a) => a.clientId === c.id && a.status === "completed")
    .reduce((s, a) => s + a.totalAmount, 0);
  const posSpend = invoices
    .filter((inv) => inv.clientId === c.id && inv.source === "pos")
    .reduce((s, inv) => s + inv.total, 0);
  const liveSpend = Math.max(c.totalSpend ?? 0, apptSpend + posSpend);
  const computed  = Math.floor(liveSpend * (ls.pointsPerRupee ?? 0.01));
  const earned    = Math.max(c.loyaltyPointsEarned ?? 0, computed);
  // Add only the newly-earned difference to the stored balance. Deriving the
  // balance as earned − redeemed would wipe a balance brought in by the
  // Clients import, which sets loyaltyPoints without loyaltyPointsEarned.
  const balance   = Math.max(0, (c.loyaltyPoints ?? 0) + earned - (c.loyaltyPointsEarned ?? 0));
  return { earned, balance };
}

// ── Digital Loyalty Card ───────────────────────────────────────────────────────

const TIER_CARD_STYLES: Record<ReturnType<typeof getTier>, { bg: string; shimmer: string; text: string; sub: string }> = {
  platinum: { bg: "linear-gradient(135deg,#0f172a 0%,#334155 55%,#94a3b8 100%)", shimmer: "rgba(255,255,255,0.16)", text: "#fff", sub: "rgba(255,255,255,0.72)" },
  gold:     { bg: "linear-gradient(135deg,#451a03 0%,#b45309 55%,#f59e0b 100%)", shimmer: "rgba(255,255,255,0.14)", text: "#fff", sub: "rgba(255,255,255,0.74)" },
  silver:   { bg: "linear-gradient(135deg,#1e293b 0%,#475569 55%,#94a3b8 100%)", shimmer: "rgba(255,255,255,0.12)", text: "#fff", sub: "rgba(255,255,255,0.72)" },
  bronze:   { bg: "linear-gradient(135deg,#431407 0%,#9a3412 55%,#c2410c 100%)", shimmer: "rgba(255,255,255,0.10)", text: "#fff", sub: "rgba(255,255,255,0.70)" },
  none:     { bg: "linear-gradient(135deg,#1c1917 0%,#9a3412 50%,#f97316 100%)", shimmer: "rgba(255,255,255,0.10)", text: "#fff", sub: "rgba(255,255,255,0.70)" },
};

function formatCardNumber(id: string): string {
  const hex = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().padEnd(16, "0").slice(0, 16);
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)} ${hex.slice(8, 12)} ${hex.slice(12, 16)}`;
}

function shortMemberId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8).padEnd(6, "0");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TIER_ICON: Record<ReturnType<typeof getTier>, typeof Award> = {
  platinum: Award, gold: Award, silver: Star, bronze: Star, none: Gift,
};

function DigitalCard({
  client, settings, businessName, businessLogo, printRef,
}: {
  client: Client;
  settings: LoyaltySettings;
  businessName: string;
  businessLogo: string;
  printRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const tier    = getTier(client.loyaltyPointsEarned ?? 0, settings);
  const balance = client.loyaltyPoints ?? 0;
  const earned  = client.loyaltyPointsEarned ?? 0;
  const next    = nextTierThreshold(earned, settings);
  const cs      = TIER_CARD_STYLES[tier];
  const meta    = TIER_META[tier];
  const memberId = shortMemberId(client.id);
  const progress = next ? Math.min(100, (earned / (earned + next.needed)) * 100) : 100;
  const TierIcon = TIER_ICON[tier];

  return (
    <div ref={printRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Card face */}
      <div style={{
        position: "relative", borderRadius: 26, overflow: "hidden",
        background: cs.bg, padding: "26px 26px 22px",
        maxWidth: 420, width: "100%", margin: "0 auto",
        boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
        fontFamily: "inherit",
        userSelect: "none",
        boxSizing: "border-box",
      }}>
        <TierIcon size={168} color={cs.text} strokeWidth={1} style={{ position: "absolute", top: -34, right: -30, opacity: 0.10, transform: "rotate(-10deg)" }} />
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 20% 15%, ${cs.shimmer} 0%, transparent 60%)`,
          pointerEvents: "none",
        }} />

        {/* Top row: business logo/name + tier badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "rgba(255,255,255,0.18)", display: "grid", placeItems: "center",
              overflow: "hidden", flexShrink: 0, border: "1.5px solid rgba(255,255,255,0.32)",
            }}>
              {businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={businessLogo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Gift size={19} color={cs.text} />
              )}
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: cs.sub, letterSpacing: "0.12em", textTransform: "uppercase" }}>Loyalty Member</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: cs.text, letterSpacing: "0.01em", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{businessName}</div>
            </div>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.18)", borderRadius: 20,
            padding: "5px 13px", fontSize: 11, fontWeight: 800, color: cs.text,
            backdropFilter: "blur(4px)", display: "flex", alignItems: "center", gap: 5,
          }}>
            {meta.emoji} {meta.label}
          </div>
        </div>

        {/* Points — hero */}
        <div style={{ marginTop: 30, position: "relative", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: cs.sub, letterSpacing: "0.14em", textTransform: "uppercase" }}>Points Balance</div>
          <div style={{ fontSize: 46, fontWeight: 900, color: cs.text, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            {balance.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: cs.sub, marginTop: 2 }}>
            ≈ {fmt(pointsToRupees(balance, settings.rupeePerPoint))} redeemable
          </div>
        </div>

        {/* Ticket-style perforation */}
        <div style={{ margin: "24px 0 18px", position: "relative", borderTop: "1.5px dashed rgba(255,255,255,0.3)" }} />

        {/* Bottom row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)",
              display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, color: cs.text,
            }}>
              {initials(client.name)}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: cs.text }}>{client.name}</div>
              <div style={{ fontSize: 9, color: cs.sub, letterSpacing: "0.1em", marginTop: 2 }}>MEMBER · {memberId}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: cs.sub, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Lifetime</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: cs.text }}>{earned.toLocaleString()} pts</div>
          </div>
        </div>
      </div>

      {/* Progress to next tier */}
      {next && (
        <div style={{ background: "#faf8f6", borderRadius: 14, padding: "14px 16px", maxWidth: 420, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>
              Progress to {TIER_META[next.tier].emoji} {TIER_META[next.tier].label}
            </div>
            <div style={{ fontSize: 11, color: "#9898b0" }}>{next.needed} pts needed</div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#eee8e2", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: "linear-gradient(90deg,#EA580C,#F97316)",
              width: `${progress}%`, transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      )}
      {!next && (
        <div style={{ background: "#FFEDD5", borderRadius: 14, padding: "12px 16px", maxWidth: 420, width: "100%", margin: "0 auto", boxSizing: "border-box", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9A3412" }}>💎 Top Tier Achieved — Platinum Member!</div>
        </div>
      )}

      {/* Tier benefits */}
      <div style={{ background: "#faf8f6", borderRadius: 14, padding: "14px 16px", maxWidth: 420, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>Your Benefits</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            `Earn 1 pt for every ${fmt(1 / settings.pointsPerRupee)} spent`,
            `Every 100 pts = ${fmt(pointsToRupees(100, settings.rupeePerPoint))} discount`,
            tier === "platinum" ? "Priority service + exclusive rewards" :
            tier === "gold"     ? "Early access to promotions" :
            tier === "silver"   ? "Monthly double-points days" : "Welcome bonus on next visit",
          ].map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#5a5a7a" }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#EA580C", flexShrink: 0 }} />
              {b}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Client Points Modal ────────────────────────────────────────────────────────

function ClientModal({
  client, settings, onClose, onUpdate,
}: {
  client: Client;
  settings: LoyaltySettings;
  onClose: () => void;
  onUpdate: (c: Client) => void;
}) {
  const tier     = getTier(client.loyaltyPointsEarned ?? 0, settings);
  const balance  = client.loyaltyPoints ?? 0;
  const earned   = client.loyaltyPointsEarned ?? 0;
  const next     = nextTierThreshold(earned, settings);
  const history  = getClientHistory(client.id);
  const cardRef  = useRef<HTMLDivElement>(null);
  const businessName = settingsStore.business.name || "Pointly";

  const [tab, setTab]         = useState<"overview" | "history" | "adjust" | "card">("overview");
  const [adjType, setAdjType] = useState<"add" | "redeem">("add");
  const [adjPts, setAdjPts]   = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [copied, setCopied]   = useState(false);

  function handlePrint() {
    const el = cardRef.current;
    if (!el) return;
    const w = window.open("", "_blank", "width=520,height=640");
    if (!w) return;
    w.document.write(`
      <html><head><title>Loyalty Card — ${client.name.replace(/</g, "&lt;")}</title>
      <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#faf8f6;font-family:sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{body{background:#fff}}</style>
      </head><body>${el.innerHTML}<script>window.onload=()=>window.print()<\/script></body></html>
    `);
    w.document.close();
  }

  function handleShare() {
    const cardNum = formatCardNumber(client.id);
    const text = `${client.name}'s ${businessName} Loyalty Card\nTier: ${TIER_META[tier].label}\nPoints: ${balance.toLocaleString()}\nCard: ${cardNum}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleAdjust() {
    const pts = parseInt(adjPts, 10);
    if (!pts || pts <= 0) return;
    const updated = adjType === "add"
      ? adjustPoints(client, pts, adjNote || "Manual adjustment")
      : redeemPoints(client, pts, adjNote || "Manual redemption");
    onUpdate(updated);
    setAdjPts("");
    setAdjNote("");
  }

  const tierMeta = TIER_META[tier];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 520,
        maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 24px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{client.name}</div>
            <div style={{ marginTop: 6 }}><TierBadge tier={tier} /></div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#9898b0" }}><X size={20} /></button>
        </div>

        {/* Points summary */}
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: tierMeta.bg, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tierMeta.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>Balance</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: tierMeta.color, marginTop: 4 }}>{balance.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: tierMeta.color + "99", marginTop: 2 }}>≈ {fmt(pointsToRupees(balance, settings.rupeePerPoint))}</div>
          </div>
          <div style={{ background: "#faf8f6", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lifetime Earned</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#1a1a2e", marginTop: 4 }}>{earned.toLocaleString()}</div>
            {next ? (
              <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>{next.needed} pts to {TIER_META[next.tier].emoji} {TIER_META[next.tier].label}</div>
            ) : (
              <div style={{ fontSize: 11, color: "#9A3412", marginTop: 2 }}>💎 Top tier achieved!</div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #f3eee9", padding: "0 24px", overflowX: "auto" }}>
          {(["overview", "history", "adjust", "card"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 14px", fontSize: 12, fontWeight: 700,
              color: tab === t ? "var(--accent)" : "#9898b0",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              textTransform: "capitalize",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {t === "card" && <CreditCard size={12} />}
              {t}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px 24px" }}>
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {next && (
                <div style={{ background: "#faf8f6", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>
                    Progress to {TIER_META[next.tier].emoji} {TIER_META[next.tier].label}
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#eee8e2", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#EA580C,#F97316)",
                      width: `${Math.min(100, ((earned / (earned + next.needed)) * 100))}%`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#9898b0", marginTop: 6 }}>{next.needed} more points needed</div>
                </div>
              )}
              <div style={{ background: "#faf8f6", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>Earning Rate</div>
                <div style={{ fontSize: 13, color: "#5a5a7a" }}>
                  Every <strong>{fmt(1 / settings.pointsPerRupee)}</strong> spent = <strong>1 point</strong>
                </div>
                <div style={{ fontSize: 13, color: "#5a5a7a", marginTop: 4 }}>
                  100 points = <strong>{fmt(pointsToRupees(100, settings.rupeePerPoint))}</strong> discount
                </div>
              </div>
              <div style={{ background: "#faf8f6", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>Redeemable Value</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)" }}>
                  {fmt(pointsToRupees(balance, settings.rupeePerPoint))}
                </div>
                <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>from {balance} points · redeem at the POS</div>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9898b0", fontSize: 13, padding: "32px 0" }}>No transactions yet</div>
              ) : history.map((tx) => (
                <div key={tx.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", background: "#faf8f6", borderRadius: 10,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{tx.note}</div>
                    <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>{fmtDate(tx.date)}</div>
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 800,
                    color: tx.points > 0 ? "#059669" : "#dc2626",
                  }}>
                    {tx.points > 0 ? "+" : ""}{tx.points} pts
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "adjust" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {(["add", "redeem"] as const).map((t) => (
                  <button key={t} onClick={() => setAdjType(t)} style={{
                    flex: 1, padding: "10px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontWeight: 700, fontSize: 13,
                    background: adjType === t ? "var(--accent)" : "#f5f1ed",
                    color: adjType === t ? "#fff" : "#5a5a7a",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    {t === "add" ? <Plus size={14} /> : <Minus size={14} />}
                    {t === "add" ? "Add Points" : "Redeem Points"}
                  </button>
                ))}
              </div>
              <input
                type="number" min={1} placeholder="Points"
                value={adjPts} onChange={(e) => setAdjPts(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px solid #ece6e0", fontSize: 14, fontWeight: 600, outline: "none" }}
              />
              <input
                type="text" placeholder="Note (optional)"
                value={adjNote} onChange={(e) => setAdjNote(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px solid #ece6e0", fontSize: 14, outline: "none" }}
              />
              {adjType === "redeem" && adjPts && (
                <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#92400e", fontWeight: 600 }}>
                  Redeeming {Math.min(parseInt(adjPts) || 0, balance)} pts = {fmt(pointsToRupees(Math.min(parseInt(adjPts) || 0, balance), settings.rupeePerPoint))} discount
                </div>
              )}
              <button onClick={handleAdjust} disabled={!adjPts} style={{
                padding: "12px", borderRadius: 12, border: "none", cursor: adjPts ? "pointer" : "not-allowed",
                background: "var(--accent-gradient)", color: "#fff",
                fontWeight: 700, fontSize: 14,
                opacity: !adjPts ? 0.5 : 1,
              }}>
                {adjType === "add" ? "Add Points" : "Redeem Points"}
              </button>
            </div>
          )}

          {tab === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handlePrint} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px", borderRadius: 10, border: "1.5px solid #ece6e0",
                  background: "#fff", fontSize: 13, fontWeight: 700, color: "#5a5a7a", cursor: "pointer",
                }}>
                  <Printer size={14} /> Print Card
                </button>
                <button onClick={handleShare} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px", borderRadius: 10, border: "none",
                  background: copied ? "#f0fdf4" : "var(--accent-gradient)",
                  fontSize: 13, fontWeight: 700,
                  color: copied ? "#059669" : "#fff", cursor: "pointer",
                }}>
                  <Share2 size={14} /> {copied ? "Copied!" : "Copy Details"}
                </button>
              </div>
              <DigitalCard
                client={client}
                settings={settings}
                businessName={businessName}
                businessLogo={settingsStore.business.logo || ""}
                printRef={cardRef}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────────────

function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: (s: LoyaltySettings) => void }) {
  const s = settingsStore.loyalty as LoyaltySettings;
  const [form, setForm] = useState<LoyaltySettings>({ ...s });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function save() {
    if (!(form.pointsPerRupee > 0) || !(form.rupeePerPoint > 0)) {
      setError("Earning rate and redemption value must both be above zero.");
      return;
    }
    if (!(form.silverMin > 0 && form.silverMin < form.goldMin && form.goldMin < form.platinumMin)) {
      setError("Tier thresholds must rise: Silver < Gold < Platinum.");
      return;
    }
    setError("");
    Object.assign(settingsStore.loyalty, form);
    saveSettings();
    onSaved({ ...form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const F = (k: keyof LoyaltySettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value) || 0;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #ece6e0", fontSize: 14, outline: "none", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)", padding: "28px 28px 24px", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>Loyalty Settings</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#9898b0" }}><X size={20} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Enable toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#faf8f6", borderRadius: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>Enable Loyalty Program</div>
              <div style={{ fontSize: 12, color: "#9898b0" }}>Points are earned and redeemed at the POS</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              aria-label="Enable loyalty program"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              style={{
                width: 44, height: 24, borderRadius: 12, cursor: "pointer", transition: "background 0.2s",
                background: form.enabled ? "var(--accent)" : "#d1d5db", position: "relative", border: "none", padding: 0, flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: form.enabled ? 22 : 2,
                width: 20, height: 20, borderRadius: 10, background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#5a5a7a", display: "block", marginBottom: 6 }}>
              Points per Rupee spent
            </label>
            <input type="number" step="0.01" min="0.01" value={form.pointsPerRupee} onChange={F("pointsPerRupee")} style={inputStyle} />
            <div style={{ fontSize: 11, color: "#9898b0", marginTop: 4 }}>
              e.g. 0.01 = 1 pt per Rs. 100 · 0.1 = 1 pt per Rs. 10
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#5a5a7a", display: "block", marginBottom: 6 }}>
              Rupees per point (redemption value)
            </label>
            <input type="number" step="0.5" min="0.5" value={form.rupeePerPoint} onChange={F("rupeePerPoint")} style={inputStyle} />
            <div style={{ fontSize: 11, color: "#9898b0", marginTop: 4 }}>
              e.g. 1 = 100 pts → Rs. 100 off
            </div>
          </div>

          <div style={{ borderTop: "1px solid #f3eee9", paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a7a", marginBottom: 10 }}>Tier Thresholds (lifetime pts)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {([
                ["silverMin", "silver"],
                ["goldMin", "gold"],
                ["platinumMin", "platinum"],
              ] as const).map(([k, tier]) => (
                <div key={k}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: TIER_META[tier].color, display: "block", marginBottom: 4 }}>
                    {TIER_META[tier].emoji} {TIER_META[tier].label}
                  </label>
                  <input type="number" min={1} value={form[k]} onChange={F(k)} style={{ ...inputStyle, padding: "8px 10px", borderRadius: 8, fontSize: 13 }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <button onClick={save} style={{
          marginTop: 20, width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: "pointer",
          background: "var(--accent-gradient)", color: "#fff", fontWeight: 700, fontSize: 15,
        }}>
          {saved ? "Saved ✓" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const [clients, setClients]         = useState<Client[]>([]);
  const [allAppts, setAllAppts]       = useState<ReturnType<typeof getStoredAppointments>>([]);
  const [allInvoices, setAllInvoices] = useState<ReturnType<typeof getInvoices>>([]);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState<Client | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tierFilter, setTierFilter]   = useState<string>("all");
  const [settings, setSettings]       = useState<LoyaltySettings>(() => ({ ...(settingsStore.loyalty as LoyaltySettings) }));
  const [branchName, setBranchName]   = useState("");
  // Locked to the active dashboard section, same rule as the Clients page.
  const [activeSection, setActiveSectionState] = useState("all");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const ls = settingsStore.loyalty as LoyaltySettings;
      const section = getActiveSection();
      const storedClients  = getStoredClients();
      const storedAppts    = getStoredAppointments();
      const storedInvoices = getInvoices();

      // Persist any upward corrections (only ever raise earned points, never
      // lower them), so the balance the POS redeems against matches this page.
      let changed = false;
      const corrected = storedClients.map((c) => {
        if (!ls.enabled) return c; // paused programmes don't accrue — same as the client page
        const { earned, balance } = liveLoyalty(c, storedAppts, storedInvoices, ls);
        if (earned === (c.loyaltyPointsEarned ?? 0)) return c;
        changed = true;
        return { ...c, loyaltyPointsEarned: earned, loyaltyPoints: balance };
      });

      // The correction save writes the full, unfiltered list — only the
      // displayed leaderboard is scoped to the active section.
      if (changed) saveClients(corrected);
      setSettings({ ...ls });
      setActiveSectionState(section);
      setBranchName(locationName());
      setClients(corrected.filter((c) => inSection(c, section)));
      setAllAppts(storedAppts);
      setAllInvoices(storedInvoices);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function handleUpdate(updated: Client) {
    const all = getStoredClients();
    saveClients(all.map((c) => c.id === updated.id ? updated : c));
    setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setSelected(updated);
  }

  const enriched = useMemo(() => {
    return clients.map((c) => {
      const { earned, balance } = liveLoyalty(c, allAppts, allInvoices, settings);
      return { client: c, tier: getTier(earned, settings), balance, earned };
    });
  }, [clients, allAppts, allInvoices, settings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((e) => {
        if (q && !e.client.name.toLowerCase().includes(q) && !(e.client.phone || "").includes(q)) return false;
        if (tierFilter !== "all" && e.tier !== tierFilter) return false;
        return true;
      })
      .sort((a, b) => b.earned - a.earned);
  }, [enriched, search, tierFilter]);

  const totalPts      = enriched.reduce((s, e) => s + e.balance, 0);
  const totalEarned   = enriched.reduce((s, e) => s + e.earned, 0);
  const activeMembers = enriched.filter((e) => e.earned > 0).length;
  const platCount     = enriched.filter((e) => e.tier === "platinum").length;

  const TIER_FILTERS = [
    { value: "all",      label: "All Members" },
    { value: "platinum", label: "💎 Platinum" },
    { value: "gold",     label: "🥇 Gold" },
    { value: "silver",   label: "🥈 Silver" },
    { value: "bronze",   label: "🥉 Bronze" },
  ];

  const subtitle = [
    branchName,
    activeSection === "all" ? "Reward your customers, grow repeat visits" : `Restricted to ${activeSection} only`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="dash-page dashboard-polish" style={{ minHeight: "100vh", background: "#ffffff", padding: "28px 32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <PageTitle icon={<Gift size={24} />} title="Loyalty Program" subtitle={subtitle} />
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setShowSettings(true)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
            borderRadius: 12, border: "1px solid #ece6e0", background: "#fff",
            fontSize: 13, fontWeight: 750, color: "#6b6b8a", cursor: "pointer", transition: "all 0.15s",
          }} className="hover-bg-light">
            <Settings2 size={16} /> Settings
          </button>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
            borderRadius: 12, border: "none",
            background: settings.enabled ? "#f0fdf4" : "#fef2f2",
            fontSize: 13, fontWeight: 800,
            color: settings.enabled ? "#059669" : "#dc2626",
          }}>
            {settings.enabled ? "● Active" : "● Paused"}
          </div>
        </div>
      </div>

      {!settings.enabled && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 13, fontWeight: 600 }}>
          Loyalty is paused — sales aren&apos;t earning points and the POS won&apos;t offer redemption. Turn it on in Settings.
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid-4">
        <StatCard icon={<Users size={22} />}      label="Active Members"       value={activeMembers.toString()} sub={`of ${clients.length} clients`} color="var(--accent)" bg="var(--accent-dim)" />
        <StatCard icon={<Star size={22} />}       label="Total Points Balance" value={totalPts.toLocaleString()} sub={`≈ ${fmt(totalPts * settings.rupeePerPoint)}`} color="#d97706" bg="#fffbeb" />
        <StatCard icon={<TrendingUp size={22} />} label="Lifetime Earned"      value={totalEarned.toLocaleString()} sub="all time" color="#059669" bg="#ecfdf5" />
        <StatCard icon={<Award size={22} />}      label="Platinum Members"     value={platCount.toString()} sub="top tier" color="#334155" bg="#f1f5f9" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
          <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9898b0" }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 12, border: "1px solid #ece6e0", fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TIER_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setTierFilter(f.value)} style={{
              padding: "9px 18px", borderRadius: 20, cursor: "pointer",
              fontSize: 13, fontWeight: 750, transition: "all 0.15s",
              background: tierFilter === f.value ? "var(--accent)" : "#fff",
              color: tierFilter === f.value ? "#fff" : "#6b6b8a",
              border: tierFilter === f.value ? "none" : "1px solid #ece6e0",
              boxShadow: tierFilter === f.value ? "0 4px 12px var(--accent-glow)" : "none",
            }} className={tierFilter !== f.value ? "hover-bg-light" : ""}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="table-scroll-wrap" style={{ background: "#fff", borderRadius: 18, border: "1px solid #ece6e0", boxShadow: "0 8px 28px rgba(0,0,0,.03)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f5f1ed", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e" }}>Client Leaderboard</div>
          <div style={{ fontSize: 13, color: "#9898b0", fontWeight: 600 }}>{filtered.length} clients</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", color: "#9898b0" }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Gift size={32} color="var(--accent)" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e", marginBottom: 8 }}>No members yet</div>
            <div style={{ fontSize: 13, color: "#9898b0", fontWeight: 500 }}>Points are awarded when a sale at the POS is billed to a saved client</div>
          </div>
        ) : (
          <div className="table-scroll-inner">
            <div style={{
              display: "grid", gridTemplateColumns: "40px minmax(160px,1fr) 120px 100px 100px 110px 20px",
              padding: "12px 24px", background: "#fcfaf8",
              fontSize: 10, fontWeight: 800, color: "#8e89a3", textTransform: "uppercase", letterSpacing: "0.08em",
              gap: 12, alignItems: "center",
            }}>
              <div>#</div><div>Client</div><div>Tier</div>
              <div style={{ textAlign: "right" }}>Balance</div>
              <div style={{ textAlign: "right" }}>Lifetime</div>
              <div style={{ textAlign: "right" }}>Value</div>
              <div />
            </div>
            {filtered.map((e, i) => (
              <div
                key={e.client.id}
                onClick={() => setSelected(e.client)}
                className="hover-bg-row"
                style={{
                  display: "grid", gridTemplateColumns: "40px minmax(160px,1fr) 120px 100px 100px 110px 20px",
                  padding: "16px 24px", gap: 12, alignItems: "center",
                  borderBottom: i < filtered.length - 1 ? "1px solid #f8f5f2" : "none", cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 850, color: i < 3 ? "var(--accent)" : "#9898b0" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 750, color: "#1a1a2e" }}>{e.client.name}</div>
                  <div style={{ fontSize: 12, color: "#9898b0", fontWeight: 500 }}>{e.client.phone}</div>
                </div>
                <div><TierBadge tier={e.tier} /></div>
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: "var(--accent)" }}>
                  {e.balance.toLocaleString()}
                </div>
                <div style={{ textAlign: "right", fontSize: 13, color: "#5a5a7a", fontWeight: 600 }}>
                  {e.earned.toLocaleString()}
                </div>
                <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#059669" }}>
                  {fmt(pointsToRupees(e.balance, settings.rupeePerPoint))}
                </div>
                <ChevronRight size={16} color="#d6cfc8" />
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ClientModal
          client={selected}
          settings={settings}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onSaved={setSettings} />}
    </div>
  );
}
