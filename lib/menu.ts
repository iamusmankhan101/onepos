/**
 * lib/menu.ts
 *
 * Menu options for restaurant mode: sizes, milk, extra shots, syrups, ice and
 * sugar levels, add-ons, "no onions" style removals — and combos, which are
 * just an item with a "Choose a drink" group.
 *
 * Options live in shared ModifierGroups rather than on each item, because a
 * café puts the same "Milk" choice on twenty drinks and wants to raise the
 * oat-milk price once. A menu item lists the groups it offers
 * (InventoryItem.modifierGroupIds), in the order the POS asks them.
 *
 * What was picked is copied onto the order line as ChosenModifier[] — names
 * and prices at the moment of sale — so renaming or repricing an option later
 * never rewrites an order, a kitchen ticket or a receipt.
 */

import { persistEntity } from "./turso-sync";
import { entityStorageKey } from "./sync-records";
import type { InventoryItem, RecipeLine } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModifierOption {
  id: string;
  name: string;
  /** Added to the item's price per unit; 0 for a free choice, never negative. */
  price: number;
  /**
   * Ingredients this choice adds to the item's recipe (lib/stock.ts). A
   * negative quantity takes some back — oat milk removes the full-cream milk.
   */
  recipe?: RecipeLine[];
}

export interface ModifierGroup {
  id: string;
  /** "Size", "Milk", "Syrup" — the question the POS asks. */
  name: string;
  /** At least one option must be picked (a size, a temperature). */
  required: boolean;
  /** More than one option may be picked (syrups, toppings, removals). */
  multi: boolean;
  /** For a multi group: the most options that can be picked. Unset = no limit. */
  maxSelect?: number;
  /** Pre-selected when the item is added — "Regular" size, "Full cream" milk. */
  defaultOptionIds?: string[];
  options: ModifierOption[];
}

/** One picked option, frozen onto an order line. */
export interface ChosenModifier {
  groupId: string;
  group: string;
  optionId: string;
  name: string;
  price: number;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const GROUPS = "modifier_groups";

export const MENU_CHANGED_EVENT = "pointly_menu_changed";

export function getModifierGroups(): ModifierGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(entityStorageKey(GROUPS)) || "[]");
    return Array.isArray(parsed) ? parsed as ModifierGroup[] : [];
  } catch {
    return [];
  }
}

/**
 * Saves the full list. Deletes must be named in `deletedIds` — a missing group
 * is never read as a delete (see inferDeletes in lib/sync-records.ts).
 */
export function saveModifierGroups(groups: ModifierGroup[], deletedIds: string[] = []): Promise<boolean> {
  const saved = persistEntity(GROUPS, groups, { inferDeletes: false, deletedIds });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MENU_CHANGED_EVENT));
  return saved;
}

export function newMenuId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * An item's base price for an order type: its takeaway or delivery price when
 * it has one, otherwise the ordinary selling price. Options are priced the
 * same whichever way the order is served.
 */
export function priceForOrderType(
  item: Pick<InventoryItem, "retailPrice" | "takeawayPrice" | "deliveryPrice">,
  orderType?: string,
): number {
  if (orderType === "takeaway" && (item.takeawayPrice ?? 0) > 0) return item.takeawayPrice!;
  if (orderType === "delivery" && (item.deliveryPrice ?? 0) > 0) return item.deliveryPrice!;
  return item.retailPrice ?? 0;
}

