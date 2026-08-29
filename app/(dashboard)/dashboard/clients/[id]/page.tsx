"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredClients, getStoredAppointments, saveClients } from "@/lib/storage";
import { getInvoices, type Invoice } from "@/lib/invoices";
import { BEAUTY_PROFILES } from "@/lib/mock-data";
import type { Client, Appointment } from "@/lib/types";
import { fmtCurrency as fmt } from "@/lib/format";
import { getTier, TIER_META, nextTierThreshold, pointsToRupees, type LoyaltySettings } from "@/lib/loyalty";
import { settingsStore } from "@/lib/settings-store";
import { exportClientPdf } from "@/lib/export-pdf";
import { locationUserKey } from "@/lib/locations";
import { getSectionOptions, getActiveSection, inSection } from "@/lib/sections";
import { normalizePhone } from "@/lib/whatsapp-link";
import {
  ArrowLeft, Phone, Mail, Calendar, Heart, Star, Camera, X,
  Plus, Edit2, TrendingUp, Clock, Users, Scissors, ShoppingCart,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, FileDown,
} from "lucide-react";

const TAG_COLORS: Record<string, { color: string; bg: string }> = {
  VIP:      { color: "#EA580C", bg: "#FFEDD5" },
  Regular:  { color: "#059669", bg: "#ecfdf5" },
  Wholesale:{ color: "#db2777", bg: "#fdf2f8" },
  New:      { color: "#0369a1", bg: "#e0f2fe" },
  "At-Risk":{ color: "#dc2626", bg: "#fef2f2" },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  booked:        { label: "Booked",      color: "#6366f1", bg: "#eef2ff" },
  confirmed:     { label: "Confirmed",   color: "#059669", bg: "#ecfdf5" },
  arrived:       { label: "Arrived",     color: "#F97316", bg: "#fff7ed" },
  "in-progress": { label: "In Progress", color: "#d97706", bg: "#fffbeb" },
  completed:     { label: "Completed",   color: "#16a34a", bg: "#f0fdf4" },
  "no-show":     { label: "No Show",     color: "#dc2626", bg: "#fef2f2" },
  cancelled:     { label: "Cancelled",   color: "#6b7280", bg: "#f9fafb" },
};

