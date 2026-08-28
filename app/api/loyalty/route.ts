/**
 * /api/loyalty
 *
 * GET  — fetch loyalty transaction history for the authenticated caller
 * POST { data }  — upsert full history array
 *
 * Stored in business_data table under key "{userId}_loyalty_history", where
 * userId is always resolved from the caller's own session.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/api-auth";
import { backupExistingBusinessData } from "@/lib/data-backup";

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
  const requestedLocationId = req.nextUrl.searchParams.get("locationId") || "main";
  const actor = await resolveActor(req, requestedLocationId);
  if (!actor) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { userId, locationId } = actor;

  try {
    await ensureTable();
    const result = await db.execute({
      sql: "SELECT data FROM business_data WHERE entity = ?",
      args: [locationId === "main" ? `${userId}_loyalty_history` : `${userId}_${locationId}_loyalty_history`],
    });
    if (result.rows.length === 0) return Response.json({ ok: true, data: [] });
    return Response.json({ ok: true, data: JSON.parse(result.rows[0].data as string) });
  } catch (err) {
    console.error("[loyalty] GET error:", err);
    return Response.json({ ok: true, data: [] });
  }
}

export async function POST(req: NextRequest) {
  let body: { locationId?: string; data: unknown[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { data } = body;
  if (!Array.isArray(data)) return Response.json({ ok: false, error: "Missing fields" }, { status: 400 });

  const actor = await resolveActor(req, body.locationId || "main");
  if (!actor) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { userId, locationId } = actor;

  try {
    await ensureTable();
    const key = locationId === "main" ? `${userId}_loyalty_history` : `${userId}_${locationId}_loyalty_history`;
    await backupExistingBusinessData(key, userId);
    await db.execute({
      sql: "INSERT OR REPLACE INTO business_data (entity, data, updated_at) VALUES (?, ?, ?)",
      args: [
        key,
        JSON.stringify(data),
        new Date().toISOString(),
      ],
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[loyalty] POST error:", err);
    return Response.json({ ok: false, error: "DB write failed" }, { status: 500 });
  }
}
