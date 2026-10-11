/**
 * /api/menu/[id] — the public QR menu. No session: [id] is the owner's user id,
 * printed into each table's QR code by the Tables page.
 *
 * GET  ?l=<branch>&t=<tableId> — business name, the table, and the menu.
 * POST { l, t, lines, name?, phone?, notes? } — a guest's order.
 *
 * Both answer 404 unless the owner switched the QR menu on (settings.qrMenu),
 * and POST also needs ordering on. A guest's order lands as unsent lines on the
 * table's open order (or a new one) — staff look it over and send it to the
 * kitchen, so a prank order never reaches the pass by itself. Prices are always
 * worked out here from the stored menu; the browser only sends ids.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  chosenModifiers, groupsForItem, modifiersTotal, priceForOrderType, selectionProblem, sizeGroup,
  type ModifierGroup, type Selection,
} from "@/lib/menu";
import { newId, stationFor, type DiningTable, type OrderLine, type RestaurantOrder } from "@/lib/restaurant";
import type { InventoryItem } from "@/lib/types";

interface MenuSettings {
  business?: { name?: string; logo?: string; currency?: string; timezone?: string };
  locations?: { items?: { id?: string; name?: string }[] };
  qrMenu?: { enabled?: boolean; ordering?: boolean };
}

function key(userId: string, locationId: string, entity: string): string {
  return locationId === "main" ? `${userId}_${entity}` : `${userId}_${locationId}_${entity}`;
}

async function readRow<T>(entity: string): Promise<T | null> {
  const res = await db.execute({ sql: "SELECT data FROM business_data WHERE entity = ?", args: [entity] });
  if (res.rows.length === 0) return null;
  try { return JSON.parse(res.rows[0].data as string) as T; } catch { return null; }
}

async function readList<T>(entity: string): Promise<T[]> {
  const list = await readRow<unknown>(entity);
  return Array.isArray(list) ? list as T[] : [];
}

/** The settings and branch for this menu, or null when the QR menu is off or the branch doesn't exist. */
async function load(userId: string, l: string | null) {
  if (!/^user_[\w-]+$/.test(userId)) return null;
  const settings = await readRow<MenuSettings>(`${userId}_settings`);
  if (!settings?.qrMenu?.enabled) return null;
  const locationId = l || "main";
  if (locationId !== "main" && !settings.locations?.items?.some((x) => x.id === locationId)) return null;
  return { settings, locationId };
}

/** What a guest may order: priced, not an ingredient, not "price on the day". */
function onMenu(i: InventoryItem): boolean {
  return (i.retailPrice ?? 0) > 0 || (i.sizes?.length ?? 0) > 0;
}

function itemGroups(item: InventoryItem, groups: ModifierGroup[]): ModifierGroup[] {
  return [sizeGroup(item), ...groupsForItem(item, groups)].filter((g): g is ModifierGroup => !!g);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await load(id, req.nextUrl.searchParams.get("l")).catch(() => null);
  if (!loaded) return Response.json({ error: "This menu isn't available." }, { status: 404 });
  const { settings, locationId } = loaded;

  const [inventory, groups, tables] = await Promise.all([
    readList<InventoryItem>(key(id, locationId, "inventory")),
    readList<ModifierGroup>(key(id, locationId, "modifier_groups")),
    readList<DiningTable>(key(id, locationId, "dining_tables")),
  ]);
  const t = req.nextUrl.searchParams.get("t");
  const table = t ? tables.find((x) => x.id === t) : undefined;

  return Response.json({
    business: {
      name: settings.business?.name || "Menu",
      logo: settings.business?.logo || "",
      currency: settings.business?.currency || "PKR",
    },
    table: table ? { id: table.id, name: table.name } : null,
    ordering: settings.qrMenu?.ordering === true,
    items: inventory.filter(onMenu).map((i) => ({
      id: i.id,
      name: `${i.brand ? i.brand + " " : ""}${i.name}`,
      price: priceForOrderType(i, table ? "dine-in" : "takeaway"),
      image: i.image || undefined,
      section: i.menuCategory?.trim() || "Menu",
      unavailable: i.unavailable === true,
      // Recipes are the owner's costing — only names and prices go out.
      groups: itemGroups(i, groups).map((g) => ({ ...g, options: g.options.map(({ id: oid, name, price }) => ({ id: oid, name, price })) })),
    })),
  });
}

