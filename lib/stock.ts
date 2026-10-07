/**
 * lib/stock.ts
 *
 * Ingredient inventory and recipe costing for restaurant mode.
 *
 * There is no separate ingredient record. An ingredient is an ordinary
 * InventoryItem — coffee beans in kg, milk in l, cups in pcs — usually with no
 * selling price, so it never shows on the POS. What changes is that a menu
 * item can have a *recipe*:
 *
 *   • An item with a recipe is made to order. It has no stock of its own
 *     (tracksStock() is false); selling one takes its ingredients out instead.
 *   • A recipe line can point at another item that itself has a recipe — a
 *     prepared base, or the burger inside a combo — and is expanded through it.
 *     A recipe may make a batch (recipeYield): a sauce recipe that makes 2 kg,
 *     of which a pizza uses 100 g.
 *   • A sized item can have a recipe per size (ItemSize.recipe); the size
 *     picked on the order decides which one is used.
 *   • A recipe line can carry a prep-loss percentage (RecipeLine.waste).
 *   • A menu option (lib/menu.ts) can carry recipe lines too: "Large" adds
 *     milk and beans; "Oat milk" adds oat milk and, with a negative quantity,
 *     takes back the full-cream milk the base recipe uses.
 *
 * Every change to stock is written as a StockMovement (sale, purchase, waste,
 * count) so usage and wastage can be reported later, and quantities are
 * always stored in the ingredient's own unit.
 */

import { persistEntity } from "./turso-sync";
import { entityStorageKey } from "./sync-records";
import { getStoredInventory, saveInventory } from "./storage";
import type { InventoryItem, InventoryUnit, RecipeLine } from "./types";
import { SIZE_GROUP_ID, type ChosenModifier, type ModifierGroup } from "./menu";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { RecipeLine };

/** "return": goods sent back to a supplier (lib/ledger.ts). */
export type MovementType = "sale" | "purchase" | "waste" | "count" | "return";

export interface MovementLine {
  itemId: string;
  name: string;
  /** Signed change to stock, in the item's own unit: −0.018 kg of beans sold, +5 l of milk received. */
  qty: number;
  unit: InventoryUnit;
  /** Value of the change at the cost price of the time, always positive. */
  cost: number;
}

export interface StockMovement {
  id: string;
  type: MovementType;
  at: string;
  /** Local YYYY-MM-DD, for date-range reports. */
  date: string;
  /** Invoice or purchase-order number, for people to read. */
  ref?: string;
  /**
   * The invoice's or purchase order's id. Numbers can repeat (a deleted
   * invoice's number is handed out again), so this is what finds the
   * movement a record made.
   */
  refId?: string;
  /** Wastage: why — "Expired", "Spilled". */
  reason?: string;
  note?: string;
  by?: string;
  lines: MovementLine[];
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  contact?: string;
  notes?: string;
}

export type PurchaseStatus = "ordered" | "received" | "cancelled";

export interface PurchaseLine {
  itemId: string;
  name: string;
  /** In the item's own unit. */
  qty: number;
  unit: InventoryUnit;
  /** Per unit of the item. */
  unitCost: number;
  /** Set on receipt, for the batch. */
  expiresOn?: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId?: string;
  supplierName: string;
  status: PurchaseStatus;
  lines: PurchaseLine[];
  notes?: string;
  createdAt: string;
  expectedOn?: string;
  receivedAt?: string;
  /** The supplier's own bill / invoice number for the delivery. */
  billNumber?: string;
}

// ─── Units ────────────────────────────────────────────────────────────────────

/** How many of the base unit one of `unit` is: 1 kg = 1000 g. */
const SCALE: Partial<Record<InventoryUnit, { base: InventoryUnit; factor: number }>> = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
};

/** Multiplier turning a quantity in `from` into `to`, or null when they don't convert (g → pcs). */
export function unitFactor(from: InventoryUnit, to: InventoryUnit): number | null {
  if (from === to) return 1;
  const a = SCALE[from];
  const b = SCALE[to];
  if (!a || !b || a.base !== b.base) return null;
  return a.factor / b.factor;
}

