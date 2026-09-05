// ─── Staff roles ──────────────────────────────────────────────────────────────
// The built-in roles are a starting point, not the whole list: a barbershop
// hires Barbers, a spa hires Therapists, and neither should have to file its
// team under "junior stylist". So a role is free text with a seeded picker,
// exactly like Service.category and lib/sections.ts.
//
// Custom roles are derived from the staff records that use them rather than
// stored in settings. That is deliberate — a role with nobody in it stops
// being offered on its own, the list travels with the team through sync and
// spreadsheet import, and there is no second place for the two to disagree.
//
// Note this is the *job title* shown around the app, and has nothing to do
// with the login roles in lib/auth.ts (owner/manager/staff/admin) that decide
// what someone may open. Settings → Staff Access owns those.

import type { StaffRoleValue } from "./types";

/** Ships with every account; always offered even when nobody holds the role. */
export const ROLE_SEED = [
  "owner",
  "manager",
  "senior-stylist",
  "junior-stylist",
  "receptionist",
  "trainee",
  "hair",
  "aesthetic",
] as const;

/** The value the picker uses for its "add a new one" entry — never a real role. */
export const CUSTOM_ROLE_OPTION = "__custom__";

const SEED_STYLES: Record<string, { color: string; bg: string }> = {
  owner:            { color: "#EA580C", bg: "#FFEDD5" },
  manager:          { color: "#0369a1", bg: "#e0f2fe" },
  "senior-stylist": { color: "#059669", bg: "#ecfdf5" },
  "junior-stylist": { color: "#d97706", bg: "#fffbeb" },
  receptionist:     { color: "#db2777", bg: "#fdf2f8" },
  trainee:          { color: "#6b7280", bg: "#f9fafb" },
  hair:             { color: "#0369a1", bg: "#e0f2fe" },
  aesthetic:        { color: "#be185d", bg: "#fdf2f8" },
};

/**
 * Custom roles pick from here by name, so a role keeps the same colour on
 * every screen and every device without anything being stored against it.
 */
const CUSTOM_STYLES: { color: string; bg: string }[] = [
  { color: "#7c3aed", bg: "#f5f3ff" },
  { color: "#0891b2", bg: "#ecfeff" },
  { color: "#c2410c", bg: "#fff7ed" },
  { color: "#4d7c0f", bg: "#f7fee7" },
  { color: "#b91c1c", bg: "#fef2f2" },
  { color: "#1d4ed8", bg: "#eff6ff" },
];

/**
 * Normalises a typed role to the same shape as the built-ins: lower case,
 * spaces to hyphens ("Nail Tech" → "nail-tech"). Keeping one canonical form
 * stops "Nail Tech", "nail tech" and "NAIL TECH" becoming three roles.
 */
export function toRoleId(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** How a role reads on screen: "senior-stylist" → "senior stylist". */
export function roleLabel(role: StaffRoleValue | undefined): string {
  return String(role ?? "").replace(/-/g, " ");
}

/** Pill colours for a role — seeded ones keep their colour, custom ones get a stable pick. */
export function roleStyle(role: StaffRoleValue | undefined): { color: string; bg: string } {
  const id = String(role ?? "");
  if (SEED_STYLES[id]) return SEED_STYLES[id];
  if (!id) return { color: "#6b7280", bg: "#f9fafb" };
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % CUSTOM_STYLES.length;
  return CUSTOM_STYLES[hash];
}

/**
 * What the role pickers offer: the seeds first, then every custom role the
 * team already uses. Mirrors getSectionOptions() in lib/sections.ts.
 */
export function getRoleOptions(records: { role?: StaffRoleValue }[]): string[] {
  const inUse = Array.from(
    new Set(records.map((record) => String(record.role ?? "").trim()).filter(Boolean)),
  ).filter((role) => !(ROLE_SEED as readonly string[]).includes(role));
  return [...ROLE_SEED, ...inUse.sort()];
}

/**
 * Reads a role off an imported spreadsheet cell. An unrecognised value is kept
 * as a custom role rather than being forced into a built-in one — that is the
 * whole point of custom roles, and silently filing someone's Barbers under
 * "junior stylist" is how an import loses information. Only a blank cell
 * falls back.
 */
export function normalizeRole(value: unknown): string {
  return toRoleId(String(value ?? "")) || "junior-stylist";
}