function fmtDate(s?: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t: string) {
  const [h, mn] = t.split(":").map(Number);
  const ampm = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(mn).padStart(2, "0")}${ampm}`;
}

function SectionCard({ title, sub, headerAction, children }: { title: string; sub?: string; headerAction?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8e8f0", overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>{title}</div>
        {headerAction ?? (sub && <span style={{ fontSize: 12, color: "#9898b0" }}>{sub}</span>)}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ marginTop: 1, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: "#1a1a2e" }}>{children}</div>
      </div>
    </div>
  );
}

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [posInvoices, setPosInvoices] = useState<Invoice[]>([]);
  const [visitPhotos, setVisitPhotos] = useState<Record<string, { before?: string; after?: string }>>({});
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", phone: "", email: "", dob: "", source: "whatsapp", tag: "", section: "", notes: "",
  });
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    const allClients = getStoredClients();
    const allAppts   = getStoredAppointments();
    const allInvoices = getInvoices();
    const found = allClients.find((c) => c.id === clientId);
    // Strict-locked, same as the Clients list — a client belonging to another
    // section is treated as not found rather than leaking through a direct link.
    const activeSection = getActiveSection();
    if (found && inSection(found, activeSection)) {
      // Recalculate loyalty points from source data (same logic as loyalty page)
      // so this page always agrees with the loyalty leaderboard.
      const ls = settingsStore.loyalty as LoyaltySettings;
      let resolved = found;
      if (ls.enabled) {
        const apptSpend = allAppts
          .filter((a) => a.clientId === clientId && a.status === "completed")
          .reduce((s, a) => s + a.totalAmount, 0);
        const posSpend = allInvoices
          .filter((inv) => inv.clientId === clientId && inv.source === "pos")
          .reduce((s, inv) => s + inv.total, 0);
        const totalSpend = Math.max(found.totalSpend ?? 0, apptSpend + posSpend);
        const totalEarned = Math.floor(totalSpend * ls.pointsPerRupee);
        if (totalEarned > (found.loyaltyPointsEarned ?? 0)) {
          const redeemed = Math.max(0, (found.loyaltyPointsEarned ?? 0) - (found.loyaltyPoints ?? 0));
          resolved = { ...found, loyaltyPointsEarned: totalEarned, loyaltyPoints: Math.max(0, totalEarned - redeemed) };
          saveClients(allClients.map((c) => c.id === clientId ? resolved : c));
        }
      }
      setClient(resolved);
      setEditForm({
        name: resolved.name, phone: resolved.phone, email: resolved.email ?? "",
        dob: resolved.dob ?? "", source: resolved.source, tag: resolved.tags[0] ?? "",
        section: resolved.section ?? "",
        notes: resolved.notes ?? "",
      });
    }
    const appts = allAppts.filter((a) => a.clientId === clientId);
    setAppointments(appts);
    const invoices = allInvoices.filter((inv) => inv.clientId === clientId && inv.source === "pos");
    setPosInvoices(invoices);

    try {
      const stored = localStorage.getItem(locationUserKey(`pointly_photos_${clientId}`));
      if (stored) setVisitPhotos(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [clientId]);

  const persistPhotos = (photos: Record<string, { before?: string; after?: string }>) => {
    setVisitPhotos(photos);
    try { localStorage.setItem(locationUserKey(`pointly_photos_${clientId}`), JSON.stringify(photos)); } catch { /* ignore */ }
  };

  const handlePhotoUpload = (apptId: string, side: "before" | "after", file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const next = { ...visitPhotos, [apptId]: { ...visitPhotos[apptId], [side]: e.target?.result as string } };
      persistPhotos(next);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (apptId: string, side: "before" | "after") => {
    const next = { ...visitPhotos, [apptId]: { ...visitPhotos[apptId], [side]: undefined } };
    persistPhotos(next);
  };

  const handleSaveEdit = () => {
    if (!client) return;
    const updated: Client = {
      ...client,
      name: editForm.name,
      phone: normalizePhone(editForm.phone),
      email: editForm.email || undefined,
      dob: editForm.dob || undefined,
      source: editForm.source as Client["source"],
      tags: editForm.tag ? [editForm.tag] : [],
      section: editForm.section || undefined,
      notes: editForm.notes || undefined,
    };
    const all = getStoredClients();
    saveClients(all.map((c) => (c.id === updated.id ? updated : c)));
    setClient(updated);
    setEditing(false);
  };

  const handleStartEditNotes = () => {
    setNotesDraft(client?.notes ?? "");
    setEditingNotes(true);
  };

  const handleSaveNotes = () => {
    if (!client) return;
    const updated: Client = { ...client, notes: notesDraft.trim() || undefined };
    const all = getStoredClients();
    saveClients(all.map((c) => (c.id === updated.id ? updated : c)));
    setClient(updated);
    setEditForm((f) => ({ ...f, notes: updated.notes ?? "" }));
    setEditingNotes(false);
  };

  if (!client) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f4f5f7" }}>
        <div style={{ color: "#9898b0", fontSize: 14 }}>Client not found.</div>
      </div>
    );
  }

  const profile = BEAUTY_PROFILES.find((p) => p.clientId === clientId);
  const completedAppts = appointments.filter((a) => a.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  const upcomingAppts  = appointments.filter((a) => !["completed", "cancelled", "no-show"].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date));
  const cancelledAppts = appointments.filter((a) => a.status === "cancelled" || a.status === "no-show").sort((a, b) => b.date.localeCompare(a.date));

  // Use stored accumulated values (include POS + all devices) — they're always >= local appointment count
  const totalVisits = Math.max(client.totalVisits ?? 0, completedAppts.length);
  const totalSpend  = Math.max(client.totalSpend  ?? 0, completedAppts.reduce((s, a) => s + a.totalAmount, 0));
  const avgTicket   = totalVisits ? Math.round(totalSpend / totalVisits) : 0;
  const lastVisit   = client.lastVisitDate ?? completedAppts[0]?.date;

  const serviceFreq: Record<string, { count: number; spend: number }> = {};
  completedAppts.forEach((a) => {
    const perService = a.serviceNames.length > 0 ? a.totalAmount / a.serviceNames.length : 0;
    a.serviceNames.forEach((s) => {
      serviceFreq[s] = { count: (serviceFreq[s]?.count ?? 0) + 1, spend: (serviceFreq[s]?.spend ?? 0) + perService };
    });
  });
  const topServices = Object.entries(serviceFreq).sort((a, b) => b[1].count - a[1].count);

  const totalPhotos = Object.values(visitPhotos).reduce((n, p) => n + (p.before ? 1 : 0) + (p.after ? 1 : 0), 0);

  const setE = (k: string, v: string) => setEditForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="dashboard-polish detail-page-polish" style={{ background: "#f4f5f7", minHeight: "100vh" }}>

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8f0", padding: "13px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <button
          onClick={() => router.push("/dashboard/clients")}
          style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", color: "#6b6b8a", fontSize: 13, fontWeight: 600, padding: 0 }}
        >
          <ArrowLeft size={15} /> Back to Clients
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}
            >
              <Edit2 size={13} /> Edit Profile
            </button>
          )}
          <button
            onClick={() => exportClientPdf(client, appointments, settingsStore.loyalty as LoyaltySettings, settingsStore.business.name as string)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}
          >
            <FileDown size={13} /> Export PDF
          </button>
          <button
            onClick={() => router.push(`/dashboard/pos?client=${encodeURIComponent(client.id)}`)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: "0 4px 14px var(--accent-glow)" }}
          >
            <ShoppingCart size={13} /> New Sale
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Hero card ─────────────────────────────────────────────────────────── */}
        <div style={{ background: "linear-gradient(135deg, #FFEDD5 0%, #fdf2f8 100%)", borderRadius: 20, padding: "28px 32px", border: "1px solid #e8e0ff" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #9A3412, #F97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {client.name.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", marginBottom: 8 }}>{client.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {client.tags.map((tag) => {
                  const tc = TAG_COLORS[tag] ?? { color: "#6b7280", bg: "#f9fafb" };
                  return (
                    <span key={tag} style={{ fontSize: 12, fontWeight: 700, color: tc.color, background: tc.bg, padding: "3px 12px", borderRadius: 20 }}>{tag}</span>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b6b8a" }}><Phone size={13} />{client.phone}</span>
                {client.email && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b6b8a" }}><Mail size={13} />{client.email}</span>}
                {client.dob && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b6b8a" }}><Calendar size={13} />DOB: {fmtDate(client.dob)}</span>}
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b6b8a" }}><Heart size={13} />via {client.source}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b6b8a" }}><Clock size={13} />Member since {fmtDate(client.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats row ─────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "Total Visits",  value: totalVisits,                      color: "#EA580C", bg: "#fff7ed",  icon: <CheckCircle2 size={18} color="#EA580C" /> },
            { label: "Total Spend",   value: fmt(totalSpend),                  color: "#059669", bg: "#ecfdf5",  icon: <TrendingUp size={18} color="#059669" /> },
            { label: "Avg Ticket",    value: avgTicket ? fmt(avgTicket) : "—", color: "#0284c7", bg: "#f0f9ff",  icon: <Star size={18} color="#0284c7" /> },
            { label: "Last Visit",    value: fmtDate(lastVisit),               color: "#d97706", bg: "#fffbeb",  icon: <Calendar size={18} color="#d97706" /> },
            { label: "Photos Saved",  value: totalPhotos,                      color: "#db2777", bg: "#fdf2f8",  icon: <Camera size={18} color="#db2777" /> },
          ].map((s) => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#9898b0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>

          {/* LEFT column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Visit history — appointments + POS, merged by date */}
            {(() => {
              type HistoryEntry =
                | { kind: "appt"; data: Appointment }
                | { kind: "pos";  data: Invoice };
              const entries: HistoryEntry[] = [
                ...completedAppts.map((a): HistoryEntry => ({ kind: "appt", data: a })),
                ...posInvoices.map((inv): HistoryEntry => ({ kind: "pos", data: inv })),
              ].sort((a, b) => {
                const da = a.kind === "appt" ? a.data.date : a.data.date;
                const db = b.kind === "appt" ? b.data.date : b.data.date;
                return db.localeCompare(da);
              });
              return (
                <SectionCard
                  title="Visit History"
                  sub={`${entries.length} record${entries.length !== 1 ? "s" : ""}`}
                >
                  {entries.length === 0 ? (
                    <div style={{ padding: "40px 22px", textAlign: "center", color: "#b0b0c8", fontSize: 14 }}>No completed visits yet.</div>
                  ) : (
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {entries.map((entry) => {
                        if (entry.kind === "pos") {
                          const inv = entry.data;
                          return (
                            <div key={inv.id} style={{ border: "1px solid #f0f0f8", borderRadius: 12, overflow: "hidden" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "13px 16px" }}>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 8px", borderRadius: 20, border: "1px solid #bbf7d0" }}>POS</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>
                                      {inv.items.map((it) => it.description).join(", ")}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11, color: "#9898b0" }}>
                                    {fmtDate(inv.date)} · {inv.staffName || "—"} · {inv.paymentMethod || "cash"}
                                  </div>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: "#059669", whiteSpace: "nowrap" }}>{fmt(inv.total)}</div>
                                <button
                                  onClick={() => setExpandedVisit(expandedVisit === inv.id ? null : inv.id)}
                                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
                                >
                                  {expandedVisit === inv.id ? <ChevronUp size={14} color="#9898b0" /> : <ChevronDown size={14} color="#9898b0" />}
                                </button>
                              </div>
                              {expandedVisit === inv.id && (
                                <div style={{ borderTop: "1px solid #ecfdf5", background: "#f9fffe", padding: "14px 16px" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Items</div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {inv.items.map((it, i) => (
                                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1a1a2e" }}>
                                        <span>{it.description} {it.qty > 1 ? `×${it.qty}` : ""}</span>
                                        <span style={{ fontWeight: 700 }}>{fmt(it.unitPrice * it.qty)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        const appt = entry.data;
                        const photos    = visitPhotos[appt.id] ?? {};
                        const photoCount = [photos.before, photos.after].filter(Boolean).length;
                        const isExpanded = expandedVisit === appt.id;
                        return (
                          <div key={appt.id} style={{ border: "1px solid #f0f0f8", borderRadius: 12, overflow: "hidden" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center", padding: "13px 16px", background: isExpanded ? "#faf8ff" : "#fff" }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{appt.serviceNames.join(", ")}</div>
                                <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>
                                  {fmtDate(appt.date)} · {fmtTime(appt.startTime)} · {appt.staffName || "—"}
                                </div>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "#EA580C", whiteSpace: "nowrap" }}>{fmt(appt.totalAmount)}</div>
                              <button
                                onClick={() => setExpandedVisit(isExpanded ? null : appt.id)}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 20, border: "none", cursor: "pointer", background: photoCount > 0 ? "#ffedd5" : "#f3f4f6", whiteSpace: "nowrap" }}
                              >
                                <Camera size={12} color={photoCount > 0 ? "#EA580C" : "#9ca3af"} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: photoCount > 0 ? "#EA580C" : "#9ca3af" }}>
                                  {photoCount > 0 ? `${photoCount} photo${photoCount > 1 ? "s" : ""}` : "Add photos"}
                                </span>
                              </button>
                              <button
                                onClick={() => setExpandedVisit(isExpanded ? null : appt.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
                              >
                                {isExpanded ? <ChevronUp size={14} color="#9898b0" /> : <ChevronDown size={14} color="#9898b0" />}
                              </button>
                            </div>
                            {isExpanded && (
                              <div style={{ borderTop: "1px solid #ffedd5", background: "#f9f8ff", padding: "18px 16px" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#ea580c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                                  Before &amp; After Photos
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                  {(["before", "after"] as const).map((side) => (
                                    <div key={side}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{side}</div>
                                      {photos[side] ? (
                                        <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                                          <img src={photos[side]} alt={side} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                                          <button
                                            onClick={() => handleRemovePhoto(appt.id, side)}
                                            style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                          >
                                            <X size={11} color="#fff" />
                                          </button>
                                        </div>
                                      ) : (
                                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, height: 140, borderRadius: 10, border: "2px dashed #fdba74", background: "#fff7ed", cursor: "pointer" }}>
                                          <Camera size={22} color="#fdba74" />
                                          <span style={{ fontSize: 12, fontWeight: 600, color: "#fb923c" }}>Upload {side}</span>
                                          <input type="file" accept="image/*" style={{ display: "none" }}
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(appt.id, side, f); }} />
                                        </label>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              );
            })()}

            {/* Services breakdown */}
            {topServices.length > 0 && (
              <SectionCard title="Services Used" sub={`${topServices.length} unique service${topServices.length !== 1 ? "s" : ""}`}>
                <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {topServices.map(([service, { count, spend }]) => {
                    const pct = totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0;
                    return (
                      <div key={service}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{service}</span>
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>{fmt(Math.round(spend))}</span>
                            <span style={{ fontSize: 11, color: "#9898b0" }}>{count}× · {pct}%</span>
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 99, background: "#f0f0f8" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #EA580C, #F97316)", width: `${pct}%`, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* Cancellations */}
            {cancelledAppts.length > 0 && (
              <SectionCard title="Cancellations & No-Shows" sub={`${cancelledAppts.length} record${cancelledAppts.length !== 1 ? "s" : ""}`}>
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {cancelledAppts.map((appt) => {
                    const sc = STATUS_CFG[appt.status] ?? { label: appt.status, color: "#6b7280", bg: "#f9fafb" };
                    return (
                      <div key={appt.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: sc.bg, border: `1px solid ${sc.color}22` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{appt.serviceNames.join(", ")}</div>
                          <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>{fmtDate(appt.date)}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: sc.color, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,0.8)" }}>{sc.label}</span>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

          </div>

          {/* RIGHT column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Loyalty Card */}
            {(() => {
              const ls = settingsStore.loyalty as LoyaltySettings;
              if (!ls.enabled) return null;
              const balance = client.loyaltyPoints ?? 0;
              const earned  = client.loyaltyPointsEarned ?? 0;
              const tier    = getTier(earned, ls);
              const tm      = TIER_META[tier];
              const next    = nextTierThreshold(earned, ls);
              return (
                <div style={{ background: `linear-gradient(135deg, ${tm.bg}, #fff)`, borderRadius: 16, border: `1.5px solid ${tm.color}33`, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: `1px solid ${tm.color}22`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e" }}>Loyalty Points</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tm.color, background: tm.bg, padding: "3px 10px", borderRadius: 20 }}>{tm.emoji} {tm.label}</span>
                  </div>
                  <div style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: tm.color, lineHeight: 1 }}>{balance.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#9898b0", marginTop: 3 }}>pts available · {fmt(pointsToRupees(balance, ls.rupeePerPoint))} value</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#5a5a7a" }}>{earned.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: "#9898b0" }}>lifetime earned</div>
                      </div>
                    </div>
                    {next && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: "#9898b0" }}>Progress to {TIER_META[next.tier].emoji} {TIER_META[next.tier].label}</span>
                          <span style={{ fontSize: 11, color: "#9898b0" }}>{next.needed} pts needed</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "#e8e8f0", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            background: `linear-gradient(90deg,${tm.color},${tm.color}99)`,
                            width: `${Math.min(100, (earned / (earned + next.needed)) * 100)}%`,
                          }} />
                        </div>
                      </div>
                    )}
                    {!next && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", textAlign: "center", padding: "4px 0" }}>💎 Platinum — Top tier achieved!</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Upcoming appointments */}
            <SectionCard title="Upcoming" sub={upcomingAppts.length > 0 ? `${upcomingAppts.length} scheduled` : undefined}>
              {upcomingAppts.length === 0 ? (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "#b0b0c8", fontSize: 13 }}>No upcoming appointments.</div>
              ) : (
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {upcomingAppts.map((appt) => {
                    const sc = STATUS_CFG[appt.status] ?? { label: appt.status, color: "#6b7280", bg: "#f9fafb" };
                    return (
                      <div key={appt.id} style={{ padding: "12px 14px", borderRadius: 12, background: sc.bg, border: `1px solid ${sc.color}22` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{appt.serviceNames.join(", ")}</div>
                        <div style={{ fontSize: 11, color: "#9898b0", marginTop: 3 }}>{fmtDate(appt.date)} · {fmtTime(appt.startTime)}</div>
                        <span style={{ display: "inline-block", marginTop: 7, fontSize: 10, fontWeight: 700, color: sc.color, background: "rgba(255,255,255,0.85)", padding: "2px 9px", borderRadius: 20, border: `1px solid ${sc.color}33` }}>{sc.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Client notes */}
            <SectionCard
              title="Notes"
              headerAction={
                editingNotes ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setEditingNotes(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#9898b0" }}>Cancel</button>
                    <button onClick={handleSaveNotes} style={{ background: "#EA580C", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", padding: "5px 12px", borderRadius: 8 }}>Save</button>
                  </div>
                ) : (
                  <button onClick={handleStartEditNotes} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "#EA580C" }}>
                    <Edit2 size={13} /> Edit
                  </button>
                )
              }
            >
              <div style={{ padding: "16px 20px", minHeight: 56 }}>
                {editingNotes ? (
                  <textarea
                    autoFocus
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={4}
                    placeholder="e.g. Sensitive scalp, prefers morning slots…"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }}
                  />
                ) : client.notes ? (
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "#faf8ff", border: "1px solid #ffedd5", color: "#5f5875", fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {client.notes}
                  </div>
                ) : (
                  <div style={{ color: "#b0b0c8", fontSize: 13 }}>
                    No notes added for this client.
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Edit form */}
            {editing ? (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EA580C44", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>Edit Profile</div>
                  <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={16} color="#9898b0" /></button>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {([
                    { label: "Full Name", key: "name",  type: "text" },
                    { label: "Phone",     key: "phone", type: "text" },
                    { label: "Email",     key: "email", type: "email" },
                    { label: "Date of Birth", key: "dob", type: "date" },
                  ] as const).map(({ label, key, type }) => (
                    <div key={key}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>{label}</label>
                      <input type={type} value={editForm[key]} onChange={(e) => setE(key, e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e", outline: "none", boxSizing: "border-box" }} />
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {([
                      { label: "Source", key: "source", opts: ["whatsapp","walk-in","web","manual"] },
                      { label: "Tag",    key: "tag",    opts: ["", ...Object.keys(TAG_COLORS)] },
                      { label: "Section", key: "section", opts: ["", ...getSectionOptions(getStoredClients())] },
                    ] as const).map(({ label, key, opts }) => (
                      <div key={key}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>{label}</label>
                        <select value={editForm[key]} onChange={(e) => setE(key, e.target.value)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e", outline: "none", background: "#fff" }}>
                          {opts.map((o) => <option key={o} value={o}>{o || "None"}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Notes &amp; Preferences</label>
                    <textarea value={editForm.notes} onChange={(e) => setE("notes", e.target.value)} rows={3}
                      placeholder="e.g. Sensitive scalp, prefers morning slots…"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}>Cancel</button>
                    <button onClick={handleSaveEdit} style={{ flex: 2, padding: "10px 0", borderRadius: 9, border: "none", background: "#EA580C", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Save Changes</button>
                  </div>
                </div>
              </div>
            ) : (
              /* Contact & Info */
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8e8f0", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f8" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>Contact &amp; Info</div>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <InfoRow icon={<Phone size={14} color="#9898b0" />} label="Phone">{client.phone}</InfoRow>
                  {client.email && <InfoRow icon={<Mail size={14} color="#9898b0" />} label="Email">{client.email}</InfoRow>}
                  {client.dob && <InfoRow icon={<Calendar size={14} color="#9898b0" />} label="Date of Birth">{fmtDate(client.dob)}</InfoRow>}
                  <InfoRow icon={<Heart size={14} color="#9898b0" />} label="Source">{client.source}</InfoRow>
                  <InfoRow icon={<Clock size={14} color="#9898b0" />} label="Member Since">{fmtDate(client.createdAt)}</InfoRow>
                  {client.gender && <InfoRow icon={<Users size={14} color="#9898b0" />} label="Gender">{client.gender}</InfoRow>}
                </div>
              </div>
            )}

            {/* WhatsApp marketing opt-in — governs birthday offers & cancellation win-backs only; booking confirmations and reminders always send regardless. */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8e8f0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f8" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>WhatsApp Marketing</div>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>
                    {client.whatsappOptedOut ? "Opted out of marketing messages" : "Receives marketing messages"}
                  </div>
                  <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>
                    Birthday offers and cancellation win-backs only. Booking confirmations and reminders are unaffected.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated: Client = { ...client, whatsappOptedOut: !client.whatsappOptedOut };
                    const all = getStoredClients();
                    saveClients(all.map((c) => (c.id === updated.id ? updated : c)));
                    setClient(updated);
                  }}
                  aria-label={client.whatsappOptedOut ? "Opt client back into marketing messages" : "Opt client out of marketing messages"}
                  aria-pressed={!client.whatsappOptedOut}
                  style={{ width: 40, height: 22, padding: 0, border: "none", borderRadius: 11, background: client.whatsappOptedOut ? "#e0e0ec" : "#059669", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}
                >
                  <div style={{ position: "absolute", top: 2, left: client.whatsappOptedOut ? 2 : 20, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </button>
              </div>
            </div>

            {/* Beauty Profile */}
            {profile && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8e8f0", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f8" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>Beauty Profile</div>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {profile.allergies.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca" }}>
                      <AlertTriangle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Allergies: {profile.allergies.join(", ")}</span>
                    </div>
                  )}
                  {profile.skinType && <InfoRow icon={<Scissors size={14} color="#9898b0" />} label="Skin Type">{profile.skinType}</InfoRow>}
                  {profile.nailPrefs && <InfoRow icon={<Star size={14} color="#9898b0" />} label="Nail Prefs">{profile.nailPrefs}</InfoRow>}
                  {profile.hairFormulas.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Hair Formulas</div>
                      {profile.hairFormulas.map((f, i) => (
                        <div key={i} style={{ background: "#f9f9fb", borderRadius: 8, padding: "10px 12px", marginBottom: 6, fontSize: 12, color: "#1a1a2e", lineHeight: 1.7 }}>
                          <span style={{ fontWeight: 600 }}>{f.brand}</span> · {f.shade} · {f.developer} · {f.ratio} · {f.processingTime}min
                          {f.notes && <div style={{ color: "#9898b0", marginTop: 2 }}>{f.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {profile.notes && <div style={{ fontSize: 12, color: "#6b6b8a", fontStyle: "italic" }}>{profile.notes}</div>}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