/** The units a recipe may measure this item in: kg stock → g or kg. */
export function compatibleUnits(unit: InventoryUnit): InventoryUnit[] {
  const s = SCALE[unit];
  if (!s) return [unit];
  return (Object.keys(SCALE) as InventoryUnit[]).filter((u) => SCALE[u]!.base === s.base);
}

/** A sensible unit to measure a portion of this item in: g for kg stock, ml for l. */
export function portionUnit(unit: InventoryUnit): InventoryUnit {
  return unit === "kg" ? "g" : unit === "l" ? "ml" : unit;
}

export function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function fmtQty(n: number, unit: InventoryUnit): string {
  // Show small kg/l amounts in g/ml so "0.018 kg" reads as "18 g".
  const small = portionUnit(unit);
  if (small !== unit && Math.abs(n) < 1 && n !== 0) {
    const f = unitFactor(unit, small)!;
    return `${roundQty(n * f).toLocaleString("en-PK", { maximumFractionDigits: 1 })} ${small}`;
  }
  return `${roundQty(n).toLocaleString("en-PK", { maximumFractionDigits: 3 })} ${unit}`;
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export function hasRecipe(item: Pick<InventoryItem, "recipe"> | undefined): boolean {
  return !!item?.recipe?.length;
}

/** Whether this item's own stock count means anything. A made-to-order item's doesn't. */
export function tracksStock(item: Pick<InventoryItem, "recipe">): boolean {
  return !hasRecipe(item);
}

type Usage = Map<string, number>;

function add(usage: Usage, itemId: string, qty: number) {
  usage.set(itemId, (usage.get(itemId) ?? 0) + qty);
}

const MAX_DEPTH = 5;

/** A recipe line's amount with its prep loss added: 20 g at 10% waste takes 22 g. */
function grossQty(line: RecipeLine): number {
  return line.qty * (1 + Math.max(0, line.waste ?? 0) / 100);
}

/**
 * Adds what `qty` (in `unit`) of an item consumes to `usage`, in each stocked
 * item's own unit. An item with a recipe is expanded through it — its recipe
 * is for one of the item's own unit — anything else is used as itself.
 */
function consume(usage: Usage, byId: Map<string, InventoryItem>, itemId: string, qty: number, unit: InventoryUnit | undefined, depth: number, seen: Set<string>) {
  const item = byId.get(itemId);
  if (!item) return;
  const factor = unit ? unitFactor(unit, item.unit) : 1;
  if (factor === null) return;
  const own = qty * factor;
  if (hasRecipe(item) && depth < MAX_DEPTH && !seen.has(itemId)) {
    const next = new Set(seen).add(itemId);
    const batches = own / ((item.recipeYield ?? 0) > 0 ? item.recipeYield! : 1);
    for (const line of item.recipe!) consume(usage, byId, line.itemId, grossQty(line) * batches, line.unit, depth + 1, next);
    return;
  }
  add(usage, itemId, own);
}

function optionRecipe(groups: ModifierGroup[], mod: ChosenModifier): RecipeLine[] {
  return groups.find((g) => g.id === mod.groupId)?.options.find((o) => o.id === mod.optionId)?.recipe ?? [];
}

/** The recipe of the size picked on an order line, when that size has its own. */
function sizeRecipe(item: InventoryItem | undefined, modifiers: ChosenModifier[] | undefined): RecipeLine[] | undefined {
  const sizeId = modifiers?.find((m) => m.groupId === SIZE_GROUP_ID)?.optionId;
  const recipe = sizeId ? item?.sizes?.find((sz) => sz.id === sizeId)?.recipe : undefined;
  return recipe?.length ? recipe : undefined;
}

/**
 * What one order line uses: the picked size's recipe, else the item's recipe
 * (or the item itself), plus its options' recipe lines, times the quantity. A
 * line never puts stock back — an ingredient an option takes away below zero
 * counts as zero.
 */
export function lineUsage(
  line: { itemId: string; qty: number; modifiers?: ChosenModifier[] },
  items: InventoryItem[],
  groups: ModifierGroup[],
): Usage {
  const byId = new Map(items.map((i) => [i.id, i]));
  const usage: Usage = new Map();
  const bySize = sizeRecipe(byId.get(line.itemId), line.modifiers);
  if (bySize) {
    for (const r of bySize) consume(usage, byId, r.itemId, grossQty(r) * line.qty, r.unit, 1, new Set([line.itemId]));
  } else {
    consume(usage, byId, line.itemId, line.qty, undefined, 0, new Set());
  }
  for (const mod of line.modifiers ?? []) {
    for (const r of optionRecipe(groups, mod)) consume(usage, byId, r.itemId, grossQty(r) * line.qty, r.unit, 1, new Set([line.itemId]));
  }
  for (const [id, q] of usage) if (q <= 0) usage.delete(id);
  return usage;
}

/** What one of an order line costs to make — its size and options included — at today's cost prices. */
export function lineCost(
  line: { itemId: string; modifiers?: ChosenModifier[] },
  items: InventoryItem[],
  groups: ModifierGroup[],
): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  let total = 0;
  for (const [id, q] of lineUsage({ ...line, qty: 1 }, items, groups)) total += q * (byId.get(id)?.costPrice ?? 0);
  return total;
}

