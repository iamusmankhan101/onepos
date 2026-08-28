import type { Client, Appointment, Staff } from "./types";
import { getTier, TIER_META, pointsToRupees, nextTierThreshold, type LoyaltySettings } from "./loyalty";

function fmtCur(n: number) {
  return "Rs. " + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(s?: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateLong() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }

// ── Status colors ──────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  completed:     "background:#d1fae5;color:#065f46;border:1px solid #6ee7b7",
  "no-show":     "background:#fee2e2;color:#991b1b;border:1px solid #fca5a5",
  cancelled:     "background:#f3f4f6;color:#374151;border:1px solid #d1d5db",
  booked:        "background:#ffedd5;color:#9a3412;border:1px solid #fdba74",
  confirmed:     "background:#e0f2fe;color:#0c4a6e;border:1px solid #7dd3fc",
  arrived:       "background:#fff7ed;color:#c2410c;border:1px solid #fb923c",
  "in-progress": "background:#fef9c3;color:#713f12;border:1px solid #fde047",
};
function statusPill(s: string) {
  const style = STATUS_STYLES[s] ?? "background:#f3f4f6;color:#374151;border:1px solid #d1d5db";
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;${style}">${s.replace(/-/g," ")}</span>`;
}

// ── Role colors ────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, [string, string]> = {
  owner:           ["#9a3412", "#ffedd5"],
  manager:         ["#0369a1", "#e0f2fe"],
  "senior-stylist":["#065f46", "#d1fae5"],
  "junior-stylist":["#92400e", "#fef3c7"],
  receptionist:    ["#9d174d", "#fce7f3"],
  trainee:         ["#374151", "#f3f4f6"],
};

// ── Shared CSS ─────────────────────────────────────────────────────────────────
const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  color: #111827;
  background: #e5e7eb;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  background: #fff;
  max-width: 900px;
  margin: 24px auto;
  border-radius: 16px;
  box-shadow: 0 4px 40px rgba(0,0,0,0.14);
  overflow: hidden;
}

