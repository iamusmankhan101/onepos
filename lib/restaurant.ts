/**
 * lib/restaurant.ts
 *
 * Restaurant mode: dining tables, open orders (tabs) and kitchen tickets.
 * Only businesses whose type has `restaurantMode` (lib/business-types.ts) see
 * any of it, but the entities sync for every account like the rest.
 *
 * How the three fit together:
 *
 *   • A RestaurantOrder is one tab — a table's dine-in order, a held takeaway,
 *     a delivery. It lives until it is paid (it then points at the invoice the
 *     POS created for it), cancelled, or merged into another order.
 *   • "Firing" an order sends every line not yet sent to the kitchen, as one
 *     KitchenTicket per station (kitchen / bar). Lines are then locked: a
 *     second round of the same dish is a new line and a new ticket, and taking
 *     a fired line back is a void that a manager has to approve.
 *   • The kitchen display writes tickets; the POS and floor plan write orders,
 *     touching a ticket only to void an item or mark food served. Two screens
 *     editing the same record at once is what the whole-record sync merge
 *     handles worst (newest copy wins), so each record mostly has one writer.
 *
 * Every mutation below re-reads the stored list, changes one record and saves
 * with inferDeletes off — pages hold long-lived copies, and saving one of
 * those back must never drop an order another terminal just opened.
 */

import { persistEntity } from "./turso-sync";
import { entityStorageKey } from "./sync-records";
import type { InventoryItem } from "./types";
import type { ChosenModifier } from "./menu";
import { billCharges, discountAmounts, type BillDiscount } from "./charges";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderType = "dine-in" | "takeaway" | "delivery";
export type OrderStatus = "open" | "paid" | "cancelled" | "merged";
export type Station = "kitchen" | "bar";
export type TicketStatus = "new" | "preparing" | "ready" | "served";

export interface DiningTable {
  id: string;
  name: string;
  /** Free-text floor area — "Main hall", "Terrace", "Family". */
  area: string;
  seats: number;
  shape: "square" | "round" | "long";
  /** Position on the floor plan, as a percentage of its width/height. */
  x: number;
  y: number;
}

/** Who approved a void or cancellation, and why. */
export interface Approval {
  reason: string;
  approvedBy: string;
  at: string;
}

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  qty: number;
  /** Per unit, options included. */
  unitPrice: number;
  /** Size, milk, add-ons… (lib/menu.ts) as picked; already counted in unitPrice. */
  modifiers?: ChosenModifier[];
  /** "No onions", "extra spicy" — printed on the kitchen ticket. */
  note?: string;
  station: Station;
  /** Set once the line has gone to the kitchen; the line is locked from then on. */
  firedAt?: string;
  voided?: Approval;
}

export interface RestaurantOrder {
  id: string;
  /** Short daily number the kitchen and the customer call out — "42". */
  number: string;
  type: OrderType;
  status: OrderStatus;
  tableIds: string[];
  guests?: number;
  waiterId?: string;
  waiterName?: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  deliveryAddress?: string;
  lines: OrderLine[];
  notes?: string;
  /** Kitchen should do this one first. */
  rush?: boolean;
  /** The table has asked for the bill. */
  billRequested?: boolean;
  createdAt: string;
  closedAt?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  cancelled?: Approval;
  /** For a "merged" order: the order its lines moved into. */
  mergedInto?: string;
  /**
   * Discounts the cashier gave on this tab, kept with it so sending a round to
   * the kitchen or holding the order doesn't lose them. Loyalty points are
   * redeemed at payment, so they aren't here.
   */
  discount?: BillDiscount;
  discount2?: BillDiscount;
  /** `discount` is the Settings → POS Rules staff discount. */
  staffDiscount?: boolean;
  /** The manager who signed off on the discount, if it needed it. */
  discountApprovedBy?: string;
}

