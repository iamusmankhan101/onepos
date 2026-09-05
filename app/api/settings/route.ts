/**
 * /api/settings
 *
 * GET  — fetch the authenticated caller's business settings object from Turso
 * POST { data }  — upsert settings (full object) for the authenticated caller
 *
 * Stored in business_data table under key "{userId}_settings", where userId is
 * always resolved from the caller's own session (never a client-supplied id).
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/api-auth";
import { backupExistingBusinessData } from "@/lib/data-backup";
import { maxBranchesFor } from "@/lib/plans";

/**
 * Trims the branch list in an incoming settings blob to what the caller's plan
 * allows, and keeps the active branch pointing at one that survived.
 *
 * The list of branches lives inside this blob, so without this a Starter
 * account could simply POST a settings object naming five locations and get a
 * multi-branch business persisted for every one of its devices. The reads and
 * writes for those branches would still be refused (resolveActor pins a
 * non-Pro caller to "main"), but the account would look multi-branch and
 * behave like a single one, which is worse than refusing the write outright.
 *
 * Anything that isn't shaped like a branch list is left exactly as it came in
 * — this route stores an opaque settings object and is not the place to
 * validate the rest of it.
 */
function clampBranchesToPlan(data: unknown, plan: string): unknown {
  const limit = maxBranchesFor(plan);
  if (!data || typeof data !== "object") return data;

  const settings = data as { locations?: { activeLocationId?: unknown; items?: unknown } };
  const items = settings.locations?.items;
  if (!Array.isArray(items) || items.length <= limit) return data;

  const kept = items.slice(0, limit);
  const keptIds = new Set(kept.map((item) => (item as { id?: unknown })?.id));
  const active = settings.locations?.activeLocationId;

  return {
    ...data,
    locations: {
      ...settings.locations,
      items: kept,
      activeLocationId: keptIds.has(active) ? active : (kept[0] as { id?: string })?.id ?? "main",
    },
  };
}

async function ensureTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_data (
      entity     TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export async function GET(req: NextRequest) {
  const actor = await resolveActor(req);
  if (!actor) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    await ensureTable();
    const result = await db.execute({
      sql: "SELECT data, updated_at FROM business_data WHERE entity = ?",
      args: [`${actor.userId}_settings`],
    });
    if (result.rows.length === 0) return Response.json({ ok: true, data: null, updatedAt: null });
    return Response.json({
      ok: true,
      data: JSON.parse(result.rows[0].data as string),
      updatedAt: result.rows[0].updated_at as string,
    });
  } catch (err) {
    console.error("[settings] GET error:", err);
    return Response.json({ ok: true, data: null });
  }
}

export async function POST(req: NextRequest) {
  const actor = await resolveActor(req);
  if (!actor) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { data: object };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { data } = body;
  if (!data) return Response.json({ ok: false, error: "Missing fields" }, { status: 400 });

  try {
    await ensureTable();
    await backupExistingBusinessData(`${actor.userId}_settings`, actor.userId);
    await db.execute({
      sql: "INSERT OR REPLACE INTO business_data (entity, data, updated_at) VALUES (?, ?, ?)",
      args: [`${actor.userId}_settings`, JSON.stringify(clampBranchesToPlan(data, actor.plan)), new Date().toISOString()],
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[settings] POST error:", err);
    return Response.json({ ok: false, error: "DB write failed" }, { status: 500 });
  }
}
