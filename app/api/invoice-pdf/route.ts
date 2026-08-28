import { NextRequest } from "next/server";
import { resolveActor } from "@/lib/api-auth";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import type { Invoice } from "@/lib/invoices";

interface RequestBody {
  invoice: Invoice;
  business: { name: string; phone?: string; email?: string; address?: string; logo?: string };
}

/**
 * POST /api/invoice-pdf
 *
 * Renders a POS invoice to an actual PDF and streams it back to the browser —
 * used by the Starter/Free-plan "share via WhatsApp" fallback (Web Share API),
 * which needs a real File object to hand to the OS share sheet since wa.me
 * links can only prefill text, never attach a file.
 */
export async function POST(request: NextRequest) {
  const actor = await resolveActor(request);
  if (!actor) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.invoice || !body.business) {
    return Response.json({ ok: false, error: "Invoice and business details are required." }, { status: 400 });
  }

  try {
    const pdfBuffer = await generateInvoicePdf(body.invoice, body.business);
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${body.invoice.number || "invoice"}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[invoice-pdf]", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Could not generate invoice PDF." }, { status: 500 });
  }
}
