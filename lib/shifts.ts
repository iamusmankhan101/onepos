/**
 * lib/shifts.ts
 *
 * Staff operations for restaurant mode: the cash drawer and the time clock.
 *
 *   • A CashShift is one stretch of the till being open — from counting in the
 *     opening float to counting out at close. The branch has at most one open
 *     at a time (it's the drawer, not the person). Sales rung up while it's
 *     open carry its id (Invoice.shiftId), so the close can say how much cash
 *     *should* be in the drawer — float + cash sales − cash refunds + udhaar
 *     collected in cash + cash paid in − cash paid out — against what was
 *     counted. Udhaar collections (lib/ledger.ts) carry the shift's id too.
 *   • A TimeEntry is one clock-in to clock-out for a staff member, which is
 *     what the hours report adds up.
 */

import { persistEntity } from "./turso-sync";
import { entityStorageKey } from "./sync-records";
import { getInvoices, paymentParts, type Invoice } from "./invoices";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashMove {
  id: string;
  at: string;
  /** "in": change added, owner top-up. "out": supplier paid from the till, bank drop. */
  type: "in" | "out";
  amount: number;
  reason: string;
  by?: string;
}

export interface CashShift {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  openedBy: string;
  openingFloat: number;
  moves: CashMove[];
  closedAt?: string;
  closedBy?: string;
  /** Cash counted in the drawer at close. */
  countedCash?: number;
  /** What the drawer should have held at close — frozen so later edits to invoices don't rewrite a closed shift. */
  expectedCash?: number;
  /** Sales summary frozen at close (see shiftSummary). */
  summary?: ShiftSummary;
  notes?: string;
}

export interface ShiftSummary {
  sales: number;
  salesCount: number;
  refunds: number;
  refundCount: number;
  /** Net takings by payment method (refunds included, as negatives). */
  byMethod: Record<string, number>;
  cashSales: number;
  cashRefunds: number;
  paidIn: number;
  paidOut: number;
  discounts: number;
  byCashier: Record<string, { count: number; total: number }>;
  /** Udhaar collected from customers during the shift. Missing on summaries frozen before the khata existed. */
  collected?: number;
  collectedCount?: number;
  collectedCash?: number;
}

export interface TimeEntry {
  id: string;
  staffId: string;
  staffName: string;
  clockIn: string;
  clockOut?: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const SHIFTS = "cash_shifts";
const TIME = "time_entries";

export const SHIFTS_CHANGED_EVENT = "pointly_shifts_changed";

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
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHIFTS_CHANGED_EVENT));
}

function upsert<T extends { id: string }>(entity: string, record: T): Promise<boolean> {
  const current = readList<T>(entity);
  const next = current.some((r) => r.id === record.id) ? current.map((r) => (r.id === record.id ? record : r)) : [record, ...current];
  const saved = persistEntity(entity as "cash_shifts" | "time_entries", next, { inferDeletes: false });
  announce();
  return saved;
}

