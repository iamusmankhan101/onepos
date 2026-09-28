/**
 * lib/pos-rules.ts
 *
 * Till controls from Settings → POS Rules (settingsStore.posRules): the staff
 * discount, how big a discount a cashier may give before a manager has to
 * approve it, and whether a sale needs the cash drawer's shift to be open.
 */

import { settingsStore } from "./settings-store";

export interface PosRules {
  staffDiscountRate: number;
  discountApprovalOver: number;
  requireOpenShift: boolean;
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
  };
}

/** Whether a discount of `pct` percent of the bill needs a manager's approval. */
export function discountNeedsApproval(pct: number, rules: PosRules = getPosRules()): boolean {
  return rules.discountApprovalOver > 0 && pct > rules.discountApprovalOver + 0.001;
}
