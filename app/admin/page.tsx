"use client";

/**
 * The platform-admin console.
 *
 * Access is gated server-side in app/admin/layout.tsx and again on every
 * endpoint this page calls, so nothing here is a security boundary — it is
 * just the surface for the actions in /api/admin/*.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Building2, Check, Copy, Database, Download,
  KeyRound, LayoutGrid, Loader2, LogOut, MoreVertical, RefreshCw, Search, Shield,
  ShieldCheck, ShieldOff, Snowflake, Sparkles, Trash2, UserCheck, UserX, Users, X, Zap,
} from "lucide-react";
import type { AuditEntry, PlatformStats, PlatformUser } from "@/lib/admin-db";
import type { AuthUser } from "@/lib/auth-db";
import { signOut } from "@/lib/auth";
import Wordmark from "@/components/wordmark";
import { normalizePlanId, PLANS, type PlanId } from "@/lib/plans";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminAction =
  | "freeze" | "unfreeze" | "approve" | "reject" | "revoke-sessions"
  | "reset-password" | "delete" | "grant-admin" | "revoke-admin" | "set-plan";

type RoleFilter = "all" | "owner" | "manager" | "staff" | "admin";
type StatusFilter = "all" | "active" | "frozen" | "pending" | "rejected";
type SortKey = "newest" | "name" | "business" | "activity" | "storage";

interface ActionResult { id: string; email?: string; ok: boolean; error?: string }

interface UserDetail {
  user: PlatformUser;
  team: AuthUser[];
  dataOwnerId: string;
  breakdown: { locationId: string; entity: string; records: number; bytes: number; updatedAt: string }[];
  history: AuditEntry[];
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtWhen(value: string | null): string {
  if (!value) return "Never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / (60 * 24))}d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initialsOf(user: PlatformUser): string {
  return (user.ownerName || user.businessName || user.email)
    .split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2);
}

type Status = "frozen" | "pending" | "rejected" | "active";

function statusOf(user: PlatformUser): Status {
  if (user.accountFrozen) return "frozen";
  if (user.approvalStatus === "pending") return "pending";
  if (user.approvalStatus === "rejected") return "rejected";
  return "active";
}

const STATUS_STYLE: Record<Status, { label: string; color: string; bg: string }> = {
  active:   { label: "Active",   color: "#047857", bg: "#ecfdf5" },
  frozen:   { label: "Frozen",   color: "#1d4ed8", bg: "#eff6ff" },
  pending:  { label: "Pending",  color: "#b45309", bg: "#fffbeb" },
  rejected: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2" },
};

const ROLE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  admin:   { label: "Platform admin", color: "#7c3aed", bg: "#f5f3ff" },
  owner:   { label: "Owner",          color: "#c2410c", bg: "#fff7ed" },
  manager: { label: "Manager",        color: "#0369a1", bg: "#e0f2fe" },
  staff:   { label: "Staff",          color: "#4b5563", bg: "#f3f4f6" },
};

const ACTION_LABEL: Record<string, string> = {
  freeze: "Froze account",
  unfreeze: "Unfroze account",
  approve: "Approved account",
  reject: "Rejected account",
  "revoke-sessions": "Forced sign-out",
  "reset-password": "Reset password",
  delete: "Deleted account",
  "grant-admin": "Granted admin",
  "revoke-admin": "Removed admin",
  "set-plan": "Changed plan",
};

const PLAN_STYLE: Record<PlanId, { label: string; color: string; bg: string }> = {
  starter: { label: "Starter", color: "#6b6b8a", bg: "#f3f4f6" },
  pro:     { label: "Pro",     color: "#c2410c", bg: "#fff7ed" },
};

// ─── Small building blocks ────────────────────────────────────────────────────

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 20, background: bg,
      color, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.02em", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function StatCard({ icon, label, value, hint, tone = "#EA580C" }: {
  icon: React.ReactNode; label: string; value: string | number; hint?: string; tone?: string;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #ececf4", borderRadius: 16, padding: "14px 16px",
      boxShadow: "0 6px 18px rgba(30,20,10,0.04)", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center",
        background: `${tone}14`, color: tone, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: "#1a1a2e", lineHeight: 1.1, letterSpacing: "-0.03em" }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8b8ba3", marginTop: 2 }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: "#a5a5bb", marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

function Modal({ title, icon, children, onClose, footer, width = 460 }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode;
  onClose: () => void; footer: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,12,20,0.45)",
        display: "grid", placeItems: "center", padding: 16, backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%", maxWidth: width, background: "#fff", borderRadius: 18,
          boxShadow: "0 30px 70px rgba(20,12,8,0.3)", overflow: "hidden",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid #f0f0f6" }}>
          {icon}
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            border: "none", background: "#f5f5fa", borderRadius: 9, padding: 6, cursor: "pointer", color: "#6b6b8a",
          }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 18, overflowY: "auto" }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "13px 18px", borderTop: "1px solid #f0f0f6", background: "#fcfcfe" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminConsolePage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [adminId, setAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const [tab, setTab] = useState<"accounts" | "activity">("accounts");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [freezeFor, setFreezeFor] = useState<PlatformUser[] | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [resetFor, setResetFor] = useState<PlatformUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [issuedPassword, setIssuedPassword] = useState("");
  const [deleteFor, setDeleteFor] = useState<PlatformUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    { action: AdminAction; targets: PlatformUser[]; title: string; body: string; label: string; tone: string } | null
  >(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // ── Data ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store", credentials: "same-origin" });
      const data = await res.json() as { ok: boolean; users?: PlatformUser[]; stats?: PlatformStats; adminId?: string; error?: string };
      if (!data.ok) throw new Error(data.error || "Could not load accounts.");
      setUsers(data.users ?? []);
      setStats(data.stats ?? null);
      setAdminId(data.adminId ?? "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred a tick rather than called straight from the effect body: the same
  // pattern the dashboard layout uses, and it keeps the first paint from being
  // a render the fetch immediately invalidates.
  useEffect(() => {
    const timer = window.setTimeout(() => { load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuFor(null);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/admin/audit?limit=300", { cache: "no-store", credentials: "same-origin" });
      const data = await res.json() as { ok: boolean; entries?: AuditEntry[] };
      setAudit(data.entries ?? []);
    } catch {
      setToast({ tone: "bad", text: "Could not load the activity log." });
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "activity") return;
    const timer = window.setTimeout(() => { loadAudit(); }, 0);
    return () => window.clearTimeout(timer);
  }, [tab, loadAudit]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setMenuFor(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { cache: "no-store", credentials: "same-origin" });
      const data = await res.json() as { ok: boolean; error?: string } & UserDetail;
      if (!data.ok) throw new Error(data.error || "Could not load this account.");
      setDetail(data);
    } catch (err) {
      setToast({ tone: "bad", text: err instanceof Error ? err.message : "Could not load this account." });
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function runAction(action: AdminAction, targets: PlatformUser[], extra: { reason?: string; password?: string; plan?: PlanId } = {}) {
    if (targets.length === 0) return;
    setBusy(true);
    setMenuFor(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, userIds: targets.map((user) => user.id), ...extra }),
      });
      const data = await res.json() as {
        ok: boolean; error?: string; results?: ActionResult[]; succeeded?: number; failed?: number;
        password?: string; users?: PlatformUser[]; stats?: PlatformStats;
      };

      if (data.users) setUsers(data.users);
      if (data.stats) setStats(data.stats);

      if (!data.results) {
        setToast({ tone: "bad", text: data.error || "Action failed." });
        return;
      }

      const failures = data.results.filter((result) => !result.ok);
      if (data.password) setIssuedPassword(data.password);

      if (failures.length === 0) {
        const who = targets.length === 1 ? (targets[0].ownerName || targets[0].email) : `${targets.length} accounts`;
        setToast({ tone: "ok", text: `${ACTION_LABEL[action] ?? "Done"} — ${who}.` });
        setSelected(new Set());
      } else {
        setToast({
          tone: data.succeeded ? "ok" : "bad",
          text: `${data.succeeded ?? 0} done, ${failures.length} failed — ${failures[0].error ?? "unknown error"}`,
        });
      }
      if (detail && targets.some((target) => target.id === detail.user.id)) {
        if (action === "delete") setDetail(null);
        else openDetail(detail.user.id);
      }
    } catch {
      setToast({ tone: "bad", text: "Action failed — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  // ── Derived list ───────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (statusFilter !== "all" && statusOf(user) !== statusFilter) return false;
      if (!needle) return true;
      return [user.email, user.ownerName, user.businessName, user.phone, user.id, user.ownerBusinessName ?? ""]
        .some((field) => field.toLowerCase().includes(needle));
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name": return (a.ownerName || a.email).localeCompare(b.ownerName || b.email);
        case "business": return (a.businessName || "").localeCompare(b.businessName || "");
        case "storage": return b.storageBytes - a.storageBytes;
        case "activity": return (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "");
        default: return (b.createdAt || "").localeCompare(a.createdAt || "") || a.email.localeCompare(b.email);
      }
    });
    return sorted;
  }, [users, search, roleFilter, statusFilter, sortKey]);

  const selectedUsers = useMemo(() => users.filter((user) => selected.has(user.id)), [users, selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((user) => selected.has(user.id));

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((user) => next.delete(user.id));
      else visible.forEach((user) => next.add(user.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const columns = ["Account ID", "Name", "Email", "Phone", "Business", "Role", "Status", "Freeze reason", "Team", "Sessions", "Branches", "Data", "Last activity", "Created"];
    const rows = visible.map((user) => [
      user.id, user.ownerName, user.email, user.phone, user.businessName,
      user.role, STATUS_STYLE[statusOf(user)].label, user.freezeReason ?? "",
      user.teamSize, user.activeSessions, user.branches.join(" | "),
      user.storageBytes, user.lastActivity ?? "", user.createdAt,
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pointly-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/sign-in";
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>
      <style>{`
        .ac-row {
          display: grid;
          grid-template-columns: 34px minmax(190px, 2.2fr) minmax(140px, 1.5fr) 104px 120px 104px 44px;
          gap: 12px; align-items: center; padding: 11px 16px;
        }
        .ac-input {
          border: 1px solid #e4e4ef; border-radius: 10px; padding: 9px 11px;
          font-size: 13px; color: #1a1a2e; background: #fff; outline: none; width: 100%;
          font-family: inherit;
        }
        .ac-input:focus { border-color: #fdba74; box-shadow: 0 0 0 3px rgba(234,88,12,.1); }
        .ac-btn {
          display: inline-flex; align-items: center; gap: 7px; border-radius: 10px;
          padding: 9px 13px; font-size: 12.5px; font-weight: 700; cursor: pointer;
          border: 1px solid #e4e4ef; background: #fff; color: #43435f; white-space: nowrap;
          font-family: inherit;
        }
        .ac-btn:hover { background: #fafaff; border-color: #d6d6e6; }
        .ac-btn:disabled { opacity: .55; cursor: not-allowed; }
        .ac-btn-primary { background: var(--accent-gradient); border-color: transparent; color: #fff; }
        .ac-btn-primary:hover { filter: brightness(1.06); background: var(--accent-gradient); }
        .ac-btn-danger { color: #b91c1c; border-color: #fecaca; background: #fff; }
        .ac-btn-danger:hover { background: #fef2f2; }
        .ac-menu-item {
          display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
          border: 0; background: transparent; padding: 8px 10px; border-radius: 8px;
          font-size: 12.5px; font-weight: 650; color: #3f3f5a; cursor: pointer; font-family: inherit;
        }
        .ac-menu-item:hover { background: #f5f5fb; }
        .ac-menu-item:disabled { opacity: .4; cursor: not-allowed; }
        .ac-user-row:hover { background: #fbfbff; }
        @media (max-width: 1150px) {
          .ac-row { grid-template-columns: 34px minmax(180px, 2.2fr) minmax(130px, 1.5fr) 104px 120px 44px; }
          .ac-col-data { display: none; }
        }
        @media (max-width: 900px) {
          .ac-row { grid-template-columns: 30px 1fr 104px 118px 40px; }
          .ac-col-business { display: none; }
        }
        @media (max-width: 640px) {
          .ac-row { grid-template-columns: 28px 1fr 112px 38px; padding: 11px 12px; }
          .ac-col-role { display: none; }
        }
      `}</style>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{
        background: "#0d0d14", padding: "12px 20px", display: "flex", alignItems: "center",
        gap: 14, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 60,
      }}>
        <Wordmark variant="mark" height={24} />
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20,
          background: "rgba(124,58,237,0.16)", border: "1px solid rgba(167,139,250,0.35)",
        }}>
          <Shield size={12} color="#c4b5fd" />
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#c4b5fd", letterSpacing: "0.07em" }}>ADMIN CONSOLE</span>
        </div>

        <div style={{ flex: 1 }} />

        <Link href="/dashboard/pos" style={{
          display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none",
          color: "rgba(255,255,255,.8)", fontSize: 12, fontWeight: 650,
          border: "1px solid #26263a", borderRadius: 9, padding: "7px 11px",
        }}>
          <ArrowLeft size={13} /> Back to POS
        </Link>
        <button type="button" onClick={handleSignOut} className="ac-btn" style={{
          background: "transparent", border: "1px solid #26263a", color: "#fca5a5",
        }}>
          <LogOut size={13} /> Sign out
        </button>
      </header>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 16px 80px" }}>
        {/* ── Heading ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#1a1a2e", letterSpacing: "-0.04em" }}>
              Accounts
            </h1>
            <div style={{ fontSize: 12, color: "#9898b0", fontWeight: 600, marginTop: 4 }}>
              Every login on the platform — business owners, their managers and staff, and other platform admins.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ac-btn" onClick={exportCsv} disabled={visible.length === 0}>
              <Download size={14} /> Export CSV
            </button>
            <button type="button" className="ac-btn" onClick={() => { setLoading(true); load(); if (tab === "activity") loadAudit(); }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard icon={<Users size={17} />} label="Login accounts" value={stats.total} hint={`${stats.newThisWeek} added this week`} />
            <StatCard icon={<Building2 size={17} />} label="Businesses" value={stats.owners} hint={`${stats.managers + stats.staff} team logins`} tone="#0369a1" />
            <StatCard icon={<Snowflake size={17} />} label="Frozen" value={stats.frozen} hint={stats.rejected ? `${stats.rejected} rejected` : "None rejected"} tone="#1d4ed8" />
            <StatCard icon={<UserCheck size={17} />} label="Awaiting approval" value={stats.pending} hint={stats.pending ? "Needs a decision" : "All clear"} tone="#b45309" />
            <StatCard icon={<Zap size={17} />} label="Signed in now" value={stats.activeSessions} hint="Live sessions" tone="#047857" />
            <StatCard icon={<Database size={17} />} label="Stored data" value={fmtBytes(stats.storageBytes)} hint="Across all businesses" tone="#7c3aed" />
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid #e8e8f2" }}>
          {([
            { key: "accounts", label: "Accounts", Icon: LayoutGrid },
            { key: "activity", label: "Activity log", Icon: Shield },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                border: "none", background: "transparent", cursor: "pointer", padding: "9px 13px",
                display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontFamily: "inherit",
                fontWeight: 800, color: tab === key ? "#c2410c" : "#8b8ba3",
                borderBottom: tab === key ? "2px solid #EA580C" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12,
            background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
            fontSize: 12.5, fontWeight: 650, marginBottom: 14,
          }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {tab === "accounts" ? (
          <>
            {/* ── Filters ────────────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
                <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#a5a5bb" }} />
                <input
                  className="ac-input"
                  style={{ paddingLeft: 34 }}
                  placeholder="Search name, email, business, phone or account id"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select className="ac-input" style={{ width: "auto", minWidth: 130, cursor: "pointer" }}
                value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} aria-label="Filter by role">
                <option value="all">All roles</option>
                <option value="owner">Owners</option>
                <option value="manager">Managers</option>
                <option value="staff">Staff</option>
                <option value="admin">Platform admins</option>
              </select>
              <select className="ac-input" style={{ width: "auto", minWidth: 130, cursor: "pointer" }}
                value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="frozen">Frozen</option>
                <option value="pending">Awaiting approval</option>
                <option value="rejected">Rejected</option>
              </select>
              <select className="ac-input" style={{ width: "auto", minWidth: 140, cursor: "pointer" }}
                value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="Sort accounts">
                <option value="newest">Newest first</option>
                <option value="name">Name A–Z</option>
                <option value="business">Business A–Z</option>
                <option value="activity">Recently active</option>
                <option value="storage">Most data</option>
              </select>
            </div>

            {/* ── Bulk bar ───────────────────────────────────────────────── */}
            {selectedUsers.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "11px 14px",
                borderRadius: 13, background: "#fff7ed", border: "1px solid #fed7aa", marginBottom: 12,
              }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#9a3412" }}>
                  {selectedUsers.length} selected
                </span>
                <div style={{ flex: 1 }} />
                <button type="button" className="ac-btn" disabled={busy} onClick={() => { setFreezeReason(""); setFreezeFor(selectedUsers); }}>
                  <Snowflake size={13} /> Freeze
                </button>
                <button type="button" className="ac-btn" disabled={busy} onClick={() => runAction("unfreeze", selectedUsers)}>
                  <Check size={13} /> Unfreeze
                </button>
                <button type="button" className="ac-btn" disabled={busy} onClick={() => runAction("approve", selectedUsers)}>
                  <UserCheck size={13} /> Approve
                </button>
                <button type="button" className="ac-btn" disabled={busy} onClick={() => runAction("revoke-sessions", selectedUsers)}>
                  <LogOut size={13} /> Force sign-out
                </button>
                <button type="button" className="ac-btn" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            )}

            {/* ── Table ──────────────────────────────────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid #ececf4", borderRadius: 16, overflow: "hidden", boxShadow: "0 6px 18px rgba(30,20,10,0.04)" }}>
              <div className="ac-row" style={{
                background: "#fafafd", borderBottom: "1px solid #ececf4",
                fontSize: 10.5, fontWeight: 800, color: "#8b8ba3", letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all shown" style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#EA580C" }} />
                <span>Account</span>
                <span className="ac-col-business">Business</span>
                <span className="ac-col-role">Role</span>
                <span>Status</span>
                <span className="ac-col-data">Data / activity</span>
                <span />
              </div>

              {loading ? (
                <div style={{ padding: "60px 20px", display: "grid", placeItems: "center", color: "#9898b0", fontSize: 13, fontWeight: 650, gap: 10 }}>
                  <Loader2 size={20} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                  Loading accounts…
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : visible.length === 0 ? (
                <div style={{ padding: "56px 20px", textAlign: "center", color: "#9898b0" }}>
                  <Users size={26} style={{ opacity: 0.4 }} />
                  <div style={{ fontSize: 13.5, fontWeight: 750, color: "#6b6b8a", marginTop: 10 }}>No accounts match these filters</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing the search or switching the role and status filters.</div>
                </div>
              ) : (
                visible.map((user) => {
                  const status = STATUS_STYLE[statusOf(user)];
                  const role = ROLE_STYLE[user.role] ?? ROLE_STYLE.staff;
                  const isSelf = user.id === adminId;
                  const isTeamLogin = Boolean(user.businessOwnerId);
                  const plan = PLANS[normalizePlanId(user.plan)];
                  return (
                    <div key={user.id} className="ac-row ac-user-row" style={{ borderBottom: "1px solid #f3f3f9", position: "relative" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(user.id)}
                        onChange={() => toggleOne(user.id)}
                        aria-label={`Select ${user.email}`}
                        style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#EA580C" }}
                      />

                      {/* Account */}
                      <button
                        type="button"
                        onClick={() => openDetail(user.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                      >
                        <div style={{
                          width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                          background: user.role === "admin" ? "linear-gradient(135deg,#6d28d9,#a78bfa)" : "linear-gradient(135deg,#9A3412,#F97316)",
                          color: "#fff", fontSize: 11.5, fontWeight: 800,
                        }}>
                          {initialsOf(user)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 750, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {user.ownerName || "—"}{isSelf && <span style={{ color: "#c2410c", fontWeight: 800 }}> · you</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: "#9898b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {user.email}
                          </div>
                        </div>
                      </button>

                      {/* Business */}
                      <div className="ac-col-business" style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#43435f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {isTeamLogin ? (user.ownerBusinessName || "—") : (user.businessName || "—")}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          {!isTeamLogin && user.role !== "admin" && <Pill {...PLAN_STYLE[plan.id]} />}
                          <span style={{ fontSize: 11, color: "#a5a5bb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isTeamLogin
                              ? `Branch: ${user.locationId || "main"}`
                              : user.teamSize > 0 ? `${user.teamSize} team login${user.teamSize === 1 ? "" : "s"}` : "No team logins"}
                          </span>
                        </div>
                      </div>

                      {/* Role */}
                      <div className="ac-col-role"><Pill {...role} /></div>

                      {/* Status */}
                      <div style={{ minWidth: 0 }}>
                        <Pill {...status} />
                        {user.accountFrozen && user.freezeReason && (
                          <div title={user.freezeReason} style={{ fontSize: 10.5, color: "#a5a5bb", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {user.freezeReason}
                          </div>
                        )}
                        {!user.accountFrozen && user.activeSessions > 0 && (
                          <div style={{ fontSize: 10.5, color: "#047857", marginTop: 3, fontWeight: 700 }}>
                            {user.activeSessions} signed in
                          </div>
                        )}
                      </div>

                      {/* Data / activity */}
                      <div className="ac-col-data" style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#43435f" }}>
                          {isTeamLogin ? "—" : fmtBytes(user.storageBytes)}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#a5a5bb", marginTop: 2 }}>
                          {isTeamLogin ? `Joined ${fmtDate(user.createdAt)}` : fmtWhen(user.lastActivity)}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ position: "relative", justifySelf: "end" }}>
                        <button
                          type="button"
                          aria-label={`Actions for ${user.email}`}
                          onClick={() => setMenuFor((current) => (current === user.id ? null : user.id))}
                          style={{ border: "1px solid #ececf4", background: "#fff", borderRadius: 9, padding: "6px 7px", cursor: "pointer", color: "#6b6b8a" }}
                        >
                          <MoreVertical size={14} />
                        </button>

                        {menuFor === user.id && (
                          <div ref={menuRef} style={{
                            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 80, width: 232,
                            background: "#fff", border: "1px solid #ececf4", borderRadius: 12, padding: 6,
                            boxShadow: "0 18px 42px rgba(20,12,8,0.18)",
                          }}>
                            <button type="button" className="ac-menu-item" onClick={() => openDetail(user.id)}>
                              <Search size={13} /> View details
                            </button>

                            {user.accountFrozen ? (
                              <button type="button" className="ac-menu-item" disabled={busy} onClick={() => runAction("unfreeze", [user])}>
                                <Check size={13} color="#047857" /> Unfreeze account
                              </button>
                            ) : (
                              <button type="button" className="ac-menu-item" disabled={busy || isSelf || user.role === "admin"}
                                onClick={() => { setFreezeReason(""); setFreezeFor([user]); setMenuFor(null); }}>
                                <Snowflake size={13} color="#1d4ed8" /> Freeze account
                              </button>
                            )}

                            {user.approvalStatus !== "approved" && (
                              <button type="button" className="ac-menu-item" disabled={busy} onClick={() => runAction("approve", [user])}>
                                <UserCheck size={13} color="#047857" /> Approve
                              </button>
                            )}
                            {user.approvalStatus !== "rejected" && (
                              <button type="button" className="ac-menu-item" disabled={busy || isSelf || user.role === "admin"}
                                onClick={() => setConfirmAction({
                                  action: "reject", targets: [user], title: "Reject this account?",
                                  body: `${user.email} will be signed out and blocked from signing in again until you approve them.`,
                                  label: "Reject account", tone: "#b91c1c",
                                })}>
                                <UserX size={13} color="#b91c1c" /> Reject
                              </button>
                            )}

                            <button type="button" className="ac-menu-item" disabled={busy || user.activeSessions === 0}
                              onClick={() => runAction("revoke-sessions", [user])}>
                              <LogOut size={13} /> Force sign-out{user.activeSessions ? ` (${user.activeSessions})` : ""}
                            </button>

                            <button type="button" className="ac-menu-item" disabled={busy}
                              onClick={() => { setResetPassword(""); setIssuedPassword(""); setResetFor(user); setMenuFor(null); }}>
                              <KeyRound size={13} /> Reset password
                            </button>

                            {!isTeamLogin && user.role !== "admin" && (
                              <button type="button" className="ac-menu-item" disabled={busy}
                                onClick={() => runAction("set-plan", [user], { plan: plan.id === "pro" ? "starter" : "pro" })}>
                                <Sparkles size={13} color="#c2410c" />
                                {plan.id === "pro" ? `Move to ${PLANS.starter.name} plan` : `Move to ${PLANS.pro.name} plan`}
                              </button>
                            )}

                            <div style={{ height: 1, background: "#f0f0f6", margin: "5px 2px" }} />

                            {user.role === "admin" ? (
                              <button type="button" className="ac-menu-item" disabled={busy || isSelf}
                                onClick={() => setConfirmAction({
                                  action: "revoke-admin", targets: [user], title: "Remove platform admin rights?",
                                  body: `${user.email} goes back to being a normal business owner and loses access to this console.`,
                                  label: "Remove admin", tone: "#b45309",
                                })}>
                                <ShieldOff size={13} color="#b45309" /> Remove admin rights
                              </button>
                            ) : user.role === "owner" ? (
                              <button type="button" className="ac-menu-item" disabled={busy}
                                onClick={() => setConfirmAction({
                                  action: "grant-admin", targets: [user], title: "Make this account a platform admin?",
                                  body: `${user.email} will be able to see every business on the platform and freeze, approve or delete any account.`,
                                  label: "Grant admin", tone: "#7c3aed",
                                })}>
                                <ShieldCheck size={13} color="#7c3aed" /> Make platform admin
                              </button>
                            ) : null}

                            <button type="button" className="ac-menu-item" disabled={busy || isSelf || user.role === "admin"}
                              style={{ color: "#b91c1c" }}
                              onClick={() => { setDeleteConfirm(""); setDeleteFor(user); setMenuFor(null); }}>
                              <Trash2 size={13} /> Delete account
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {!loading && visible.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#a5a5bb", fontWeight: 650, marginTop: 10 }}>
                Showing {visible.length} of {users.length} accounts
              </div>
            )}
          </>
        ) : (
          /* ── Activity log ─────────────────────────────────────────────── */
          <div style={{ background: "#fff", border: "1px solid #ececf4", borderRadius: 16, overflow: "hidden", boxShadow: "0 6px 18px rgba(30,20,10,0.04)" }}>
            {auditLoading ? (
              <div style={{ padding: "56px 20px", textAlign: "center", color: "#9898b0", fontSize: 13, fontWeight: 650 }}>Loading activity…</div>
            ) : audit.length === 0 ? (
              <div style={{ padding: "56px 20px", textAlign: "center", color: "#9898b0" }}>
                <Shield size={26} style={{ opacity: 0.4 }} />
                <div style={{ fontSize: 13.5, fontWeight: 750, color: "#6b6b8a", marginTop: 10 }}>No admin actions yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Freezes, approvals, password resets and deletions all appear here.</div>
              </div>
            ) : (
              audit.map((entry) => (
                <div key={entry.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px",
                  borderBottom: "1px solid #f3f3f9",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center",
                    background: "#f5f5fb", color: "#6b6b8a",
                  }}>
                    <Shield size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 750, color: "#1a1a2e" }}>
                      {ACTION_LABEL[entry.action] ?? entry.action}
                      {entry.targetEmail && <span style={{ color: "#6b6b8a", fontWeight: 650 }}> · {entry.targetEmail}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#9898b0", marginTop: 2 }}>
                      by {entry.actorEmail}{entry.detail ? ` — ${entry.detail}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#a5a5bb", fontWeight: 650, whiteSpace: "nowrap" }}>
                    {fmtWhen(entry.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Freeze modal ───────────────────────────────────────────────────── */}
      {freezeFor && (
        <Modal
          title={freezeFor.length === 1 ? "Freeze this account" : `Freeze ${freezeFor.length} accounts`}
          icon={<Snowflake size={17} color="#1d4ed8" />}
          onClose={() => setFreezeFor(null)}
          footer={
            <>
              <button type="button" className="ac-btn" onClick={() => setFreezeFor(null)}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy}
                onClick={async () => { const targets = freezeFor; setFreezeFor(null); await runAction("freeze", targets, { reason: freezeReason }); }}>
                <Snowflake size={13} /> Freeze
              </button>
            </>
          }
        >
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#6b6b8a", lineHeight: 1.65 }}>
            {freezeFor.length === 1
              ? <><strong style={{ color: "#1a1a2e" }}>{freezeFor[0].email}</strong> is signed out of every device immediately and can&apos;t sign in again until you unfreeze them. Their data is untouched.</>
              : "These accounts are signed out of every device immediately and can't sign in again until you unfreeze them. Their data is untouched."}
          </p>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#6b6b8a", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Reason (shown to them at sign-in)
          </label>
          <input
            className="ac-input"
            autoFocus
            maxLength={300}
            placeholder="e.g. Unpaid invoice for March"
            value={freezeReason}
            onChange={(event) => setFreezeReason(event.target.value)}
          />
          {freezeFor.some((user) => user.role === "owner" && user.teamSize > 0) && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 11.5, color: "#92400e", lineHeight: 1.55 }}>
              Team logins under a frozen business owner keep working. Freeze them separately if you need the whole business locked out.
            </div>
          )}
        </Modal>
      )}

      {/* ── Reset password modal ───────────────────────────────────────────── */}
      {resetFor && (
        <Modal
          title="Reset password"
          icon={<KeyRound size={17} color="#c2410c" />}
          onClose={() => { setResetFor(null); setIssuedPassword(""); }}
          footer={
            issuedPassword ? (
              <button type="button" className="ac-btn ac-btn-primary" onClick={() => { setResetFor(null); setIssuedPassword(""); }}>Done</button>
            ) : (
              <>
                <button type="button" className="ac-btn" onClick={() => setResetFor(null)}>Cancel</button>
                <button type="button" className="ac-btn ac-btn-primary" disabled={busy || (resetPassword.length > 0 && resetPassword.length < 8)}
                  onClick={() => runAction("reset-password", [resetFor], resetPassword ? { password: resetPassword } : {})}>
                  <KeyRound size={13} /> {resetPassword ? "Set password" : "Generate password"}
                </button>
              </>
            )
          }
        >
          {issuedPassword ? (
            <>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b8a", lineHeight: 1.65 }}>
                Password changed for <strong style={{ color: "#1a1a2e" }}>{resetFor.email}</strong> and every device signed out.
                This is the only time it is shown — pass it on now.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 12, background: "#f8f8fc", border: "1px dashed #d6d6e6" }}>
                <code style={{ flex: 1, fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", color: "#1a1a2e", wordBreak: "break-all" }}>{issuedPassword}</code>
                <button type="button" className="ac-btn" onClick={() => {
                  navigator.clipboard?.writeText(issuedPassword)
                    .then(() => setToast({ tone: "ok", text: "Password copied." }))
                    .catch(() => setToast({ tone: "bad", text: "Copy failed — select it by hand." }));
                }}>
                  <Copy size={13} /> Copy
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#6b6b8a", lineHeight: 1.65 }}>
                Sets a new password for <strong style={{ color: "#1a1a2e" }}>{resetFor.email}</strong> and signs every device out.
                Leave the field empty to generate one.
              </p>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#6b6b8a", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                New password (optional)
              </label>
              <input
                className="ac-input"
                autoFocus
                type="text"
                placeholder="Leave empty to generate a strong one"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
              {resetPassword.length > 0 && resetPassword.length < 8 && (
                <div style={{ fontSize: 11.5, color: "#b91c1c", fontWeight: 650, marginTop: 6 }}>At least 8 characters.</div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ── Delete modal ───────────────────────────────────────────────────── */}
      {deleteFor && (
        <Modal
          title="Delete this account"
          icon={<Trash2 size={17} color="#b91c1c" />}
          onClose={() => setDeleteFor(null)}
          footer={
            <>
              <button type="button" className="ac-btn" onClick={() => setDeleteFor(null)}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-danger" disabled={busy || deleteConfirm.trim().toLowerCase() !== deleteFor.email}
                onClick={async () => { const target = deleteFor; setDeleteFor(null); await runAction("delete", [target]); }}>
                <Trash2 size={13} /> Delete permanently
              </button>
            </>
          }
        >
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b8a", lineHeight: 1.65 }}>
            Deletes the login <strong style={{ color: "#1a1a2e" }}>{deleteFor.email}</strong>
            {deleteFor.teamSize > 0 && <> and the <strong style={{ color: "#1a1a2e" }}>{deleteFor.teamSize}</strong> team login{deleteFor.teamSize === 1 ? "" : "s"} under it</>}.
            This can&apos;t be undone.
          </p>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 11.5, color: "#1e40af", lineHeight: 1.55, marginBottom: 14 }}>
            Their sales, invoices and client records stay in the database — deleting the login doesn&apos;t erase the business&apos;s data.
            Freezing is the reversible option if you only need to cut off access.
          </div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#6b6b8a", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Type <span style={{ color: "#b91c1c" }}>{deleteFor.email}</span> to confirm
          </label>
          <input className="ac-input" autoFocus value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} />
        </Modal>
      )}

      {/* ── Generic confirm ────────────────────────────────────────────────── */}
      {confirmAction && (
        <Modal
          title={confirmAction.title}
          icon={<AlertTriangle size={17} color={confirmAction.tone} />}
          onClose={() => setConfirmAction(null)}
          footer={
            <>
              <button type="button" className="ac-btn" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button type="button" className="ac-btn" disabled={busy}
                style={{ background: confirmAction.tone, borderColor: confirmAction.tone, color: "#fff" }}
                onClick={async () => { const pending = confirmAction; setConfirmAction(null); await runAction(pending.action, pending.targets); }}>
                {confirmAction.label}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 12.5, color: "#6b6b8a", lineHeight: 1.65 }}>{confirmAction.body}</p>
        </Modal>
      )}

      {/* ── Detail drawer ──────────────────────────────────────────────────── */}
      {(detail || detailLoading) && (
        <div
          onClick={() => { setDetail(null); setDetailLoading(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(15,12,20,0.4)", display: "flex", justifyContent: "flex-end" }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, 100%)", background: "#fff", height: "100%", overflowY: "auto",
              boxShadow: "-20px 0 60px rgba(20,12,8,0.25)",
            }}
          >
            {detailLoading || !detail ? (
              <div style={{ padding: 40, color: "#9898b0", fontSize: 13, fontWeight: 650 }}>Loading account…</div>
            ) : (
              <>
                <div style={{ padding: "18px 20px", borderBottom: "1px solid #f0f0f6", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                    background: detail.user.role === "admin" ? "linear-gradient(135deg,#6d28d9,#a78bfa)" : "linear-gradient(135deg,#9A3412,#F97316)",
                    color: "#fff", fontSize: 14, fontWeight: 800,
                  }}>
                    {initialsOf(detail.user)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 850, color: "#1a1a2e", letterSpacing: "-0.02em" }}>{detail.user.ownerName || detail.user.email}</div>
                    <div style={{ fontSize: 12, color: "#9898b0", marginTop: 2, wordBreak: "break-all" }}>{detail.user.email}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <Pill {...(ROLE_STYLE[detail.user.role] ?? ROLE_STYLE.staff)} />
                      <Pill {...STATUS_STYLE[statusOf(detail.user)]} />
                    </div>
                  </div>
                  <button type="button" onClick={() => setDetail(null)} aria-label="Close details" style={{
                    border: "none", background: "#f5f5fa", borderRadius: 9, padding: 6, cursor: "pointer", color: "#6b6b8a",
                  }}>
                    <X size={15} />
                  </button>
                </div>

                <div style={{ padding: 20, display: "grid", gap: 20 }}>
                  <section>
                    <div style={{ fontSize: 10.5, fontWeight: 850, color: "#8b8ba3", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 9 }}>Account</div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {([
                        ["Business", detail.user.businessName || "—"],
                        ["Phone", detail.user.phone || "—"],
                        ["Branch", detail.user.locationId || (detail.user.businessOwnerId ? "main" : "All branches")],
                        ["Email verified", detail.user.emailVerified ? "Yes" : "No"],
                        ["Live sessions", String(detail.user.activeSessions ?? 0)],
                        ["Created", fmtDate(detail.user.createdAt)],
                        ["Account id", detail.user.id],
                        ...(detail.user.accountFrozen ? [["Freeze reason", detail.user.freezeReason || "No reason recorded"]] : []),
                        ...(detail.user.permissions?.length ? [["Permissions", detail.user.permissions.join(", ")]] : []),
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} style={{ display: "flex", gap: 12, fontSize: 12.5 }}>
                          <div style={{ width: 120, flexShrink: 0, color: "#9898b0", fontWeight: 650 }}>{label}</div>
                          <div style={{ color: "#1a1a2e", fontWeight: 650, wordBreak: "break-word" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {detail.team.length > 0 && (
                    <section>
                      <div style={{ fontSize: 10.5, fontWeight: 850, color: "#8b8ba3", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 9 }}>
                        Team logins ({detail.team.length})
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {detail.team.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => openDetail(member.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 10,
                              border: "1px solid #ececf4", background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 750, color: "#1a1a2e" }}>{member.ownerName}</div>
                              <div style={{ fontSize: 11, color: "#9898b0" }}>{member.email} · {member.locationId || "main"}</div>
                            </div>
                            {member.accountFrozen && <Pill {...STATUS_STYLE.frozen} />}
                            <Pill {...(ROLE_STYLE[member.role] ?? ROLE_STYLE.staff)} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <div style={{ fontSize: 10.5, fontWeight: 850, color: "#8b8ba3", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 9 }}>
                      Business data{detail.user.businessOwnerId ? " (owner's)" : ""}
                    </div>
                    {detail.breakdown.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "#9898b0" }}>No records stored yet.</div>
                    ) : (
                      <div style={{ border: "1px solid #ececf4", borderRadius: 12, overflow: "hidden" }}>
                        {detail.breakdown.map((row) => (
                          <div key={`${row.locationId}/${row.entity}`} style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "8px 11px",
                            borderBottom: "1px solid #f5f5fb", fontSize: 12,
                          }}>
                            <div style={{ flex: 1, fontWeight: 700, color: "#43435f" }}>
                              {row.entity.replace(/_/g, " ")}
                              <span style={{ color: "#a5a5bb", fontWeight: 600 }}> · {row.locationId}</span>
                            </div>
                            <div style={{ color: "#1a1a2e", fontWeight: 750 }}>{row.records.toLocaleString()}</div>
                            <div style={{ width: 66, textAlign: "right", color: "#a5a5bb" }}>{fmtBytes(row.bytes)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <div style={{ fontSize: 10.5, fontWeight: 850, color: "#8b8ba3", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 9 }}>
                      Admin history
                    </div>
                    {detail.history.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "#9898b0" }}>Nothing has been done to this account yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 7 }}>
                        {detail.history.map((entry) => (
                          <div key={entry.id} style={{ fontSize: 12, color: "#6b6b8a" }}>
                            <strong style={{ color: "#1a1a2e" }}>{ACTION_LABEL[entry.action] ?? entry.action}</strong>
                            {" — "}{fmtWhen(entry.createdAt)} by {entry.actorEmail}
                            {entry.detail && <div style={{ fontSize: 11.5, color: "#a5a5bb" }}>{entry.detail}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #f0f0f6", paddingTop: 16 }}>
                    {detail.user.accountFrozen ? (
                      <button type="button" className="ac-btn ac-btn-primary" disabled={busy}
                        onClick={() => runAction("unfreeze", [detail.user])}>
                        <Check size={13} /> Unfreeze
                      </button>
                    ) : (
                      <button type="button" className="ac-btn" disabled={busy || detail.user.id === adminId || detail.user.role === "admin"}
                        onClick={() => { setFreezeReason(""); setFreezeFor([detail.user]); }}>
                        <Snowflake size={13} /> Freeze
                      </button>
                    )}
                    {detail.user.approvalStatus !== "approved" && (
                      <button type="button" className="ac-btn" disabled={busy} onClick={() => runAction("approve", [detail.user])}>
                        <UserCheck size={13} /> Approve
                      </button>
                    )}
                    <button type="button" className="ac-btn" disabled={busy || detail.user.activeSessions === 0}
                      onClick={() => runAction("revoke-sessions", [detail.user])}>
                      <LogOut size={13} /> Force sign-out
                    </button>
                    <button type="button" className="ac-btn" disabled={busy}
                      onClick={() => { setResetPassword(""); setIssuedPassword(""); setResetFor(detail.user); }}>
                      <KeyRound size={13} /> Reset password
                    </button>
                  </section>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 300,
            display: "flex", alignItems: "center", gap: 9, padding: "11px 16px", borderRadius: 12,
            background: toast.tone === "ok" ? "#052e1a" : "#3f1212", color: "#fff",
            fontSize: 12.5, fontWeight: 700, boxShadow: "0 18px 40px rgba(10,6,4,0.35)", maxWidth: "92vw",
          }}
        >
          {toast.tone === "ok" ? <Check size={15} color="#6ee7b7" /> : <AlertTriangle size={15} color="#fca5a5" />}
          {toast.text}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.6)", cursor: "pointer", padding: 0, marginLeft: 4 }}>
            <X size={13} />
          </button>
        </div>
      )}

      {busy && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 400,
          background: "linear-gradient(90deg,#9A3412,#F97316,#9A3412)", backgroundSize: "200% 100%",
          animation: "acbar 1.1s linear infinite",
        }}>
          <style>{`@keyframes acbar { 0% { background-position: 0% 0; } 100% { background-position: 200% 0; } }`}</style>
        </div>
      )}
    </div>
  );
}