/* ── Header ───────────────────────────────────────────── */
.header {
  position: relative;
  padding: 0;
  overflow: hidden;
  background: linear-gradient(135deg, #7c2d12 0%, #c2410c 55%, #f97316 100%);
}
.header-pattern {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    radial-gradient(circle at 10% 20%, rgba(255,255,255,0.08) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(255,255,255,0.06) 0%, transparent 40%);
}
.header-circles {
  position: absolute; top: -30px; right: -30px;
  width: 220px; height: 220px; border-radius: 50%;
  background: rgba(255,255,255,0.05);
}
.header-circles::after {
  content:''; position: absolute; top: 30px; left: 30px;
  right: -60px; bottom: -60px;
  border-radius: 50%; background: rgba(255,255,255,0.04);
}
.header-inner {
  position: relative;
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px;
  padding: 36px 44px 32px;
}
.header-left  { display: flex; align-items: center; gap: 22px; }
.avatar-wrap  { position: relative; flex-shrink: 0; }
.avatar {
  width: 80px; height: 80px; border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.5);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 900; color: #fff;
  background: rgba(255,255,255,0.18);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.avatar-ring {
  position: absolute; inset: -5px; border-radius: 50%;
  border: 2px dashed rgba(255,255,255,0.25);
}
.header-info { flex: 1; }
.header-name { font-size: 30px; font-weight: 900; color: #fff; letter-spacing: -0.02em; line-height: 1; margin-bottom: 10px; }
.header-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 12px; border-radius: 20px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
  background: rgba(255,255,255,0.18); color: #fff;
  border: 1px solid rgba(255,255,255,0.28);
  backdrop-filter: blur(4px);
}
.badge-success { background: #dcfce7; color: #14532d; border-color: #86efac; }
.badge-danger  { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.badge-gold    { background: #fef3c7; color: #78350f; border-color: #fcd34d; }
.badge-silver  { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
.badge-platinum{ background: #e2e8f0; color: #1e293b; border-color: #94a3b8; }
.header-meta { font-size: 12px; color: rgba(255,255,255,0.78); line-height: 1.9; }
.header-right { text-align: right; flex-shrink: 0; padding-top: 4px; }
.business-name   { font-size: 17px; font-weight: 800; color: #fff; letter-spacing: 0.01em; }
.report-type  { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.12em; margin-top: 3px; }
.report-date  { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 18px; }

/* ── Key numbers strip ────────────────────────────────── */
.kpi-strip {
  background: #faf9ff;
  border-bottom: 1px solid #ffedd5;
  display: grid;
  padding: 0;
}
.kpi-item {
  padding: 18px 22px;
  border-right: 1px solid #ffedd5;
  position: relative;
}
.kpi-item:last-child { border-right: none; }
.kpi-icon  { font-size: 18px; margin-bottom: 4px; }
.kpi-val   { font-size: 22px; font-weight: 900; line-height: 1; letter-spacing: -0.03em; margin-bottom: 4px; }
.kpi-lbl   { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; }
.kpi-sub   { font-size: 10px; color: #fdba74; margin-top: 2px; }

/* ── Body ─────────────────────────────────────────────── */
.body { padding: 28px 44px 40px; }

/* ── Section heading ──────────────────────────────────── */
.section-head {
  display: flex; align-items: center; gap: 10px;
  margin: 28px 0 14px;
}
.section-icon {
  width: 28px; height: 28px; border-radius: 8px;
  background: linear-gradient(135deg,#9a3412,#f97316);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; flex-shrink: 0;
}
.section-title {
  font-size: 11px; font-weight: 800; color: #c2410c;
  text-transform: uppercase; letter-spacing: 0.1em;
  flex: 1;
}
.section-line { flex: 1; height: 1px; background: #ffedd5; }

/* ── Stat grid ────────────────────────────────────────── */
.stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.stat-card {
  border-radius: 14px; padding: 18px 20px;
  border: 1px solid #f0f0f8; position: relative; overflow: hidden;
}
.stat-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 14px 14px 0 0; }
.stat-card-bg {
  position: absolute; bottom: -10px; right: -10px;
  font-size: 52px; line-height: 1; opacity: 0.07; pointer-events: none;
}
.stat-emoji { font-size: 20px; margin-bottom: 8px; }
.stat-val { font-size: 24px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; margin-bottom: 6px; }
.stat-lbl { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; }
.stat-sub { font-size: 10px; color: #fdba74; margin-top: 3px; }

/* ── Progress bar ─────────────────────────────────────── */
.prog-wrap { background: #f0f0f8; border-radius: 6px; height: 10px; overflow: hidden; margin: 6px 0; }
.prog-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg,#c2410c,#f97316); }

/* ── Info grid ────────────────────────────────────────── */
.info-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  border: 1px solid #f0f0f8; border-radius: 14px; overflow: hidden;
}
.info-item { padding: 14px 18px; border-bottom: 1px solid #f7f7fb; }
.info-item:nth-last-child(-n+2) { border-bottom: none; }
.info-item:nth-child(odd)       { border-right: 1px solid #f7f7fb; }
.info-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
.info-value { font-size: 13px; font-weight: 600; color: #111827; }

/* ── Loyalty card visual ─────────────────────────────── */
.loyalty-card {
  border-radius: 16px; padding: 22px 24px;
  background: linear-gradient(135deg,#7c2d12,#c2410c,#f97316);
  color: #fff; position: relative; overflow: hidden;
}
.loyalty-card-pattern {
  position: absolute; top: -20px; right: -20px;
  width: 140px; height: 140px; border-radius: 50%;
  background: rgba(255,255,255,0.06);
}
.loyalty-pts-big { font-size: 40px; font-weight: 900; letter-spacing: -0.03em; }
.loyalty-pts-lbl { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.65); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }
.loyalty-prog-bg { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.2); margin: 10px 0 6px; overflow: hidden; }
.loyalty-prog-fill { height: 100%; border-radius: 4px; background: rgba(255,255,255,0.85); }

/* ── Table ────────────────────────────────────────────── */
.table-wrap { border: 1px solid #f0f0f8; border-radius: 14px; overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: linear-gradient(135deg,#7c2d12,#ea580c); }
thead th {
  padding: 11px 16px; text-align: left;
  font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.9);
  text-transform: uppercase; letter-spacing: 0.09em;
}
thead th.r { text-align: right; }
thead th.c { text-align: center; }
tbody tr { border-bottom: 1px solid #f7f7fb; transition: background 0.1s; }
tbody tr:nth-child(even) { background: #fdfcff; }
tbody tr:last-child { border-bottom: none; }
tbody td { padding: 11px 16px; font-size: 12px; color: #374151; vertical-align: middle; }
td.r { text-align: right; font-weight: 700; color: #ea580c; }
td.c { text-align: center; }
td.muted { color: #9ca3af; font-size: 11px; }
.rank { font-size: 15px; }

/* ── Performance bar ─────────────────────────────────── */
.perf-bar-wrap { background: #f0f0f8; border-radius: 6px; height: 8px; flex: 1; overflow: hidden; }
.perf-bar-fill { height: 100%; border-radius: 6px; }

/* ── Notes ────────────────────────────────────────────── */
.notes-box {
  background: #faf9ff; border: 1px solid #ffedd5;
  border-left: 4px solid #ea580c;
  border-radius: 0 12px 12px 0;
  padding: 14px 18px;
  font-size: 13px; color: #4b5563; line-height: 1.65; font-style: italic;
}

/* ── Tags ─────────────────────────────────────────────── */
.tag-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  display: inline-block; padding: 4px 12px; border-radius: 20px;
  font-size: 11px; font-weight: 600;
  background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa;
}

/* ── Footer ───────────────────────────────────────────── */
.footer {
  margin-top: 40px; padding: 18px 0 0;
  border-top: 1px solid #f0f0f8;
  display: flex; align-items: center; justify-content: space-between;
}
.footer-brand { display: flex; align-items: center; gap: 10px; }
.footer-logo {
  width: 28px; height: 28px; border-radius: 8px;
  background: linear-gradient(135deg,#9a3412,#f97316);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #fff; font-weight: 900;
}
.footer-business { font-size: 13px; font-weight: 700; color: #9a3412; }
.footer-powered { font-size: 10px; color: #fdba74; margin-top: 1px; }
.footer-right { text-align: right; font-size: 11px; color: #9ca3af; line-height: 1.7; }

/* ── Print ────────────────────────────────────────────── */
@media print {
  body { background: #fff; }
  .page { box-shadow: none; max-width: 100%; margin: 0; border-radius: 0; }
  @page { margin: 0.4in 0.5in; }
}
`;

function openPrint(html: string, title: string) {
  const win = window.open("", "_blank", "width=980,height=820");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${BASE_CSS}</style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 800);
}

// ── CLIENT PDF ─────────────────────────────────────────────────────────────────

export function exportClientPdf(
  client: Client,
  appointments: Appointment[],
  loyaltySettings: LoyaltySettings,
  businessName: string,
) {
  const completed = appointments.filter(a => a.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  const noShows   = appointments.filter(a => a.status === "no-show").length;
  const totalVisits = completed.length;
  const totalSpend  = completed.reduce((s, a) => s + a.totalAmount, 0);
  const avgTicket   = totalVisits ? Math.round(totalSpend / totalVisits) : 0;
  const lastVisit   = completed[0]?.date;
  const noShowRate  = appointments.length ? pct(noShows, appointments.length) : 0;

  const serviceFreq: Record<string, { count: number; revenue: number }> = {};
  completed.forEach(a => a.serviceNames.forEach(s => {
    if (!serviceFreq[s]) serviceFreq[s] = { count: 0, revenue: 0 };
    serviceFreq[s].count++;
    serviceFreq[s].revenue += a.totalAmount / a.serviceNames.length;
  }));
  const topServices = Object.entries(serviceFreq)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 8)
    .map(([name, v]) => ({ name, count: v.count, revenue: Math.round(v.revenue) }));

  const tier     = getTier(client.loyaltyPointsEarned ?? 0, loyaltySettings);
  const tierMeta = TIER_META[tier];
  const balance  = client.loyaltyPoints ?? 0;
  const earned   = client.loyaltyPointsEarned ?? 0;
  const nextTier = nextTierThreshold(earned, loyaltySettings);
  const loyaltyPct = nextTier ? pct(earned, earned + nextTier.needed) : 100;

  const tierClass = tier === "gold" ? "badge-gold" : tier === "silver" ? "badge-silver" : tier === "platinum" ? "badge-platinum" : "";

  const visitRows = completed.slice(0, 20).map((a, i) => `
    <tr>
      <td class="muted" style="font-weight:700;width:36px">${i + 1}</td>
      <td style="font-weight:600;white-space:nowrap">${fmtDate(a.date)}</td>
      <td>${a.serviceNames.join(", ")}</td>
      <td>${a.staffName || "—"}</td>
      <td class="r">${fmtCur(a.totalAmount)}</td>
    </tr>`).join("");

  const svcRows = topServices.map((s, i) => `
    <tr>
      <td class="rank" style="width:40px">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `<span style="color:#9ca3af;font-weight:700;font-size:12px">${i+1}</span>`}</td>
      <td style="font-weight:600">${s.name}</td>
      <td class="c" style="color:#374151;font-weight:600">${s.count}×</td>
      <td class="r">${fmtCur(s.revenue)}</td>
    </tr>`).join("");

  const tagsHtml = (client.tags ?? []).map(t => `<span class="tag">${t}</span>`).join("");

  const html = `
  <div class="page">
    <div class="header">
      <div class="header-pattern"></div>
      <div class="header-circles"></div>
      <div class="header-inner">
        <div class="header-left">
          <div class="avatar-wrap">
            <div class="avatar">${client.name.charAt(0).toUpperCase()}</div>
            <div class="avatar-ring"></div>
          </div>
          <div class="header-info">
            <div class="header-name">${client.name}</div>
            <div class="header-badges">
              ${tagsHtml ? tagsHtml : ""}
              <span class="badge ${tierClass}">${tierMeta.emoji}&nbsp;${tierMeta.label}</span>
              <span class="badge" style="background:rgba(255,255,255,0.15)">${client.source}</span>
            </div>
            <div class="header-meta">
              📞 ${client.phone}${client.email ? `&ensp;·&ensp;✉ ${client.email}` : ""}
              ${client.dob ? `<br>🎂 ${fmtDate(client.dob)}` : ""}
              &ensp;·&ensp;📅 Member since ${fmtDate(client.createdAt)}
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="business-name">${businessName}</div>
          <div class="report-type">Client Profile</div>
          <div class="report-date">Generated: ${fmtDateLong()}</div>
        </div>
      </div>
    </div>

    <!-- KPI STRIP -->
    <div class="kpi-strip" style="grid-template-columns:repeat(5,1fr)">
      <div class="kpi-item">
        <div class="kpi-icon">🗓</div>
        <div class="kpi-val" style="color:#c2410c">${totalVisits}</div>
        <div class="kpi-lbl">Total Visits</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">💰</div>
        <div class="kpi-val" style="color:#059669">${fmtCur(totalSpend)}</div>
        <div class="kpi-lbl">Total Spend</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">🎯</div>
        <div class="kpi-val" style="color:#0284c7">${avgTicket ? fmtCur(avgTicket) : "—"}</div>
        <div class="kpi-lbl">Avg Ticket</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">⭐</div>
        <div class="kpi-val" style="color:#d97706">${balance.toLocaleString()}</div>
        <div class="kpi-lbl">Loyalty Pts</div>
        <div class="kpi-sub">≈ ${fmtCur(pointsToRupees(balance, loyaltySettings.rupeePerPoint))}</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">📅</div>
        <div class="kpi-val" style="color:#ea580c;font-size:14px">${fmtDate(lastVisit)}</div>
        <div class="kpi-lbl">Last Visit</div>
      </div>
    </div>

    <div class="body">

      <!-- LOYALTY CARD -->
      <div class="section-head">
        <div class="section-icon">⭐</div>
        <div class="section-title">Loyalty Status</div>
        <div class="section-line"></div>
      </div>
      <div class="loyalty-card">
        <div class="loyalty-card-pattern"></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative">
          <div>
            <div class="loyalty-pts-lbl">Points Balance</div>
            <div class="loyalty-pts-big">${balance.toLocaleString()}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:2px">
              ≈ ${fmtCur(pointsToRupees(balance, loyaltySettings.rupeePerPoint))} redeemable
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:28px">${tierMeta.emoji}</div>
            <div style="font-size:13px;font-weight:800;color:#fff;margin-top:4px">${tierMeta.label}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6)">${earned.toLocaleString()} pts lifetime</div>
          </div>
        </div>
        ${nextTier ? `
        <div style="margin-top:14px;position:relative">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:10px;color:rgba(255,255,255,0.65);font-weight:700;text-transform:uppercase;letter-spacing:0.07em">Progress to ${TIER_META[nextTier.tier].label}</span>
            <span style="font-size:10px;color:rgba(255,255,255,0.65)">${nextTier.needed} pts needed</span>
          </div>
          <div class="loyalty-prog-bg"><div class="loyalty-prog-fill" style="width:${loyaltyPct}%"></div></div>
        </div>` : `
        <div style="margin-top:14px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.9)">
          💎 Top tier achieved — Platinum Member!
        </div>`}
      </div>

      <!-- CONTACT INFO -->
      <div class="section-head">
        <div class="section-icon">📋</div>
        <div class="section-title">Contact &amp; Details</div>
        <div class="section-line"></div>
      </div>
      <div class="info-grid">
        <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${client.phone}</div></div>
        <div class="info-item"><div class="info-label">Email</div><div class="info-value">${client.email || "—"}</div></div>
        <div class="info-item"><div class="info-label">Date of Birth</div><div class="info-value">${client.dob ? fmtDate(client.dob) : "—"}</div></div>
        <div class="info-item"><div class="info-label">Gender</div><div class="info-value" style="text-transform:capitalize">${client.gender || "—"}</div></div>
        <div class="info-item"><div class="info-label">Source</div><div class="info-value" style="text-transform:capitalize">${client.source}</div></div>
        <div class="info-item"><div class="info-label">No-show Rate</div><div class="info-value" style="color:${noShowRate > 20 ? "#dc2626" : "#374151"}">${noShowRate}% <span style="color:#9ca3af;font-weight:400;font-size:11px">(${noShows} of ${appointments.length})</span></div></div>
      </div>

      <!-- FAVOURITE SERVICES -->
      ${topServices.length > 0 ? `
      <div class="section-head">
        <div class="section-icon">💇</div>
        <div class="section-title">Favourite Services</div>
        <div class="section-line"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th width="44">#</th><th>Service</th><th class="c" width="80">Visits</th><th class="r" width="120">Revenue Share</th></tr></thead>
          <tbody>${svcRows}</tbody>
        </table>
      </div>` : ""}

      <!-- VISIT HISTORY -->
      <div class="section-head">
        <div class="section-icon">📅</div>
        <div class="section-title">Visit History${completed.length > 20 ? " (last 20)" : ""}</div>
        <div class="section-line"></div>
      </div>
      ${completed.length === 0
        ? `<div style="background:#faf9ff;border:1px dashed #fed7aa;border-radius:12px;padding:24px;text-align:center;color:#9ca3af;font-size:13px">No completed visits on record.</div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th width="36">#</th><th>Date</th><th>Services</th><th>Staff</th><th class="r">Amount</th></tr></thead>
            <tbody>${visitRows}</tbody>
          </table></div>`}

      <!-- NOTES -->
      ${client.notes ? `
      <div class="section-head">
        <div class="section-icon">📝</div>
        <div class="section-title">Notes &amp; Preferences</div>
        <div class="section-line"></div>
      </div>
      <div class="notes-box">"${client.notes}"</div>` : ""}

      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-brand">
          <div class="footer-logo">W</div>
          <div>
            <div class="footer-business">${businessName}</div>
            <div class="footer-powered">Powered by OnePOS</div>
          </div>
        </div>
        <div class="footer-right">
          Client Profile &nbsp;·&nbsp; ${fmtDateLong()}<br>
          <span style="color:#fed7aa">Confidential — for internal use only</span>
        </div>
      </div>

    </div>
  </div>`;

  openPrint(html, `${client.name} — Client Profile`);
}

// ── STAFF PDF ──────────────────────────────────────────────────────────────────

export function exportStaffPdf(
  staff: Staff,
  appointments: Appointment[],
  businessName: string,
) {
  const allMine    = appointments.filter(a => a.staffId === staff.id);
  const completed  = allMine.filter(a => a.status === "completed");
  const noShows    = allMine.filter(a => a.status === "no-show");
  const cancelled  = allMine.filter(a => a.status === "cancelled");
  const booked     = allMine.filter(a => ["booked","confirmed","arrived","in-progress"].includes(a.status));

  const totalRev      = completed.reduce((s, a) => s + (a.totalAmount ?? 0), 0);
  const avgTicket     = completed.length ? Math.round(totalRev / completed.length) : 0;
  const noShowRate    = allMine.length ? pct(noShows.length, allMine.length) : 0;
  const completionRate= allMine.length ? pct(completed.length, allMine.length) : 0;
  const uniqueClients = new Set(allMine.map(a => a.clientId)).size;

  const serviceCount: Record<string, number>   = {};
  const serviceRevenue: Record<string, number> = {};
  for (const appt of completed) {
    for (const name of appt.serviceNames) {
      serviceCount[name]   = (serviceCount[name]   ?? 0) + 1;
      serviceRevenue[name] = (serviceRevenue[name] ?? 0) + (appt.totalAmount ?? 0) / appt.serviceNames.length;
    }
  }
  const topServices = Object.entries(serviceCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name, count, revenue: Math.round(serviceRevenue[name] ?? 0) }));

  const recentAppts = [...allMine].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

  const [roleColor, roleBg] = ROLE_COLORS[staff.role] ?? ["#9a3412", "#ffedd5"];

  const specialtiesHtml = (staff.specialties ?? [])
    .map(s => `<span class="badge">${s}</span>`).join(" ");

  const svcRows = topServices.map((s, i) => {
    const barPct = topServices[0].revenue > 0 ? pct(s.revenue, topServices[0].revenue) : 0;
    return `
    <tr>
      <td class="rank" style="width:40px">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `<span style="color:#9ca3af;font-weight:700;font-size:12px">${i+1}</span>`}</td>
      <td style="font-weight:600">${s.name}</td>
      <td class="c" style="color:#374151;font-weight:600;width:70px">${s.count}×</td>
      <td style="width:180px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="perf-bar-wrap"><div class="perf-bar-fill" style="width:${barPct}%;background:linear-gradient(90deg,#c2410c,#f97316)"></div></div>
          <span style="font-size:11px;font-weight:700;color:#c2410c;white-space:nowrap">${fmtCur(s.revenue)}</span>
        </div>
      </td>
    </tr>`;
  }).join("");

  const apptRows = recentAppts.map(a => `
    <tr>
      <td style="white-space:nowrap;font-weight:500">${fmtDate(a.date)}</td>
      <td style="font-weight:600">${a.clientName}</td>
      <td class="muted">${a.serviceNames.join(", ")}</td>
      <td>${statusPill(a.status)}</td>
      <td class="r">${a.status === "completed" ? fmtCur(a.totalAmount ?? 0) : `<span style="color:#d1d5db">—</span>`}</td>
    </tr>`).join("");

  // Performance score (simple weighted metric)
  const perfScore = Math.min(100, Math.round(
    completionRate * 0.5 + Math.max(0, 100 - noShowRate * 2) * 0.3 + Math.min(100, (totalRev / 10000) * 100) * 0.2
  ));
  const perfColor = perfScore >= 80 ? "#059669" : perfScore >= 60 ? "#d97706" : "#dc2626";
  const perfLabel = perfScore >= 80 ? "Excellent" : perfScore >= 60 ? "Good" : "Needs Improvement";

  const html = `
  <div class="page">
    <div class="header">
      <div class="header-pattern"></div>
      <div class="header-circles"></div>
      <div class="header-inner">
        <div class="header-left">
          <div class="avatar-wrap">
            <div class="avatar">${staff.name.charAt(0).toUpperCase()}</div>
            <div class="avatar-ring"></div>
          </div>
          <div class="header-info">
            <div class="header-name">${staff.name}</div>
            <div class="header-badges">
              <span class="badge" style="background:${roleBg};color:${roleColor};border-color:${roleColor}40">
                ${staff.role.replace(/-/g, " ")}
              </span>
              <span class="badge ${staff.isActive ? "badge-success" : "badge-danger"}">
                ${staff.isActive ? "● Active" : "● Inactive"}
              </span>
            </div>
            <div class="header-meta">
              📞 ${staff.phone}
              ${specialtiesHtml ? `<br>✂️ &nbsp;${specialtiesHtml}` : ""}
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="business-name">${businessName}</div>
          <div class="report-type">Staff Profile</div>
          <div class="report-date">Generated: ${fmtDateLong()}</div>
        </div>
      </div>
    </div>

    <!-- KPI STRIP -->
    <div class="kpi-strip" style="grid-template-columns:repeat(6,1fr)">
      <div class="kpi-item">
        <div class="kpi-icon">💰</div>
        <div class="kpi-val" style="color:#c2410c">${fmtCur(totalRev)}</div>
        <div class="kpi-lbl">Revenue</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">✅</div>
        <div class="kpi-val" style="color:#059669">${completed.length}</div>
        <div class="kpi-lbl">Completed</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">📅</div>
        <div class="kpi-val" style="color:#0284c7">${allMine.length}</div>
        <div class="kpi-lbl">Total Appts</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">🎯</div>
        <div class="kpi-val" style="color:#d97706">${avgTicket ? fmtCur(avgTicket) : "—"}</div>
        <div class="kpi-lbl">Avg Ticket</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">👥</div>
        <div class="kpi-val" style="color:#db2777">${uniqueClients}</div>
        <div class="kpi-lbl">Clients</div>
      </div>
      <div class="kpi-item">
        <div class="kpi-icon">📈</div>
        <div class="kpi-val" style="color:${perfColor}">${completionRate}%</div>
        <div class="kpi-lbl">Completion</div>
      </div>
    </div>

    <div class="body">

      <!-- PERFORMANCE OVERVIEW -->
      <div class="section-head">
        <div class="section-icon">📊</div>
        <div class="section-title">Performance Overview</div>
        <div class="section-line"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

        <!-- Score card -->
        <div style="border:1px solid #f0f0f8;border-radius:14px;padding:20px 22px;display:flex;align-items:center;gap:18px">
          <div style="width:64px;height:64px;border-radius:50%;border:4px solid ${perfColor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:20px;font-weight:900;color:${perfColor}">${perfScore}</span>
          </div>
          <div>
            <div style="font-size:16px;font-weight:800;color:${perfColor}">${perfLabel}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Performance score</div>
          </div>
        </div>

        <!-- Breakdown bars -->
        <div style="border:1px solid #f0f0f8;border-radius:14px;padding:16px 20px;display:flex;flex-direction:column;gap:10px">
          ${[
            { label: "Completion Rate", val: completionRate, color: "#059669" },
            { label: "No-show Rate",    val: noShowRate,    color: noShowRate > 20 ? "#dc2626" : "#9ca3af", invert: true },
          ].map(m => `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:11px;font-weight:600;color:#374151">${m.label}</span>
                <span style="font-size:11px;font-weight:700;color:${m.color}">${m.val}%</span>
              </div>
              <div class="perf-bar-wrap"><div class="perf-bar-fill" style="width:${m.val}%;background:${m.color}"></div></div>
            </div>`).join("")}
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px;padding-top:10px;border-top:1px solid #f7f7fb">
            ${[
              { label: "Upcoming", val: booked.length, color: "#c2410c" },
              { label: "Cancelled", val: cancelled.length, color: "#6b7280" },
              { label: "No-shows", val: noShows.length, color: "#dc2626" },
            ].map(s => `
              <div style="text-align:center">
                <div style="font-size:18px;font-weight:800;color:${s.color}">${s.val}</div>
                <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em">${s.label}</div>
              </div>`).join("")}
          </div>
        </div>
      </div>

      <!-- STAFF DETAILS -->
      <div class="section-head">
        <div class="section-icon">👤</div>
        <div class="section-title">Staff Details</div>
        <div class="section-line"></div>
      </div>
      <div class="info-grid">
        <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${staff.phone}</div></div>
        <div class="info-item">
          <div class="info-label">Role</div>
          <div class="info-value">
            <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${roleBg};color:${roleColor}">
              ${staff.role.replace(/-/g, " ")}
            </span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value" style="color:${staff.isActive ? "#059669" : "#dc2626"}">
            ${staff.isActive ? "● Active" : "● Inactive"}
          </div>
        </div>
        <div class="info-item"><div class="info-label">Specialties</div><div class="info-value">${(staff.specialties ?? []).join(", ") || "—"}</div></div>
      </div>

      <!-- TOP SERVICES -->
      ${topServices.length > 0 ? `
      <div class="section-head">
        <div class="section-icon">✂️</div>
        <div class="section-title">Top Services</div>
        <div class="section-line"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th width="44">#</th><th>Service</th><th class="c" width="70">Count</th><th>Revenue</th></tr></thead>
          <tbody>${svcRows}</tbody>
        </table>
      </div>` : ""}

      <!-- RECENT APPOINTMENTS -->
      <div class="section-head">
        <div class="section-icon">📅</div>
        <div class="section-title">Recent Appointments${allMine.length > 15 ? " (last 15)" : ""}</div>
        <div class="section-line"></div>
      </div>
      ${recentAppts.length === 0
        ? `<div style="background:#faf9ff;border:1px dashed #fed7aa;border-radius:12px;padding:24px;text-align:center;color:#9ca3af;font-size:13px">No appointments on record.</div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Client</th><th>Services</th><th>Status</th><th class="r">Amount</th></tr></thead>
            <tbody>${apptRows}</tbody>
          </table></div>`}

      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-brand">
          <div class="footer-logo">W</div>
          <div>
            <div class="footer-business">${businessName}</div>
            <div class="footer-powered">Powered by OnePOS</div>
          </div>
        </div>
        <div class="footer-right">
          Staff Profile &nbsp;·&nbsp; ${fmtDateLong()}<br>
          <span style="color:#fed7aa">Confidential — for internal use only</span>
        </div>
      </div>

    </div>
  </div>`;

  openPrint(html, `${staff.name} — Staff Profile`);
}
