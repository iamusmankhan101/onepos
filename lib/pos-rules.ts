/**
 * lib/pos-rules.ts
 *
 * Till controls from Settings → POS Rules (settingsStore.posRules): the staff
 * discount, how big a discount a cashier may give before a manager has to
 * approve it, whether a sale needs the cash drawer's shift to be open, and
 * (restaurant mode) whether a dish sells out by itself when an ingredient runs
 * out (lib/stock.ts shortIngredient).
 */

import { settingsStore } from "./settings-store";

export interface PosRules {
  staffDiscountRate: number;
  discountApprovalOver: number;
  requireOpenShift: boolean;
  /** Off by default: a menu whose ingredient stock was never entered would all read as sold out. */
  autoSoldOut: boolean;
}

export function getPosRules(): PosRules {
  const r = (settingsStore as { posRules?: Partial<PosRules> }).posRules ?? {};
  const pct = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  };
  return {
    staffDiscountRate: pct(r.staffDiscountRate),
    discountApprovalOver: pct(r.discountApprovalOver),
    requireOpenShift: r.requireOpenShift === true,
    autoSoldOut: r.autoSoldOut === true,
  };
}

/** Whether a discount of `pct` percent of the bill needs a manager's approval. */
export function discountNeedsApproval(pct: number, rules: PosRules = getPosRules()): boolean {
  return rules.discountApprovalOver > 0 && pct > rules.discountApprovalOver + 0.001;
}
