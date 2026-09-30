/**
 * /api/admin/billing — subscription payments for the admin console.
 *
 * GET   → every billable business with its paid-until date and status, the
 *         revenue roll-up, and the payment history.
 * POST  { action: "record", ownerId, plan, months | days, amountPkr, method, paidAt, reference?, note? }
 *       { action: "void", paymentId, reason? }
 *       { action: "set-terms", ownerId, customPricePkr: number | null, billingCycleMonths: number | null }
 *       { action: "set-payment-method", ownerId, paymentMethodId: string | null }  — null = the default account
 *       { action: "set-dates", ownerId, billingStartDate, invoiceIssueDate, invoiceDueDate }  — each YYYY-MM-DD or null (the default)
 *
 * Gated on requireAdmin(); every write is audit-logged alongside the other
 * admin actions.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/admin-db";
import { getBillingOverview, recordPayment, voidPayment } from "@/lib/billing-db";
import { getUserById, setBillingDates, setBillingTerms } from "@/lib/auth-db";
import { listPaymentMethods, setPaymentMethodForUser } from "@/lib/invoice-settings-db";
import {
  billingDates, cycleLabel, durationLabel, isIsoDate, MAX_PAYMENT_DAYS, MAX_PAYMENT_MONTHS, monthlyPrice, PAYMENT_METHODS,
  todayIso, type PeriodLength,
} from "@/lib/billing";
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

      // A period is whole months or a number of days — exactly one of the two.
      let length: PeriodLength;
      if (body.days !== undefined && body.days !== null) {
        const days = Number(body.days);
        if (!Number.isInteger(days) || days < 1 || days > MAX_PAYMENT_DAYS) {
          return Response.json({ ok: false, error: `Days must be a whole number from 1 to ${MAX_PAYMENT_DAYS}.` }, { status: 400 });
        }
        length = { days };
      } else {
        const months = Number(body.months);
        if (!Number.isInteger(months) || months < 1 || months > MAX_PAYMENT_MONTHS) {
          return Response.json({ ok: false, error: `Months must be a whole number from 1 to ${MAX_PAYMENT_MONTHS}.` }, { status: 400 });
        }
        length = { months };
      }

      // 0 is allowed: a complimentary period (a trial, a goodwill extension).
      const amountPkr = Math.round(Number(body.amountPkr));
      if (!Number.isFinite(amountPkr) || amountPkr < 0 || amountPkr > 10_000_000) {
        return Response.json({ ok: false, error: "Enter the amount received (0 for a free period)." }, { status: 400 });
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
        length,
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
        detail: `${payment.amountPkr > 0 ? `PKR ${payment.amountPkr.toLocaleString("en-US")} via ${payment.method}` : "Complimentary"} for ${durationLabel(payment)} of ${PLANS[plan].name}; paid until ${payment.periodEnd}.`
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

    if (body.action === "set-terms") {
      const ownerId = text(body.ownerId, 200);
      const owner = ownerId ? await getUserById(ownerId) : null;
      if (!owner) return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
      if (owner.businessOwnerId || owner.role !== "owner") {
        return Response.json({ ok: false, error: "Pricing is set on the business owner's account." }, { status: 400 });
      }

      let customPricePkr: number | null = null;
      if (body.customPricePkr !== null && body.customPricePkr !== undefined && body.customPricePkr !== "") {
        customPricePkr = Math.round(Number(body.customPricePkr));
        if (!Number.isFinite(customPricePkr) || customPricePkr < 0 || customPricePkr > 10_000_000) {
          return Response.json({ ok: false, error: "Enter a monthly price from 0 to 10,000,000." }, { status: 400 });
        }
      }

      let billingCycleMonths: number | null = null;
      if (body.billingCycleMonths !== null && body.billingCycleMonths !== undefined && body.billingCycleMonths !== "") {
        billingCycleMonths = Number(body.billingCycleMonths);
        if (!Number.isInteger(billingCycleMonths) || billingCycleMonths < 1 || billingCycleMonths > MAX_PAYMENT_MONTHS) {
          return Response.json({ ok: false, error: `The billing cycle must be 1 to ${MAX_PAYMENT_MONTHS} months.` }, { status: 400 });
        }
        if (billingCycleMonths === 1) billingCycleMonths = null;
      }

      await setBillingTerms(owner.id, { customPricePkr, billingCycleMonths });
      const price = monthlyPrice(PLANS[owner.plan].pricePkr, customPricePkr);
      await logAdminAction({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "set-billing-terms",
        targetId: owner.id,
        targetEmail: owner.email,
        detail: `${customPricePkr === null ? "List price" : "Custom price"}: ${cycleLabel(price, billingCycleMonths)}.`,
      });

      return Response.json({ ok: true, ...(await getBillingOverview()) });
    }

    if (body.action === "set-dates") {
      const ownerId = text(body.ownerId, 200);
      const owner = ownerId ? await getUserById(ownerId) : null;
      if (!owner) return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
      if (owner.businessOwnerId || owner.role !== "owner") {
        return Response.json({ ok: false, error: "Billing dates are set on the business owner's account." }, { status: 400 });
      }
      const dates = { billingStartDate: null as string | null, invoiceIssueDate: null as string | null, invoiceDueDate: null as string | null };
      for (const key of ["billingStartDate", "invoiceIssueDate", "invoiceDueDate"] as const) {
        const value = body[key];
        if (value === null || value === undefined || value === "") continue;
        if (!isIsoDate(value)) return Response.json({ ok: false, error: "Dates must be YYYY-MM-DD." }, { status: 400 });
        dates[key] = value;
      }
      // Checked on the dates as they'll actually apply, defaults included.
      const overview = await getBillingOverview();
      const paidUntil = overview.accounts.find((a) => a.id === owner.id)?.paidUntil ?? null;
      const effective = billingDates({ createdAt: owner.createdAt, paidUntil, ...dates });
      if (effective.issueDate > effective.dueDate) {
        return Response.json({ ok: false, error: "The invoice can't be issued after it's due." }, { status: 400 });
      }

      await setBillingDates(owner.id, dates);
      await logAdminAction({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "set-billing-dates",
        targetId: owner.id,
        targetEmail: owner.email,
        detail: `Started ${effective.startDate}; next invoice issued ${effective.issueDate}, due ${effective.dueDate}.`,
      });
      return Response.json({ ok: true, ...(await getBillingOverview()) });
    }

    if (body.action === "set-payment-method") {
      const ownerId = text(body.ownerId, 200);
      const owner = ownerId ? await getUserById(ownerId) : null;
      if (!owner) return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
      if (owner.businessOwnerId || owner.role !== "owner") {
        return Response.json({ ok: false, error: "The payment method is set on the business owner's account." }, { status: 400 });
      }
      const paymentMethodId = text(body.paymentMethodId, 200);
      await setPaymentMethodForUser(owner.id, paymentMethodId);
      const method = paymentMethodId ? (await listPaymentMethods()).find((m) => m.id === paymentMethodId) : null;
      await logAdminAction({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "set-payment-method",
        targetId: owner.id,
        targetEmail: owner.email,
        detail: `Invoices now show ${method ? method.label : "the default account"}.`,
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
