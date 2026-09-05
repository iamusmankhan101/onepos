import { saveSettings, settingsStore } from "./settings-store";
import { getCurrentUser, userKey } from "./auth";
import { MULTI_BRANCH_PLAN, planFor, supportsMultiBranch, type PlanDefinition } from "./plans";

export interface BusinessLocation {
  id: string;
  name: string;
  address?: string;
  city?: string;
}

/**
 * The original branch of every account. It predates branches (its data sits
 * under the plain, un-suffixed storage keys), it is the one branch a
 * single-location plan resolves to, and for both of those reasons it can be
 * renamed but never deleted.
 */
export const MAIN_LOCATION_ID = "main";

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "location";
}

// settingsStore's shape is inferred as `any` in places (JSON.parse spreads in
// settings-store.ts), so narrow it through a typed view instead of `as any`.
interface LocationSettingsShape {
  locations?: { activeLocationId?: string; items?: BusinessLocation[] };
  business?: { address?: string; city?: string };
}

// ─── Plan entitlement ─────────────────────────────────────────────────────────

/** The signed-in business's plan definition (Starter when signed out). */
export function activePlan(): PlanDefinition {
  return planFor(getCurrentUser());
}

/**
 * Whether this business may run more than one branch at all. Every branch
 * management surface — the Branches settings section, the dashboard switcher —
 * hangs off this, and the server enforces the same thing independently in
 * resolveActor(), so a client that ignores it gets pinned to Main Branch
 * rather than quietly writing into a branch it isn't paying for.
 */
export function canManageBranches(): boolean {
  return supportsMultiBranch(getCurrentUser()?.plan);
}

// ─── Branches ─────────────────────────────────────────────────────────────────

/**
 * Every branch the business has configured. On a plan without multi-branch
 * this is only ever the one — a list left behind by a downgrade is trimmed to
 * Main Branch, matching what the server keeps (see clampBranchesToPlan in
 * /api/settings) and what it will actually serve data for.
 */
export function getBusinessLocations(): BusinessLocation[] {
  const configured = (settingsStore as { locations?: { items?: BusinessLocation[] } }).locations?.items;
  const business = settingsStore.business as { address?: string; city?: string };
  const items = Array.isArray(configured) && configured.length > 0
    ? configured
    : [{ id: MAIN_LOCATION_ID, name: "Main Branch", address: business.address, city: business.city }];
  if (canManageBranches()) return items;
  const main = items.find((location) => location.id === MAIN_LOCATION_ID);
  return [main ?? { id: MAIN_LOCATION_ID, name: items[0]?.name || "Main Branch", address: business.address, city: business.city }];
}

export function getDefaultLocationId() {
  const locations = getBusinessLocations();
  const active = (settingsStore as { locations?: { activeLocationId?: string } }).locations?.activeLocationId;
  return locations.some((location) => location.id === active) ? active! : locations[0]?.id ?? MAIN_LOCATION_ID;
}

/**
 * The branch every store reads and writes right now. This is the client half
 * of the same rule resolveActor() applies on the server, and the two must
 * agree: if this returned a branch the server won't serve, the till would
 * write branch-scoped keys locally and sync them against Main Branch.
 */
export function getActiveLocationFilter() {
  return getDefaultLocationId();
}

export function setActiveLocationFilter(locationId: string) {
  const locations = getBusinessLocations();
  const nextId = locations.some((location) => location.id === locationId)
    ? locationId
    : locations[0]?.id ?? "main";
  const selected = locations.find((location) => location.id === nextId);

  (settingsStore as any).locations = {
    ...(settingsStore as any).locations,
    activeLocationId: nextId,
    items: locations,
  };
  if (selected) {
    (settingsStore.business as any).address = selected.address || "";
    (settingsStore.business as any).city = selected.city || "";
  }
  saveSettings();
  return nextId;
}

/**
 * Keeps the original Main Branch key for backward compatibility while giving
 * every additional branch a completely independent user-scoped data slot.
 */
export function locationUserKey(baseKey: string, locationId = getActiveLocationFilter()) {
  return userKey(locationId === "main" ? baseKey : `${baseKey}__location_${locationId}`);
}

export function clientLocationId(client: { locationId?: string }) {
  return client.locationId || getDefaultLocationId();
}

export function locationName(locationId?: string) {
  const id = locationId || getDefaultLocationId();
  return getBusinessLocations().find((location) => location.id === id)?.name || "Main Branch";
}

export function addBusinessLocation(input: { name: string; address: string; city?: string }): BusinessLocation {
  const cleanName = input.name.trim();
  const cleanAddress = input.address.trim();
  const cleanCity = input.city?.trim() || "";
  if (!cleanName) throw new Error("Location name is required.");
  if (!cleanAddress) throw new Error("Location address is required.");

  const plan = activePlan();
  const locations = getBusinessLocations();
  if (locations.length >= plan.maxBranches) {
    throw new Error(
      supportsMultiBranch(plan.id)
        ? `Your ${plan.name} plan covers up to ${plan.maxBranches} branches. Remove one before adding another.`
        : `Extra branches are part of the ${MULTI_BRANCH_PLAN.name} plan. Upgrade to run more than one location from this account.`,
    );
  }
  const existing = locations.find((location) => location.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) throw new Error("A location with this branch name already exists.");

  const baseId = slug(cleanName);
  let id = baseId;
  let counter = 2;
  while (locations.some((location) => location.id === id)) {
    id = `${baseId}-${counter++}`;
  }

  const next = { id, name: cleanName, address: cleanAddress, city: cleanCity };
  (settingsStore as any).locations = {
    activeLocationId: getDefaultLocationId(),
    items: [...locations, next],
  };
  saveSettings();
  return next;
}

