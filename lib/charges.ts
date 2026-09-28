/**
 * lib/charges.ts
 *
 * Tax and service charge on a POS bill, from Settings → Tax & Service Charge
 * (settingsStore.charges). Both are percentages, and both are worked out on
 * the bill after discounts:
 *
 *   net            = subtotal − discounts
 *   service charge = net × service %      (dine-in only, unless set otherwise)
 *   tax            = (net + service charge) × tax %   — or net × tax % when
 *                    tax isn't charged on the service charge
 *   total          = net + service charge + tax
 *
 * Only the total is rounded from the exact figures, so it never drifts a
 * rupee from what the percentages say; the tax line takes up the rounding so
 * the lines on the receipt still add up to it.
 */

import { settingsStore } from "./settings-store";

export interface ChargeSettings {
  taxRate: number;
  taxLabel: string;
  serviceChargeRate: number;
  serviceChargeDineInOnly: boolean;
  /** Tax is worked out on net + service charge (true) or on net alone. */
  taxOnServiceCharge: boolean;
}

export function getChargeSettings(): ChargeSettings {
  const c = (settingsStore as { charges?: Partial<ChargeSettings> }).charges ?? {};
  const pct = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  };
  return {
    taxRate: pct(c.taxRate),
    taxLabel: (c.taxLabel ?? "").trim() || "Tax",
    serviceChargeRate: pct(c.serviceChargeRate),
    serviceChargeDineInOnly: c.serviceChargeDineInOnly !== false,
    taxOnServiceCharge: c.taxOnServiceCharge !== false,
  };
}

/**
 * `orderType` is the restaurant order type, or undefined for a plain retail /
 * salon sale. "Dine-in only" narrows the service charge among restaurant
 * orders; a sale that isn't a restaurant order at all always gets it.
 */
export function billCharges(net: number, orderType?: string, settings: ChargeSettings = getChargeSettings()): {
  serviceCharge: number;
  tax: number;
} {
  const base = Math.max(0, Math.round(net));
  const serviceApplies = settings.serviceChargeRate > 0 && (!settings.serviceChargeDineInOnly || !orderType || orderType === "dine-in");
  const serviceExact = serviceApplies ? base * settings.serviceChargeRate / 100 : 0;
  const serviceCharge = Math.round(serviceExact);
  if (!(settings.taxRate > 0)) return { serviceCharge, tax: 0 };
  const taxExact = (base + (settings.taxOnServiceCharge ? serviceExact : 0)) * settings.taxRate / 100;
  const total = Math.round(base + serviceExact + taxExact);
  return { serviceCharge, tax: Math.max(0, total - base - serviceCharge) };
}

export type DiscountType = "flat" | "pct";

/** A discount as the cashier typed it — a flat amount or a percentage of the subtotal. */
export interface BillDiscount {
  type: DiscountType;
  value: number;
}

/**
 * The two stacked POS discounts in whole rupees: each is worked out on the
 * subtotal, and together they never exceed it.
 */
export function discountAmounts(subtotal: number, first?: BillDiscount, second?: BillDiscount): [number, number] {
  const amount = (d?: BillDiscount) => {
    if (!d || !(d.value > 0)) return 0;
    const n = d.type === "pct" ? subtotal * d.value / 100 : d.value;
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const a = Math.min(amount(first), Math.max(0, subtotal));
  const b = Math.min(amount(second), Math.max(0, subtotal - a));
  return [a, b];
}
