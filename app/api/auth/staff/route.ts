import { NextRequest } from "next/server";
import { sessionUserId } from "@/lib/api-auth";
import { getStaffUsersForOwner, getUserById, upsertStaffUser } from "@/lib/auth-db";

const STAFF_PERMISSIONS = ["dashboard", "calendar", "appointments", "clients", "pos", "invoices"];
const MANAGER_PERMISSIONS = ["*"];
const ALL_PERMISSION_KEYS = new Set([
  "dashboard", "calendar", "appointments", "clients", "pos", "products", "invoices", "loyalty",
  "revenue", "cash-flow", "inventory", "services", "staff", "messages", "try-on",
  "account", "billing",
]);

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

async function getAuthorizedActor(req: NextRequest) {
  const actorId = await sessionUserId(req);
  if (!actorId) return { error: Response.json({ ok: false, error: "Not authenticated." }, { status: 401 }) };

  const actor = await getUserById(actorId);
  if (!actor || actor.approvalStatus !== "approved" || actor.accountFrozen) {
    return { error: Response.json({ ok: false, error: "Not authenticated." }, { status: 401 }) };
  }
  if (!["owner", "manager"].includes(actor.role)) {
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

  let body: {
    staffId?: string; name?: string; email?: string; phone?: string; password?: string; locationId?: string;
    role?: string; permissions?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const { staffId, name, email, locationId } = body;
  if (!isText(staffId) || !isText(name) || !isText(email) || !isText(locationId)) {
    return Response.json({ ok: false, error: "Staff name, email, ID and assigned location are required." }, { status: 400 });
  }
  if (body.phone !== undefined && typeof body.phone !== "string") {
    return Response.json({ ok: false, error: "Invalid phone number." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) {
    return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  }
  // Checked here, not only on create: a blank password keeps the current one,
  // but a new one must meet the same rule whether the login is new or not.
  if (body.password !== undefined && body.password !== "") {
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
      return Response.json({ ok: false, error: "Staff password must be 8 to 128 characters." }, { status: 400 });
    }
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
      staffId,
      name,
      businessName: actor!.businessName,
      email,
      phone: body.phone || "",
      password: body.password,
      role: isManager ? "manager" : "staff",
      permissions,
      locationId,
    });
    return Response.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save staff login.";
    const status = message.includes("already exists") ? 409 : 400;
    return Response.json({ ok: false, error: message }, { status });
  }
}