export interface TicketItem {
  lineId: string;
  name: string;
  qty: number;
  /** Option names — "Large", "Oat milk" — for the barista to read. */
  modifiers?: string[];
  note?: string;
  voided?: boolean;
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  orderType: OrderType;
  /** Where the food goes. Moving or merging the order rewrites it on tickets not yet served. */
  tableNames: string[];
  /** The tables it was fired for, when the order has since moved — the paper ticket still says these. */
  movedFrom?: string[];
  waiterName?: string;
  /** Delivery orders: where it's going and who to call — the rider reads it off the ticket. */
  deliveryAddress?: string;
  clientName?: string;
  clientPhone?: string;
  station: Station;
  items: TicketItem[];
  status: TicketStatus;
  rush?: boolean;
  createdAt: string;
  startedAt?: string;
  readyAt?: string;
  servedAt?: string;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export const STATION_LABEL: Record<Station, string> = { kitchen: "Kitchen", bar: "Bar" };

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const TABLES = "dining_tables";
const ORDERS = "restaurant_orders";
const TICKETS = "kitchen_tickets";

/** Fired on `window` whenever this tab changes a table, order or ticket. */
export const RESTAURANT_CHANGED_EVENT = "pointly_restaurant_changed";

function announce(saved: Promise<boolean>): Promise<boolean> {
  // persistEntity has written localStorage synchronously before its first await,
  // so screens can re-read now rather than after the network round trip.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RESTAURANT_CHANGED_EVENT));
  return saved;
}

function readList<T>(entity: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(entityStorageKey(entity)) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

/** Replaces (or adds) records by id in the freshly-read stored list, then saves it. */
function upsert<T extends { id: string }>(entity: typeof ORDERS | typeof TICKETS | typeof TABLES, records: T[]): Promise<boolean> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const current = readList<T>(entity);
  const next = current.map((r) => byId.get(r.id) ?? r);
  for (const r of records) if (!current.some((c) => c.id === r.id)) next.unshift(r);
  return announce(persistEntity(entity, next, { inferDeletes: false }));
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Tables

export function getTables(): DiningTable[] {
  return readList<DiningTable>(TABLES);
}

export function saveTable(table: DiningTable): Promise<boolean> {
  return upsert(TABLES, [table]);
}

export function deleteTable(id: string): Promise<boolean> {
  return announce(persistEntity(TABLES, getTables().filter((t) => t.id !== id), { deletedIds: [id], inferDeletes: false }));
}

// Orders

export function getOrders(): RestaurantOrder[] {
  return readList<RestaurantOrder>(ORDERS);
}

export function getOpenOrders(): RestaurantOrder[] {
  return getOrders()
    .filter((o) => o.status === "open")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getOrder(id: string): RestaurantOrder | undefined {
  return getOrders().find((o) => o.id === id);
}

export function saveOrder(order: RestaurantOrder): Promise<boolean> {
  return upsert(ORDERS, [order]);
}

// Tickets

export function getTickets(): KitchenTicket[] {
  return readList<KitchenTicket>(TICKETS);
}

export function saveTickets(tickets: KitchenTicket[]): Promise<boolean> {
  return tickets.length ? upsert(TICKETS, tickets) : Promise.resolve(true);
}

// ─── Derived values ───────────────────────────────────────────────────────────

/** Drinks go to the bar unless the item says otherwise; everything else to the kitchen. */
export function stationFor(item: Pick<InventoryItem, "category" | "station"> | undefined): Station {
  if (item?.station) return item.station;
  return item?.category === "drinks" ? "bar" : "kitchen";
}

export function liveLines(order: Pick<RestaurantOrder, "lines">): OrderLine[] {
  return order.lines.filter((l) => !l.voided);
}

export function orderSubtotal(order: Pick<RestaurantOrder, "lines">): number {
  return liveLines(order).reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

/** What the order's bill comes to right now: discounts, service charge and tax included. */
export function orderBill(order: Pick<RestaurantOrder, "lines" | "type" | "discount" | "discount2">): {
  subtotal: number; discount: number; serviceCharge: number; tax: number; total: number;
} {
  const subtotal = Math.round(liveLines(order).reduce((sum, l) => sum + l.qty * Math.round(l.unitPrice), 0));
  const [a, b] = discountAmounts(subtotal, order.discount, order.discount2);
  const discount = a + b;
  const { serviceCharge, tax } = billCharges(subtotal - discount, order.type);
  return { subtotal, discount, serviceCharge, tax, total: subtotal - discount + serviceCharge + tax };
}

export function unfiredLines(order: Pick<RestaurantOrder, "lines">): OrderLine[] {
  return liveLines(order).filter((l) => !l.firedAt);
}

/**
 * Next short order number. Numbers restart every day and are derived from the
 * orders this terminal has synced, so two tills ringing up at the same second
 * before either syncs can hand out the same number — the table name and the
 * time on the ticket still tell them apart.
 */
export function nextOrderNumber(now = new Date()): string {
  const today = now.toDateString();
  const highest = getOrders()
    .filter((o) => new Date(o.createdAt).toDateString() === today)
    .reduce((max, o) => Math.max(max, parseInt(o.number, 10) || 0), 0);
  return String(highest + 1);
}

/**
 * Where a new table goes on the floor plan: the first slot of a loose grid
 * that no table in the same area covers, so it never lands on top of one.
 * Positions are percentages of the floor, as on DiningTable.
 */
export function freeTableSpot(existing: Pick<DiningTable, "x" | "y">[]): { x: number; y: number } {
  const W = 16, H = 22; // a table plus breathing room, in % of the floor
  for (let y = 5; y <= 71; y += H) {
    for (let x = 3; x <= 83; x += W) {
      if (!existing.some((t) => Math.abs(t.x - x) < W && Math.abs(t.y - y) < H)) return { x, y };
    }
  }
  return { x: 6 + Math.random() * 70, y: 8 + Math.random() * 60 };
}

export type TableState = "free" | "occupied" | "ready" | "bill";

/** What a table looks like on the floor plan right now. */
export function tableState(tableId: string, openOrders: RestaurantOrder[], tickets: KitchenTicket[]): { state: TableState; order?: RestaurantOrder } {
  const order = openOrders.find((o) => o.tableIds.includes(tableId));
  if (!order) return { state: "free" };
  if (order.billRequested) return { state: "bill", order };
  if (tickets.some((t) => t.orderId === order.id && t.status === "ready")) return { state: "ready", order };
  return { state: "occupied", order };
}

export function tableNames(ids: string[], tables: DiningTable[] = getTables()): string[] {
  return ids.map((id) => tables.find((t) => t.id === id)?.name).filter((n): n is string => !!n);
}

/** "Table 4 + 5", "Takeaway #12", "Delivery #7" — how an order is named everywhere. */
export function orderLabel(order: RestaurantOrder, tables: DiningTable[] = getTables()): string {
  if (order.type === "dine-in") {
    const names = tableNames(order.tableIds, tables);
    if (names.length) return names.join(" + ");
  }
  return `${ORDER_TYPE_LABEL[order.type]} #${order.number}`;
}

/** orderLabel plus the order number where the label doesn't already carry it — "T4 · #12", "Takeaway #12". */
export function orderRef(order: RestaurantOrder, tables: DiningTable[] = getTables()): string {
  const label = orderLabel(order, tables);
  return label.endsWith(`#${order.number}`) ? label : `${label} · #${order.number}`;
}

/** Minutes since an ISO timestamp, never negative (clocks on two tills differ). */
export function minutesSince(iso: string | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Sends every unsent line to the kitchen: one ticket per station. Returns the
 * order as saved and the tickets created (empty when there was nothing new).
 */
export async function fireOrder(order: RestaurantOrder): Promise<{ order: RestaurantOrder; tickets: KitchenTicket[] }> {
  const pending = unfiredLines(order);
  const now = new Date().toISOString();
  if (pending.length === 0) {
    await saveOrder(order);
    return { order, tickets: [] };
  }

  const names = tableNames(order.tableIds);
  const byStation = new Map<Station, OrderLine[]>();
  for (const line of pending) byStation.set(line.station, [...(byStation.get(line.station) ?? []), line]);

  const tickets: KitchenTicket[] = [...byStation.entries()].map(([station, lines]) => ({
    id: newId("kot"),
    orderId: order.id,
    orderNumber: order.number,
    orderType: order.type,
    tableNames: names,
    waiterName: order.waiterName,
    ...(order.type === "delivery" ? {
      deliveryAddress: order.deliveryAddress,
      clientName: order.clientName,
      clientPhone: order.clientPhone,
    } : {}),
    station,
    items: lines.map((l) => ({
      lineId: l.id, name: l.name, qty: l.qty, note: l.note,
      modifiers: l.modifiers?.length ? l.modifiers.map((m) => m.name) : undefined,
    })),
    status: "new",
    rush: order.rush,
    createdAt: now,
  }));

  const firedIds = new Set(pending.map((l) => l.id));
  const fired: RestaurantOrder = {
    ...order,
    lines: order.lines.map((l) => (firedIds.has(l.id) ? { ...l, firedAt: now } : l)),
  };
  await saveTickets(tickets);
  await saveOrder(fired);
  return { order: fired, tickets };
}

/** Marks every ticket item for these lines as voided, so the kitchen stops making them. */
async function voidTicketItems(orderId: string, lineIds: Set<string>): Promise<void> {
  const changed = getTickets()
    .filter((t) => t.orderId === orderId && t.items.some((i) => lineIds.has(i.lineId) && !i.voided))
    .map((t) => ({ ...t, items: t.items.map((i) => (lineIds.has(i.lineId) ? { ...i, voided: true } : i)) }));
  await saveTickets(changed);
}

/** Takes a line back. A fired line needs an approval; an unsent one is simply removed. */
export async function voidLine(order: RestaurantOrder, lineId: string, approval?: Approval): Promise<RestaurantOrder> {
  const line = order.lines.find((l) => l.id === lineId);
  if (!line) return order;
  let next: RestaurantOrder;
  if (line.firedAt) {
    if (!approval) throw new Error("A manager has to approve voiding an item the kitchen already has.");
    next = { ...order, lines: order.lines.map((l) => (l.id === lineId ? { ...l, voided: approval } : l)) };
    await voidTicketItems(order.id, new Set([lineId]));
  } else {
    next = { ...order, lines: order.lines.filter((l) => l.id !== lineId) };
  }
  await saveOrder(next);
  return next;
}

/** Cancels a whole order. Anything already fired needs an approval. */
export async function cancelOrder(order: RestaurantOrder, approval?: Approval): Promise<RestaurantOrder> {
  const fired = liveLines(order).filter((l) => l.firedAt);
  if (fired.length > 0 && !approval) throw new Error("A manager has to approve cancelling an order the kitchen already has.");
  const cancelled: RestaurantOrder = {
    ...order,
    status: "cancelled",
    closedAt: new Date().toISOString(),
    cancelled: approval ?? { reason: "Cancelled before sending to the kitchen", approvedBy: "", at: new Date().toISOString() },
  };
  if (fired.length) await voidTicketItems(order.id, new Set(fired.map((l) => l.id)));
  await saveOrder(cancelled);
  return cancelled;
}

/** Closes an order against the invoice the POS created for it. */
export async function markOrderPaid(orderId: string, invoice: { id: string; number: string }): Promise<void> {
  const order = getOrder(orderId);
  if (!order) return;
  await saveOrder({
    ...order,
    status: "paid",
    billRequested: false,
    closedAt: new Date().toISOString(),
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
  });
}

/**
 * Points the order's unserved kitchen tickets at where the order is now, so
 * food fired before a table move or merge goes to the right table. The
 * tables it was fired for are kept as `movedFrom`, since a printed ticket
 * still says those.
 */
async function retargetTickets(orderIds: string[], order: RestaurantOrder): Promise<void> {
  const names = tableNames(order.tableIds);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((n, i) => n === b[i]);
  const changed = getTickets()
    .filter((t) => orderIds.includes(t.orderId) && t.status !== "served" && !same(t.tableNames, names))
    .map((t) => ({
      ...t,
      orderType: order.type,
      tableNames: names,
      movedFrom: t.movedFrom ?? t.tableNames,
      waiterName: order.waiterName ?? t.waiterName,
    }));
  await saveTickets(changed);
}

/** Moves an order to other table(s); the kitchen's tickets follow it. */
export async function moveOrder(order: RestaurantOrder, tableIds: string[]): Promise<RestaurantOrder> {
  const moved = { ...order, type: "dine-in" as const, tableIds };
  await saveOrder(moved);
  await retargetTickets([order.id], moved);
  return moved;
}

/**
 * Merges `source` into `target`: its lines (fired state and all), tables and
 * guests move across, and `source` is closed as "merged" so it drops off the
 * floor. Kitchen tickets keep pointing at the source order; their table names
 * are brought up to date with the merged order's tables.
 */
export async function mergeOrders(target: RestaurantOrder, source: RestaurantOrder): Promise<RestaurantOrder> {
  const merged: RestaurantOrder = {
    ...target,
    type: target.type === "dine-in" || source.type === "dine-in" ? "dine-in" : target.type,
    tableIds: Array.from(new Set([...target.tableIds, ...source.tableIds])),
    guests: (target.guests ?? 0) + (source.guests ?? 0) || undefined,
    lines: [...target.lines, ...source.lines],
    notes: [target.notes, source.notes].filter(Boolean).join(" · ") || undefined,
    rush: target.rush || source.rush,
  };
  await saveOrder({ ...source, status: "merged", mergedInto: target.id, closedAt: new Date().toISOString() });
  await saveOrder(merged);
  await retargetTickets([target.id, source.id], merged);
  return merged;
}

/**
 * Splits the given lines off into a new order on the same table(s), so each
 * part can be paid on its own — split by guest, or by the tables of a merge.
 */
export async function splitOrder(order: RestaurantOrder, lineIds: string[]): Promise<{ original: RestaurantOrder; split: RestaurantOrder }> {
  const ids = new Set(lineIds);
  const moving = order.lines.filter((l) => ids.has(l.id));
  if (moving.length === 0 || moving.length === order.lines.length) {
    throw new Error("Pick some — but not all — of the items to split off.");
  }
  const split: RestaurantOrder = {
    ...order,
    id: newId("ord"),
    number: nextOrderNumber(),
    lines: moving,
    guests: undefined,
    billRequested: false,
    createdAt: new Date().toISOString(),
    // A percentage discount applies to both parts; a flat one stays with the original, not counted twice.
    discount: order.discount?.type === "pct" ? order.discount : undefined,
    discount2: order.discount2?.type === "pct" ? order.discount2 : undefined,
    staffDiscount: order.discount?.type === "pct" ? order.staffDiscount : undefined,
  };
  const original = { ...order, lines: order.lines.filter((l) => !ids.has(l.id)) };
  await saveOrder(split);
  await saveOrder(original);
  return { original, split };
}

export async function setTicketStatus(ticket: KitchenTicket, status: TicketStatus): Promise<KitchenTicket> {
  const now = new Date().toISOString();
  const next: KitchenTicket = {
    ...ticket,
    status,
    startedAt: status === "preparing" ? ticket.startedAt ?? now : ticket.startedAt,
    readyAt: status === "ready" ? now : status === "served" ? ticket.readyAt ?? now : status === "new" || status === "preparing" ? undefined : ticket.readyAt,
    servedAt: status === "served" ? now : undefined,
  };
  await saveTickets([next]);
  return next;
}

/** Marks every ready ticket of an order as served — the waiter took the food out. */
export async function serveOrder(orderId: string): Promise<void> {
  const now = new Date().toISOString();
  const ready = getTickets()
    .filter((t) => t.orderId === orderId && t.status === "ready")
    .map((t) => ({ ...t, status: "served" as const, servedAt: now }));
  await saveTickets(ready);
}