/** The groups an item offers, in its own order, skipping any since deleted. */
export function groupsForItem(item: Pick<InventoryItem, "modifierGroupIds"> | undefined, groups: ModifierGroup[]): ModifierGroup[] {
  if (!item?.modifierGroupIds?.length) return [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  return item.modifierGroupIds.map((id) => byId.get(id)).filter((g): g is ModifierGroup => !!g && g.options.length > 0);
}

/** Selection as the customize sheet holds it: group id → picked option ids. */
export type Selection = Record<string, string[]>;

export function defaultSelection(groups: ModifierGroup[]): Selection {
  const sel: Selection = {};
  for (const g of groups) {
    const valid = (g.defaultOptionIds ?? []).filter((id) => g.options.some((o) => o.id === id));
    sel[g.id] = g.multi ? valid : valid.slice(0, 1);
  }
  return sel;
}

/** Taps an option: a single-choice group swaps, a multi group toggles (up to its max). */
export function toggleOption(sel: Selection, group: ModifierGroup, optionId: string): Selection {
  const current = sel[group.id] ?? [];
  let next: string[];
  if (!group.multi) {
    next = current[0] === optionId && !group.required ? [] : [optionId];
  } else if (current.includes(optionId)) {
    next = current.filter((id) => id !== optionId);
  } else if (group.maxSelect && current.length >= group.maxSelect) {
    next = group.maxSelect === 1 ? [optionId] : current;
  } else {
    next = [...current, optionId];
  }
  return { ...sel, [group.id]: next };
}

/** The first thing stopping this selection from going on the order, or null. */
export function selectionProblem(groups: ModifierGroup[], sel: Selection): string | null {
  for (const g of groups) {
    if (g.required && (sel[g.id] ?? []).length === 0) return `Choose a ${g.name.toLowerCase()}`;
  }
  return null;
}

/** The selection as order-line modifiers, in group then option order. */
export function chosenModifiers(groups: ModifierGroup[], sel: Selection): ChosenModifier[] {
  const out: ChosenModifier[] = [];
  for (const g of groups) {
    const picked = new Set(sel[g.id] ?? []);
    for (const o of g.options) {
      if (picked.has(o.id)) out.push({ groupId: g.id, group: g.name, optionId: o.id, name: o.name, price: Math.max(0, o.price || 0) });
    }
  }
  return out;
}

export function selectionFromModifiers(mods: ChosenModifier[] | undefined): Selection {
  const sel: Selection = {};
  for (const m of mods ?? []) sel[m.groupId] = [...(sel[m.groupId] ?? []), m.optionId];
  return sel;
}

export function modifiersTotal(mods: ChosenModifier[] | undefined): number {
  return (mods ?? []).reduce((sum, m) => sum + m.price, 0);
}

/** "Large · Oat Milk · Extra Shot" — how a line's options read everywhere. */
export function modifierSummary(mods: ChosenModifier[] | undefined, sep = " · "): string {
  return (mods ?? []).map((m) => m.name).join(sep);
}

/** Whether two lines carry the same options, so another tap can add to the same line. */
export function sameModifiers(a: ChosenModifier[] | undefined, b: ChosenModifier[] | undefined): boolean {
  const key = (mods: ChosenModifier[] | undefined) => (mods ?? []).map((m) => `${m.groupId}:${m.optionId}`).sort().join("|");
  return key(a) === key(b);
}

/** A receipt/invoice line description: "Iced Latte (Large, Oat Milk, Extra Shot)". */
export function lineDescription(name: string, mods: ChosenModifier[] | undefined): string {
  return mods?.length ? `${name} (${modifierSummary(mods, ", ")})` : name;
}

// ─── Café starter set ─────────────────────────────────────────────────────────

type PresetOption = [name: string, price: number];

interface Preset {
  name: string;
  required: boolean;
  multi: boolean;
  maxSelect?: number;
  /** Index into options of the pre-selected choice. */
  defaultIndex?: number;
  options: PresetOption[];
}

/**
 * The option groups most cafés start from. Prices are placeholders in the
 * account's currency — the owner edits them after adding the set.
 */
export const CAFE_PRESETS: Preset[] = [
  { name: "Size", required: true, multi: false, defaultIndex: 1, options: [["Small", 0], ["Medium", 100], ["Large", 200]] },
  { name: "Temperature", required: true, multi: false, defaultIndex: 0, options: [["Hot", 0], ["Iced", 50]] },
  { name: "Milk", required: false, multi: false, defaultIndex: 0, options: [["Full cream", 0], ["Skimmed", 0], ["Oat milk", 150], ["Almond milk", 150], ["Soy milk", 120], ["No milk", 0]] },
  { name: "Extra shot", required: false, multi: false, options: [["Extra shot", 150], ["Double extra shot", 280], ["Decaf", 0]] },
  { name: "Syrup", required: false, multi: true, maxSelect: 3, options: [["Vanilla", 100], ["Caramel", 100], ["Hazelnut", 100], ["Sugar-free vanilla", 120]] },
  { name: "Toppings", required: false, multi: true, options: [["Whipped cream", 80], ["Chocolate drizzle", 60], ["Caramel drizzle", 60], ["Cinnamon", 0]] },
  { name: "Ice level", required: false, multi: false, options: [["No ice", 0], ["Less ice", 0], ["Extra ice", 0]] },
  { name: "Sugar level", required: false, multi: false, options: [["No sugar", 0], ["Less sugar", 0], ["Extra sugar", 0]] },
];

/** Café menu sections, offered as suggestions in the item form and as POS tabs. */
export const CAFE_MENU_CATEGORIES = [
  "Coffee", "Tea", "Cold beverages", "Shakes", "Smoothies", "Breakfast", "Bakery", "Desserts", "Snacks", "Combos", "Seasonal",
];

export const RESTAURANT_MENU_CATEGORIES = [
  "Starters", "Mains", "BBQ", "Rice", "Breads", "Sides", "Desserts", "Drinks", "Deals",
];

/** Builds groups from the presets, skipping any whose name is already taken. */
export function presetGroups(existing: ModifierGroup[]): ModifierGroup[] {
  const taken = new Set(existing.map((g) => g.name.trim().toLowerCase()));
  return CAFE_PRESETS.filter((p) => !taken.has(p.name.toLowerCase())).map((p) => {
    const options = p.options.map(([name, price]) => ({ id: newMenuId("opt"), name, price }));
    return {
      id: newMenuId("mg"),
      name: p.name,
      required: p.required,
      multi: p.multi,
      maxSelect: p.maxSelect,
      defaultOptionIds: p.defaultIndex !== undefined ? [options[p.defaultIndex].id] : [],
      options,
    };
  });
}
