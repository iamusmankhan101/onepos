import { locationUserKey } from "./locations";
import { persistEntity } from "./turso-sync";

export type ExpenseCategory =
  | "rent"
  | "water_bill"
  | "electricity_bill"
  | "committee"
  | "salaries"
  | "utilities"
  | "supplies"
  | "equipment"
  | "marketing"
  | "food"
  | "miscellaneous";

export interface Expense {
  id: string;
  date: string;        // YYYY-MM-DD
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: string;
  paymentStatus?: "paid" | "pending";
  billImageDataUrl?: string;
  billImageName?: string;
  notes?: string;
  createdAt: string;   // ISO timestamp
  /** Which business section this expense belongs to (e.g. "Men's", "Women's"). Untagged = shared overhead, excluded from a section-restricted view. */
  section?: string;
}

const KEY = "pointly_expenses";

export function getExpenses(): Expense[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(locationUserKey(KEY)) ?? "[]"); } catch { return []; }
}

/**
 * Saves locally (always) and returns the Turso write's outcome so a caller
 * that needs to know whether the save actually reached the shared database
 * can await it and warn the user instead of silently leaving the expense
 * invisible on every device but the one it was added on (the previous
 * fire-and-forget save could fail with nothing but a console warning).
 */
export function saveExpenses(list: Expense[]): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return persistEntity("expenses", list);
}

export async function addExpense(data: Omit<Expense, "id" | "createdAt">): Promise<{ expense: Expense; dbSaved: boolean }> {
  const entry: Expense = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const list = getExpenses();
  list.push(entry);
  const dbSaved = await saveExpenses(list);
  return { expense: entry, dbSaved };
}

export function deleteExpense(id: string): void {
  saveExpenses(getExpenses().filter(e => e.id !== id));
}

export async function updateExpense(id: string, patch: Partial<Omit<Expense, "id" | "createdAt">>): Promise<boolean> {
  return saveExpenses(getExpenses().map(e => e.id === id ? { ...e, ...patch } : e));
}
