import { Document, Page, StyleSheet, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Invoice } from "@/lib/invoices";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", jazzcash: "JazzCash", easypaisa: "EasyPaisa",
  raast: "Raast", card: "Card", bank: "Bank Transfer", "": "—",
};

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 9, color: "#111111" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 },
  businessName: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  businessLine: { fontSize: 9, color: "#555555", marginBottom: 4 },
  logo: { width: 70, height: 70, objectFit: "contain" },
  logoFallback: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  logoInitials: { color: "#ffffff", fontSize: 20, fontFamily: "Helvetica-Bold" },

  metaGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  metaCol: { width: "47%" },
  sectionLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 8 },
  billName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  billLine: { fontSize: 9, color: "#555555", marginBottom: 3 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  metaRowLabel: { fontSize: 9, color: "#555555" },
  metaRowValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  tableHeader: { flexDirection: "row", backgroundColor: "#f0f0f0", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#cccccc", padding: 8 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e8e8e8", padding: 8 },
  description: { width: "46%" },
  qty: { width: "10%", textAlign: "right" },
  amount: { width: "22%", textAlign: "right" },
  head: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  cellMuted: { fontSize: 9, color: "#555555" },
  cellStrong: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  summary: { marginLeft: "auto", width: "48%", marginTop: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#e8e8e8" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 2, borderTopColor: "#111111", marginTop: 2 },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  paidLine: { fontSize: 9, color: "#059669", fontFamily: "Helvetica-Bold", marginTop: 24 },
  notesBlock: { marginTop: 24 },
  termsBlock: { marginTop: 24 },
  termsText: { fontSize: 9, color: "#555555", lineHeight: 1.6 },

  footer: { position: "absolute", bottom: 40, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e0e0e0", paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { fontSize: 9, color: "#555555" },
  footerBrand: { fontSize: 9, color: "#9898b0" },
  footerLogo: { height: 11, objectFit: "contain" },
});

/**
 * The Pointly mark for the footer, read off disk once. A downscaled copy: it
 * renders 11pt tall and gets embedded in every invoice, which are shared over
 * WhatsApp. @react-pdf renders on the server, where the public/ file may not
 * be part of the deployment bundle — hence the fallback to a plain text mark
 * rather than a hard failure.
 */
const footerLogo: string | null = (() => {
  try {
    const file = readFileSync(join(process.cwd(), "public", "logo-dark-sm.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
})();

function money(value: number) {
  return `PKR ${Math.round(value).toLocaleString("en-PK")}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PK", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function InvoiceDocument({ invoice, business }: {
  invoice: Invoice;
  business: { name: string; phone?: string; email?: string; address?: string; logo?: string };
}) {
  const isPaid   = invoice.status === "paid";
  const businessName = business.name || "Pointly";
  const initials  = businessName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const methodLabel = METHOD_LABELS[invoice.paymentMethod ?? ""] ?? "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{businessName}</Text>
            {!!business.address && <Text style={styles.businessLine}>{business.address}</Text>}
            {!!business.email   && <Text style={styles.businessLine}>{business.email}</Text>}
            {!!business.phone   && <Text style={styles.businessLine}>{business.phone}</Text>}
          </View>
          {business.logo ? (
            <Image src={business.logo} style={styles.logo} />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoInitials}>{initials}</Text>
            </View>
          )}
        </View>

        {/* ── BILL TO / INVOICE ── */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.billName}>{invoice.clientName}</Text>
            {!!invoice.clientPhone && <Text style={styles.billLine}>{invoice.clientPhone}</Text>}
            {!!invoice.clientEmail && <Text style={styles.billLine}>{invoice.clientEmail}</Text>}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Invoice</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaRowLabel}>Invoice No:</Text>
              <Text style={styles.metaRowValue}>{invoice.number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaRowLabel}>Issue Date:</Text>
              <Text style={styles.metaRowValue}>{fmtDate(invoice.date)}</Text>
            </View>
            {!!invoice.staffName && (
              <View style={styles.metaRow}>
                <Text style={styles.metaRowLabel}>Stylist:</Text>
                <Text style={styles.metaRowValue}>{invoice.staffName}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaRowLabel}>Payment:</Text>
              <Text style={styles.metaRowValue}>{methodLabel}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaRowLabel}>Status:</Text>
              <Text style={styles.metaRowValue}>{isPaid ? "PAID" : "UNPAID"}</Text>
            </View>
          </View>
        </View>

        {/* ── ITEMS TABLE ── */}
        <View style={styles.tableHeader}>
          <Text style={[styles.description, styles.head]}>Description</Text>
          <Text style={[styles.qty, styles.head]}>Qty</Text>
          <Text style={[styles.amount, styles.head]}>Unit Price</Text>
          <Text style={[styles.amount, styles.head]}>Amount</Text>
        </View>
        {invoice.items.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={[styles.description, styles.cellMuted]}>{item.description}</Text>
            <Text style={[styles.qty, styles.cellMuted]}>{item.qty}</Text>
            <Text style={[styles.amount, styles.cellMuted]}>{money(item.unitPrice)}</Text>
            <Text style={[styles.amount, styles.cellStrong]}>{money(item.total)}</Text>
          </View>
        ))}

        {/* ── TOTALS ── */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.cellMuted}>Subtotal</Text>
            <Text style={styles.cellStrong}>{money(invoice.subtotal)}</Text>
          </View>
          {invoice.taxAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.cellMuted}>Tax</Text>
              <Text style={styles.cellMuted}>{money(invoice.taxAmount)}</Text>
            </View>
          )}
          {invoice.discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.cellMuted}>Discount</Text>
              <Text style={styles.cellMuted}>-{money(invoice.discountAmount)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(invoice.total)}</Text>
          </View>
        </View>

        {/* ── PAYMENT STATUS ── */}
        {isPaid && invoice.paymentMethod && (
          <Text style={styles.paidLine}>Paid via {methodLabel}</Text>
        )}

        {/* ── NOTES ── */}
        {!!invoice.notes && (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.termsText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── TERMS ── */}
        <View style={styles.termsBlock}>
          <Text style={styles.sectionLabel}>Terms</Text>
          <Text style={styles.termsText}>
            Payment is due upon receipt. Thank you for your business!{"\n"}
            For queries, contact us at {business.email || business.phone || "—"}.
          </Text>
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Thank you for visiting {businessName}!</Text>
          {footerLogo
            ? <Image src={footerLogo} style={styles.footerLogo} />
            : <Text style={styles.footerBrand}>Powered by Pointly</Text>}
        </View>

      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(
  invoice: Invoice,
  business: { name: string; phone?: string; email?: string; address?: string; logo?: string },
) {
  return renderToBuffer(<InvoiceDocument invoice={invoice} business={business} />);
}
