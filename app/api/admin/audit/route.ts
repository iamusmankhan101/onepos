/**
 * GET /api/admin/audit?limit=200
 *
 * The platform-wide admin action trail — who froze, approved, reset or deleted
 * what, and when. Read-only: entries are written by the action routes and are
 * never editable from the console.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getAuditLog } from "@/lib/admin-db";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;

  try {
    return Response.json({ ok: true, entries: await getAuditLog(limit) });
  } catch (err) {
    console.error("[admin/audit] GET error:", err);
    return Response.json({ ok: false, error: "Failed to load the audit log." }, { status: 500 });
  }
}
