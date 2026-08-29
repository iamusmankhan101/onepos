"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Store, Clock, Shield, Smartphone, ChevronRight, Check, KeyRound, PrinterIcon } from "lucide-react";
import { settingsStore, saveSettings } from "@/lib/settings-store";
import { getActiveLocationFilter, getDefaultLocationId, getBusinessLocations, locationName, updateActiveLocationDetails, type BusinessLocation } from "@/lib/locations";
import { updateCurrentPassword, type AuthUser } from "@/lib/auth";
import { getStoredStaff } from "@/lib/storage";
import type { Staff } from "@/lib/types";
import { fillTemplate, sanitizeForLink } from "@/lib/whatsapp-link";
import PageTitle from "@/components/page-title";

const SECTIONS = [
  { id: "business",   label: "Business Profile", icon: Store },
  { id: "hours",   label: "Business Hours",  icon: Clock },
  { id: "whatsapp", label: "WhatsApp Receipt", icon: Smartphone },
  { id: "printer", label: "Thermal Printer", icon: PrinterIcon },
  { id: "access",  label: "Staff Access",    icon: KeyRound },
  { id: "security", label: "Security",       icon: Shield },
];

// Only the modules this build ships. "dashboard" is added server-side to every
// staff login (it is what /dashboard itself resolves to), so it isn't listed.
const PERMISSION_OPTIONS = [
  { key: "pos",       label: "POS"       },
  { key: "products",  label: "Products"  },
  { key: "clients",   label: "Clients"   },
  { key: "invoices",  label: "Invoices"  },
  { key: "revenue",   label: "Revenue"   },
  { key: "cash-flow", label: "Cash Flow" },
  { key: "staff",     label: "Staff"     },
];
const DEFAULT_STAFF_PERMISSIONS = ["pos", "products", "clients", "invoices"];

const inp: CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 12,
  border: "1px solid #e3e0eb", fontSize: 13, color: "#1a1a2e",
  outline: "none", background: "#fff", boxSizing: "border-box",
  transition: "border-color 0.15s", boxShadow: "0 2px 8px rgba(0,0,0,0.01)",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "#9898b0", marginBottom: 2 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{ width: 44, height: 24, borderRadius: 12, background: value ? "var(--accent)" : "#e3e0eb", cursor: "pointer", position: "relative", transition: "all 0.25s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "all 0.25s", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }} />
    </div>
  );
}

function SavedBanner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#ecfdf5", borderRadius: 8, fontSize: 13, color: "#059669", fontWeight: 500 }}>
      <Check size={14} /> Changes saved successfully.
    </div>
  );
}

function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #f0f0f5", marginTop: 16 }}>
      <button onClick={onSave} style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 750, color: "#fff", cursor: "pointer", transition: "all 0.15s", boxShadow: "0 4px 14px var(--accent-glow)" }} className="hover-scale">
        Save Changes
      </button>
    </div>
  );
}