/** Cost of `qty` (in `unit`) of an item: through its recipe if it has one. */
function costOf(byId: Map<string, InventoryItem>, itemId: string, qty: number, unit: InventoryUnit | undefined): number {
  const usage: Usage = new Map();
  consume(usage, byId, itemId, qty, unit, 0, new Set());
  let total = 0;
  for (const [id, q] of usage) total += q * (byId.get(id)?.costPrice ?? 0);
  return total;
}

/** Cost of one serving of an item: its recipe, or its own cost price. */
export function itemCost(item: InventoryItem, items: InventoryItem[]): number {
  return costOf(new Map(items.map((i) => [i.id, i])), item.id, 1, undefined);
}

/** Cost a recipe adds (or saves, when negative). */
export function recipeCost(lines: RecipeLine[] | undefined, items: InventoryItem[]): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (lines ?? []).reduce((sum, l) => sum + Math.sign(l.qty) * costOf(byId, l.itemId, Math.abs(grossQty(l)), l.unit), 0);
}

/**
 * Re-prices every made-to-order item from its recipe, so a recipe item's
 * costPrice — shown as its cost, margin and stock value everywhere — follows
 * what its ingredients cost now. Returns the same array when nothing changed.
 */
export function refreshRecipeCosts(items: InventoryItem[]): InventoryItem[] {
  let changed = false;
  const next = items.map((i) => {
    if (!hasRecipe(i)) return i;
    const cost = Math.round(itemCost(i, items) * 100) / 100;
    if (cost === i.costPrice) return i;
    changed = true;
    return { ...i, costPrice: cost };
  });
  return changed ? next : items;
}

/** Food/beverage cost as a percentage of the selling price, or null with no price. */
export function costPercent(cost: number, price: number): number | null {
  return price > 0 ? Math.round((cost / price) * 1000) / 10 : null;
}

/** Items a recipe can use: anything except the item itself and items built from it. */
export function recipeCandidates(items: InventoryItem[], selfId?: string): InventoryItem[] {
  if (!selfId) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const usesSelf = (id: string, depth = 0): boolean => {
    if (id === selfId) return true;
    if (depth > MAX_DEPTH) return false;
    return (byId.get(id)?.recipe ?? []).some((l) => usesSelf(l.itemId, depth + 1));
  };
  return items.filter((i) => !usesSelf(i.id));
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const MOVEMENTS = "stock_movements";
const SUPPLIERS = "suppliers";
const PURCHASES = "purchase_orders";

export const STOCK_CHANGED_EVENT = "pointly_stock_changed";

function readList<T>(entity: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(entityStorageKey(entity)) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STOCK_CHANGED_EVENT));
}

export function newStockId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getMovements(): StockMovement[] {
  return readList<StockMovement>(MOVEMENTS);
}

export function getSuppliers(): Supplier[] {
  return readList<Supplier>(SUPPLIERS);
}

