/**
 * lib/plans.ts
 *
 * The subscription tiers an account can be on, and what each one unlocks.
 * Deliberately isomorphic — no `window`, no DB, no imports beyond types — so
 * the same table gates the UI in the browser and the writes on the server.
 *
 * The only entitlement this build actually sells is how many branches a
 * business may run: Starter is a single-location till, Pro is the multi-branch
 * one. Everything branch-shaped (lib/locations.ts, the Branches settings
 * section, the dashboard branch switcher, /api/db, /api/settings) asks
 * `supportsMultiBranch()` rather than testing for "pro" by name, so adding a
 * third tier later is a change to this file only.
 *
 * A plan lives on the account row (users.plan) and is set by a platform admin
 * from the /admin console — this build has no self-serve billing, so there is
 * nothing else that could move an account between tiers.
 */

export type PlanId = "starter" | "pro";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  blurb: string;
  /**
   * Hard ceiling on branches. Pro is capped rather than unlimited because the
   * branch list rides inside the business settings blob, which syncs as one
   * JSON row — this is a sanity limit, not a commercial one.
   */
  maxBranches: number;
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    blurb: "Everything one shop floor needs — POS, clients, invoices and reporting for a single location.",
    maxBranches: 1,
    highlights: [
      "One branch",
      "POS, products, clients and invoices",
      "Revenue and cash flow reporting",
      "Staff logins with per-module access",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "Run several locations from one account, each with its own stock, staff, clients and takings.",
    maxBranches: 20,
    highlights: [
      "Up to 20 branches",
      "Separate stock, staff, clients and takings per branch",
      "Switch branches without signing out",
      "Pin each staff login to the branch they work at",
    ],
  },
};

export const DEFAULT_PLAN_ID: PlanId = "starter";
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Anything unrecognised (null, a legacy value, a hand-edited row) is Starter. */
export function normalizePlanId(value: unknown): PlanId {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (PLAN_IDS as string[]).includes(id) ? (id as PlanId) : DEFAULT_PLAN_ID;
}

export function planById(value: unknown): PlanDefinition {
  return PLANS[normalizePlanId(value)];
}

/** The plan carried by a user record (client AuthUser or server User alike). */
export function planFor(user: { plan?: unknown } | null | undefined): PlanDefinition {
  return planById(user?.plan);
}

export function maxBranchesFor(value: unknown): number {
  return planById(value).maxBranches;
}

/** True when the plan may run more than one branch — the multi-branch gate. */
export function supportsMultiBranch(value: unknown): boolean {
  return maxBranchesFor(value) > 1;
}

/** The tier a business has to be on before branches become available. */
export const MULTI_BRANCH_PLAN = PLANS.pro;
