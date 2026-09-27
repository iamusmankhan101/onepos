"use client";

/**
 * The "manager, can you approve this?" dialog: a reason, plus an owner's or
 * manager's email and password, checked by POST /api/auth/authorize without
 * signing anyone in or out. An owner or manager who is already the signed-in
 * user only gives a reason — they are the authority being asked for.
 */

import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import type { Approval } from "@/lib/restaurant";

const inp: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4",
  fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box",
};

export default function ManagerApproval({ title, detail, confirmLabel, onApproved, onClose }: {
  title: string;
  detail?: string;
  confirmLabel: string;
  onApproved: (approval: Approval) => void | Promise<void>;
  onClose: () => void;
}) {
  const user = getCurrentUser();
  const selfApproves = user?.role === "owner" || user?.role === "manager" || user?.role === "admin";
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) { setError("Give a reason."); return; }
    setBusy(true);
    setError("");
    try {
      let approvedBy = user?.ownerName || "Manager";
      if (!selfApproves) {
        const res = await fetch("/api/auth/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json() as { ok: boolean; error?: string; approver?: { name: string } };
        if (!data.ok || !data.approver) { setError(data.error || "Not approved."); return; }
        approvedBy = data.approver.name;
      }
      await onApproved({ reason: reason.trim(), approvedBy, at: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,15,30,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 24px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fef2f2", display: "grid", placeItems: "center" }}>
            <ShieldCheck size={18} color="#dc2626" />
          </div>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "#1d1d2f" }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0" }}><X size={16} /></button>
        </div>
        {detail && <div style={{ fontSize: 12, color: "#6b6b8a", lineHeight: 1.5 }}>{detail}</div>}
        <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. customer changed mind)" style={inp} />
        {!selfApproves && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Manager approval</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Manager or owner email" autoComplete="off" style={inp} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" style={inp} />
          </>
        )}
        {error && <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>{error}</div>}
        <button type="submit" disabled={busy}
          style={{ height: 42, borderRadius: 11, border: "none", background: busy ? "#e8e8f0" : "#dc2626", color: busy ? "#9999b0" : "#fff", fontSize: 13, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Checking…" : confirmLabel}
        </button>
      </form>
    </div>
  );
}