interface IncomingLine { itemId?: unknown; qty?: unknown; optionIds?: unknown; note?: unknown }

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limited = await rateLimit("qr-order", clientIp(req), { windowMs: 15 * 60_000, maxAttempts: 15, blockMs: 15 * 60_000 });
  if (limited.blocked) return Response.json({ error: "Too many orders from this phone. Please ask a waiter." }, { status: 429 });

  let body: { l?: unknown; t?: unknown; lines?: unknown; name?: unknown; phone?: unknown; notes?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid order." }, { status: 400 }); }

  const loaded = await load(id, typeof body.l === "string" ? body.l : null).catch(() => null);
  if (!loaded || loaded.settings.qrMenu?.ordering !== true) {
    return Response.json({ error: "Ordering from this menu is switched off. Please ask a waiter." }, { status: 404 });
  }
  const { settings, locationId } = loaded;
  const incoming = Array.isArray(body.lines) ? body.lines as IncomingLine[] : [];
  if (incoming.length === 0 || incoming.length > 30) return Response.json({ error: "Your basket is empty." }, { status: 400 });

  const ordersKey = key(id, locationId, "restaurant_orders");
  const [inventory, groups, tables, orders] = await Promise.all([
    readList<InventoryItem>(key(id, locationId, "inventory")),
    readList<ModifierGroup>(key(id, locationId, "modifier_groups")),
    readList<DiningTable>(key(id, locationId, "dining_tables")),
    readList<RestaurantOrder>(ordersKey),
  ]);

  const table = typeof body.t === "string" && body.t ? tables.find((x) => x.id === body.t) : undefined;
  if (body.t && !table) return Response.json({ error: "This table's QR code is out of date. Please ask a waiter." }, { status: 400 });
  const name = text(body.name, 60);
  const phone = text(body.phone, 20);
  if (!table && !name) return Response.json({ error: "Add your name so we can call you." }, { status: 400 });
  const type = table ? "dine-in" as const : "takeaway" as const;

  const lines: OrderLine[] = [];
  for (const l of incoming) {
    const item = inventory.find((i) => i.id === l.itemId);
    if (!item || !onMenu(item)) return Response.json({ error: "Something in your basket is no longer on the menu." }, { status: 400 });
    if (item.unavailable) return Response.json({ error: `${item.name} is sold out right now.` }, { status: 400 });
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return Response.json({ error: "Invalid quantity." }, { status: 400 });

    const picked = new Set(Array.isArray(l.optionIds) ? l.optionIds.map(String) : []);
    const itemGroupList = itemGroups(item, groups);
    const sel: Selection = {};
    for (const g of itemGroupList) {
      const ids = g.options.filter((o) => picked.has(o.id)).map((o) => o.id);
      sel[g.id] = g.multi ? ids.slice(0, g.maxSelect || ids.length) : ids.slice(0, 1);
    }
    const problem = selectionProblem(itemGroupList, sel);
    if (problem) return Response.json({ error: `${item.name}: ${problem.toLowerCase()}.` }, { status: 400 });
    const modifiers = chosenModifiers(itemGroupList, sel);

    lines.push({
      id: newId("ln"),
      itemId: item.id,
      name: `${item.brand ? item.brand + " " : ""}${item.name}`,
      qty,
      unitPrice: priceForOrderType(item, type) + modifiersTotal(modifiers),
      modifiers: modifiers.length ? modifiers : undefined,
      note: text(l.note, 140) || undefined,
      station: stationFor(item),
      fromQr: true,
    });
  }

  const now = new Date();
  const stamp = now.toISOString();
  const notes = text(body.notes, 200);
  const open = table ? orders.find((o) => o.status === "open" && o.tableIds.includes(table.id)) : undefined;
  let order: RestaurantOrder;
  if (open) {
    // ponytail: read-modify-write of the whole orders row, same as every till's
    // sync; a till saving this same order in the same instant can drop the
    // guest's lines. Per-order rows if that ever shows up in practice.
    order = { ...open, lines: [...open.lines, ...lines], notes: [open.notes, notes].filter(Boolean).join(" · ") || undefined };
  } else {
    const tz = settings.business?.timezone || "Asia/Karachi";
    const day = (d: Date) => { try { return d.toLocaleDateString("en-CA", { timeZone: tz }); } catch { return d.toDateString(); } };
    const today = day(now);
    const highest = orders
      .filter((o) => day(new Date(o.createdAt)) === today)
      .reduce((max, o) => Math.max(max, parseInt(o.number, 10) || 0), 0);
    order = {
      id: newId("ord"),
      number: String(highest + 1),
      type,
      status: "open",
      tableIds: table ? [table.id] : [],
      clientName: name || undefined,
      clientPhone: phone || undefined,
      lines,
      notes: notes || undefined,
      createdAt: stamp,
    };
  }
  const stamped = { ...order, _updatedAt: stamp };
  const next = open ? orders.map((o) => (o.id === open.id ? stamped : o)) : [stamped, ...orders];

  try {
    await db.execute({
      sql: "INSERT OR REPLACE INTO business_data (entity, data, updated_at) VALUES (?, ?, ?)",
      args: [ordersKey, JSON.stringify(next), stamp],
    });
  } catch (err) {
    console.error("[menu] order write failed:", err);
    return Response.json({ error: "Couldn't send your order. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true, number: order.number, table: table?.name ?? null });
}