function BusinessProfile() {
  const [form, setForm] = useState({ ...settingsStore.business });
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState("");
  const activeLocation = getActiveLocationFilter();
  const [branchName, setBranchName] = useState(() => locationName(activeLocation));
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  // Stored inline as a data URL: settings ride along with the rest of the
  // business settings blob to Turso, so there is no separate file host to keep
  // in sync — hence the size cap.
  function onLogoPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 400 * 1024) { setLogoError("That image is larger than 400 KB. Please pick a smaller one."); return; }
    const reader = new FileReader();
    reader.onload = () => { setLogoError(""); set("logo", String(reader.result || "")); };
    reader.onerror = () => setLogoError("Could not read that file.");
    reader.readAsDataURL(file);
  }
  const save = () => {
    Object.assign(settingsStore.business, form);
    updateActiveLocationDetails({ name: branchName, address: form.address, city: form.city });
    saveSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {saved && <SavedBanner />}
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fff7ed", color: "#c2410c", fontSize: 12, fontWeight: 700 }}>
        Editing location: {branchName || locationName(activeLocation)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Branch Name"><input value={branchName} onChange={(e) => setBranchName(e.target.value)} style={inp} /></Field>
        <Field label="Business Name"><input value={form.name} onChange={(e) => set("name", e.target.value)} style={inp} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inp} /></Field>
        <Field label="Email"><input value={form.email} onChange={(e) => set("email", e.target.value)} style={inp} /></Field>
        <Field label="City"><input value={form.city} onChange={(e) => set("city", e.target.value)} style={inp} /></Field>
      </div>
      <Field label="Address"><input value={form.address} onChange={(e) => set("address", e.target.value)} style={inp} /></Field>
      <Field label="Logo" hint="Shown in the sidebar and printed on invoices. PNG or JPG, up to 400 KB.">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, border: "1px solid #e3e0eb", background: "#f9f9fb", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
            {form.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={form.logo} alt="Business logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Store size={18} color="#c0c0d8" />}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoPicked} style={{ fontSize: 12, color: "#6b6b8a" }} />
          {form.logo && (
            <button type="button" onClick={() => set("logo", "")}
              style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #e3e0eb", background: "#fff", fontSize: 12, fontWeight: 600, color: "#9898b0", cursor: "pointer" }}>
              Remove
            </button>
          )}
        </div>
        {logoError && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>{logoError}</div>}
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)} style={inp}>
            <option value="PKR">PKR — Pakistani Rupee</option>
            <option value="USD">USD — US Dollar</option>
            <option value="AED">AED — UAE Dirham</option>
          </select>
        </Field>
        <Field label="Timezone">
          <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} style={inp}>
            <option value="Asia/Karachi">Asia/Karachi (PKT +5:00)</option>
            <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
            <option value="UTC">UTC</option>
          </select>
        </Field>
      </div>
      <SaveBar onSave={save} />
    </div>
  );
}

function BusinessHours() {
  const [hours, setHours] = useState(() => (settingsStore.hours as any[]).map((h: any) => ({ ...h })));
  const [saved, setSaved] = useState(false);
  const toggle = (i: number) => setHours((h: any[]) => h.map((r: any, idx: number) => idx === i ? { ...r, open: !r.open } : r));
  const setTime = (i: number, k: "from" | "to", v: string) => setHours((h: any[]) => h.map((r: any, idx: number) => idx === i ? { ...r, [k]: v } : r));
  const save = () => { hours.forEach((h: any, i: number) => Object.assign(settingsStore.hours[i], h)); saveSettings(); setSaved(true); setTimeout(() => setSaved(false), 3000); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {saved && <SavedBanner />}
      {hours.map((row: any, i: number) => (
        <div key={row.day} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: "#f9f9fb", borderRadius: 10 }}>
          <div style={{ width: 100, fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{row.day}</div>
          <Toggle value={row.open} onChange={() => toggle(i)} />
          {row.open ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <input type="time" value={row.from} onChange={(e) => setTime(i, "from", e.target.value)} style={{ ...inp, width: 120 }} />
              <span style={{ fontSize: 12, color: "#9898b0" }}>to</span>
              <input type="time" value={row.to} onChange={(e) => setTime(i, "to", e.target.value)} style={{ ...inp, width: 120 }} />
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "#b0b0c8", fontStyle: "italic" }}>Closed</span>
          )}
        </div>
      ))}
      <SaveBar onSave={save} />
    </div>
  );
}

