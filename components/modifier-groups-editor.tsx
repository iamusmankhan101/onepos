"use client";

/**
 * The "Menu options" manager on the Menu page: the shared option groups
 * (lib/menu.ts) that menu items then pick from — Size, Milk, Syrup…
 */

import { useEffect, useState } from "react";
import { Plus, Trash2, X, Sparkles, ChevronUp, ChevronDown, Check } from "lucide-react";
import {
  MENU_CHANGED_EVENT, getModifierGroups, newMenuId, presetGroups, saveModifierGroups,
  type ModifierGroup, type ModifierOption,
} from "@/lib/menu";
import type { InventoryItem } from "@/lib/types";
import { subscribeToStoredData } from "@/lib/storage";

const INP: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e8e8f0",
  fontSize: 13, color: "#1a1a2e", outline: "none", background: "#fff", boxSizing: "border-box",
};

function blankGroup(): ModifierGroup {
  return { id: newMenuId("mg"), name: "", required: false, multi: false, defaultOptionIds: [], options: [{ id: newMenuId("opt"), name: "", price: 0 }] };
}

export default function ModifierGroupsEditor({ items, currency, onClose }: {
  items: InventoryItem[];
  currency: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<ModifierGroup[]>(() => getModifierGroups());
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [error, setError] = useState("");

  // A sync landing while this is open (a fresh device, another till's edit)
  // must show here — adding the starter set against a stale, empty list would
  // create a second copy of every group.
  useEffect(() => {
    const load = () => setGroups(getModifierGroups());
    const unsubscribe = subscribeToStoredData(load);
    window.addEventListener(MENU_CHANGED_EVENT, load);
    return () => { unsubscribe(); window.removeEventListener(MENU_CHANGED_EVENT, load); };
  }, []);

  const usedBy = (id: string) => items.filter((i) => i.modifierGroupIds?.includes(id)).length;

  async function commit(next: ModifierGroup[], deletedIds: string[] = []) {
    setGroups(next);
    await saveModifierGroups(next, deletedIds);
  }

  function addPresets() {
    const added = presetGroups(groups);
    if (added.length) commit([...groups, ...added]);
  }

  function remove(group: ModifierGroup) {
    const n = usedBy(group.id);
    if (n > 0 && !window.confirm(`${group.name} is on ${n} menu item${n === 1 ? "" : "s"}. Delete it anyway? Those items stop offering it.`)) return;
    commit(groups.filter((g) => g.id !== group.id), [group.id]);
  }

  function saveEditing() {
    if (!editing) return;
    const options = editing.options
      .map((o) => ({ ...o, name: o.name.trim(), price: Math.max(0, Math.round(Number(o.price) || 0)) }))
      .filter((o) => o.name);
    const name = editing.name.trim();
    if (!name) { setError("Give the group a name, like Size or Milk."); return; }
    if (options.length === 0) { setError("Add at least one option."); return; }
    const ids = new Set(options.map((o) => o.id));
    let defaults = (editing.defaultOptionIds ?? []).filter((id) => ids.has(id));
    if (!editing.multi) defaults = defaults.slice(0, 1);
    const maxSelect = editing.multi && editing.maxSelect && editing.maxSelect > 0 ? Math.round(editing.maxSelect) : undefined;
    const group: ModifierGroup = { ...editing, name, options, defaultOptionIds: defaults, maxSelect };
    const exists = groups.some((g) => g.id === group.id);
    commit(exists ? groups.map((g) => (g.id === group.id ? group : g)) : [...groups, group]);
    setEditing(null);
    setError("");
  }

  function patchOption(id: string, patch: Partial<ModifierOption>) {
    setEditing((g) => g && { ...g, options: g.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }

  function moveOption(index: number, delta: number) {
    setEditing((g) => {
      if (!g) return g;
      const to = index + delta;
      if (to < 0 || to >= g.options.length) return g;
      const options = [...g.options];
      [options[index], options[to]] = [options[to], options[index]];
      return { ...g, options };
    });
  }

  function toggleDefault(id: string) {
    setEditing((g) => {
      if (!g) return g;
      const current = g.defaultOptionIds ?? [];
      const on = current.includes(id);
      const next = g.multi ? (on ? current.filter((x) => x !== id) : [...current, id]) : (on ? [] : [id]);
      return { ...g, defaultOptionIds: next };
    });
  }

  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet"
        style={{ background: "#fff", borderRadius: 20, width: 620, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2e" }}>{editing ? (groups.some((g) => g.id === editing.id) ? `Edit — ${editing.name}` : "New option group") : "Menu options"}</div>
            {!editing && <div style={{ fontSize: 12, color: "#9898b0", marginTop: 3 }}>Sizes, milk, extra shots, add-ons. Create a group once, then switch it on for any item.</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}><X size={18} color="#9898b0" /></button>
        </div>

        {!editing ? (
          <div style={{ padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
            {groups.length === 0 && (
              <div style={{ padding: "22px 16px", borderRadius: 12, background: "#faf9fb", textAlign: "center", fontSize: 13, color: "#6b6b8a", lineHeight: 1.6 }}>
                No option groups yet. Start from the café set (Size, Temperature, Milk, Extra shot, Syrup, Toppings, Ice and Sugar level) and edit the prices, or build your own.
              </div>
            )}
            {groups.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid #ecebf3" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 750, color: "#1a1a2e" }}>
                    {g.name}
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: g.required ? "#b45309" : "#6b6b8a", background: g.required ? "#fffbeb" : "#f4f4f8", borderRadius: 20, padding: "2px 8px" }}>
                      {g.required ? "Required" : "Optional"} · {g.multi ? (g.maxSelect ? `up to ${g.maxSelect}` : "pick any") : "pick one"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9898b0", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.options.map((o) => (o.price > 0 ? `${o.name} +${o.price}` : o.name)).join(" · ")}
                  </div>
                  <div style={{ fontSize: 11, color: "#b0b0c8", marginTop: 2 }}>On {usedBy(g.id)} item{usedBy(g.id) === 1 ? "" : "s"}</div>
                </div>
                <button type="button" onClick={() => { setEditing(structuredClone(g)); setError(""); }}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e3e0eb", background: "#fff", fontSize: 12, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>Edit</button>
                <button type="button" onClick={() => remove(g)} aria-label={`Delete ${g.name}`}
                  style={{ padding: 7, borderRadius: 8, border: "1px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "flex" }}><Trash2 size={14} color="#dc2626" /></button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={() => { setEditing(blankGroup()); setError(""); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #9A3412, #F97316)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={14} /> New group
              </button>
              {presetGroups(groups).length > 0 && (
                <button type="button" onClick={addPresets}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  <Sparkles size={14} /> Add café starter set
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Group name
              <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Size, Milk, Syrup" style={INP} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {([
                [false, "Pick one", "Size, milk, temperature"],
                [true, "Pick several", "Syrups, toppings, removals"],
              ] as const).map(([multi, label, hint]) => (
                <button key={label} type="button" onClick={() => setEditing({ ...editing, multi, defaultOptionIds: multi ? editing.defaultOptionIds : (editing.defaultOptionIds ?? []).slice(0, 1) })}
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${editing.multi === multi ? "#EA580C" : "#e8e8f0"}`, background: editing.multi === multi ? "#fff7ed" : "#fff", cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 750, color: editing.multi === multi ? "#c2410c" : "#1a1a2e" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2 }}>{hint}</div>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#1a1a2e", cursor: "pointer" }}>
                <input type="checkbox" checked={editing.required} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} style={{ accentColor: "#EA580C" }} />
                Required — the cashier must choose
              </label>
              {editing.multi && (
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#1a1a2e" }}>
                  Max
                  <input type="number" min={1} value={editing.maxSelect ?? ""} placeholder="any"
                    onChange={(e) => setEditing({ ...editing, maxSelect: Number(e.target.value) || undefined })}
                    style={{ ...INP, width: 70 }} />
                </label>
              )}
            </div>

            <div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 44px auto", gap: 8, fontSize: 10, fontWeight: 800, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                <span>Option</span><span>Extra ({currency})</span><span>Default</span><span />
              </div>
              {editing.options.map((o, i) => {
                const isDefault = (editing.defaultOptionIds ?? []).includes(o.id);
                return (
                  <div key={o.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 44px auto", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <input value={o.name} onChange={(e) => patchOption(o.id, { name: e.target.value })} placeholder={i === 0 ? "e.g. Large" : "Option"} style={INP} aria-label="Option name" />
                    <input type="number" min={0} value={o.price || ""} onChange={(e) => patchOption(o.id, { price: Number(e.target.value) || 0 })} placeholder="0" style={INP} aria-label={`Extra price for ${o.name || "option"}`} />
                    <button type="button" onClick={() => toggleDefault(o.id)} aria-pressed={isDefault} title="Pre-selected when the item is added"
                      style={{ height: 34, borderRadius: 8, border: `1.5px solid ${isDefault ? "#059669" : "#e8e8f0"}`, background: isDefault ? "#ecfdf5" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isDefault && <Check size={14} color="#059669" />}
                    </button>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} aria-label="Move up" style={{ padding: 6, borderRadius: 7, border: "1px solid #ecebf3", background: "#fff", cursor: "pointer", opacity: i === 0 ? 0.35 : 1, display: "flex" }}><ChevronUp size={13} /></button>
                      <button type="button" onClick={() => moveOption(i, 1)} disabled={i === editing.options.length - 1} aria-label="Move down" style={{ padding: 6, borderRadius: 7, border: "1px solid #ecebf3", background: "#fff", cursor: "pointer", opacity: i === editing.options.length - 1 ? 0.35 : 1, display: "flex" }}><ChevronDown size={13} /></button>
                      <button type="button" onClick={() => setEditing({ ...editing, options: editing.options.filter((x) => x.id !== o.id) })} aria-label="Remove option" style={{ padding: 6, borderRadius: 7, border: "1px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "flex" }}><Trash2 size={13} color="#dc2626" /></button>
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={() => setEditing({ ...editing, options: [...editing.options, { id: newMenuId("opt"), name: "", price: 0 }] })}
                style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px dashed #d1d5db", background: "#fafafd", fontSize: 12, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>
                <Plus size={13} /> Add option
              </button>
            </div>

            {error && <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, paddingTop: 14, borderTop: "1px solid #f0f0f8" }}>
              <button type="button" onClick={() => { setEditing(null); setError(""); }} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}>Back</button>
              <button type="button" onClick={saveEditing} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #9A3412, #F97316)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Save group</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
