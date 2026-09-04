/**
 * GET /api/admin/users/[id]
 *
 * Everything the console's detail panel shows for one account: the account
 * itself, the team logins under it (business owners only), what its business
 * is holding in business_data broken down by branch and entity, and the audit
 * trail of admin actions taken against it.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getStaffUsersForOwner, getUserById } from "@/lib/auth-db";
import { getActiveSessionCounts, getAuditLog, getBusinessBreakdown } from "@/lib/admin-db";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;

  try {
    const user = await getUserById(id);
    if (!user) return Response.json({ ok: false, error: "Account not found." }, { status: 404 });

    const { password: _password, ...safeUser } = user;
    void _password;

    // Staff and managers hold no data of their own — their records live under
    // the business owner, so the footprint shown is that of the owner.
    const dataOwnerId = user.businessOwnerId || user.id;
    const [team, breakdown, history, sessionCounts] = await Promise.all([
      user.businessOwnerId ? Promise.resolve([]) : getStaffUsersForOwner(user.id),
      getBusinessBreakdown(dataOwnerId),
      getAuditLog(50, id),
      getActiveSessionCounts(),
    ]);

    // Same enriched shape the list endpoint returns, so the console renders one
    // account the same way whether it came from the table or from here.
    const ownRows = user.businessOwnerId ? [] : breakdown;
    return Response.json({
      ok: true,
      user: {
        ...safeUser,
        teamSize: team.length,
        activeSessions: sessionCounts.get(id) ?? 0,
        storageBytes: ownRows.reduce((sum, row) => sum + row.bytes, 0),
        branches: [...new Set(ownRows.filter((row) => row.entity !== "settings").map((row) => row.locationId))].sort(),
        lastActivity: ownRows.reduce<string | null>(
          (latest, row) => (row.updatedAt && (!latest || row.updatedAt > latest) ? row.updatedAt : latest),
          null,
        ),
      },
      team,
      dataOwnerId,
      breakdown,
      history,
    });
  } catch (err) {
    console.error("[admin/users/:id] GET error:", err);
    return Response.json({ ok: false, error: "Failed to load account." }, { status: 500 });
  }
}
