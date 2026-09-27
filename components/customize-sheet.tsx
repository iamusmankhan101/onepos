"use client";

/**
 * The POS pop-up for an item with options (lib/menu.ts): pick a size, milk,
 * add-ons… and see the price build up before it goes on the order.
 */

import { useState } from "react";
import { Minus, Plus, X, StickyNote } from "lucide-react";
import {
  chosenModifiers, modifiersTotal, selectionProblem, toggleOption,
  type ChosenModifier, type ModifierGroup, type Selection,
} from "@/lib/menu";

export default function CustomizeSheet({ name, basePrice, groups, initial, initialQty = 1, initialNote = "", editing, money, onConfirm, onClose }: {
  name: string;
  basePrice: number;
  groups: ModifierGroup[];
  initial: Selection;
  initialQty?: number;
  initialNote?: string;
  /** Changing a line already in the cart rather than adding a new one. */
  editing?: boolean;
  money: (n: number) => string;
  onConfirm: (modifiers: ChosenModifier[], qty: number, note: string) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Selection>(initial);
  const [qty, setQty] = useState(initialQty);
  const [note, setNote] = useState(initialNote);
  const [showProblem, setShowProblem] = useState(false);

  const mods = chosenModifiers(groups, sel);
  const unit = basePrice + modifiersTotal(mods);
  const problem = selectionProblem(groups, sel);

  function confirm() {
    if (problem) { setShowProblem(true); return; }
    onConfirm(mods, qty, note.trim());
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(15,15,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Customize ${name}`}
        style={{ width: "100%", maxWidth: 520, maxHeight: "92vh", background: "#fff", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f2f2f8", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#1d1d2f" }}>{name}</div>
            <div style={{ fontSize: 12, color: "#9999b0", marginTop: 2 }}>Base {money(basePrice)}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0", display: "flex", padding: 2 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((g) => {
            const picked = sel[g.id] ?? [];
            const missing = showProblem && g.required && picked.length === 0;
            return (
              <div key={g.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: missing ? "#dc2626" : "#1d1d2f", textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: g.required ? "#b45309" : "#b0b0c8" }}>
                    {g.required ? "Required" : "Optional"}{g.multi ? (g.maxSelect ? ` · up to ${g.maxSelect}` : " · pick any") : ""}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 7 }}>
                  {g.options.map((o) => {
                    const on = picked.includes(o.id);
                    return (
                      <button key={o.id} type="button" aria-pressed={on} onClick={() => { setSel((s) => toggleOption(s, g, o.id)); setShowProblem(false); }}
                        style={{ textAlign: "left", padding: "10px 11px", borderRadius: 11, border: `2px solid ${on ? "#EA580C" : missing ? "#fecaca" : "#ececf4"}`, background: on ? "#fff7ed" : "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: on ? "#9A3412" : "#1d1d2f", lineHeight: 1.25 }}>{o.name}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: on ? "#EA580C" : "#9999b0", marginTop: 2 }}>{o.price > 0 ? `+ ${money(o.price)}` : "—"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#1d1d2f", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
              <StickyNote size={12} /> Note for the {groups.length ? "bar / kitchen" : "kitchen"}
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Extra hot, less foam, name on cup…"
              style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, outline: "none", background: "#fafafe" }} />
          </label>
        </div>

        <div style={{ padding: "14px 20px 18px", borderTop: "1px solid #f2f2f8", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8f4", borderRadius: 11, overflow: "hidden", flexShrink: 0 }}>
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One less" style={{ width: 38, height: 42, border: "none", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={14} color="#EA580C" /></button>
            <div style={{ width: 34, textAlign: "center", fontSize: 15, fontWeight: 900 }}>{qty}</div>
            <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="One more" style={{ width: 38, height: 42, border: "none", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={14} color="#EA580C" /></button>
          </div>
          <button type="button" onClick={confirm}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: problem ? "#e8e8f0" : "linear-gradient(135deg,#9A3412,#F97316)", color: problem ? "#8a8aa6" : "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {showProblem && problem ? problem : `${editing ? "Update" : "Add"} · ${money(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
