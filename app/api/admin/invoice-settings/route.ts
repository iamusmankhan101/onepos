/**
 * /api/admin/invoice-settings — what prints on every subscription invoice.
 *
 * GET   → { billedFrom, methods }: the "Billed From" block and the bank
 *         accounts (payment methods) businesses can be pointed at.
 * POST  { action: "save-billed-from", name, tagline, phone, email, address }
 *       { action: "create-method", label, bankName, bankTitle, accountNumber, iban }
 *       { action: "update-method", id, label, bankName, bankTitle, accountNumber, iban }
 *       { action: "delete-method", id }  — businesses on it fall back to the default
 *
 * Assigning a method to one business is on /api/admin/billing ("set-payment-method").
 * Gated on requireAdmin(); every write is audit-logged.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/admin-db";
import {
  createPaymentMethod, deletePaymentMethod, getBilledFrom, listPaymentMethods,
  setBilledFrom, updatePaymentMethod, type PaymentMethodInput,
} from "@/lib/invoice-settings-db";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function methodInput(body: Record<string, unknown>): PaymentMethodInput | string {
  const input = {
    label: str(body.label), bankName: str(body.bankName), bankTitle: str(body.bankTitle),
    accountNumber: str(body.accountNumber), iban: str(body.iban),
  };
  if (!input.label.trim()) return "Label is required.";
  if (!input.bankName.trim()) return "Bank name is required.";
  if (!input.bankTitle.trim()) return "Account title is required.";
  if (!input.accountNumber.trim()) return "Account number is required.";
  if (!input.iban.trim()) return "IBAN is required.";
  return input;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    const [billedFrom, methods] = await Promise.all([getBilledFrom(), listPaymentMethods()]);
    return Response.json({ ok: true, billedFrom, methods });
  } catch (err) {
    console.error("[admin/invoice-settings] GET error:", err);
    return Response.json({ ok: false, error: "Could not load invoice settings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const log = (action: string, detail: string) =>
    logAdminAction({ actorId: admin.id, actorEmail: admin.email, action, detail });

  try {
    if (body.action === "save-billed-from") {
      if (!str(body.name).trim()) return Response.json({ ok: false, error: "Business name is required." }, { status: 400 });
      const billedFrom = await setBilledFrom({
        name: str(body.name), tagline: str(body.tagline), phone: str(body.phone), email: str(body.email), address: str(body.address),
      });
      await log("set-invoice-details", `Billed From: ${billedFrom.name}.`);
      return Response.json({ ok: true, billedFrom });
    }

    if (body.action === "create-method" || body.action === "update-method") {
      const input = methodInput(body);
      if (typeof input === "string") return Response.json({ ok: false, error: input }, { status: 400 });
      if (body.action === "create-method") {
        const method = await createPaymentMethod(input);
        await log("create-payment-method", `${method.label} (${method.bankName}, ${method.bankTitle}).`);
        return Response.json({ ok: true, method, methods: await listPaymentMethods() });
      }
      const id = str(body.id);
      if (!id) return Response.json({ ok: false, error: "No payment method given." }, { status: 400 });
      const method = await updatePaymentMethod(id, input);
      await log("update-payment-method", `${method.label} (${method.bankName}, ${method.bankTitle}).`);
      return Response.json({ ok: true, method, methods: await listPaymentMethods() });
    }

    if (body.action === "delete-method") {
      const id = str(body.id);
      if (!id) return Response.json({ ok: false, error: "No payment method given." }, { status: 400 });
      const method = await deletePaymentMethod(id);
      await log("delete-payment-method", `${method.label}; its businesses now show the default account.`);
      return Response.json({ ok: true, methods: await listPaymentMethods() });
    }

    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    console.error("[admin/invoice-settings] POST error:", message);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
