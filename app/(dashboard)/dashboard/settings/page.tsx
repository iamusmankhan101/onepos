"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { Store, Clock, Shield, Smartphone, ChevronRight, Check, KeyRound, PrinterIcon, Building2, MapPin, Plus, Trash2, Sparkles } from "lucide-react";
import { settingsStore, saveSettings, SETTINGS_CHANGED_EVENT } from "@/lib/settings-store";
import {
  activePlan, addBusinessLocation, canManageBranches, deleteBusinessLocation, getActiveLocationFilter,
  getBusinessLocations, getDefaultLocationId, locationName, MAIN_LOCATION_ID, setActiveLocationFilter,
  updateActiveLocationDetails, updateBusinessLocation, type BusinessLocation,
} from "@/lib/locations";
import { MULTI_BRANCH_PLAN, PLANS, type PlanDefinition } from "@/lib/plans";
import { ACCOUNT_REFRESHED_EVENT, updateCurrentPassword, type AuthUser } from "@/lib/auth";
import { getStoredStaff } from "@/lib/storage";
import type { Staff } from "@/lib/types";
import { fillTemplate, sanitizeForLink } from "@/lib/whatsapp-link";
import PageTitle from "@/components/page-title";

const SECTIONS = [
  { id: "business",   label: "Business Profile", icon: Store },
  { id: "branches", label: "Branches",       icon: Building2 },
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

/**
 * Keeps a settings form in step with the store behind it.
 *
 * Settings do not finish loading at first paint: the dashboard layout runs
 * syncFromDB(), then reloadSettings(), then fires SETTINGS_CHANGED_EVENT, all
 * after this page has already rendered. A form that only snapshots
 * settingsStore into useState therefore shows the pre-sync localStorage copy —
 * a blank address/city on a device that has not synced yet — and, far worse,
 * writes that stale snapshot straight back over the synced values on Save,
 * pushing the emptied settings to Turso and every other device. That is what
 * "settings reverted everything I had saved" looks like from the outside.
 *
 * So re-read the store whenever it changes, but never on top of edits the user
 * has already typed: `edit` marks the form dirty and freezes re-hydration
 * until `markSaved` (called by the form's own save) releases it again.
 */
function useSyncedSettings<T>(read: () => T) {
  const readRef = useRef(read);
  readRef.current = read;
  const dirty = useRef(false);
  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    function rehydrate() {
      if (!dirty.current) setValue(readRef.current());
    }
    // Deferred a tick for the same reason the rest of this page defers: the
    // store is only readable after hydration, and the sync can land before
    // this effect has subscribed.
    const timer = window.setTimeout(rehydrate, 0);
    window.addEventListener(SETTINGS_CHANGED_EVENT, rehydrate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, rehydrate);
    };
  }, []);

  const edit: Dispatch<SetStateAction<T>> = useCallback((next) => {
    dirty.current = true;
    setValue(next);
  }, []);

  /** Call once the form has written itself into settingsStore. */
  const markSaved = useCallback(() => { dirty.current = false; }, []);

  return [value, edit, markSaved] as const;
}

