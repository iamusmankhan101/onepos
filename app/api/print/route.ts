/**
 * POST /api/print
 * Sends an ESC/POS receipt to a LAN thermal printer via TCP (port 9100).
 * Body: { invoice, businessName, businessPhone, businessAddress, printerIp, printerPort? }
 */

import { NextRequest } from "next/server";
import * as net from "net";

// ── ESC/POS helpers ────────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;

const CMD = {
  init:        Buffer.from([ESC, 0x40]),
  alignLeft:   Buffer.from([ESC, 0x61, 0x00]),
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignRight:  Buffer.from([ESC, 0x61, 0x02]),
  boldOn:      Buffer.from([ESC, 0x45, 0x01]),
  boldOff:     Buffer.from([ESC, 0x45, 0x00]),
  doubleOn:    Buffer.from([GS,  0x21, 0x11]),  // double width + height
  doubleOff:   Buffer.from([GS,  0x21, 0x00]),
  cut:         Buffer.from([GS,  0x56, 0x00]),  // full cut
  lf:          Buffer.from([0x0a]),
};

function text(s: string): Buffer {
  return Buffer.from(s + "\n", "utf8");
}

function divider(char = "-", len = 32): Buffer {
  return text(char.repeat(len));
}

function padLine(left: string, right: string, width = 32): Buffer {
  const gap = Math.max(1, width - left.length - right.length);
  return text(left + " ".repeat(gap) + right);
}

function buildReceipt(data: ReceiptData): Buffer {
  const W = 32; // characters wide for 80mm paper
  const chunks: Buffer[] = [];
  const push = (...bufs: Buffer[]) => chunks.push(...bufs);

  // ── Header ────────────────────────────────────────────────────────────────
  push(CMD.init);
  push(CMD.alignCenter, CMD.boldOn, CMD.doubleOn);
  push(text(data.businessName.toUpperCase()));
  push(CMD.doubleOff, CMD.boldOff);

  if (data.businessAddress) push(text(data.businessAddress));
  if (data.businessPhone)   push(text(`Tel: ${data.businessPhone}`));

  push(CMD.lf);
  push(divider("=", W));

  // ── Invoice meta ──────────────────────────────────────────────────────────
  push(CMD.alignLeft);
  push(CMD.boldOn, text(`Invoice: ${data.invoice.number}`), CMD.boldOff);
  push(text(`Date   : ${data.invoice.date}`));
  push(text(`Client : ${data.invoice.clientName}`));
  if (data.invoice.clientPhone) push(text(`Phone  : ${data.invoice.clientPhone}`));
  if (data.invoice.staffName)   push(text(`Staff  : ${data.invoice.staffName}`));

  push(divider("-", W));

  // ── Items ──────────────────────────────────────────────────────────────────
  push(CMD.boldOn, padLine("ITEM", "TOTAL", W), CMD.boldOff);
  push(divider("-", W));

  for (const item of data.invoice.items) {
    const label = item.qty > 1 ? `${item.description} x${item.qty}` : item.description;
    const price  = `${data.currency} ${item.total.toFixed(0)}`;
    // Wrap long labels
    if (label.length > W - price.length - 1) {
      push(text(label));
      push(CMD.alignRight, text(price), CMD.alignLeft);
    } else {
      push(padLine(label, price, W));
    }
  }

  push(divider("-", W));

  // ── Totals ────────────────────────────────────────────────────────────────
  push(padLine("Subtotal", `${data.currency} ${data.invoice.subtotal.toFixed(0)}`, W));

  if (data.invoice.discountAmount > 0)
    push(padLine("Discount", `-${data.currency} ${data.invoice.discountAmount.toFixed(0)}`, W));

  if (data.invoice.taxAmount > 0)
    push(padLine("Tax", `${data.currency} ${data.invoice.taxAmount.toFixed(0)}`, W));

  push(CMD.boldOn);
  push(padLine("TOTAL", `${data.currency} ${data.invoice.total.toFixed(0)}`, W));
  push(CMD.boldOff);

  if (data.invoice.paymentMethod) {
    const METHOD: Record<string, string> = {
      cash: "Cash", jazzcash: "JazzCash", easypaisa: "EasyPaisa",
      raast: "Raast", card: "Card", bank: "Bank Transfer",
    };
    push(padLine("Payment", METHOD[data.invoice.paymentMethod] ?? data.invoice.paymentMethod, W));
  }

  const isPaid = data.invoice.status === "paid";
  push(CMD.alignCenter, CMD.boldOn);
  push(text(isPaid ? "** PAID **" : "** UNPAID **"));
  push(CMD.boldOff);

  if (data.invoice.notes) {
    push(CMD.alignLeft);
    push(divider("-", W));
    push(text(`Note: ${data.invoice.notes}`));
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  push(divider("=", W));
  push(CMD.alignCenter);
  push(text("Thank you for your visit!"));
  push(text("We hope to see you again soon."));
  push(CMD.lf, CMD.lf, CMD.lf);
  push(CMD.cut);

  return Buffer.concat(chunks);
}

// ── TCP send ───────────────────────────────────────────────────────────────────

function sendToprinter(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Printer connection timed out (5s). Check the IP and LAN cable."));
    }, 5000);

    socket.connect(port, ip, () => {
      socket.write(data, (err) => {
        clearTimeout(timeout);
        socket.destroy();
        if (err) reject(err);
        else resolve();
      });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReceiptData {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  currency: string;
  invoice: {
    number: string;
    date: string;
    clientName: string;
    clientPhone: string;
    staffName: string;
    items: { description: string; qty: number; total: number }[];
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    paymentMethod: string;
    status: string;
    notes?: string;
  };
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: ReceiptData & { printerIp: string; printerPort?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { printerIp, printerPort = 9100, ...receiptData } = body;

  if (!printerIp) {
    return Response.json({ ok: false, error: "printerIp is required" }, { status: 400 });
  }

  try {
    const receipt = buildReceipt(receiptData);
    await sendToprinter(printerIp, printerPort, receipt);
    return Response.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[thermal-print] error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
