"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search, Scissors, Package, Plus, Minus, Trash2, Phone,
  X, ShoppingCart, ReceiptText, Banknote, CreditCard,
  Smartphone, Zap, Tag, UserPlus, CheckCircle2, Printer,
  MessageSquare, RefreshCw, User, ChevronRight, Sparkles,
  Clock, AlertCircle, Gift,
  ScanBarcode, Lock,
} from "lucide-react";
import { awardPoints, redeemPoints, type LoyaltySettings } from "@/lib/loyalty";
import InvoicePrint from "@/components/invoice-print";
import InvoiceEdit from "@/components/invoice-edit";
import {
  getStoredServices, getStoredClients, getStoredInventory,
  getStoredStaff, getStoredAppointments, saveAppointments, saveClients, saveInventory,
} from "@/lib/storage";
import {
  createInvoice, calcTotals,
  localDateKey, getInvoices, saveInvoices,
  type Invoice, type InvoiceItem,
} from "@/lib/invoices";
import { settingsStore } from "@/lib/settings-store";
import { normalizePhone, fillTemplate, openWhatsAppChat, buildWhatsAppLink, sanitizeForLink } from "@/lib/whatsapp-link";
import { getDefaultLocationId } from "@/lib/locations";
import { getSectionOptions, getActiveSection, inSection } from "@/lib/sections";
import type { Service, Client, InventoryItem, Staff, PaymentMethod } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type CatalogTab = "all" | "services" | "products";
type DiscountType = "flat" | "pct";

interface CatalogItem {
  id: string;
  type: "service" | "product";
  name: string;
  price: number;
  category: string;
  section?: string;
  stock?: number;
  unit?: string;
  barcode?: string;
  variablePrice?: boolean;
  priceRangeMin?: number;
  priceRangeMax?: number;
}

