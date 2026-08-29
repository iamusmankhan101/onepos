import { saveSettings, settingsStore } from "./settings-store";
import { getCurrentUser, userKey } from "./auth";

export interface BusinessLocation {
  id: string;
  name: string;
  address?: string;
  city?: string;
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "location";
}

export function getBusinessLocations(): BusinessLocation[] {
  const configured = (settingsStore as { locations?: { items?: BusinessLocation[] } }).locations?.items;
  if (Array.isArray(configured) && configured.length > 0) return configured;
  const business = settingsStore.business as { address?: string; city?: string };
  return [{ id: "main", name: "Main Branch", address: business.address, city: business.city }];
}

export function getDefaultLocationId() {
  const locations = getBusinessLocations();
  const active = (settingsStore as { locations?: { activeLocationId?: string } }).locations?.activeLocationId;
  return locations.some((location) => location.id === active) ? active! : locations[0]?.id ?? "main";
}

export function getActiveLocationFilter() {
  const locations = getBusinessLocations();
  const active = (settingsStore as { locations?: { activeLocationId?: string } }).locations?.activeLocationId;
  return locations.some((location) => location.id === active) ? active! : locations[0]?.id ?? "main";
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
  const locations = getBusinessLocations();
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

export function updateActiveLocationDetails(details: { name?: string; address: string; city?: string }) {
  const activeId = getActiveLocationFilter();
  const locations = getBusinessLocations();
  (settingsStore as any).locations = {
    ...(settingsStore as any).locations,
    activeLocationId: activeId,
    items: locations.map((location) => location.id === activeId
      ? {
          ...location,
          name: details.name?.trim() || location.name,
          address: details.address.trim(),
          city: details.city?.trim() || "",
        }
      : location),
  };
}

/**
 * Permanently removes a branch from the business's location list. The last
 * remaining location can never be deleted — every business needs at least one
 * branch to read/write data against. If the deleted branch was active, the
 * first remaining branch becomes active and the business's address/city are
 * refreshed to match it. Returns the removed location and the id that is
 * active afterwards. Branch data itself (localStorage + DB rows) is wiped
 * separately via clearLocationLocalData() / the /api/db DELETE route.
 */
// settingsStore's shape is inferred as `any` in places (JSON.parse spreads in
// settings-store.ts), so narrow it through a typed view instead of `as any`.
interface LocationSettingsShape {
  locations?: { activeLocationId?: string; items?: BusinessLocation[] };
  business?: { address?: string; city?: string };
}

export function removeBusinessLocation(locationId: string): { removed: BusinessLocation; nextActiveId: string } {
  const locationSettings = settingsStore as unknown as LocationSettingsShape;
  const locations = getBusinessLocations();
  const removed = locations.find((location) => location.id === locationId);
  if (!removed) throw new Error("Location not found.");
  if (locations.length <= 1) {
    throw new Error("You can't delete your only location. Add another branch first.");
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
