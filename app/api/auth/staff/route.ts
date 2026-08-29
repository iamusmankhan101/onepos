import { NextRequest } from "next/server";
import { COOKIE_NAME, LEGACY_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getStaffUsersForOwner, getUserById, upsertStaffUser } from "@/lib/auth-db";

const STAFF_PERMISSIONS = ["dashboard", "calendar", "appointments", "clients", "pos", "invoices"];
const MANAGER_PERMISSIONS = ["*"];
const ALL_PERMISSION_KEYS = new Set([
  "dashboard", "calendar", "appointments", "clients", "pos", "invoices", "loyalty",
  "revenue", "cash-flow", "inventory", "services", "staff", "messages", "try-on",
  "account", "billing",
]);

async function getAuthorizedActor(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? req.cookies.get(LEGACY_COOKIE_NAME)?.value;
  const actorId = token ? verifySessionToken(token) : null;
  if (!actorId) return { error: Response.json({ ok: false, error: "Not authenticated." }, { status: 401 }) };

  const actor = await getUserById(actorId);
  if (!actor || !["owner", "manager"].includes(actor.role)) {
    return { error: Response.json({ ok: false, error: "Only owners or managers can manage staff access." }, { status: 403 }) };
  }

  return { actor };
}

export async function GET(req: NextRequest) {
  const { actor, error } = await getAuthorizedActor(req);
  if (error) return error;

  const users = await getStaffUsersForOwner(actor!.businessOwnerId || actor!.id);
  return Response.json({ ok: true, users });
}

export async function POST(req: NextRequest) {
  const { actor, error } = await getAuthorizedActor(req);
  if (error) return error;

  const body = await req.json() as {
    staffId?: string; name?: string; email?: string; phone?: string; password?: string; locationId?: string;
    role?: string; permissions?: string[];
  };
  if (!body.staffId || !body.name || !body.email || !body.locationId) {
    return Response.json({ ok: false, error: "Staff name, email, ID and assigned location are required." }, { status: 400 });
  }

  const isManager = body.role === "manager";
  const requestedPermissions = Array.isArray(body.permissions)
    ? body.permissions.filter((permission) => ALL_PERMISSION_KEYS.has(permission))
    : STAFF_PERMISSIONS;
  const permissions = isManager
    ? MANAGER_PERMISSIONS
    : Array.from(new Set(["dashboard", ...requestedPermissions]));

  try {
    const user = await upsertStaffUser({
      businessOwnerId: actor!.businessOwnerId || actor!.id,
      staffId: body.staffId,
      name: body.name,
      businessName: actor!.businessName,
      email: body.email,
      phone: body.phone || "",
      password: body.password,
      role: isManager ? "manager" : "staff",
      permissions,
      locationId: body.locationId,
    });
    return Response.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save staff login.";
    const status = message.includes("already exists") ? 409 : 400;
    return Response.json({ ok: false, error: message }, { status });
  }
}
