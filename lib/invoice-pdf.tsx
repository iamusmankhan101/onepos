import { Document, Page, StyleSheet, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Invoice } from "@/lib/invoices";
import { code39, code39Width } from "@/lib/barcode";

/**
 * The customer receipt, laid out for an 80mm till roll rather than a sheet of
 * A4 — this is a point of sale, so what a customer walks away with (and what
 * gets sent over WhatsApp) is a receipt.
 *
 * 80mm at 72dpi is 226.77pt; the printable area of an 80mm roll is 72mm, which
 * leaves 204pt. The page height is computed from the content because a roll has
 * no fixed page — see receiptHeight().
 */
const ROLL_WIDTH = 226.77;
const PADDING = 12;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", jazzcash: "JazzCash", easypaisa: "EasyPaisa",
  raast: "Raast", card: "Card", bank: "Bank Transfer", "": "—",
};

const styles = StyleSheet.create({
  page: { paddingVertical: 14, paddingHorizontal: PADDING, fontFamily: "Helvetica", fontSize: 8, color: "#000000" },

  center: { alignItems: "center" },
  logo: { maxWidth: 110, maxHeight: 46, objectFit: "contain", marginBottom: 6 },
  businessName: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 0.4 },
  businessLine: { fontSize: 7, color: "#333333", textAlign: "center", marginTop: 2 },

  rule: { borderBottomWidth: 1, borderBottomColor: "#000000", borderBottomStyle: "dashed", marginVertical: 7 },
  ruleLight: { borderBottomWidth: 0.5, borderBottomColor: "#999999", marginVertical: 5 },

  title: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 1.2 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  metaLabel: { fontSize: 7, color: "#444444" },
  metaValue: { fontSize: 7, fontFamily: "Helvetica-Bold" },

  itemHead: { flexDirection: "row", marginBottom: 3 },
  itemRow: { flexDirection: "row", marginTop: 4 },
  colQty: { width: 22, fontSize: 7.5 },
  colName: { flex: 1, fontSize: 7.5, paddingRight: 4 },
  colAmount: { width: 54, fontSize: 7.5, textAlign: "right" },
  headText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#444444", letterSpacing: 0.4 },
  unitLine: { fontSize: 6.5, color: "#666666", marginTop: 1 },

  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  totalLabel: { fontSize: 8 },
  totalValue: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  grandRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: "#000000" },
  grandLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },

  thanks: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 1.5, marginTop: 4 },
  note: { fontSize: 7, color: "#444444", textAlign: "center", marginTop: 3, lineHeight: 1.5 },

  barcodeRow: { flexDirection: "row", height: 26, marginTop: 8, justifyContent: "center" },
  barcodeText: { fontSize: 6.5, color: "#333333", textAlign: "center", letterSpacing: 1, marginTop: 2 },

  footerLogo: { width: 44, marginTop: 8, alignSelf: "center" },
  footerBrand: { fontSize: 6.5, color: "#888888", textAlign: "center", marginTop: 8 },
});

/**
 * The Pointly mark for the footer, read off disk once. A downscaled copy: it
 * renders a few points tall and gets embedded in every receipt, which are
 * shared over WhatsApp. @react-pdf renders on the server, where the public/
 * file may not be part of the deployment bundle — hence the fallback to a
 * plain text mark rather than a hard failure.
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
    year: "numeric", month: "short", day: "numeric",
  });
}

/**
 * A till roll has no page height — it is cut where the content ends. @react-pdf
 * needs a number, so this adds up the real line heights of everything drawn
 * below. Being short pushes the footer onto a phantom second page, so it ends
 * with a small safety margin: a few points of extra paper beats a second page.
 */
function receiptHeight(
  invoice: Invoice,
  business: { address?: string; email?: string; phone?: string; logo?: string },
): number {
  const line = (fontSize: number, lineHeight = 1.2) => fontSize * lineHeight;
  const RULE = 15;        // 1pt border + 7pt margin either side
  const RULE_LIGHT = 11;

  let h = 28;                                                   // page padding, top + bottom
  if (business.logo) h += 52;                                   // logo box + its margin
  h += line(12) + 1;                                            // business name
  h += [business.address, business.phone, business.email].filter(Boolean).length * (line(7) + 2);

  h += RULE + line(9) + RULE_LIGHT;                             // rule, "SALES RECEIPT", rule

  const metaRows = 4 + (invoice.staffName ? 1 : 0);             // no, date, customer, [staff], payment
  h += metaRows * (line(7) + 2);

  h += RULE + line(6.5) + 3;                                    // rule + column header

  // ~26 characters fit the item column at 7.5pt; longer descriptions wrap.
  for (const item of invoice.items) {
    const wrapped = Math.max(1, Math.ceil(item.description.length / 26));
    h += 4 + wrapped * line(7.5);
    if (item.qty > 1) h += line(6.5) + 1;                       // the "@ unit price" line
  }

  h += RULE;
  const totalRows =
    1 +                                                          // subtotal
    (invoice.discountAmount > 0 ? 1 : 0) +
    ((invoice.discount2Amount ?? 0) > 0 ? 1 : 0) +
    (invoice.taxAmount > 0 ? 1 : 0) +
    1;                                                           // the payment/balance line
  h += totalRows * (line(8) + 3);
  h += 5 + 5 + line(11) + 1;                                     // grand total row

  if (invoice.notes) h += 3 + Math.max(1, Math.ceil(invoice.notes.length / 46)) * line(7, 1.5);

  h += RULE_LIGHT + 4 + line(9);                                 // "THANK YOU"
  h += 3 + line(7, 1.5);                                         // keep-this-receipt note
  h += 8 + 26 + 2 + line(6.5);                                   // barcode block + caption
  h += 8 + 44 / 2.5;                                             // footer mark (44pt wide, 2.5:1)
  h += 12;                                                       // safety margin

  return Math.max(260, Math.ceil(h));
}

