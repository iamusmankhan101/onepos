/**
 * /api/admin/billing — subscription payments for the admin console.
 *
 * GET   → every billable business with its paid-until date and status, the
 *         revenue roll-up, and the payment history.
 * POST  { action: "record", ownerId, plan, months, amountPkr, method, paidAt, reference?, note? }
 *       { action: "void", paymentId, reason? }
 *
 * Gated on requireAdmin(); every write is audit-logged alongside the other
 * admin actions.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/admin-db";
import { getBillingOverview, recordPayment, voidPayment } from "@/lib/billing-db";
import { isIsoDate, PAYMENT_METHODS, PAYMENT_MONTH_OPTIONS, todayIso } from "@/lib/billing";
import { normalizePlanId, PLANS } from "@/lib/plans";

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    return Response.json({ ok: true, ...(await getBillingOverview()) });
  } catch (err) {
    console.error("[admin/billing] GET error:", err);
    return Response.json({ ok: false, error: "Failed to load billing." }, { status: 500 });
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

  try {
    if (body.action === "record") {
      const ownerId = text(body.ownerId, 200);
      if (!ownerId) return Response.json({ ok: false, error: "Choose an account." }, { status: 400 });

      // Same rule as set-plan: an unknown tier is refused, never read as Basic.
      if (typeof body.plan !== "string" || normalizePlanId(body.plan) !== body.plan) {
        return Response.json({ ok: false, error: "Unknown plan." }, { status: 400 });
      }
      const plan = normalizePlanId(body.plan);

      const months = Number(body.months);
      if (!(PAYMENT_MONTH_OPTIONS as readonly number[]).includes(months)) {
        return Response.json({ ok: false, error: "Months must be 1, 3, 6 or 12." }, { status: 400 });
      }

      const amountPkr = Math.round(Number(body.amountPkr));
      if (!Number.isFinite(amountPkr) || amountPkr <= 0 || amountPkr > 10_000_000) {
        return Response.json({ ok: false, error: "Enter the amount received." }, { status: 400 });
      }

      const method = text(body.method, 40);
      if (!method || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
        return Response.json({ ok: false, error: "Choose how it was paid." }, { status: 400 });
      }

      const paidAt = isIsoDate(body.paidAt) ? body.paidAt : todayIso();
      // A day of slack: the server runs on UTC while the admin is five hours
      // ahead, so "today" in Karachi can be tomorrow here.
      if (paidAt > todayIso(new Date(Date.now() + 24 * 60 * 60 * 1000))) {
        return Response.json({ ok: false, error: "The payment date can't be in the future." }, { status: 400 });
      }

      const { payment, planChanged } = await recordPayment({
        ownerId,
        plan,
        amountPkr,
        months,
        method,
        reference: text(body.reference, 120),
        note: text(body.note, 300),
        paidAt,
        recordedBy: { id: admin.id, email: admin.email },
      });

      await logAdminAction({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "record-payment",
        targetId: payment.ownerId,
        targetEmail: payment.ownerEmail,
        detail: `PKR ${payment.amountPkr.toLocaleString("en-US")} via ${payment.method} for ${payment.months} month(s) of ${PLANS[plan].name}; paid until ${payment.periodEnd}.`
          + (planChanged ? ` Plan set to ${PLANS[plan].name}.` : ""),
      });

      return Response.json({ ok: true, payment, ...(await getBillingOverview()) });
    }

    if (body.action === "void") {
      const paymentId = text(body.paymentId, 200);
      if (!paymentId) return Response.json({ ok: false, error: "No payment given." }, { status: 400 });
      const reason = text(body.reason, 300);
      const payment = await voidPayment(paymentId, reason);

      await logAdminAction({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "void-payment",
        targetId: payment.ownerId,
        targetEmail: payment.ownerEmail,
        detail: `Voided PKR ${payment.amountPkr.toLocaleString("en-US")} paid ${payment.paidAt}.${reason ? ` ${reason}` : ""}`,
      });

      return Response.json({ ok: true, ...(await getBillingOverview()) });
    }

    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    console.error("[admin/billing] POST error:", message);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