function SaveBar({ onSave, busy }: { onSave: () => void; busy?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #f0f0f5", marginTop: 16 }}>
      <button onClick={onSave} disabled={busy} style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 750, color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, transition: "all 0.15s", boxShadow: "0 4px 14px var(--accent-glow)" }} className={busy ? "" : "hover-scale"}>
        {busy ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

interface BusinessSettings {
  name: string; phone: string; email: string; address: string;
  city: string; currency: string; timezone: string; logo: string;
}
/** Every business field, plus the active branch's name, which is edited alongside them. */
type BusinessProfileForm = BusinessSettings & { branchName: string };

/**
 * The Business Profile form's values. Address and city are read off the active
 * branch first: settingsStore.business.address is only ever a mirror of the
 * branch (setActiveLocationFilter copies branch -> business on every switch),
 * so the branch list is the copy that stays correct once a business runs more
 * than one location. The business-level value is the fallback, which is what
 * an account that pre-dates branches still has its address stored in.
 */
function readBusinessProfile(): BusinessProfileForm {
  const activeId = getActiveLocationFilter();
  const branch = getBusinessLocations().find((location) => location.id === activeId);
  const business = settingsStore.business as BusinessSettings;
  return {
    ...business,
    address: branch?.address || business.address || "",
    city: branch?.city || business.city || "",
    branchName: branch?.name || locationName(activeId),
  };
}

function BusinessProfile() {
  const [form, setForm, markSaved] = useSyncedSettings(readBusinessProfile);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState("");
  const set = (k: keyof BusinessProfileForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
  const save = async () => {
    const { branchName, ...business } = form;
    Object.assign(settingsStore.business, business);
    updateActiveLocationDetails({ name: branchName, address: business.address, city: business.city });
    setSaveError("");
    setSaving(true);
    // saveSettings() writes localStorage synchronously and returns the Turso
    // write's outcome. Awaiting it is the whole point here: a POST that failed
    // used to look exactly like one that succeeded, right up until the next
    // sync pulled the old row back over the top of it. The form stays dirty on
    // failure so what was typed survives on screen for a second attempt.
    const synced = await saveSettings();
    setSaving(false);
    if (!synced) {
      setSaveError("Saved on this device, but it could not reach your account. Check your connection and press Save Changes again — otherwise these values will be replaced the next time this device syncs.");
      return;
    }
    markSaved();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {saved && <SavedBanner />}
      {saveError && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 13, color: "#991b1b", fontWeight: 500, lineHeight: 1.6 }}>
          {saveError}
        </div>
      )}
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fff7ed", color: "#c2410c", fontSize: 12, fontWeight: 700 }}>
        Editing location: {form.branchName}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Branch Name"><input value={form.branchName} onChange={(e) => set("branchName", e.target.value)} style={inp} /></Field>
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
      <SaveBar onSave={save} busy={saving} />
    </div>
  );
}