/**
 * Edits one branch's details in place. Does not persist on its own — the
 * caller decides when to saveSettings(), so a form that also writes other
 * settings (Business Profile does exactly this) still makes one save.
 */
export function updateBusinessLocation(locationId: string, details: { name?: string; address: string; city?: string }) {
  const locationSettings = settingsStore as unknown as LocationSettingsShape;
  const locations = getBusinessLocations();
  locationSettings.locations = {
    ...locationSettings.locations,
    activeLocationId: getActiveLocationFilter(),
    items: locations.map((location) => location.id === locationId
      ? {
          ...location,
          name: details.name?.trim() || location.name,
          address: details.address.trim(),
          city: details.city?.trim() || "",
        }
      : location),
  };
}

export function updateActiveLocationDetails(details: { name?: string; address: string; city?: string }) {
  updateBusinessLocation(getActiveLocationFilter(), details);
}

/**
 * Permanently removes a branch from the business's location list. Neither the
 * last remaining location nor Main Branch can be deleted — every business
 * needs at least one branch to read/write data against, and Main Branch is the
 * one a single-location plan resolves to. If the deleted branch was active, the
 * first remaining branch becomes active and the business's address/city are
 * refreshed to match it. Returns the removed location and the id that is
 * active afterwards. Branch data itself (localStorage + DB rows) is wiped
 * separately via clearLocationLocalData() / the /api/db DELETE route.
 */
export function removeBusinessLocation(locationId: string): { removed: BusinessLocation; nextActiveId: string } {
  const locationSettings = settingsStore as unknown as LocationSettingsShape;
  const locations = getBusinessLocations();
  const removed = locations.find((location) => location.id === locationId);
  if (!removed) throw new Error("Location not found.");
  if (locations.length <= 1) {
    throw new Error("You can't delete your only location. Add another branch first.");
  }

  if (locationId === MAIN_LOCATION_ID) {
    throw new Error("Main Branch can't be deleted — it's the branch your account falls back to. Rename it instead.");
  }

  const remaining = locations.filter((location) => location.id !== locationId);
  const activeId = getActiveLocationFilter();
  const nextActiveId = activeId === locationId ? remaining[0].id : activeId;

  locationSettings.locations = {
    activeLocationId: nextActiveId,
    items: remaining,
  };
  const selected = remaining.find((location) => location.id === nextActiveId);
  if (selected && locationSettings.business) {
    // Refresh the business's address/city to match the newly active branch.
    locationSettings.business.address = selected.address || "";
    locationSettings.business.city = selected.city || "";
  }
  saveSettings();
  return { removed, nextActiveId };
}

/**
 * Wipes every localStorage key that belongs to one branch — appointments,
 * clients, staff, services, inventory, business invoices, expenses, attendance,
 * payouts, cash flow, loyalty history, WhatsApp queues/logs, schema version.
 * Main Branch uses plain `pointly_<entity>_<owner>` keys; every other branch
 * lives under `pointly_<entity>__location_<id>_<owner>`. Account-level keys
 * (settings, auth, plan, subscription invoices, payment requests) are never
 * touched — settings in particular carry the location list itself.
 */
export function clearLocationLocalData(locationId: string) {
  if (typeof window === "undefined") return;
  const user = getCurrentUser();
  if (!user) return;
  const dataOwnerId = user.businessOwnerId || user.id;

  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("pointly_")) continue;
    if (locationId !== "main") {
      // Branch keys always embed `__location_<id>_` (id slugs are [a-z0-9-]).
      if (key.includes(`__location_${locationId}_`)) doomed.push(key);
      continue;
    }
    if (key.includes("__location_")) continue; // another branch's data
    if (!key.endsWith(`_${dataOwnerId}`)) continue; // not this business's key
    if (/^pointly_(settings|auth|user_cache|active_plan|payment_requests|invoices)/.test(key)) continue;
    doomed.push(key);
  }
  for (const key of doomed) localStorage.removeItem(key);
}

/**
 * Removes a branch and everything it holds, in the one order that is safe:
 *
 *  1. the shared database rows first, while the branch id is still resolvable
 *     and the server will still accept a scoped delete for it;
 *  2. this browser's localStorage copy, which would otherwise be re-uploaded
 *     by the next sync and bring the branch's data straight back;
 *  3. the branch itself, out of the settings list.
 *
 * Doing (3) first is the tempting order and the wrong one — the list is what
 * names the branch, so a failure after it leaves rows nothing can address.
 * The DB delete is best-effort: an offline owner can still remove the branch
 * from their business, and the rows stay addressable under the same key if the
 * branch is ever re-created with that name.
 *
 * Returns the removed branch and the branch that is active afterwards.
 */
export async function deleteBusinessLocation(locationId: string) {
  const locations = getBusinessLocations();
  if (!locations.some((location) => location.id === locationId)) throw new Error("Location not found.");
  if (locations.length <= 1) {
    throw new Error("You can't delete your only location. Add another branch first.");
  }
  if (locationId === MAIN_LOCATION_ID) {
    throw new Error("Main Branch can't be deleted — it's the branch your account falls back to. Rename it instead.");
  }

  let dataCleared = true;
  try {
    const response = await fetch(`/api/db?locationId=${encodeURIComponent(locationId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    dataCleared = response.ok;
  } catch {
    dataCleared = false; // offline — the branch still goes, the rows are orphaned
  }

  clearLocationLocalData(locationId);
  const { removed, nextActiveId } = removeBusinessLocation(locationId);
  return { removed, nextActiveId, dataCleared };
}