interface CartEntry {
  cartId: string;
  itemId: string;
  type: "service" | "product";
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  variablePrice?: boolean;
  priceRangeMin?: number;
  priceRangeMax?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAY_METHODS: { value: PaymentMethod; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { value: "cash",      label: "Cash",      icon: Banknote,   color: "#059669", bg: "#ecfdf5" },
  { value: "jazzcash",  label: "JazzCash",  icon: Smartphone, color: "#EA580C", bg: "#fff7ed" },
  { value: "easypaisa", label: "EasyPaisa", icon: Smartphone, color: "#10b981", bg: "#f0fdf4" },
  { value: "raast",     label: "Raast",     icon: Zap,        color: "#0284c7", bg: "#f0f9ff" },
  { value: "card",      label: "Card",      icon: CreditCard, color: "#6366f1", bg: "#eef2ff" },
  { value: "bank",      label: "Bank",      icon: CreditCard, color: "#0369a1", bg: "#f0f9ff" },
];

const CATEGORY_COLORS: Record<string, { fg: string; bg: string }> = {
  hair:    { fg: "#EA580C", bg: "#fff7ed" },
  skin:    { fg: "#0284c7", bg: "#f0f9ff" },
  nails:   { fg: "#ec4899", bg: "#fdf2f8" },
  bridal:  { fg: "#d97706", bg: "#fffbeb" },
  piercing: { fg: "#c2410c", bg: "#fff7ed" },
  product: { fg: "#d97706", bg: "#fffbeb" },
  other:   { fg: "#6b7280", bg: "#f9fafb" },
};

function catColor(category: string, type: "service" | "product") {
  if (type === "product") return CATEGORY_COLORS.product;
  return CATEGORY_COLORS[category?.toLowerCase()] || CATEGORY_COLORS.other;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pkr(n: number) {
  return "PKR " + Math.round(n).toLocaleString("en-PK");
}

function wholePkr(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseDiscountValue(value: string): number {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

function initials(name: string) {
  return name.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 2) || "?";
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function POSPage() {

  // ── Data ──────────────────────────────────────────────────────────────────
  const [services,  setServices]  = useState<Service[]>([]);
  const [clients,   setClients]   = useState<Client[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [staff,     setStaff]     = useState<Staff[]>([]);
  const [now,       setNow]       = useState(new Date());
  const [apptBanner, setApptBanner] = useState<string | null>(null);
  const [checkoutAppointmentId, setCheckoutAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    const allServices  = getStoredServices().filter(s => s.isActive);
    const allClients   = getStoredClients();
    const allInventory = getStoredInventory();
    const allStaff     = getStoredStaff().filter(s => s.isActive);

    setServices(allServices);
    setClients(allClients);
    setInventory(allInventory);
    setStaff(allStaff);

    // Pre-fill from appointment if ?appointmentId= is in the URL
    const params       = new URLSearchParams(window.location.search);
    const apptId       = params.get("appointmentId");
    if (apptId) {
      const appt = getStoredAppointments().find(a => a.id === apptId);
      if (appt) {
        // Set client
        const client = allClients.find(c => c.id === appt.clientId);
        if (client) setSelectedClient(client);

        // Set staff
        if (appt.staffId) setSelectedStaffId(appt.staffId);

        // Build cart from appointment services
        const cartEntries: CartEntry[] = appt.serviceIds
          .map((svcId, idx) => {
            const svc = allServices.find(s => s.id === svcId);
            const name = svc?.name ?? appt.serviceNames[idx] ?? "Service";
            const price = svc?.price ?? appt.totalAmount;
            return {
              cartId:    crypto.randomUUID(),
              itemId:    svcId,
              type:      "service" as const,
              name,
              qty:       1,
              unitPrice: price,
              total:     price,
            };
          })
          .filter(e => e.unitPrice > 0);

        if (cartEntries.length > 0) setCart(cartEntries);

        // Note the source appointment
        setSaleNotes(`Appointment checkout${appt.date ? ` · ${appt.date}` : ""}`);
        setApptBanner(`Checking out: ${appt.clientName} · ${appt.serviceNames.join(", ")} · ${appt.date}`);
        setCheckoutAppointmentId(appt.id);
      }
    }

    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Customer ──────────────────────────────────────────────────────────────
  const [clientQ,         setClientQ]         = useState("");
  const [showDrop,        setShowDrop]         = useState(false);
  const [selectedClient,  setSelectedClient]   = useState<Client | null>(null);
  const [showNewForm,     setShowNewForm]       = useState(false);
  const [newName,         setNewName]           = useState("");
  const [newPhone,        setNewPhone]          = useState("");
  const [newDob,          setNewDob]            = useState("");
  const [selectedStaffId, setSelectedStaffId]  = useState("");
  const [saleNotes,       setSaleNotes]         = useState("");

  // ── Catalog ───────────────────────────────────────────────────────────────
  const [catalogTab,    setCatalogTab]    = useState<CatalogTab>("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSectionFilter, setCatalogSectionFilter] = useState(() => getActiveSection());
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const scannerBuffer = useRef("");
  const scannerLastKeyAt = useRef(0);

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart,          setCart]          = useState<CartEntry[]>([]);
  const [discount,      setDiscount]      = useState<number>(0);
  const [discType,      setDiscType]      = useState<DiscountType>("flat");
  const [discount2,     setDiscount2]     = useState<number>(0);
  const [discType2,     setDiscType2]     = useState<DiscountType>("flat");
  const [loyaltyRedeem, setLoyaltyRedeem] = useState<number>(0);
  // No default — staff must actively pick a method (or Pay Later/Credit) before checkout,
  // otherwise sales were silently defaulting to "cash" even when no one confirmed that.
  const [payMethod,     setPayMethod]     = useState<PaymentMethod | null>(null);

  // ── Mobile tab ───────────────────────────────────────────────────────────
  const [posTab, setPosTab] = useState<"customer" | "catalog" | "cart">("catalog");

  // ── Flow ──────────────────────────────────────────────────────────────────
  const [isCredit,         setIsCredit]         = useState(false);
  const [completing,       setCompleting]       = useState(false);
  const [printInvoice,     setPrintInvoice]     = useState<Invoice | null>(null);
  const [editingInvoice,   setEditingInvoice]   = useState<Invoice | null>(null);
  const [completed,        setCompleted]        = useState(false);
  const [lastInvoice,      setLastInvoice]      = useState<Invoice | null>(null);
  // "opened"  — the prefilled WhatsApp chat was handed to the browser
  // "blocked" — window.open was suppressed (popup blocker / lost user gesture);
  //             the banner's Send button below is the manual way through
  const [waStatus,         setWaStatus]         = useState<"idle" | "opened" | "blocked">("idle");
  const [waPdfStatus,      setWaPdfStatus]       = useState<"idle" | "working" | "shared" | "downloaded" | "failed">("idle");
  const [syncFailed,       setSyncFailed]       = useState(false);
  const [retryingSync,     setRetryingSync]     = useState(false);

  // ── Derived catalog ───────────────────────────────────────────────────────
  const catalogItems = useMemo<CatalogItem[]>(() => {
    const q = catalogSearch.toLowerCase();
    const svc: CatalogItem[] = (catalogTab !== "products" ? services : [])
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .filter(s => inSection(s, catalogSectionFilter))
      .map(s => ({
        id: s.id, type: "service", name: s.name, price: s.price, category: s.category, section: s.section,
        variablePrice: s.variablePrice, priceRangeMin: s.priceRangeMin, priceRangeMax: s.priceRangeMax,
      }));
    const prod: CatalogItem[] = (catalogTab !== "services" ? inventory : [])
      .filter(i => (i.retailPrice ?? 0) > 0 || i.variablePrice)
      .filter(i => !q || i.name.toLowerCase().includes(q) || i.brand.toLowerCase().includes(q))
      .filter(i => inSection(i, catalogSectionFilter))
      .map(i => ({
        id: i.id, type: "product", name: `${i.brand ? i.brand + " " : ""}${i.name}`, price: i.retailPrice ?? 0,
        category: i.category, section: i.section, stock: i.currentStock, unit: i.unit, barcode: i.barcode,
        variablePrice: i.variablePrice, priceRangeMin: i.priceRangeMin, priceRangeMax: i.priceRangeMax,
      }));
    return [...svc, ...prod];
  }, [services, inventory, catalogTab, catalogSearch, catalogSectionFilter]);

  const dropClients = useMemo(() => {
    const q = clientQ.toLowerCase();
    return q
      ? clients.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 8)
      : clients.slice(0, 8);
  }, [clients, clientQ]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const cartLineItems: InvoiceItem[] = cart.map(e => ({
    id: e.cartId, type: e.type, description: e.name,
    qty: e.qty, unitPrice: wholePkr(e.unitPrice), total: wholePkr(e.total),
  }));
  const rawSubtotal    = wholePkr(cartLineItems.reduce((s, i) => s + i.total, 0));
  const baseDiscountAmount = discType === "pct" ? wholePkr(rawSubtotal * discount / 100) : wholePkr(discount);
  const discountAmount = Math.min(baseDiscountAmount, rawSubtotal);
  const baseDiscountAmount2 = discType2 === "pct" ? wholePkr(rawSubtotal * discount2 / 100) : wholePkr(discount2);
  const discountAmount2 = Math.min(baseDiscountAmount2, Math.max(0, rawSubtotal - discountAmount));

  const loyaltySettings       = settingsStore.loyalty as LoyaltySettings;
  const availableLoyaltyPts   = selectedClient?.id ? (selectedClient.loyaltyPoints ?? 0) : 0;
  const cappedLoyaltyRedeem   = Math.min(loyaltyRedeem, availableLoyaltyPts);
  const loyaltyDiscount       = loyaltySettings.enabled && cappedLoyaltyRedeem > 0
    ? Math.min(Math.floor(cappedLoyaltyRedeem * loyaltySettings.rupeePerPoint), Math.max(0, rawSubtotal - discountAmount - discountAmount2))
    : 0;
  const totalDiscountAmount   = Math.min(rawSubtotal, wholePkr(discountAmount + discountAmount2 + loyaltyDiscount));

  const { subtotal, taxAmount, total } = calcTotals(cartLineItems, totalDiscountAmount);
  const totalQty = cart.reduce((s, e) => s + e.qty, 0);
  const hasUnpricedVariable = cart.some(e => e.variablePrice && e.unitPrice <= 0);
  const noPaymentSelected = !isCredit && !payMethod;

  // ── Cart ops ──────────────────────────────────────────────────────────────
  const addToCart = useCallback((item: CatalogItem) => {
    setCart(prev => {
      const hit = prev.find(e => e.itemId === item.id);
      if (hit) return prev.map(e => e.itemId === item.id ? { ...e, qty: e.qty + 1, total: (e.qty + 1) * e.unitPrice } : e);
      return [...prev, {
        cartId: crypto.randomUUID(), itemId: item.id, type: item.type, name: item.name, qty: 1,
        unitPrice: item.price, total: item.price, variablePrice: item.variablePrice,
        priceRangeMin: item.priceRangeMin, priceRangeMax: item.priceRangeMax,
      }];
    });
  }, []);

  const addBarcodeToCart = useCallback((rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const product = inventory.find(item => item.barcode?.trim().toLowerCase() === code.toLowerCase());
    if (!product) {
      setScanFeedback({ ok: false, message: `No product found for barcode ${code}` });
      return;
    }
    if (!(product.retailPrice && product.retailPrice > 0)) {
      setScanFeedback({ ok: false, message: `${product.name} needs a retail price before it can be sold.` });
      return;
    }
    if (product.currentStock <= 0) {
      setScanFeedback({ ok: false, message: `${product.name} is out of stock.` });
      return;
    }
    addToCart({
      id: product.id,
      type: "product",
      name: `${product.brand ? product.brand + " " : ""}${product.name}`,
      price: product.retailPrice,
      category: product.category,
      stock: product.currentStock,
      unit: product.unit,
      barcode: product.barcode,
    });
    setScanFeedback({ ok: true, message: `${product.name} added to cart.` });
    setBarcodeInput("");
  }, [addToCart, inventory]);

  useEffect(() => {
    function handleScannerKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const nowMs = Date.now();
      if (nowMs - scannerLastKeyAt.current > 120) scannerBuffer.current = "";
      scannerLastKeyAt.current = nowMs;
      if (event.key === "Enter") {
        if (scannerBuffer.current.length >= 3) {
          event.preventDefault();
          addBarcodeToCart(scannerBuffer.current);
        }
        scannerBuffer.current = "";
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        scannerBuffer.current += event.key;
      }
    }
    window.addEventListener("keydown", handleScannerKey);
    return () => window.removeEventListener("keydown", handleScannerKey);
  }, [addBarcodeToCart]);

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = window.setTimeout(() => setScanFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [scanFeedback]);

  function updateQty(cartId: string, delta: number) {
    setCart(prev => {
      const entry = prev.find(e => e.cartId === cartId);
      if (!entry) return prev;
      const nextQty = entry.qty + delta;
      if (nextQty < 1) return prev.filter(e => e.cartId !== cartId);
      return prev.map(e => e.cartId === cartId ? { ...e, qty: nextQty, total: nextQty * e.unitPrice } : e);
    });
  }

  function updateUnitPrice(cartId: string, price: number) {
    setCart(prev => prev.map(e => e.cartId === cartId ? { ...e, unitPrice: price, total: price * e.qty } : e));
  }

  // ── Quick-add client ──────────────────────────────────────────────────────
  function quickAddClient() {
    if (!newName.trim()) return;
    const c: Client = {
      id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: newName.trim(), phone: normalizePhone(newPhone),
      dob: newDob || undefined,
      locationId: getDefaultLocationId(),
      tags: [], source: "walk-in",
      createdAt: new Date().toISOString().slice(0, 10),
      totalVisits: 0, totalSpend: 0,
    };
    const updated = [c, ...clients];
    setClients(updated);
    saveClients(updated);
    setSelectedClient(c);
    setShowNewForm(false);
    setNewName(""); setNewPhone(""); setNewDob("");
  }

  // Reset redeemed points when client changes
  useEffect(() => { setLoyaltyRedeem(0); }, [selectedClient?.id]);

  // ── New sale reset ────────────────────────────────────────────────────────
  function startNewSale() {
    setCart([]); setDiscount(0); setDiscount2(0); setLoyaltyRedeem(0); setSaleNotes(""); setPayMethod(null);
    setSelectedClient(null); setClientQ(""); setSelectedStaffId("");
    setCompleted(false); setLastInvoice(null); setWaStatus("idle"); setIsCredit(false);
    setSyncFailed(false);
  }

  // ── Complete sale ─────────────────────────────────────────────────────────
  async function completeSale() {
    if (cart.length === 0 || completing) return;
    // Mirrors the Complete Sale button's disabled condition — a payment method (or
    // explicit Pay Later/Credit) must be chosen, never silently defaulted.
    if (!isCredit && !payMethod) return;
    setCompleting(true);
    try {
      const today = localDateKey();
      const staffMember = staff.find(s => s.id === selectedStaffId);
      // Prefer the assigned staff member's section; with no staff chosen, fall
      // back to the cart's section only when every line item agrees — a mixed
      // cart (e.g. a men's haircut + a women's product) has no single section,
      // so leave it unset rather than guess. Last resort: whichever section the
      // dashboard is currently active on (the cashier's working context).
      const cartSections = cart.map(e => catalogItems.find(ci => ci.id === e.itemId)?.section).filter((s): s is string => !!s);
      const activeSection = getActiveSection();
      const saleSection = staffMember?.section
        ?? (new Set(cartSections).size === 1 ? cartSections[0] : undefined)
        ?? (activeSection !== "all" ? activeSection : undefined);
      const { invoice, dbSaved } = await createInvoice({
        appointmentId: checkoutAppointmentId || undefined,
        clientId:      selectedClient?.id || undefined,
        clientName:    selectedClient?.name || "Walk-in Customer",
        clientPhone:   selectedClient?.phone ? normalizePhone(selectedClient.phone) : "",
        clientEmail:   selectedClient?.email,
        staffName:     staffMember?.name || "",
        section:       saleSection,
        items:         cartLineItems,
        subtotal, discountAmount: wholePkr(discountAmount + loyaltyDiscount), discount2Amount: discountAmount2, taxAmount, total,
        paymentMethod: isCredit ? "" : (payMethod as PaymentMethod),
        date: today, status: isCredit ? "unpaid" : "paid",
        notes: saleNotes.trim(),
        source: "pos",
      });
      // The sale is already final (payment collected, receipt about to send) so a
      // failed sync doesn't block checkout — but it must not go unnoticed the way
      // it did before, silently leaving the invoice missing on every other device.
      setSyncFailed(!dbSaved);

      // Checking out from a booked appointment doesn't otherwise touch the
      // appointment record — mark it completed so it's reflected in the
      // calendar and in dashboard/revenue stats that key off appointment status.
      if (checkoutAppointmentId) {
        const freshAppointments = getStoredAppointments();
        const updatedAppointments = freshAppointments.map(a =>
          a.id === checkoutAppointmentId ? { ...a, status: "completed" as const, totalAmount: total } : a
        );
        saveAppointments(updatedAppointments);
      }

      const soldProducts = cart.filter(e => e.type === "product");
      if (soldProducts.length > 0) {
        const updated = inventory.map(item => {
          const sold = soldProducts.find(e => e.itemId === item.id);
          return sold ? { ...item, currentStock: Math.max(0, item.currentStock - sold.qty) } : item;
        });
        setInventory(updated);
        saveInventory(updated);
      }

      if (selectedClient?.id) {
        let updatedClient: Client = {
          ...selectedClient,
          totalVisits: selectedClient.totalVisits + 1,
          totalSpend:  selectedClient.totalSpend + total,
          lastVisitDate: today,
        };
        console.log("[POS loyalty] client:", selectedClient.name, "| total:", total, "| loyalty enabled:", loyaltySettings.enabled, "| ppr:", loyaltySettings.pointsPerRupee, "| pts before:", selectedClient.loyaltyPoints ?? 0);
        if (loyaltySettings.enabled) {
          if (loyaltyDiscount > 0 && cappedLoyaltyRedeem > 0) {
            updatedClient = redeemPoints(updatedClient, cappedLoyaltyRedeem, `Redeemed at POS · ${invoice.number}`);
          }
          updatedClient = awardPoints(updatedClient, total, loyaltySettings, invoice.id);
        }
        console.log("[POS loyalty] pts after awardPoints:", updatedClient.loyaltyPoints ?? 0);
        // Read fresh from localStorage so we never map over stale React state
        const freshClients = getStoredClients();
        console.log("[POS loyalty] freshClients count:", freshClients.length, "| found client in LS:", freshClients.some(c => c.id === selectedClient.id));
        const found = freshClients.some(c => c.id === selectedClient.id);
        const updatedClients = found
          ? freshClients.map(c => c.id === selectedClient.id ? updatedClient : c)
          : [updatedClient, ...freshClients]; // client was quick-added and not yet in localStorage
        setClients(updatedClients);
        setSelectedClient(updatedClient); // keep selectedClient fresh in the current session
        saveClients(updatedClients);
        console.log("[POS loyalty] saved. pts in saved client:", updatedClients.find(c => c.id === selectedClient.id)?.loyaltyPoints ?? 0);
      } else {
        console.log("[POS loyalty] SKIPPED — selectedClient?.id is falsy:", selectedClient?.id);
      }

      setLastInvoice(invoice);
      setPrintInvoice(invoice);
      // Receipts go out as a WhatsApp Web deep link — the business's own WhatsApp
      // opens with the thank-you + invoice summary prefilled, ready to send.
      // Best-effort: the awaits above may have used up the click's "user
      // activation" window, so the browser can silently block the new tab —
      // the WhatsApp button in the success banner is the fallback for that.
      openWhatsAppThankYou(invoice, selectedClient);
      setCompleted(true);
    } finally {
      setCompleting(false);
    }
  }

  async function retrySync() {
    setRetryingSync(true);
    try {
      const dbSaved = await saveInvoices(getInvoices());
      setSyncFailed(!dbSaved);
    } finally {
      setRetryingSync(false);
    }
  }

  // ── WhatsApp receipt (wa.me deep link) ────────────────────────────────────
  // There is no WhatsApp provider account behind this POS: every receipt is a
  // wa.me link opened in a new tab, which WhatsApp Web (or the phone app) turns
  // into the client's chat with this message already typed.
  function buildThankYouMessage(invoice: Invoice, client: Client): string {
    const thankYouTpl = (settingsStore.whatsapp as { posThankYou?: string }).posThankYou;
    const thankYou = thankYouTpl
      ? fillTemplate(thankYouTpl, { name: client.name, business_name: business.name })
      : `Thank you so much for visiting ${business.name} today, ${client.name}!`;
    const itemLines = invoice.items.map(it => `• ${it.description}${it.qty > 1 ? ` x${it.qty}` : ""}`).join("\n");
    const dateLabel = new Date(invoice.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
    const rawMessage = [
      thankYou,
      "",
      `Invoice ${invoice.number} · ${dateLabel}`,
      itemLines,
      `Total: ${pkr(invoice.total)}`,
    ].join("\n");
    // Emoji and stray indentation are stripped by sanitizeForLink() when the
    // link is built (see lib/whatsapp-link.ts) — WhatsApp Web garbles emoji
    // picked up from a query string. Do it here too so the Web Share path,
    // which passes this text straight to the OS share sheet, matches.
    return sanitizeForLink(rawMessage);
  }

  function openWhatsAppThankYou(invoice: Invoice, client: Client | null) {
    if (!client?.phone) { setWaStatus("idle"); return; }
    const opened = openWhatsAppChat(client.phone, buildThankYouMessage(invoice, client));
    setWaStatus(opened ? "opened" : "blocked");
  }

  // Manual, click-driven version: actually attaches the invoice PDF via the
  // OS share sheet (Web Share API) so WhatsApp receives a real file — a wa.me
  // link alone can only ever prefill text, never a file. Requires a real user
  // gesture (unlike openWhatsAppThankYou above), so this is only wired to the
  // button below, never to the automatic post-checkout attempt.
  async function sharePdfToWhatsApp(invoice: Invoice, client: Client | null) {
    if (!client?.phone) return;
    const message = buildThankYouMessage(invoice, client);
    const normalizedPhone = normalizePhone(client.phone);
    setWaPdfStatus("working");

    let file: File | null = null;
    try {
      const res = await fetch("/api/invoice-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice, business }),
      });
      if (res.ok) {
        const blob = await res.blob();
        file = new File([blob], `${invoice.number || "invoice"}.pdf`, { type: "application/pdf" });
      } else {
        console.error("[sharePdfToWhatsApp] PDF generation failed:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[sharePdfToWhatsApp] PDF fetch failed:", err);
    }

    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
        setWaPdfStatus("shared");
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") { setWaPdfStatus("idle"); return; } // user cancelled the share sheet
        console.error("[sharePdfToWhatsApp] navigator.share failed:", err);
        // otherwise fall through to the manual fallback below
      }
    }

    // No file-sharing support (most desktop browsers) — download the PDF so
    // it can be attached by hand, and open the chat with the text prefilled.
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url; a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking too early can cancel an in-flight download in some browsers —
      // give it a moment to actually start before freeing the blob URL.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setWaPdfStatus("downloaded");
    } else {
      setWaPdfStatus("failed");
    }
    window.open(buildWhatsAppLink(normalizedPhone, message), "_blank");
  }

  const business = settingsStore.business as { name: string; phone: string; email: string; address: string; logo?: string };
  const selectedPayMethod = PAY_METHODS.find(p => p.value === payMethod);


  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-polish pos-polish" style={{ height: "100vh", background: "#f4f5fa", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "inherit" }}>

      {/* ══ TOP BAR ══ */}
      <div className="pos-topbar" style={{ background: "#fff", borderBottom: "1px solid #eaeaf4", display: "flex", alignItems: "center", padding: "0 24px", height: 64, gap: 16, flexShrink: 0 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 8 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,#9A3412,#F97316)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(154,52,18,0.3)" }}>
            <ReceiptText size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#1d1d2f", lineHeight: 1 }}>Point of Sale</div>
            <div style={{ fontSize: 11, color: "#9999b0", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} />
              {now.toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" })}
              &nbsp;·&nbsp;
              {now.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Cart badge pill */}
        {totalQty > 0 && !completed && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, padding: "5px 14px" }}>
            <ShoppingCart size={13} color="#EA580C" />
            <span style={{ fontSize: 12, fontWeight: 800, color: "#EA580C" }}>{totalQty} item{totalQty > 1 ? "s" : ""}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#F97316" }}>· {pkr(total)}</span>
          </div>
        )}

        {/* New Sale button */}
        {completed && (
          <button type="button" onClick={startNewSale}
            style={{ display: "flex", alignItems: "center", gap: 7, border: "none", borderRadius: 10, padding: "10px 22px", background: "linear-gradient(135deg,#9A3412,#F97316)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 3px 12px rgba(154,52,18,0.38)" }}>
            <Plus size={15} /> New Sale
          </button>
        )}
      </div>

      {/* ══ APPOINTMENT BANNER ══ */}
      {apptBanner && !completed && (
        <div style={{ background: "linear-gradient(135deg,#fff7ed,#ffedd5)", borderBottom: "1px solid #fed7aa", display: "flex", alignItems: "center", padding: "10px 24px", gap: 12, flexShrink: 0 }}>
          <ShoppingCart size={15} color="#EA580C" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#9A3412", flex: 1 }}>{apptBanner}</span>
          <button onClick={() => setApptBanner(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0", display: "flex", padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ══ SUCCESS BANNER ══ */}
      {completed && lastInvoice && (
        <div style={{
          background: lastInvoice.status === "unpaid" ? "linear-gradient(135deg,#fffbeb,#fef9c3)" : "linear-gradient(135deg,#ecfdf5,#f0fdf4)",
          borderBottom: `2px solid ${lastInvoice.status === "unpaid" ? "#fcd34d" : "#6ee7b7"}`,
          display: "flex", alignItems: "center", padding: "12px 24px", gap: 14, flexShrink: 0,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: lastInvoice.status === "unpaid" ? "#d97706" : "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 8px rgba(${lastInvoice.status === "unpaid" ? "217,119,6" : "5,150,105"},0.35)` }}>
            {lastInvoice.status === "unpaid" ? <Clock size={20} color="#fff" /> : <CheckCircle2 size={20} color="#fff" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: lastInvoice.status === "unpaid" ? "#92400e" : "#065f46" }}>
              {lastInvoice.status === "unpaid" ? "Credit Invoice Created" : "Sale Complete"}
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: lastInvoice.status === "unpaid" ? "#fcd34d" : "#6ee7b7", background: lastInvoice.status === "unpaid" ? "#92400e" : "#065f46", borderRadius: 6, padding: "1px 8px" }}>{lastInvoice.number}</span>
            </div>
            <div style={{ fontSize: 12, color: lastInvoice.status === "unpaid" ? "#b45309" : "#047857", marginTop: 3, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800 }}>{pkr(lastInvoice.total)}</span>
              <span>· {lastInvoice.clientName}</span>
              {lastInvoice.status === "unpaid" && <span style={{ fontWeight: 700 }}>· Awaiting payment</span>}
              {waStatus === "opened" && <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#059669", fontWeight: 700 }}><CheckCircle2 size={11} /> WhatsApp opened — press send</span>}
              {waStatus === "blocked" && <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#d97706", fontWeight: 700 }}><AlertCircle size={11} /> WhatsApp tab blocked — use Send on WhatsApp</span>}
              {syncFailed && <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#dc2626", fontWeight: 700 }}><AlertCircle size={11} /> Not synced to server — saved on this device only</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {syncFailed && (
              <button type="button" onClick={retrySync} disabled={retryingSync}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #dc2626", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: retryingSync ? "default" : "pointer", opacity: retryingSync ? 0.6 : 1 }}>
                <RefreshCw size={14} /> {retryingSync ? "Retrying…" : "Retry Sync"}
              </button>
            )}
            <button type="button" onClick={() => setPrintInvoice(lastInvoice)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: `1.5px solid ${lastInvoice.status === "unpaid" ? "#d97706" : "#059669"}`, background: "#fff", color: lastInvoice.status === "unpaid" ? "#d97706" : "#059669", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <Printer size={14} /> Print
            </button>
            {selectedClient?.phone && lastInvoice.status !== "unpaid" && (
              <>
                <button type="button" onClick={() => openWhatsAppThankYou(lastInvoice, selectedClient)}
                  title="Opens WhatsApp Web (or the WhatsApp app) with the receipt message already typed for this client."
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #25d366", background: "#fff", color: "#25d366", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <MessageSquare size={14} /> Send on WhatsApp
                </button>
                <button type="button" onClick={() => sharePdfToWhatsApp(lastInvoice, selectedClient)} disabled={waPdfStatus === "working"}
                  title="Shares the invoice PDF itself via WhatsApp (or downloads it and opens the chat with the message ready to send)."
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #059669", background: "#fff", color: "#059669", fontSize: 12, fontWeight: 700, cursor: waPdfStatus === "working" ? "default" : "pointer", opacity: waPdfStatus === "working" ? 0.6 : 1 }}>
                  <ReceiptText size={14} /> {waPdfStatus === "working" ? "Preparing…" : "Send PDF"}
                </button>
                {waPdfStatus === "downloaded" && (
                  <span style={{ fontSize: 11, color: "#059669", fontWeight: 700, alignSelf: "center" }}>PDF downloaded — attach it in the chat</span>
                )}
                {waPdfStatus === "failed" && (
                  <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, alignSelf: "center" }}>Couldn&apos;t generate the PDF — opened chat with text only</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ 3-PANEL BODY ══ */}
      <div className="pos-panels" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "280px 1fr 340px", overflow: "hidden", gap: 12, padding: "12px 16px 12px" }}>

        {/* ══════════════════════ PANEL 1: CUSTOMER ══════════════════════ */}
        <div className={`pos-surface pos-customer-panel ${posTab !== "customer" ? "pos-panel-hide" : ""}`} style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaeaf4", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

          {/* Panel header */}
          <div className="pos-panel-heading" style={{ padding: "14px 16px", borderBottom: "1px solid #f4f4fc", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <User size={14} color="#EA580C" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f" }}>Customer</span>
            {selectedClient && (
              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#fff7ed", color: "#EA580C", borderRadius: 20, padding: "2px 8px" }}>Selected</span>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

            {!selectedClient ? (
              <>
                {/* Search */}
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#b0b0c8", pointerEvents: "none" }} />
                  <input
                    value={clientQ}
                    onChange={e => { setClientQ(e.target.value); setShowDrop(true); }}
                    onFocus={() => setShowDrop(true)}
                    onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                    placeholder="Search by name or phone…"
                    style={{ width: "100%", height: 40, padding: "0 12px 0 34px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box" }}
                  />
                  {/* Dropdown */}
                  {showDrop && dropClients.length > 0 && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: "1px solid #e8e8f4", borderRadius: 12, boxShadow: "0 10px 32px rgba(0,0,0,0.12)", zIndex: 99, overflow: "hidden" }}>
                      {dropClients.map((c, i) => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setSelectedClient(c); setClientQ(""); setShowDrop(false); }}
                          style={{ width: "100%", padding: "10px 12px", border: "none", background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, borderBottom: i < dropClients.length - 1 ? "1px solid #f8f8fc" : "none" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f5f4ff")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#9A3412,#F97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                            {initials(c.name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1d1d2f" }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: "#9999b0", marginTop: 1 }}>{c.phone || "No phone"}</div>
                          </div>
                          {c.totalVisits > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 800, background: "#ffedd5", color: "#EA580C", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>
                              {c.totalVisits}× visits
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button type="button"
                    onClick={() => setSelectedClient({ id: "", name: "Walk-in Customer", phone: "", tags: [], source: "walk-in", createdAt: "", totalVisits: 0, totalSpend: 0 })}
                    style={{ padding: "11px 0", borderRadius: 10, border: "1.5px dashed #d1d5db", background: "#fafafd", fontSize: 12, fontWeight: 700, color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f4f4f8"; e.currentTarget.style.borderColor = "#9999b0"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#fafafd"; e.currentTarget.style.borderColor = "#d1d5db"; }}>
                    <User size={13} /> Walk-in
                  </button>
                  <button type="button" onClick={() => setShowNewForm(v => !v)}
                    style={{ padding: "11px 0", borderRadius: 10, border: "1.5px solid #fdba74", background: showNewForm ? "#fff7ed" : "#faf8ff", fontSize: 12, fontWeight: 700, color: "#EA580C", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.12s" }}>
                    <UserPlus size={13} /> New Client
                  </button>
                </div>

                {/* New client form */}
                {showNewForm && (
                  <div style={{ padding: 14, border: "1.5px solid #fed7aa", borderRadius: 12, background: "#faf8ff", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#EA580C", display: "flex", alignItems: "center", gap: 6 }}>
                      <UserPlus size={13} /> Quick Add Client
                    </div>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name *"
                      style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, outline: "none", background: "#fff", boxSizing: "border-box" }} />
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone (for WhatsApp)"
                      style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, outline: "none", background: "#fff", boxSizing: "border-box" }} />
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Date of Birth
                      <input type="date" value={newDob} onChange={e => setNewDob(e.target.value)}
                        style={{ width: "100%", height: 36, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, outline: "none", background: "#fff", boxSizing: "border-box", color: "#1d1d2f" }} />
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" onClick={() => setShowNewForm(false)}
                        style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid #e8e8f0", background: "#fff", fontSize: 12, color: "#9999b0", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                      <button type="button" onClick={quickAddClient} disabled={!newName.trim()}
                        style={{ flex: 2, height: 34, borderRadius: 8, border: "none", background: newName.trim() ? "#EA580C" : "#e8e8f0", color: newName.trim() ? "#fff" : "#aaaabc", fontSize: 12, fontWeight: 700, cursor: newName.trim() ? "pointer" : "not-allowed" }}>
                        Add Client
                      </button>
                    </div>
                  </div>
                )}

                {/* Recent clients hint */}
                {!showNewForm && !clientQ && clients.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Recent Clients</div>
                    {clients.slice(0, 4).map(c => (
                      <button key={c.id} type="button"
                        onMouseDown={() => setSelectedClient(c)}
                        style={{ width: "100%", padding: "8px 10px", border: "none", background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, borderRadius: 9, marginBottom: 2, transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f5f4ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#9A3412,#F97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {initials(c.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d2f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                          {c.lastVisitDate && <div style={{ fontSize: 10, color: "#b0b0c8" }}>Last: {c.lastVisitDate}</div>}
                        </div>
                        <ChevronRight size={12} color="#d0d0e0" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* ── Selected client card ── */
              <div>
                <div style={{ padding: "14px", border: "2px solid #fed7aa", borderRadius: 14, background: "linear-gradient(145deg, #faf8ff, #fff7ed)", position: "relative" }}>
                  {/* Change button */}
                  <button type="button" onClick={() => setSelectedClient(null)}
                    style={{ position: "absolute", top: 10, right: 10, border: "1px solid #fed7aa", background: "#fff", borderRadius: 7, cursor: "pointer", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#EA580C", fontSize: 10, fontWeight: 700 }}>
                    <X size={12} color="#EA580C" />
                  </button>

                  {/* Avatar + info */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#9A3412,#F97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff", flexShrink: 0, boxShadow: "0 3px 10px rgba(154,52,18,0.3)" }}>
                      {initials(selectedClient.name)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#1d1d2f" }}>{selectedClient.name}</div>
                      {selectedClient.phone
                        ? <div style={{ fontSize: 11, color: "#EA580C", display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontWeight: 600 }}><Phone size={10} />{selectedClient.phone}</div>
                        : <div style={{ fontSize: 11, color: "#c8c8d8", marginTop: 2 }}>No phone number</div>
                      }
                    </div>
                  </div>

                  {/* Stats */}
                  {selectedClient.id && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { label: "Visits", value: selectedClient.totalVisits, color: "#EA580C", bg: "rgba(234,88,12,0.07)" },
                        { label: "Spent", value: selectedClient.totalSpend >= 1000 ? `${(selectedClient.totalSpend / 1000).toFixed(1)}k` : selectedClient.totalSpend, color: "#059669", bg: "rgba(5,150,105,0.07)" },
                        { label: "Points", value: selectedClient.loyaltyPoints ?? 0, color: "#d97706", bg: "rgba(217,119,6,0.07)" },
                      ].map(s => (
                        <div key={s.label} style={{ padding: "8px 6px", borderRadius: 9, background: s.bg, textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                          <div style={{ fontSize: 9, color: "#9999b0", marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "#f4f4fc", margin: "2px 0" }} />

            {/* Staff selector */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Assigned Staff</label>
              <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}
                style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box" }}>
                <option value="">Any available staff</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Sale Notes</label>
              <textarea value={saleNotes} onChange={e => setSaleNotes(e.target.value)} rows={3}
                placeholder="Special instructions, preferences…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 12, color: "#1d1d2f", outline: "none", background: "#fafafe", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
        </div>

        {/* ══════════════════════ PANEL 2: CATALOG ══════════════════════ */}
        <div className={`pos-surface pos-catalog-panel ${posTab !== "catalog" ? "pos-panel-hide" : ""}`} style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaeaf4", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

          {/* Catalog header */}
          <div className="pos-catalog-heading" style={{ padding: "12px 16px", borderBottom: "1px solid #f4f4fc", flexShrink: 0 }}>
            {/* Search row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#b0b0c8", pointerEvents: "none" }} />
                <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="Search services & products…"
                  style={{ width: "100%", height: 38, padding: "0 34px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box" }} />
                {catalogSearch && (
                  <button type="button" onClick={() => setCatalogSearch("")}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={13} color="#9999b0" />
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#b0b0c8", flexShrink: 0 }}>
                {catalogItems.length} item{catalogItems.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Barcode scanner */}
            <form
              onSubmit={(event) => { event.preventDefault(); addBarcodeToCart(barcodeInput); }}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
            >
              <div style={{ position: "relative", flex: 1 }}>
                <ScanBarcode size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#EA580C", pointerEvents: "none" }} />
                <input
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  placeholder="Scan barcode or enter code…"
                  autoComplete="off"
                  autoFocus
                  inputMode="numeric"
                  style={{ width: "100%", height: 36, padding: "0 12px 0 35px", borderRadius: 10, border: "1.5px solid #fed7aa", fontSize: 12, color: "#1d1d2f", outline: "none", background: "#faf8ff", boxSizing: "border-box" }}
                />
              </div>
              <button
                type="submit"
                disabled={!barcodeInput.trim()}
                style={{ height: 36, padding: "0 13px", borderRadius: 10, border: "none", background: barcodeInput.trim() ? "linear-gradient(135deg,#9A3412,#F97316)" : "#eceaf2", color: barcodeInput.trim() ? "#fff" : "#b2aca4", fontSize: 11, fontWeight: 800, cursor: barcodeInput.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
              >
                Add Product
              </button>
            </form>

            {scanFeedback && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 7, borderRadius: 9, padding: "7px 10px", background: scanFeedback.ok ? "#ecfdf5" : "#fef2f2", border: `1px solid ${scanFeedback.ok ? "#bbf7d0" : "#fecaca"}`, color: scanFeedback.ok ? "#047857" : "#dc2626", fontSize: 11, fontWeight: 700 }}>
                {scanFeedback.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {scanFeedback.message}
              </div>
            )}

            {/* Tab switcher */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
              {([
                { id: "all",      label: "All Items", icon: Sparkles },
                { id: "services", label: "Services",  icon: Scissors },
                { id: "products", label: "Products",  icon: Package  },
              ] as { id: CatalogTab; label: string; icon: React.ElementType }[]).map(t => {
                const active = catalogTab === t.id;
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => setCatalogTab(t.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 9, border: `1.5px solid ${active ? "#EA580C" : "#e8e8f4"}`, background: active ? "#fff7ed" : "#fafafe", color: active ? "#EA580C" : "#9999b0", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.12s", flexShrink: 0, whiteSpace: "nowrap" }}>
                    <Icon size={12} /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Section filter — locked to the active dashboard section when one is
                set (no picker needed, only that section is valid here); shown as
                an interactive picker otherwise, only once something is tagged. */}
            {getActiveSection() !== "all" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Lock size={11} color="#EA580C" />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#EA580C" }}>Showing {getActiveSection()} + unassigned catalog</span>
              </div>
            ) : [...services, ...inventory].some(x => x.section) && (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", marginTop: 8 }}>
                {["all", ...getSectionOptions([...services, ...inventory])].map(sec => {
                  const active = catalogSectionFilter === sec;
                  return (
                    <button key={sec} type="button" onClick={() => setCatalogSectionFilter(sec)}
                      style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${active ? "#EA580C" : "#e8e8f4"}`, background: active ? "#fff7ed" : "#fafafe", color: active ? "#EA580C" : "#9999b0", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.12s", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {sec === "all" ? "All Sections" : sec}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px" }}>
            {catalogItems.length === 0 ? (
              <div style={{ padding: "80px 24px", textAlign: "center" }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "#f4f4fc", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Package size={28} color="#d0d0e8" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#b0b0c8" }}>No items found</div>
                <div style={{ fontSize: 12, color: "#c8c8d8", marginTop: 6, lineHeight: 1.6 }}>
                  {catalogTab === "products"
                    ? "Set retail prices on inventory items to sell them here"
                    : "Add active services to display them in the catalog"}
                </div>
              </div>
            ) : (
              <div className="pos-catalog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}>
                {catalogItems.map(item => {
                  const inCart  = cart.find(e => e.itemId === item.id);
                  const { fg, bg } = catColor(item.category, item.type);
                  const outOfStock = item.type === "product" && (item.stock ?? 999) === 0;
                  return (
                    <button key={item.id} type="button" className={`pos-catalog-card${inCart ? " is-in-cart" : ""}${outOfStock ? " is-disabled" : ""}`}
                      onClick={() => !outOfStock && addToCart(item)}
                      disabled={outOfStock}
                      style={{
                        textAlign: "left", border: `2px solid ${inCart ? fg : "#eaeaf4"}`,
                        borderRadius: 14, padding: "0", background: inCart ? bg : "#fff",
                        cursor: outOfStock ? "not-allowed" : "pointer", opacity: outOfStock ? 0.45 : 1,
                        transition: "all 0.13s", position: "relative", overflow: "hidden",
                        boxShadow: inCart ? `0 0 0 3px ${fg}20` : "none",
                      }}
                      onMouseEnter={e => { if (!outOfStock && !inCart) { e.currentTarget.style.borderColor = fg + "80"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = inCart ? fg : "#eaeaf4"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = inCart ? `0 0 0 3px ${fg}20` : "none"; }}
                    >
                      {/* Color strip at top */}
                      <div style={{ height: 4, background: fg, opacity: inCart ? 1 : 0.35, borderRadius: "12px 12px 0 0" }} />

                      <div style={{ padding: "12px 12px 11px" }}>
                        {/* In-cart qty badge */}
                        {inCart && (
                          <div style={{ position: "absolute", top: 12, right: 10, width: 22, height: 22, borderRadius: "50%", background: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}>
                            {inCart.qty}
                          </div>
                        )}

                        {/* Icon */}
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, border: `1px solid ${fg}20`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                          {item.type === "service" ? <Scissors size={16} color={fg} /> : <Package size={16} color={fg} />}
                        </div>

                        {/* Name */}
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1d1d2f", marginBottom: 4, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {item.name}
                        </div>

                        {/* Price */}
                        <div style={{ fontSize: 15, fontWeight: 900, color: fg, marginBottom: 5 }}>
                          {item.variablePrice
                            ? (item.priceRangeMin && item.priceRangeMax ? `${pkr(item.priceRangeMin)}–${pkr(item.priceRangeMax)}` : "Varies")
                            : pkr(item.price)}
                        </div>

                        {/* Badges */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <span style={{ padding: "2px 7px", borderRadius: 20, background: fg + "15", fontSize: 9, fontWeight: 800, color: fg, textTransform: "capitalize", letterSpacing: "0.03em" }}>
                            {item.type === "service" ? item.category : "product"}
                          </span>
                          {item.type === "product" && item.stock !== undefined && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: item.stock === 0 ? "#dc2626" : item.stock <= 3 ? "#d97706" : "#9999b0" }}>
                              {item.stock === 0 ? "Out of stock" : `${item.stock} left`}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════ PANEL 3: CART ══════════════════════ */}
        <div className={`pos-surface pos-cart-panel ${posTab !== "cart" ? "pos-panel-hide" : ""}`} style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaeaf4", display: "flex", flexDirection: "column", minHeight: 0, overflowX: "hidden", overflowY: "auto", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

          {/* Cart header */}
          <div className="pos-panel-heading" style={{ padding: "14px 16px", borderBottom: "1px solid #f4f4fc", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: totalQty > 0 ? "#fff7ed" : "#f8f8fc", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShoppingCart size={14} color={totalQty > 0 ? "#EA580C" : "#c0c0d8"} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1d1d2f", flex: 1 }}>
              Cart
              {totalQty > 0 && (
                <span style={{ marginLeft: 8, background: "#EA580C", color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "2px 7px" }}>
                  {totalQty}
                </span>
              )}
            </span>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])}
                style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #fee2e2", borderRadius: 8, background: "#fff5f5", cursor: "pointer", padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#ef4444" }}>
                <Trash2 size={11} /> Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div style={{ flex: cart.length === 0 ? 1 : "0 0 auto", minHeight: 0, overflowY: "visible", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
            {cart.length === 0 ? (
              <div className="pos-cart-empty" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 16px", textAlign: "center" }}>
                <div className="pos-cart-empty-icon" style={{ width: 64, height: 64, borderRadius: 18, background: "#f4f4fc", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <ShoppingCart size={28} color="#d0d0e8" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#b0b0c8" }}>Your cart is empty</div>
                <div style={{ fontSize: 12, color: "#c8c8d8", marginTop: 6, lineHeight: 1.6, maxWidth: 180 }}>
                  Click any service or product from the catalog to add it
                </div>
              </div>
            ) : (
              cart.map(entry => {
                const c = entry.type === "service" ? "#EA580C" : "#d97706";
                return (
                  <div key={entry.cartId}
                    style={{ borderRadius: 12, border: "1.5px solid #eaeaf4", background: "#fafafe", overflow: "hidden", flexShrink: 0 }}>
                    {/* Color bar */}
                    <div style={{ height: 3, background: c }} />
                    <div style={{ padding: "14px 12px 16px" }}>
                      {/* Name row */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 14 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1d1d2f", lineHeight: 1.3 }}>{entry.name}</div>
                          {entry.variablePrice ? (
                            <div style={{ marginTop: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 11, color: "#b0b0c8" }}>PKR</span>
                                <input type="number" value={entry.unitPrice || ""} onChange={(e) => updateUnitPrice(entry.cartId, Number(e.target.value) || 0)}
                                  placeholder="Enter price" aria-label={`Price for ${entry.name}`}
                                  style={{ width: 84, fontSize: 12, padding: "3px 6px", borderRadius: 6, border: entry.unitPrice > 0 ? "1px solid #e0dff0" : "1px solid #f59e0b", outline: "none" }} />
                                <span style={{ fontSize: 11, color: "#b0b0c8" }}>each</span>
                              </div>
                              {entry.priceRangeMin && entry.priceRangeMax && (
                                <div style={{ fontSize: 10, color: "#c8c8d8", marginTop: 3, whiteSpace: "nowrap" }}>
                                  Range: {pkr(entry.priceRangeMin)} – {pkr(entry.priceRangeMax)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: "#b0b0c8", marginTop: 2 }}>{pkr(entry.unitPrice)} each</div>
                          )}
                        </div>
                        <button type="button" onClick={() => setCart(prev => prev.filter(e => e.cartId !== entry.cartId))}
                          style={{ border: "none", background: "#f8f4ff", borderRadius: 6, cursor: "pointer", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <X size={12} color="#9999b0" />
                        </button>
                      </div>

                      {/* Qty + total row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {/* Qty controls */}
                        <div style={{ display: "flex", alignItems: "center", background: "#fff", border: "1.5px solid #e8e8f4", borderRadius: 10, overflow: "hidden" }}>
                          <button type="button" onClick={() => updateQty(entry.cartId, -1)}
                            style={{ width: 34, height: 34, border: "none", background: entry.qty === 1 ? "#fff5f5" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.1s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = entry.qty === 1 ? "#fee2e2" : "#f5f4ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = entry.qty === 1 ? "#fff5f5" : "#fff")}
                          >
                            {entry.qty === 1 ? <Trash2 size={12} color="#ef4444" /> : <Minus size={12} color="#EA580C" />}
                          </button>
                          <div style={{ width: 36, textAlign: "center", fontSize: 14, fontWeight: 900, color: "#1d1d2f" }}>{entry.qty}</div>
                          <button type="button" onClick={() => updateQty(entry.cartId, 1)}
                            style={{ width: 34, height: 34, border: "none", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fff7ed")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                          >
                            <Plus size={12} color="#EA580C" />
                          </button>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: c }}>{pkr(entry.total)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Cart footer ── */}
          {cart.length > 0 && (
            <div style={{ borderTop: "1px solid #f4f4fc", padding: "14px 14px 14px", flexShrink: 0 }}>

              {/* Summary */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9999b0", marginBottom: 4 }}>
                  <span>{cart.length} line item{cart.length !== 1 ? "s" : ""} · {totalQty} unit{totalQty !== 1 ? "s" : ""}</span>
                  <span style={{ fontWeight: 700, color: "#4a4a6a" }}>{pkr(rawSubtotal)}</span>
                </div>

                {/* Discount row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 9, background: "#fafafe", border: "1px solid #f0f0f8" }}>
                  <Tag size={12} color="#d97706" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9999b0" }}>Discount</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="number" min={0} value={discount || ""} onChange={e => setDiscount(parseDiscountValue(e.target.value))}
                      placeholder="0"
                      style={{ width: 72, height: 30, padding: "0 8px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, textAlign: "right", outline: "none", background: "#fff", fontWeight: 700 }} />
                    <select value={discType} onChange={e => setDiscType(e.target.value as DiscountType)}
                      style={{ height: 30, borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, padding: "0 6px", outline: "none", background: "#fff", color: "#5a5a78", fontWeight: 700 }}>
                      <option value="flat">PKR</option>
                      <option value="pct">%</option>
                    </select>
                  </div>
                </div>

                {discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#059669", marginTop: 4, fontWeight: 700, padding: "0 4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Tag size={11} />Discount applied</span>
                    <span>− {pkr(discountAmount)}</span>
                  </div>
                )}

                {/* 2nd discount row — stacks on top of the discount above (e.g. a separate promo/staff discount) */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 9, background: "#fafafe", border: "1px solid #f0f0f8", marginTop: 6 }}>
                  <Tag size={12} color="#d97706" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9999b0" }}>Discount 2</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="number" min={0} value={discount2 || ""} onChange={e => setDiscount2(parseDiscountValue(e.target.value))}
                      placeholder="0"
                      style={{ width: 72, height: 30, padding: "0 8px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, textAlign: "right", outline: "none", background: "#fff", fontWeight: 700 }} />
                    <select value={discType2} onChange={e => setDiscType2(e.target.value as DiscountType)}
                      style={{ height: 30, borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, padding: "0 6px", outline: "none", background: "#fff", color: "#5a5a78", fontWeight: 700 }}>
                      <option value="flat">PKR</option>
                      <option value="pct">%</option>
                    </select>
                  </div>
                </div>

                {discountAmount2 > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#059669", marginTop: 4, fontWeight: 700, padding: "0 4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Tag size={11} />Discount 2 applied</span>
                    <span>− {pkr(discountAmount2)}</span>
                  </div>
                )}

                {/* Loyalty redemption row */}
                {loyaltySettings.enabled && selectedClient?.id && availableLoyaltyPts > 0 && (
                  <div style={{ marginTop: 8, padding: "10px", borderRadius: 9, background: "#fffbeb", border: "1px solid #fde68a" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                      <Gift size={12} color="#d97706" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", flex: 1 }}>Loyalty Points</span>
                      <span style={{ fontSize: 10, color: "#d97706", fontWeight: 800, background: "#fef3c7", padding: "1px 7px", borderRadius: 20 }}>
                        {availableLoyaltyPts} pts = {pkr(availableLoyaltyPts * loyaltySettings.rupeePerPoint)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <input
                        type="number" min={0} max={availableLoyaltyPts}
                        value={loyaltyRedeem || ""}
                        onChange={e => setLoyaltyRedeem(Math.min(Math.max(0, Number(e.target.value)), availableLoyaltyPts))}
                        placeholder="0"
                        style={{ flex: 1, height: 30, padding: "0 8px", borderRadius: 8, border: "1.5px solid #fde68a", fontSize: 12, textAlign: "right", outline: "none", background: "#fff", fontWeight: 700 }}
                      />
                      <span style={{ fontSize: 11, color: "#92400e", fontWeight: 600 }}>pts</span>
                      <button type="button" onClick={() => setLoyaltyRedeem(availableLoyaltyPts)}
                        style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #fbbf24", background: "#fef3c7", fontSize: 10, fontWeight: 800, color: "#92400e", cursor: "pointer", whiteSpace: "nowrap" }}>
                        Use All
                      </button>
                      {loyaltyRedeem > 0 && (
                        <button type="button" onClick={() => setLoyaltyRedeem(0)}
                          style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                          <X size={11} color="#dc2626" />
                        </button>
                      )}
                    </div>
                    {loyaltyDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#d97706", marginTop: 6, fontWeight: 700, padding: "0 2px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Gift size={11} />Points redeemed</span>
                        <span>− {pkr(loyaltyDiscount)}</span>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Total box */}
              <div style={{ borderRadius: 13, background: "linear-gradient(135deg,#9A3412,#F97316)", padding: "12px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 16px rgba(154,52,18,0.3)" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>TOTAL AMOUNT</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>{pkr(total)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>via</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "4px 10px" }}>
                    {isCredit ? (
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>Pay Later</span>
                    ) : selectedPayMethod ? (
                      <>
                        <selectedPayMethod.icon size={12} color="#fff" />
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{selectedPayMethod.label}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.6)" }}>Not selected</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment methods */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>Payment Method</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {PAY_METHODS.map(pm => {
                    const Icon = pm.icon;
                    const sel = payMethod === pm.value;
                    return (
                      <button key={pm.value} type="button" onClick={() => setPayMethod(pm.value)}
                        style={{ padding: "9px 6px", borderRadius: 10, border: `2px solid ${sel ? pm.color : "#e8e8f4"}`, background: sel ? pm.bg : "#fafafe", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.12s", transform: sel ? "scale(1.03)" : "scale(1)" }}>
                        <Icon size={15} color={sel ? pm.color : "#b0b0c8"} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: sel ? pm.color : "#9999b0" }}>{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pay Later toggle */}
              <button
                type="button"
                onClick={() => setIsCredit(c => !c)}
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 10, marginBottom: 8,
                  border: `2px solid ${isCredit ? "#d97706" : "#e8e8f4"}`,
                  background: isCredit ? "#fffbeb" : "#fafafe",
                  color: isCredit ? "#d97706" : "#9999b0",
                  fontSize: 12, fontWeight: 800, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "all 0.15s",
                }}
              >
                <Clock size={13} />
                {isCredit ? "Pay Later — Credit Sale" : "Pay Later / Credit"}
              </button>

              {hasUnpricedVariable && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#d97706" }}>
                  <AlertCircle size={13} /> Enter a price for the variable-priced item(s) before checkout
                </div>
              )}
              {!hasUnpricedVariable && noPaymentSelected && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#d97706" }}>
                  <AlertCircle size={13} /> Select a payment method (or Pay Later/Credit) before checkout
                </div>
              )}
              {/* Complete button */}
              <button type="button" onClick={completeSale} disabled={completing || hasUnpricedVariable || noPaymentSelected}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 13, border: "none",
                  background: (completing || hasUnpricedVariable || noPaymentSelected) ? "#e8e8f0" : isCredit ? "linear-gradient(135deg,#d97706,#f59e0b)" : "linear-gradient(135deg,#9A3412,#F97316)",
                  color: (completing || hasUnpricedVariable || noPaymentSelected) ? "#aaaabc" : "#fff",
                  fontSize: 15, fontWeight: 900, cursor: (completing || hasUnpricedVariable || noPaymentSelected) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                  boxShadow: (completing || hasUnpricedVariable || noPaymentSelected) ? "none" : isCredit ? "0 5px 20px rgba(217,119,6,0.40)" : "0 5px 20px rgba(154,52,18,0.42)",
                  letterSpacing: "-0.01em", transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!completing) e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {completing
                  ? <><RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> Processing…</>
                  : isCredit
                    ? <><Clock size={17} /> Create Credit Invoice</>
                    : <><ReceiptText size={17} /> Complete Sale &amp; Print</>
                }
              </button>

              {/* WA hint */}
              {selectedClient?.phone && (
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "#b0b0c8", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <MessageSquare size={11} color="#25d366" />
                  PDF invoice will be sent to {selectedClient.phone}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ MOBILE TAB BAR ══ */}
      <nav className="pos-tab-bar">
        <button className={`pos-tab-btn${posTab === "customer" ? " pos-tab-active" : ""}`} onClick={() => setPosTab("customer")}>
          <User size={18} />
          Customer
        </button>
        <button className={`pos-tab-btn${posTab === "catalog" ? " pos-tab-active" : ""}`} onClick={() => setPosTab("catalog")}>
          <Scissors size={18} />
          Catalog
        </button>
        <button className={`pos-tab-btn${posTab === "cart" ? " pos-tab-active" : ""}`} onClick={() => {setPosTab("cart");}}>
          <ShoppingCart size={18} />
          Cart {totalQty > 0 && <span style={{ fontSize: 10, background: "#EA580C", color: "#fff", borderRadius: 99, padding: "1px 5px", marginLeft: 2 }}>{totalQty}</span>}
        </button>
      </nav>

      {/* Print modal */}
      {printInvoice && (
        <InvoicePrint
          invoice={printInvoice}
          businessName={business.name}
          businessPhone={business.phone}
          businessEmail={business.email}
          businessAddress={business.address}
          onClose={() => { setPrintInvoice(null); startNewSale(); }}
          onEdit={() => setEditingInvoice(printInvoice)}
        />
      )}
      {editingInvoice && (
        <InvoiceEdit
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={(updated) => {
            setPrintInvoice(updated);
            setLastInvoice(updated);
          }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e0e0f0; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #c8c8e0; }
      `}</style>
    </div>
  );
}