export function saveSuppliers(list: Supplier[], deletedIds: string[] = []): Promise<boolean> {
  const saved = persistEntity(SUPPLIERS, list, { inferDeletes: false, deletedIds });
  announce();
  return saved;
}

export function getPurchaseOrders(): PurchaseOrder[] {
  return readList<PurchaseOrder>(PURCHASES);
}

/** Saves one purchase order over the freshly-read list. */
export function savePurchaseOrder(po: PurchaseOrder): Promise<boolean> {
  const current = getPurchaseOrders();
  const next = current.some((p) => p.id === po.id) ? current.map((p) => (p.id === po.id ? po : p)) : [po, ...current];
  const saved = persistEntity(PURCHASES, next, { inferDeletes: false });
  announce();
  return saved;
}

export function nextPurchaseNumber(): string {
  const highest = getPurchaseOrders().reduce((max, p) => Math.max(max, parseInt(p.number.replace(/\D/g, ""), 10) || 0), 0);
  return `PO-${String(highest + 1).padStart(4, "0")}`;
}

export function purchaseTotal(po: Pick<PurchaseOrder, "lines">): number {
  return po.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
}

// ─── Moving stock ─────────────────────────────────────────────────────────────

export interface StockChange {
  itemId: string;
  /** Signed, in the item's own unit. */
  qty: number;
  /** Purchases: the new cost per unit, which becomes the item's cost price. */
  unitCost?: number;
  /** Purchases: the batch's expiry date. */
  expiresOn?: string;
}

/**
 * Applies stock changes and records them as one movement. Re-reads the stored
 * inventory rather than trusting a page's copy, so a sale on one screen never
 * writes back a stale count another screen just changed.
 */
export async function recordMovement(
  type: MovementType,
  changes: StockChange[],
  meta: { ref?: string; refId?: string; reason?: string; note?: string; by?: string } = {},
): Promise<StockMovement | null> {
  const real = changes.filter((c) => c.qty !== 0 && Number.isFinite(c.qty));
  if (real.length === 0) return null;
  const items = getStoredInventory();
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines: MovementLine[] = [];
  const updated = new Map<string, InventoryItem>();

  for (const c of real) {
    const item = updated.get(c.itemId) ?? byId.get(c.itemId);
    if (!item) continue;
    const before = item.currentStock || 0;
    const after = roundQty(Math.max(0, before + c.qty));
    const next: InventoryItem = { ...item, currentStock: after };
    if (type === "purchase") {
      if (c.unitCost !== undefined && c.unitCost > 0) next.costPrice = roundQty(c.unitCost);
      next.lastRestocked = localDate();
      if (c.expiresOn) {
        // Earliest batch still on the shelf is what matters; a restock from empty starts over.
        next.expiresOn = before <= 0 || !item.expiresOn || c.expiresOn < item.expiresOn ? c.expiresOn : item.expiresOn;
      }
    }
    if (after <= 0) delete next.expiresOn;
    updated.set(item.id, next);
    lines.push({
      itemId: item.id,
      name: item.name,
      qty: roundQty(c.qty),
      unit: item.unit,
      cost: Math.round(Math.abs(c.qty) * (type === "purchase" && c.unitCost ? c.unitCost : item.costPrice || 0)),
    });
  }
  if (lines.length === 0) return null;

  saveInventory(refreshRecipeCosts(items.map((i) => updated.get(i.id) ?? i)));
  const now = new Date();
  const movement: StockMovement = { id: newStockId("mv"), type, at: now.toISOString(), date: localDate(now), lines, ...meta };
  await persistEntity(MOVEMENTS, [movement, ...getMovements()], { inferDeletes: false });
  announce();
  return movement;
}

/**
 * Takes a sale out of stock: each recipe through its ingredients (options
 * included), each plain item as itself.
 */
export function saleChanges(
  lines: { itemId: string; qty: number; modifiers?: ChosenModifier[] }[],
  items: InventoryItem[],
  groups: ModifierGroup[],
): StockChange[] {
  const total: Usage = new Map();
  for (const line of lines) for (const [id, q] of lineUsage(line, items, groups)) add(total, id, q);
  return [...total].map(([itemId, qty]) => ({ itemId, qty: -roundQty(qty) }));
}