function Barcode({ value }: { value: string }) {
  const elements = code39(value);
  if (elements.length === 0) return null;
  const available = ROLL_WIDTH - PADDING * 2;
  const unit = available / code39Width(elements);

  return (
    <View style={styles.barcodeRow}>
      {elements.map((element, i) => (
        <View
          key={i}
          style={{ width: element.units * unit, backgroundColor: element.bar ? "#000000" : "#ffffff" }}
        />
      ))}
    </View>
  );
}

function ReceiptDocument({ invoice, business }: {
  invoice: Invoice;
  business: { name: string; phone?: string; email?: string; address?: string; logo?: string };
}) {
  const isPaid       = invoice.status === "paid";
  const businessName = business.name || "Pointly";
  const methodLabel  = METHOD_LABELS[invoice.paymentMethod ?? ""] ?? "—";
  const itemCount    = invoice.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <Document>
      <Page size={[ROLL_WIDTH, receiptHeight(invoice, business)]} style={styles.page}>

        {/* ── SHOP ── */}
        <View style={styles.center}>
          {!!business.logo && <Image src={business.logo} style={styles.logo} />}
          <Text style={styles.businessName}>{businessName.toUpperCase()}</Text>
          {!!business.address && <Text style={styles.businessLine}>{business.address}</Text>}
          {!!business.phone   && <Text style={styles.businessLine}>{business.phone}</Text>}
          {!!business.email   && <Text style={styles.businessLine}>{business.email}</Text>}
        </View>

        <View style={styles.rule} />
        <Text style={styles.title}>SALES RECEIPT</Text>
        <View style={styles.ruleLight} />

        {/* ── SALE DETAILS ── */}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Receipt No</Text>
          <Text style={styles.metaValue}>{invoice.number}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>{fmtDate(invoice.date)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Customer</Text>
          <Text style={styles.metaValue}>{invoice.clientName}</Text>
        </View>
        {!!invoice.staffName && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Served by</Text>
            <Text style={styles.metaValue}>{invoice.staffName}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Payment</Text>
          <Text style={styles.metaValue}>{isPaid ? methodLabel : "UNPAID"}</Text>
        </View>

        <View style={styles.rule} />

        {/* ── ITEMS ── */}
        <View style={styles.itemHead}>
          <Text style={[styles.colQty, styles.headText]}>QTY</Text>
          <Text style={[styles.colName, styles.headText]}>ITEM</Text>
          <Text style={[styles.colAmount, styles.headText]}>AMOUNT</Text>
        </View>

        {invoice.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.colQty}>{item.qty}x</Text>
            <View style={styles.colName}>
              <Text>{item.description}</Text>
              {item.qty > 1 && <Text style={styles.unitLine}>@ {money(item.unitPrice)}</Text>}
            </View>
            <Text style={styles.colAmount}>{money(item.total)}</Text>
          </View>
        ))}

        <View style={styles.rule} />

        {/* ── TOTALS ── */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal ({itemCount} item{itemCount === 1 ? "" : "s"})</Text>
          <Text style={styles.totalValue}>{money(invoice.subtotal)}</Text>
        </View>
        {invoice.discountAmount > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Discount</Text>
            <Text style={styles.totalValue}>-{money(invoice.discountAmount)}</Text>
          </View>
        )}
        {(invoice.discount2Amount ?? 0) > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Discount 2</Text>
            <Text style={styles.totalValue}>-{money(invoice.discount2Amount!)}</Text>
          </View>
        )}
        {invoice.taxAmount > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{money(invoice.taxAmount)}</Text>
          </View>
        )}

        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>TOTAL</Text>
          <Text style={styles.grandValue}>{money(invoice.total)}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{isPaid ? methodLabel : "Balance due"}</Text>
          <Text style={styles.totalValue}>{money(invoice.total)}</Text>
        </View>

        {!!invoice.notes && <Text style={styles.note}>{invoice.notes}</Text>}

        <View style={styles.ruleLight} />
        <Text style={styles.thanks}>THANK YOU</Text>
        <Text style={styles.note}>Please keep this receipt for exchanges.</Text>

        <Barcode value={invoice.number} />
        <Text style={styles.barcodeText}>{invoice.number}</Text>

        {footerLogo
          ? <Image src={footerLogo} style={styles.footerLogo} />
          : <Text style={styles.footerBrand}>Powered by Pointly</Text>}

      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(
  invoice: Invoice,
  business: { name: string; phone?: string; email?: string; address?: string; logo?: string },
) {
  return renderToBuffer(<ReceiptDocument invoice={invoice} business={business} />);
}
