/**
 * lib/charges.ts
 *
 * Tax and service charge on a POS bill, from Settings → Tax & Service Charge
 * (settingsStore.charges). Both are percentages, and both are worked out on
 * the bill after discounts:
 *
 *   net            = subtotal − discounts
 *   service charge = net × service %      (dine-in only, unless set otherwise)
 *   tax            = (net + service charge) × tax %
 *   total          = net + service charge + tax
 */

import { settingsStore } from "./settings-store";

export interface ChargeSettings {
  taxRate: number;
  taxLabel: string;
  serviceChargeRate: number;
  serviceChargeDineInOnly: boolean;
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
  const base = Math.max(0, net);
  const serviceApplies = settings.serviceChargeRate > 0 && (!settings.serviceChargeDineInOnly || !orderType || orderType === "dine-in");
  const serviceCharge = serviceApplies ? Math.round(base * settings.serviceChargeRate / 100) : 0;
  const tax = settings.taxRate > 0 ? Math.round((base + serviceCharge) * settings.taxRate / 100) : 0;
  return { serviceCharge, tax };
}
