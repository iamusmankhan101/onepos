// ─── Sections (same-branch Men's/Women's style split) ──────────────────────
// A lightweight, cosmetic-only tag — distinct from lib/locations.ts, which
// partitions storage across different physical branches. Section is just a
// free-text field (mirrors Service.category) filterable on each listing page;
// Revenue/Cash Flow/Dashboard intentionally never filter by it, so combined
// totals fall out of simply not touching those pages.

import { saveSettings, settingsStore } from "./settings-store";

export const SECTION_SEED = ["Men's", "Women's"] as const;

/**
 * The persistent "which section am I working" context set via the dashboard
 * switcher (mirrors lib/locations.ts's getActiveLocationFilter/setActiveLocationFilter,
 * but with no storage partitioning — just a default filter value every
 * section-aware page initializes from). "all" = both sections combined.
 */
export function getActiveSection(): string {
  return (settingsStore as { activeSection?: string }).activeSection || "all";
}

export function setActiveSection(section: string): void {
  (settingsStore as { activeSection?: string }).activeSection = section;
  saveSettings();
}

/**
 * Seed values first, then any custom section strings already present in the
 * data (mirrors the Services page's PRESET_CATEGORIES + customCategories
 * pattern) — so pickers are never empty on a fresh account, but an owner can
 * still introduce a third section just by typing it once.
 */
export function getSectionOptions(records: { section?: string }[]): string[] {
  const custom = Array.from(
    new Set(records.map((r) => r.section).filter((s): s is string => !!s))
  ).filter((s) => !(SECTION_SEED as readonly string[]).includes(s));
  return [...SECTION_SEED, ...custom];
}

/**
 * Does `record` belong in the view for `section`?
 *
 * A record with no section ("Unassigned") belongs to *every* section. Section
 * is a cosmetic tag, not a partition (that's lib/locations.ts) — so an untagged
 * record must never become unreachable just because someone switched the
 * dashboard into Men's or Women's.
 *
 * Every listing used to test `record.section === activeSection` outright, which
 * hid untagged records from all three views at once: they were only visible
 * under "All Sections". That is what "the services I added disappeared after a
 * few days" actually was — the records were safe in Turso the whole time (the
 * stored count only ever grew), but the business flipped the section switcher and
 * every service with a blank Section vanished from the catalogue, the POS, and
 * the booking screens. Services get a blank section easily: the Add form's
 * Section picker defaults to "Unassigned", and an imported spreadsheet
 * with no Section column leaves all of them blank.
 */
export function inSection(record: { section?: string } | null | undefined, section: string): boolean {
  if (section === "all") return true;
  const value = record?.section;
  return !value || value === section;
}

/**
 * The section a newly created record should default to: whatever section the
 * user is working in, so today's additions stop becoming tomorrow's orphans.
 * `undefined` under "All Sections" — there is no one section to imply there.
 */
export function defaultSectionForNewRecord(): string {
  const active = getActiveSection();
  return active === "all" ? "" : active;
}
