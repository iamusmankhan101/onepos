"use client";

/**
 * Edits a recipe (lib/stock.ts): which stocked items, and how much of each.
 * Used for a menu item's own recipe and for what a menu option adds or takes
 * away (`allowNegative`).
 */

import { Plus, Trash2 } from "lucide-react";
import { compatibleUnits, hasRecipe, portionUnit, recipeCost } from "@/lib/stock";
import type { InventoryItem, InventoryUnit, RecipeLine } from "@/lib/types";

const INP: React.CSSProperties = {
  padding: "7px 8px", borderRadius: 8, border: "1px solid #e8e8f0", fontSize: 12.5,
  color: "#1a1a2e", outline: "none", background: "#fff", boxSizing: "border-box", minWidth: 0,
};

export default function RecipeEditor({ lines, onChange, items, money, allowNegative = false, emptyHint }: {
  lines: RecipeLine[];
  onChange: (next: RecipeLine[]) => void;
  /** What may go in the recipe — lib/stock.ts recipeCandidates() keeps an item out of its own recipe. */
  items: InventoryItem[];
  money: (n: number) => string;
  allowNegative?: boolean;
  emptyHint?: string;
}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  // Ingredients first, then anything made from a recipe (bases, combo parts).
  const sorted = [...items].sort((a, b) => Number(hasRecipe(a)) - Number(hasRecipe(b)) || a.name.localeCompare(b.name));
  const total = recipeCost(lines, items);

  function patch(index: number, next: Partial<RecipeLine>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...next } : l)));
  }

  function pick(index: number, itemId: string) {
    const item = byId.get(itemId);
    if (!item) return;
    patch(index, { itemId, unit: portionUnit(item.unit) });
  }

  function addLine() {
    const first = sorted.find((i) => !lines.some((l) => l.itemId === i.id));
    if (!first) return;
    onChange([...lines, { itemId: first.id, qty: 0, unit: portionUnit(first.unit) }]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.length === 0 && (
        <div style={{ fontSize: 12, color: "#9898b0" }}>{emptyHint ?? "No ingredients yet."}</div>
      )}
      {lines.map((line, index) => {
        const item = byId.get(line.itemId);
        const units: InventoryUnit[] = item ? compatibleUnits(item.unit) : [line.unit];
        const lineCost = recipeCost([line], items);
        return (
          <div key={index} className="rc-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 72px 58px 64px 30px", gap: 6, alignItems: "center" }}>
            <select className="rc-item" value={line.itemId} onChange={(e) => pick(index, e.target.value)} style={INP} aria-label="Ingredient">
              {!item && <option value={line.itemId}>(deleted item)</option>}
              {sorted.map((i) => (
                <option key={i.id} value={i.id}>{i.name}{hasRecipe(i) ? " (recipe)" : ""}</option>
              ))}
            </select>
            <input type="number" step="any" min={allowNegative ? undefined : 0} value={line.qty || ""} placeholder="0"
              onChange={(e) => patch(index, { qty: Number(e.target.value) || 0 })} style={INP} aria-label={`Quantity of ${item?.name ?? "ingredient"}`} />
            <select value={line.unit} onChange={(e) => patch(index, { unit: e.target.value as InventoryUnit })} style={INP} aria-label="Unit">
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: lineCost < 0 ? "#059669" : "#6b6b8a", textAlign: "right", whiteSpace: "nowrap" }}>
              {lineCost < 0 ? "−" : ""}{money(Math.abs(lineCost))}
            </div>
            <button type="button" onClick={() => onChange(lines.filter((_, i) => i !== index))} aria-label="Remove ingredient"
              style={{ padding: 6, borderRadius: 7, border: "1px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "flex", justifyContent: "center" }}>
              <Trash2 size={13} color="#dc2626" />
            </button>
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
        <button type="button" onClick={addLine} disabled={items.length === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: "1px dashed #d1d5db", background: "#fafafd", fontSize: 12, fontWeight: 700, color: "#6b6b8a", cursor: items.length ? "pointer" : "not-allowed" }}>
          <Plus size={13} /> Add ingredient
        </button>
        {items.length === 0 && <span style={{ fontSize: 11.5, color: "#9898b0" }}>Add ingredients on the Inventory page first.</span>}
        {lines.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#1a1a2e" }}>
            {allowNegative && total < 0 ? "Saves " : "Cost "}{money(Math.abs(total))}
          </span>
        )}
      </div>
      {allowNegative && lines.length > 0 && (
        <div style={{ fontSize: 11, color: "#9898b0" }}>A negative amount takes that much back out of the item&apos;s own recipe.</div>
      )}
    </div>
  );
}