type SaleLine = { itemId: string; qty: number; modifiers?: ChosenModifier[] };

/**
 * The first stocked item `lines` need more of than is left on the shelf once
 * `committed` (unpaid orders, which haven't come off stock yet) is set aside,
 * or null when they can be made — what the POS's automatic sold-out checks.
 * Only what `lines` use is checked, so an ingredient already overdrawn by
 * other orders doesn't sell out dishes that don't need it.
 */
export function shortIngredient(lines: SaleLine[], items: InventoryItem[], groups: ModifierGroup[], committed: SaleLine[] = []): InventoryItem | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const promised = new Map(saleChanges(committed, items, groups).map((c) => [c.itemId, -c.qty]));
  for (const c of saleChanges(lines, items, groups)) {
    const item = byId.get(c.itemId);
    if (item && -c.qty + (promised.get(c.itemId) ?? 0) > (item.currentStock || 0) + 1e-9) return item;
  }
  return null;
}

// ─── Deleting ─────────────────────────────────────────────────────────────────

/**
 * Removes a movement from the log and reverses what it did to stock — undoing
 * a wastage entry puts the stock back. Cost prices a purchase changed stay as
 * they are.
 */
export async function undoMovement(movement: StockMovement): Promise<void> {
  const items = getStoredInventory();
  const byId = new Map(movement.lines.map((l) => [l.itemId, l.qty]));
  const reversed = items.map((i) => {
    const qty = byId.get(i.id);
    return qty === undefined ? i : { ...i, currentStock: roundQty(Math.max(0, (i.currentStock || 0) - qty)) };
  });
  saveInventory(refreshRecipeCosts(reversed));
  await persistEntity(MOVEMENTS, getMovements().filter((m) => m.id !== movement.id), { inferDeletes: false, deletedIds: [movement.id] });
  announce();
}

/**
 * The stock movement an invoice or purchase order made: by its id, or — for
 * movements written before ids were recorded — by its number.
 */
export function movementFor(type: MovementType, record: { id: string; number: string }): StockMovement | undefined {
  const movements = getMovements().filter((m) => m.type === type);
  return movements.find((m) => m.refId === record.id)
    ?? movements.find((m) => !m.refId && m.ref === record.number);
}

/** Every stock movement an invoice made — the sale, plus any edits to it since. */
export function movementsFor(type: MovementType, record: { id: string; number: string }): StockMovement[] {
  const byId = getMovements().filter((m) => m.type === type && m.refId === record.id);
  if (byId.length) return byId;
  const legacy = movementFor(type, record);
  return legacy ? [legacy] : [];
}

/** Deletes a purchase order; a received one also takes its delivery back out of stock. */
export async function deletePurchaseOrder(po: PurchaseOrder): Promise<void> {
  if (po.status === "received") {
    const movement = movementFor("purchase", po);
    if (movement) await undoMovement(movement);
  }
  await persistEntity(PURCHASES, getPurchaseOrders().filter((p) => p.id !== po.id), { inferDeletes: false, deletedIds: [po.id] });
  announce();
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(item: InventoryItem): StockLevel {
  if (!tracksStock(item)) return "ok";
  if ((item.currentStock || 0) <= 0) return "out";
  if (item.currentStock <= item.minStock) return "low";
  return "ok";
}

export type ExpiryState = "expired" | "soon" | null;

/** Expired, or expiring within `days` days — only while there's stock to expire. */
export function expiryState(item: InventoryItem, days = 3, today = localDate()): ExpiryState {
  if (!item.expiresOn || (item.currentStock || 0) <= 0) return null;
  if (item.expiresOn < today) return "expired";
  const soon = new Date(today + "T00:00:00");
  soon.setDate(soon.getDate() + days);
  return item.expiresOn <= localDate(soon) ? "soon" : null;
}

export const WASTE_REASONS = ["Expired", "Spoiled", "Spilled / dropped", "Burnt / made wrong", "Staff meal", "Customer return", "Other"];
