import { settingsStore } from "./settings-store";

/** Format a number as a currency string using the business's configured currency. */
export function fmtCurrency(n: number): string {
  const currency = settingsStore.business.currency || "PKR";
  return `${currency} ${Math.round(n).toLocaleString("en-PK")}`;
}
