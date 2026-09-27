/**
 * lib/business-types.ts
 *
 * The kind of business an account runs, picked once at sign-up, and how the
 * app adapts to it. Deliberately isomorphic, like lib/plans.ts — no `window`,
 * no DB — so the server can validate it and the browser can read it off the
 * cached AuthUser.
 *
 * A business type only tailors the existing app: what screens are called
 * (a café's "Products" is its "Menu"), which product categories and staff
 * roles are offered first, and which industry-specific panels show. It never
 * hides data — a record in a category the type doesn't feature still shows
 * and still edits.
 *
 * "general" is not offered at sign-up. It is what every account created before
 * this existed reads as, and it keeps the app exactly as it was for them.
 *
 * The type lives on the owner's row (users.business_type). Staff and manager
 * logins inherit it, see getEffectiveBusinessType() in lib/auth-db.ts.
 */

import type { InventoryCategory } from "./types";

export type BusinessTypeId = "general" | "restaurant" | "cafe" | "retail" | "salon";

export interface BusinessTypeDefinition {
  id: BusinessTypeId;
  name: string;
  /** One line under the name on the sign-up picker. */
  blurb: string;
  /** Sidebar and page title for /dashboard/products. */
  productsLabel: string;
  /** Singular of productsLabel, for buttons like "Add Menu Item". */
  productLabel: string;
  /** Sidebar and page title for /dashboard/clients. */
  clientsLabel: string;
  /** Singular of clientsLabel. */
  clientLabel: string;
  /** Product categories offered in pickers and filters, in this order. */
  categories: InventoryCategory[];
  /** Staff job titles the role picker offers before any custom ones. */
  roleSeed: string[];
  /** The skin/hair "Beauty Profile" on a client — salon-only. */
  beautyProfile: boolean;
}

const ALL_CATEGORIES: InventoryCategory[] = [
  "general", "food", "drinks", "apparel", "electronics", "supplies", "tools", "other",
];

const SALON_ROLES = [
  "owner", "manager", "senior-stylist", "junior-stylist", "receptionist", "trainee", "hair", "aesthetic",
];

export const BUSINESS_TYPES: Record<BusinessTypeId, BusinessTypeDefinition> = {
  general: {
    id: "general",
    name: "General",
    blurb: "Every module with the standard labels.",
    productsLabel: "Products",
    productLabel: "Product",
    clientsLabel: "Clients",
    clientLabel: "Client",
    categories: ALL_CATEGORIES,
    roleSeed: SALON_ROLES,
    beautyProfile: true,
  },
  restaurant: {
    id: "restaurant",
    name: "Restaurant",
    blurb: "Dine-in, takeaway and delivery.",
    productsLabel: "Menu",
    productLabel: "Menu Item",
    clientsLabel: "Customers",
    clientLabel: "Customer",
    categories: ["food", "drinks", "supplies", "general", "other"],
    roleSeed: ["owner", "manager", "chef", "cook", "waiter", "cashier", "kitchen-helper"],
    beautyProfile: false,
  },
  cafe: {
    id: "cafe",
    name: "Café / Coffee shop",
    blurb: "Coffee, drinks, bakery and light food.",
    productsLabel: "Menu",
    productLabel: "Menu Item",
    clientsLabel: "Customers",
    clientLabel: "Customer",
    categories: ["drinks", "food", "supplies", "general", "other"],
    roleSeed: ["owner", "manager", "barista", "baker", "cashier", "server"],
    beautyProfile: false,
  },
  retail: {
    id: "retail",
    name: "Retail / Mart",
    blurb: "Shops, groceries and general stores.",
    productsLabel: "Products",
    productLabel: "Product",
    clientsLabel: "Customers",
    clientLabel: "Customer",
    categories: ALL_CATEGORIES,
    roleSeed: ["owner", "manager", "cashier", "sales-associate", "stock-keeper"],
    beautyProfile: false,
  },
  salon: {
    id: "salon",
    name: "Salon / Clinic",
    blurb: "Salons, spas, barbers and clinics.",
    productsLabel: "Products",
    productLabel: "Product",
    clientsLabel: "Clients",
    clientLabel: "Client",
    categories: ALL_CATEGORIES,
    roleSeed: SALON_ROLES,
    beautyProfile: true,
  },
};

export const DEFAULT_BUSINESS_TYPE_ID: BusinessTypeId = "general";
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES) as BusinessTypeId[];

/** The choices on the sign-up form — everything except the legacy "general". */
export const SIGNUP_BUSINESS_TYPE_IDS: BusinessTypeId[] = ["restaurant", "cafe", "retail", "salon"];

/** Anything unrecognised (null, a legacy row, a hand-edited value) is General. */
export function normalizeBusinessTypeId(value: unknown): BusinessTypeId {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (BUSINESS_TYPE_IDS as string[]).includes(id) ? (id as BusinessTypeId) : DEFAULT_BUSINESS_TYPE_ID;
}

export function businessTypeById(value: unknown): BusinessTypeDefinition {
  return BUSINESS_TYPES[normalizeBusinessTypeId(value)];
}

/** The type carried by a user record (client AuthUser or server User alike). */
export function businessTypeFor(user: { businessType?: unknown } | null | undefined): BusinessTypeDefinition {
  return businessTypeById(user?.businessType);
}