function Security() {
  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.current.length > 0 && form.newPass.length >= 8 && form.newPass === form.confirm && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await updateCurrentPassword(form.current, form.newPass);
      setForm({ current: "", newPass: "", confirm: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update the password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {saved && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#ecfdf5", borderRadius: 12, fontSize: 13, color: "#059669", fontWeight: 500 }}><Check size={14} /> Password updated successfully.</div>}
      {error && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, fontSize: 13, color: "#991b1b", fontWeight: 500 }}>{error}</div>}
      <Field label="Current Password"><input type="password" value={form.current} onChange={(e) => set("current", e.target.value)} placeholder="••••••••" style={inp} /></Field>
      <Field label="New Password" hint="At least 8 characters."><input type="password" value={form.newPass} onChange={(e) => set("newPass", e.target.value)} placeholder="••••••••" style={inp} /></Field>
      <Field label="Confirm New Password">
        <input type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="••••••••" style={{ ...inp, borderColor: form.confirm && form.confirm !== form.newPass ? "#dc2626" : "#e3e0eb" }} />
        {form.confirm && form.confirm !== form.newPass && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>Passwords do not match.</div>}
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #f0f0f5", marginTop: 16 }}>
        <button
          onClick={save}
          style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: canSave ? "var(--accent-gradient)" : "#e3e0eb", fontSize: 13, fontWeight: 750, color: canSave ? "#fff" : "#9898b0", cursor: canSave ? "pointer" : "not-allowed", transition: "all 0.15s", boxShadow: canSave ? "0 4px 14px var(--accent-glow)" : "none" }}
          className={canSave ? "hover-scale" : ""}>
          {saving ? "Updating…" : "Update Password"}
        </button>
      </div>
    </div>
  );
}