export function newShiftId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function getShifts(): CashShift[] {
  return readList<CashShift>(SHIFTS).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

/** The drawer's open shift, if any. Two left open by two terminals: the newest wins. */
export function getOpenShift(): CashShift | undefined {
  return getShifts().find((s) => s.status === "open");
}

export function getTimeEntries(): TimeEntry[] {
  return readList<TimeEntry>(TIME).sort((a, b) => b.clockIn.localeCompare(a.clockIn));
}

// ─── Cash drawer ──────────────────────────────────────────────────────────────

export async function openShift(openingFloat: number, by: string): Promise<CashShift> {
  const existing = getOpenShift();
  if (existing) return existing;
  const shift: CashShift = {
    id: newShiftId("shift"), status: "open", openedAt: new Date().toISOString(), openedBy: by,
    openingFloat: Math.max(0, Math.round(openingFloat)), moves: [],
  };
  await upsert(SHIFTS, shift);
  return shift;
}

export async function addCashMove(shift: CashShift, move: Omit<CashMove, "id" | "at">): Promise<CashShift> {
  const fresh = getShifts().find((s) => s.id === shift.id) ?? shift;
  const next: CashShift = {
    ...fresh,
    moves: [...fresh.moves, { ...move, amount: Math.max(0, Math.round(move.amount)), id: newShiftId("cm"), at: new Date().toISOString() }],
  };
  await upsert(SHIFTS, next);
  return next;
}

/** Invoices rung up during a shift: tagged with its id. */
export function shiftInvoices(shift: CashShift, invoices: Invoice[] = getInvoices()): Invoice[] {
  return invoices.filter((inv) => inv.shiftId === shift.id && inv.status === "paid");
}

export function shiftSummary(shift: CashShift, invoices: Invoice[] = getInvoices()): ShiftSummary {
  const summary: ShiftSummary = {
    sales: 0, salesCount: 0, refunds: 0, refundCount: 0, byMethod: {}, cashSales: 0, cashRefunds: 0,
    paidIn: 0, paidOut: 0, discounts: 0, byCashier: {},
  };
  for (const inv of shiftInvoices(shift, invoices)) {
    const refund = !!inv.refundOf;
    if (refund) { summary.refunds += -inv.total; summary.refundCount += 1; }
    else {
      summary.sales += inv.total; summary.salesCount += 1;
      summary.discounts += (inv.discountAmount || 0) + (inv.discount2Amount || 0);
      const who = inv.cashierName || "—";
      const row = summary.byCashier[who] ?? { count: 0, total: 0 };
      summary.byCashier[who] = { count: row.count + 1, total: row.total + inv.total };
    }
    for (const part of paymentParts(inv)) {
      const method = part.method || "cash";
      summary.byMethod[method] = (summary.byMethod[method] ?? 0) + part.amount;
      if (method === "cash") {
        if (refund) summary.cashRefunds += -part.amount;
        else summary.cashSales += part.amount;
      }
    }
  }
  for (const m of shift.moves) {
    if (m.type === "in") summary.paidIn += m.amount;
    else summary.paidOut += m.amount;
  }
  // Read straight from storage: lib/ledger.ts imports this file.
  const collections = readList<{ kind: string; amount: number; method?: string; shiftId?: string }>("customer_ledger")
    .filter((e) => e.kind === "payment" && e.shiftId === shift.id);
  summary.collected = collections.reduce((s, e) => s + e.amount, 0);
  summary.collectedCount = collections.length;
  summary.collectedCash = collections.filter((e) => (e.method || "cash") === "cash").reduce((s, e) => s + e.amount, 0);
  return summary;
}

/** What the drawer should hold now. */
export function expectedCash(shift: CashShift, invoices?: Invoice[]): number {
  const s = shiftSummary(shift, invoices);
  return shift.openingFloat + s.cashSales - s.cashRefunds + (s.collectedCash ?? 0) + s.paidIn - s.paidOut;
}

export async function closeShift(shift: CashShift, countedCash: number, by: string, notes?: string): Promise<CashShift> {
  const fresh = getShifts().find((s) => s.id === shift.id) ?? shift;
  const summary = shiftSummary(fresh);
  const closed: CashShift = {
    ...fresh,
    status: "closed",
    closedAt: new Date().toISOString(),
    closedBy: by,
    countedCash: Math.round(countedCash),
    expectedCash: Math.round(expectedCash(fresh)),
    summary,
    notes: notes?.trim() || undefined,
  };
  await upsert(SHIFTS, closed);
  return closed;
}

/** Counted minus expected: positive is over, negative is short. */
export function cashDifference(shift: CashShift): number | null {
  if (shift.countedCash === undefined || shift.expectedCash === undefined) return null;
  return shift.countedCash - shift.expectedCash;
}

// ─── Time clock ───────────────────────────────────────────────────────────────

export function openEntry(staffId: string, entries: TimeEntry[] = getTimeEntries()): TimeEntry | undefined {
  return entries.find((e) => e.staffId === staffId && !e.clockOut);
}

export async function clockIn(staffId: string, staffName: string): Promise<TimeEntry> {
  const existing = openEntry(staffId);
  if (existing) return existing;
  const entry: TimeEntry = { id: newShiftId("te"), staffId, staffName, clockIn: new Date().toISOString() };
  await upsert(TIME, entry);
  return entry;
}

export async function clockOut(staffId: string): Promise<TimeEntry | undefined> {
  const entry = openEntry(staffId);
  if (!entry) return undefined;
  const closed = { ...entry, clockOut: new Date().toISOString() };
  await upsert(TIME, closed);
  return closed;
}

/** Hours in an entry, up to now for one still open. */
export function entryHours(entry: TimeEntry, now = Date.now()): number {
  const end = entry.clockOut ? new Date(entry.clockOut).getTime() : now;
  return Math.max(0, (end - new Date(entry.clockIn).getTime()) / 3_600_000);
}

export function fmtHours(h: number): string {
  const mins = Math.round(h * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