function BusinessHours() {
  const [hours, setHours, markSaved] = useSyncedSettings(() => (settingsStore.hours as any[]).map((h: any) => ({ ...h })));
  const [saved, setSaved] = useState(false);
  const toggle = (i: number) => setHours((h: any[]) => h.map((r: any, idx: number) => idx === i ? { ...r, open: !r.open } : r));
  const setTime = (i: number, k: "from" | "to", v: string) => setHours((h: any[]) => h.map((r: any, idx: number) => idx === i ? { ...r, [k]: v } : r));
  const save = () => { hours.forEach((h: any, i: number) => Object.assign(settingsStore.hours[i], h)); markSaved(); saveSettings(); setSaved(true); setTimeout(() => setSaved(false), 3000); };
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
  const [template, setTemplate, markSaved] = useSyncedSettings(
    () => (settingsStore.whatsapp as { posThankYou?: string }).posThankYou || "",
  );
  const [saved, setSaved] = useState(false);

  const save = () => {
    (settingsStore.whatsapp as { posThankYou?: string }).posThankYou = template;
    markSaved();
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
  const [form, setForm, markSaved] = useSyncedSettings(() => {
    const p = settingsStore.printer as { enabled: boolean; ip: string; port: number };
    return { enabled: p.enabled, ip: p.ip, port: p.port || 9100 };
  });
  const [saved, setSaved]     = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  function save() {
    Object.assign(settingsStore.printer, form);
    markSaved();
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

// ─── Branches (Pro) ───────────────────────────────────────────────────────────

interface BranchDraft { name: string; address: string; city: string }

const EMPTY_BRANCH: BranchDraft = { name: "", address: "", city: "" };

/**
 * Every branch keeps its own clients, staff, stock, invoices and takings —
 * switching is a reload rather than a filter, because each branch reads from a
 * different set of localStorage keys and needs its own pull from the shared
 * database before anything on screen is true.
 */
function BranchUpgradeCard({ plan }: { plan: PlanDefinition }) {
  return (
    <div style={{ border: "1px solid #fed7aa", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ padding: "20px 22px", background: "linear-gradient(135deg, rgba(234,88,12,0.08), rgba(255,255,255,0.9))", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, display: "grid", placeItems: "center", background: "var(--accent-gradient)", boxShadow: "0 6px 18px var(--accent-glow)", flexShrink: 0 }}>
          <Sparkles size={19} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 850, color: "#1a1a2e" }}>Multiple branches are part of {plan.name}</div>
          <div style={{ fontSize: 12.5, color: "#6b6b8a", marginTop: 4, lineHeight: 1.6, maxWidth: 560 }}>{plan.blurb}</div>
        </div>
      </div>
      <div style={{ padding: "18px 22px 22px", background: "#fff" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {plan.highlights.map((line) => (
            <div key={line} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "#1a1a2e", fontWeight: 600 }}>
              <Check size={14} color="var(--accent)" /> {line}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, padding: "12px 14px", background: "#f9f9fb", borderRadius: 12, fontSize: 12, color: "#6b6b8a", lineHeight: 1.65 }}>
          Your account is on <strong>Starter</strong>, which runs a single location. Get in touch to move it to {plan.name} —
          your current branch, its data and every staff login carry over untouched.
        </div>
      </div>
    </div>
  );
}

function BranchesSection() {
  const [plan, setPlan] = useState<PlanDefinition>(() => PLANS.starter);
  // The plan can only be read after hydration, and rendering the default in
  // the meantime would flash "upgrade to Pro" at a business already on Pro.
  const [ready, setReady] = useState(false);
  const [multiBranch, setMultiBranch] = useState(false);
  const [branches, setBranches] = useState<BusinessLocation[]>([]);
  const [activeId, setActiveId] = useState("main");
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<BranchDraft>(EMPTY_BRANCH);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<BranchDraft>(EMPTY_BRANCH);
  const [deleteId, setDeleteId] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Deferred a tick — the branch list, like everything else on this page,
  // comes from localStorage and is only readable after hydration. It is also
  // re-read when the session check pulls down a changed account: an owner who
  // has just been moved onto Pro is very likely sitting on this exact screen.
  useEffect(() => {
    function refreshPlan() {
      setPlan(activePlan());
      setMultiBranch(canManageBranches());
      setBranches(getBusinessLocations());
      setActiveId(getActiveLocationFilter());
      setReady(true);
    }
    const timer = window.setTimeout(refreshPlan, 0);
    window.addEventListener(ACCOUNT_REFRESHED_EVENT, refreshPlan);
    // ...and when the Turso sync lands, which is what fills in the branch
    // list (addresses included) on a device that has just signed in.
    window.addEventListener(SETTINGS_CHANGED_EVENT, refreshPlan);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(ACCOUNT_REFRESHED_EVENT, refreshPlan);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refreshPlan);
    };
  }, []);

  function refresh() {
    setBranches(getBusinessLocations());
    setActiveId(getActiveLocationFilter());
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function addBranch() {
    setError("");
    try {
      addBusinessLocation({ name: addDraft.name, address: addDraft.address, city: addDraft.city });
      setAddDraft(EMPTY_BRANCH);
      setAdding(false);
      refresh();
      flashSaved();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not add that branch.");
    }
  }

  function startEdit(branch: BusinessLocation) {
    setError("");
    setDeleteId("");
    setEditingId(branch.id);
    setEditDraft({ name: branch.name, address: branch.address || "", city: branch.city || "" });
  }

  function saveEdit() {
    if (!editDraft.name.trim()) { setError("Branch name is required."); return; }
    updateBusinessLocation(editingId, editDraft);
    saveSettings();
    setEditingId("");
    refresh();
    flashSaved();
  }

  // A branch switch reloads the page on purpose: the stores are keyed by
  // branch, so the lists already in React state belong to the branch being
  // left, and the new one needs its own sync from the database before any of
  // it can be trusted.
  function switchBranch(id: string) {
    if (id === activeId) return;
    setBusy(true);
    setActiveLocationFilter(id);
    window.location.reload();
  }

  async function confirmDelete(branch: BusinessLocation) {
    setBusy(true);
    setError("");
    try {
      const { nextActiveId, dataCleared } = await deleteBusinessLocation(branch.id);
      if (!dataCleared) {
        setError(`${branch.name} was removed from your business, but its saved data could not be cleared while offline.`);
      }
      setDeleteId("");
      setDeleteConfirm("");
      // Deleting the branch you were standing in changes which data the whole
      // dashboard is reading — that has to be a reload, same as a switch.
      if (branch.id === activeId || nextActiveId !== activeId) { window.location.reload(); return; }
      refresh();
      flashSaved();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete that branch.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div style={{ padding: "16px 18px", fontSize: 13, color: "#9898b0" }}>Loading your branches…</div>;
  }

  if (!multiBranch) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <BranchUpgradeCard plan={MULTI_BRANCH_PLAN} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Your location</div>
          {branches.map((branch) => (
            <div key={branch.id} style={{ border: "1px solid #f2e9e1", borderRadius: 14, padding: "14px 16px", background: "#fff" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>{branch.name}</div>
              <div style={{ fontSize: 12, color: "#9898b0", marginTop: 3 }}>
                {[branch.address, branch.city].filter(Boolean).join(", ") || "No address set — add one in Business Profile."}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const slotsLeft = Math.max(0, plan.maxBranches - branches.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {saved && <SavedBanner />}

      <div style={{ padding: "12px 14px", background: "#fff7ed", borderRadius: 10, fontSize: 12, color: "#c2410c", fontWeight: 650, lineHeight: 1.6 }}>
        Each branch keeps its own clients, staff, stock, invoices and takings. The branch you switch to here is the one every
        page reads and writes, and it is what staff pinned to that branch see when they sign in. Main Branch can be renamed
        but not deleted — it is where the account falls back to.
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, fontSize: 13, color: "#991b1b", fontWeight: 500 }}>{error}</div>}

      {branches.map((branch) => {
        const isActive = branch.id === activeId;
        const isEditing = editingId === branch.id;
        const isDeleting = deleteId === branch.id;
        return (
          <div key={branch.id} style={{
            border: `1px solid ${isActive ? "rgba(234,88,12,0.35)" : "#f2e9e1"}`,
            borderRadius: 16, padding: "18px 20px",
            background: isActive ? "linear-gradient(135deg, rgba(234,88,12,0.04), #fff)" : "#fff",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, display: "grid", placeItems: "center", background: isActive ? "var(--accent-gradient)" : "#f4f4f8", flexShrink: 0 }}>
                  <MapPin size={17} color={isActive ? "#fff" : "#9898b0"} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>{branch.name}</span>
                    {isActive && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent-dark)", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Currently open
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#9898b0", marginTop: 3 }}>
                    {[branch.address, branch.city].filter(Boolean).join(", ") || "No address set"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {!isActive && (
                  <button type="button" onClick={() => switchBranch(branch.id)} disabled={busy}
                    style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--accent-gradient)", fontSize: 12, fontWeight: 750, color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                    Switch to this branch
                  </button>
                )}
                <button type="button" onClick={() => (isEditing ? setEditingId("") : startEdit(branch))}
                  style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #e3e0eb", background: "#fff", fontSize: 12, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
                  {isEditing ? "Cancel" : "Edit"}
                </button>
                {branch.id !== MAIN_LOCATION_ID && (
                  <button type="button" aria-label={`Delete ${branch.name}`}
                    onClick={() => { setDeleteId(isDeleting ? "" : branch.id); setDeleteConfirm(""); setEditingId(""); setError(""); }}
                    style={{ padding: 9, borderRadius: 10, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer", display: "grid", placeItems: "center" }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {isEditing && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 14, borderTop: "1px solid #f0f0f5" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="Branch name"><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} style={inp} /></Field>
                  <Field label="City"><input value={editDraft.city} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} style={inp} /></Field>
                </div>
                <Field label="Address" hint="Printed on this branch's receipts and invoices.">
                  <input value={editDraft.address} onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })} style={inp} />
                </Field>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={saveEdit}
                    style={{ padding: "9px 20px", borderRadius: 12, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 750, color: "#fff", cursor: "pointer", boxShadow: "0 4px 14px var(--accent-glow)" }}>
                    Save branch
                  </button>
                </div>
              </div>
            )}

            {isDeleting && (
              <div style={{ paddingTop: 14, borderTop: "1px solid #fee2e2", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12.5, color: "#991b1b", lineHeight: 1.65 }}>
                  Deleting <strong>{branch.name}</strong> permanently removes its clients, staff, stock, invoices, expenses and
                  takings from every device on this account. Your other branches are untouched. This cannot be undone —
                  type the branch name to confirm.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={branch.name}
                    style={{ ...inp, maxWidth: 260, borderColor: "#fecaca" }} />
                  <button type="button" disabled={busy || deleteConfirm.trim() !== branch.name} onClick={() => confirmDelete(branch)}
                    style={{
                      padding: "10px 18px", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 750, color: "#fff",
                      background: deleteConfirm.trim() === branch.name ? "#dc2626" : "#fca5a5",
                      cursor: busy || deleteConfirm.trim() !== branch.name ? "default" : "pointer",
                    }}>
                    {busy ? "Deleting…" : "Delete branch"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div style={{ border: "1px dashed #fed7aa", borderRadius: 16, padding: "18px 20px", background: "#fffdfa", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e" }}>New branch</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Branch name" hint="How your team will recognise it, e.g. DHA Phase 5.">
              <input value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} style={inp} />
            </Field>
            <Field label="City"><input value={addDraft.city} onChange={(e) => setAddDraft({ ...addDraft, city: e.target.value })} style={inp} /></Field>
          </div>
          <Field label="Address" hint="Printed on this branch's receipts and invoices.">
            <input value={addDraft.address} onChange={(e) => setAddDraft({ ...addDraft, address: e.target.value })} style={inp} />
          </Field>
          <div style={{ fontSize: 12, color: "#9898b0", lineHeight: 1.6 }}>
            A new branch starts empty — no clients, staff, stock or history carry over. Add its team on the Staff page, then
            give each of them a login pinned to this branch under Staff Access.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={() => { setAdding(false); setAddDraft(EMPTY_BRANCH); setError(""); }}
              style={{ padding: "9px 18px", borderRadius: 12, border: "1px solid #e3e0eb", background: "#fff", fontSize: 13, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={addBranch}
              style={{ padding: "9px 20px", borderRadius: 12, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 750, color: "#fff", cursor: "pointer", boxShadow: "0 4px 14px var(--accent-glow)" }}>
              Add branch
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#9898b0" }}>
            {branches.length} of {plan.maxBranches} branches used on your {plan.name} plan.
          </div>
          <button type="button" disabled={slotsLeft === 0} onClick={() => { setAdding(true); setError(""); }}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 12, border: "none",
              background: slotsLeft === 0 ? "#e3e0eb" : "var(--accent-gradient)",
              fontSize: 13, fontWeight: 750, color: slotsLeft === 0 ? "#9898b0" : "#fff",
              cursor: slotsLeft === 0 ? "default" : "pointer",
              boxShadow: slotsLeft === 0 ? "none" : "0 4px 14px var(--accent-glow)",
            }}>
            <Plus size={15} /> Add branch
          </button>
        </div>
      )}
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
              {id === "branches" && <BranchesSection />}
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