function WhatsAppSection() {
  const [template, setTemplate] = useState(
    () => (settingsStore.whatsapp as { posThankYou?: string }).posThankYou || "",
  );
  const [saved, setSaved] = useState(false);

  const save = () => {
    (settingsStore.whatsapp as { posThankYou?: string }).posThankYou = template;
    saveSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const businessName = (settingsStore.business as { name: string }).name;
  const preview = sanitizeForLink(fillTemplate(template, { name: "Ayesha", business_name: businessName }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {saved && <SavedBanner />}

      <div style={{ padding: "14px 16px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #6ee7b7", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Smartphone size={18} color="#059669" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>Sent through WhatsApp Web — no setup needed</div>
          <div style={{ fontSize: 11, color: "#6b6b8a", marginTop: 2, lineHeight: 1.6 }}>
            Completing a sale opens WhatsApp (Web on desktop, the app on mobile) with this message and the invoice
            summary already typed for the client. Nothing is sent until you press send in WhatsApp, so keep the business&apos;s
            number signed in at <strong>web.whatsapp.com</strong>.
          </div>
        </div>
      </div>

      <Field label="Receipt message" hint="Variables: {{name}} — customer's name · {{business_name}} — your business name. The invoice number, items and total are appended automatically.">
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={4} style={{ ...inp, resize: "none", lineHeight: 1.6 }} />
      </Field>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Preview</div>
        <div style={{ padding: "12px 14px", background: "#f9f9fb", borderRadius: 10, fontSize: 12, color: "#4a4a6a", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          {preview || "—"}
        </div>
        <div style={{ fontSize: 11, color: "#9898b0", marginTop: 8, lineHeight: 1.6 }}>
          Emoji are stripped from the message: a wa.me link carries the text through a URL, where WhatsApp Web has been
          seen garbling them.
        </div>
      </div>

      <SaveBar onSave={save} />
    </div>
  );
}

function ThermalPrinterSection() {
  const p = settingsStore.printer as { enabled: boolean; ip: string; port: number };
  const [form, setForm] = useState({ enabled: p.enabled, ip: p.ip, port: p.port || 9100 });
  const [saved, setSaved]     = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  function save() {
    Object.assign(settingsStore.printer, form);
    saveSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function testPrint() {
    if (!form.ip) { setTestMsg("Enter a printer IP first."); return; }
    setTesting(true);
    setTestMsg("");
    try {
      const res = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printerIp: form.ip, printerPort: form.port,
          businessName: (settingsStore.business as { name: string }).name,
          businessPhone: (settingsStore.business as { phone: string }).phone,
          businessAddress: (settingsStore.business as { address: string }).address,
          currency: "PKR",
          invoice: {
            number: "TEST-001", date: new Date().toISOString().slice(0, 10),
            clientName: "Test Client", clientPhone: "", staffName: "Staff",
            items: [{ description: "Connection Test", qty: 1, total: 0 }],
            subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0,
            paymentMethod: "cash", status: "paid", notes: "Printer test — if you see this, it works!",
          },
        }),
      });
      const json = await res.json();
      setTestMsg(json.ok ? "✓ Test receipt printed successfully!" : `✗ ${json.error}`);
    } catch (e: unknown) {
      setTestMsg(`✗ ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setTesting(false);
    }
  }

  const connected = form.enabled && !!form.ip;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {saved && <SavedBanner />}

      {/* Status banner */}
      <div style={{ padding: "14px 16px", background: connected ? "#f0fdf4" : "#faf8ff", borderRadius: 10, border: `1px solid ${connected ? "#6ee7b7" : "#ffedd5"}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: connected ? "#dcfce7" : "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <PrinterIcon size={18} color={connected ? "#059669" : "#EA580C"} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: connected ? "#065f46" : "#9a3412" }}>
            {connected ? "Thermal printer connected" : "No printer configured"}
          </div>
          <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>
            {connected ? `Sending to ${form.ip}:${form.port} — Speed-X 400ul (ESC/POS)` : "Enter the printer's LAN IP address to enable direct receipt printing."}
          </div>
        </div>
      </div>

      {/* Enable toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#f9f9fb", borderRadius: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>Enable Thermal Printing</div>
          <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>Show thermal print button on invoices</div>
        </div>
        <Toggle value={form.enabled} onChange={() => setForm(f => ({ ...f, enabled: !f.enabled }))} />
      </div>

      {/* IP */}
      <Field label="Printer IP Address" hint="Assign a static IP to the printer in your router. e.g. 192.168.1.100">
        <input
          type="text" value={form.ip} placeholder="192.168.1.100"
          onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
          style={inp}
        />
      </Field>

      {/* Port */}
      <Field label="Port" hint="Default is 9100 for all ESC/POS LAN printers — don't change unless needed.">
        <input
          type="number" value={form.port} min={1} max={65535}
          onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 9100 }))}
          style={{ ...inp, maxWidth: 140 }}
        />
      </Field>

      {/* Setup guide */}
      <div style={{ padding: "12px 14px", background: "#f9f9fb", borderRadius: 8, fontSize: 11, color: "#6b6b8a", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>Setup guide (Speed-X 400ul)</div>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Connect the printer to your router with an RJ-45 LAN cable</li>
          <li>Print a self-test page (hold Feed button on power-on) — note the IP shown</li>
          <li>In your router admin, assign that IP as a static/reserved address</li>
          <li>Enter the IP above, save, then click <strong>Test Print</strong></li>
        </ol>
      </div>

      {/* Test result */}
      {testMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: testMsg.startsWith("✓") ? "#f0fdf4" : "#fef2f2",
          color: testMsg.startsWith("✓") ? "#065f46" : "#991b1b",
          border: `1px solid ${testMsg.startsWith("✓") ? "#6ee7b7" : "#fca5a5"}`,
        }}>
          {testMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={testPrint} disabled={testing} style={{
          padding: "10px 20px", borderRadius: 9, border: "1.5px solid #e8e8f0",
          background: "#fff", fontSize: 13, fontWeight: 700, color: "#5a5a7a",
          cursor: testing ? "not-allowed" : "pointer", opacity: testing ? 0.6 : 1,
        }}>
          {testing ? "Printing…" : "Test Print"}
        </button>
        <SaveBar onSave={save} />
      </div>
    </div>
  );
}

interface AccessDraft {
  email: string;
  password: string;
  role: "staff" | "manager";
  locationId: string;
  permissions: string[];
}

function buildAccessDrafts(staff: Staff[], users: AuthUser[], branchList: BusinessLocation[]) {
  const fallbackLocation = branchList[0]?.id || getDefaultLocationId();
  return staff.reduce<Record<string, AccessDraft>>((acc, member) => {
    const login = users.find((user) => user.staffId === member.id);
    const isManager = login?.role === "manager" || login?.permissions?.includes("*");
    acc[member.id] = {
      email: login?.email || member.email || "",
      password: "",
      role: isManager ? "manager" : "staff",
      locationId: login?.locationId || fallbackLocation,
      permissions: isManager
        ? DEFAULT_STAFF_PERMISSIONS
        : (login?.permissions
            ?.filter((permission) => permission !== "*")
            .filter((permission) => PERMISSION_OPTIONS.some((option) => option.key === permission)) ?? []),
    };
    return acc;
  }, {});
}

function StaffAccess() {
  const [staffList, setStaffList]   = useState<Staff[]>([]);
  const [locations, setLocations]   = useState<BusinessLocation[]>([]);
  const [loginUsers, setLoginUsers] = useState<AuthUser[]>([]);
  const [drafts, setDrafts]         = useState<Record<string, AccessDraft>>({});
  const [savingId, setSavingId]     = useState("");
  const [savedId, setSavedId]       = useState("");
  const [error, setError]           = useState("");

  useEffect(() => {
    const controller = new AbortController();

    // Deferred a tick: the staff list and branches come from localStorage,
    // which is only readable once this has hydrated in the browser.
    queueMicrotask(() => {
      const staff = getStoredStaff();
      const branchList = getBusinessLocations();
      setStaffList(staff);
      setLocations(branchList);
      // Drafts are seeded from local data first, then refined once the DB says
      // which of these staff already have a login.
      setDrafts(buildAccessDrafts(staff, [], branchList));

      fetch("/api/auth/staff", { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { ok?: boolean; users?: AuthUser[] }) => {
          const users = data.ok && Array.isArray(data.users) ? data.users : [];
          setLoginUsers(users);
          setDrafts(buildAccessDrafts(staff, users, branchList));
        })
        .catch(() => { /* offline — the locally-seeded drafts still work */ });
    });

    return () => controller.abort();
  }, []);

  function updateDraft(staffId: string, patch: Partial<AccessDraft>) {
    setDrafts((current) => ({ ...current, [staffId]: { ...current[staffId], ...patch } }));
  }

  function togglePermission(staffId: string, permission: string) {
    const draft = drafts[staffId];
    if (!draft) return;
    const next = draft.permissions.includes(permission)
      ? draft.permissions.filter((item) => item !== permission)
      : [...draft.permissions, permission];
    updateDraft(staffId, { permissions: next });
  }

  async function saveAccess(member: Staff) {
    const draft = drafts[member.id];
    if (!draft || !draft.email.trim()) { setError("A login email is required."); return; }
    const existing = loginUsers.find((user) => user.staffId === member.id);
    if (!existing && draft.password.length < 8) {
      setError("A new staff login needs a password of at least 8 characters.");
      return;
    }

    setSavingId(member.id);
    setSavedId("");
    setError("");
    try {
      const response = await fetch("/api/auth/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId:     member.id,
          name:        member.name,
          email:       draft.email,
          phone:       member.phone || "",
          password:    draft.password || undefined,
          role:        draft.role,
          locationId:  draft.locationId,
          permissions: draft.permissions,
        }),
      });
      const result = await response.json() as { ok?: boolean; user?: AuthUser; error?: string };
      if (!response.ok || !result.ok || !result.user) throw new Error(result.error || "Unable to save staff access.");

      setLoginUsers((current) => [...current.filter((user) => user.staffId !== member.id), result.user!]);
      updateDraft(member.id, { password: "" });
      setSavedId(member.id);
      setTimeout(() => setSavedId(""), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save staff access.");
    } finally {
      setSavingId("");
    }
  }

  if (staffList.length === 0) {
    return (
      <div style={{ padding: "16px 18px", background: "#f9f9fb", borderRadius: 12, fontSize: 13, color: "#6b6b8a", lineHeight: 1.7 }}>
        No team members yet. Add them on the <strong>Staff</strong> page first — a login is created against a staff record.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: "12px 14px", background: "#fff7ed", borderRadius: 10, fontSize: 12, color: "#c2410c", fontWeight: 650, lineHeight: 1.6 }}>
        Staff sign in through the <strong>Staff</strong> tab on the sign-in page and only see the modules ticked here.
        A manager sees everything except this Settings page, which stays owner-only.
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, fontSize: 13, color: "#991b1b", fontWeight: 500 }}>{error}</div>}

      {staffList.map((member) => {
        const draft = drafts[member.id];
        if (!draft) return null;
        const existing = loginUsers.some((user) => user.staffId === member.id);
        const isManager = draft.role === "manager";
        return (
          <div key={member.id} style={{ border: "1px solid #f2e9e1", borderRadius: 16, padding: "18px 20px", background: "#fff", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>{member.name}</div>
                <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>{existing ? "Login active" : "No login yet"}</div>
              </div>
              {savedId === member.id && <span style={{ fontSize: 11, fontWeight: 700, color: "#059669", display: "flex", alignItems: "center", gap: 4 }}><Check size={13} /> Saved</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Login email">
                <input value={draft.email} onChange={(e) => updateDraft(member.id, { email: e.target.value })} placeholder="name@business.com" style={inp} />
              </Field>
              <Field label={existing ? "New password" : "Password"} hint={existing ? "Leave blank to keep the current one." : "At least 8 characters."}>
                <input type="password" value={draft.password} onChange={(e) => updateDraft(member.id, { password: e.target.value })} placeholder="••••••••" style={inp} />
              </Field>
              <Field label="Access level">
                <select value={draft.role} onChange={(e) => updateDraft(member.id, { role: e.target.value as AccessDraft["role"] })} style={inp}>
                  <option value="staff">Staff — only the ticked modules</option>
                  <option value="manager">Manager — every module</option>
                </select>
              </Field>
              <Field label="Branch">
                <select value={draft.locationId} onChange={(e) => updateDraft(member.id, { locationId: e.target.value })} style={inp}>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </Field>
            </div>

            {!isManager && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Modules</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PERMISSION_OPTIONS.map(({ key, label }) => {
                    const on = draft.permissions.includes(key);
                    return (
                      <button key={key} type="button" onClick={() => togglePermission(member.id, key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999,
                          border: `1.5px solid ${on ? "var(--accent)" : "#e3e0eb"}`,
                          background: on ? "#fff7ed" : "#fff",
                          color: on ? "var(--accent-dark)" : "#8d8880",
                          fontSize: 12, fontWeight: 750, cursor: "pointer",
                        }}>
                        {on && <Check size={12} />} {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => saveAccess(member)} disabled={savingId === member.id}
                style={{ padding: "9px 20px", borderRadius: 12, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 750, color: "#fff", cursor: savingId === member.id ? "default" : "pointer", opacity: savingId === member.id ? 0.6 : 1, boxShadow: "0 4px 14px var(--accent-glow)" }}>
                {savingId === member.id ? "Saving…" : existing ? "Update access" : "Create login"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState("business");

  return (
    <div className="dash-page dashboard-polish desktop-only" style={{ background: "#ffffff", minHeight: "100vh", padding: "32px 32px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header" style={{ marginBottom: 4 }}>
        <PageTitle icon={<Shield size={24} />} title="Settings" subtitle="Manage your business preferences" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(226,223,235,0.8)", boxShadow: "0 4px 16px rgba(0,0,0,0.02)", overflow: "hidden", padding: "8px 0" }}>
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button key={id} onClick={() => setActive(id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: isActive ? "var(--accent-light)" : "transparent", border: "none", borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`, cursor: "pointer", transition: "all 0.15s" }} className={isActive ? "" : "hover-bg-light"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Icon size={16} color={isActive ? "var(--accent)" : "#6b6b8a"} />
                  <span style={{ fontSize: 13, fontWeight: isActive ? 750 : 500, color: isActive ? "var(--accent-dark)" : "#1a1a2e" }}>{label}</span>
                </div>
                <ChevronRight size={14} color={isActive ? "var(--accent)" : "#d0d0e0"} />
              </button>
            );
          })}
        </div>

        <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(226,223,235,.95)", boxShadow: "0 8px 28px rgba(75,40,20,.04)", padding: "30px 32px" }}>
          {SECTIONS.map(({ id, label }) => (
            <div key={id} style={{ display: active === id ? "block" : "none" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#1a1a2e", marginBottom: 24 }}>{label}</div>
              {id === "business"    && <BusinessProfile />}
              {id === "hours"    && <BusinessHours />}
              {id === "whatsapp" && <WhatsAppSection />}
              {id === "printer"  && <ThermalPrinterSection />}
              {id === "access"   && <StaffAccess />}
              {id === "security" && <Security />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
