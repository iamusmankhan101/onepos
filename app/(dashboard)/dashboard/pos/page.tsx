"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search, Scissors, Package, Plus, Minus, Trash2, Phone,
  X, ShoppingCart, ReceiptText, Banknote, CreditCard,
  Smartphone, Zap, Tag, UserPlus, CheckCircle2, Printer,
  MessageSquare, RefreshCw, User, ChevronRight, Sparkles,
  Clock, AlertCircle, Gift,
  ScanBarcode, Lock,
  Send, Pause, StickyNote, ListOrdered, Bike, ShoppingBag, UtensilsCrossed, Flame, ChefHat,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useBusinessType } from "@/lib/use-business-type";
import KotPrint from "@/components/kot-print";
import ManagerApproval from "@/components/manager-approval";
import CustomizeSheet from "@/components/customize-sheet";
import {
  MENU_CHANGED_EVENT, defaultSelection, getModifierGroups, groupsForItem, lineDescription, sizeGroup, sizePriceRange,
  modifierSummary, modifiersTotal, priceForOrderType, sameModifiers, selectionFromModifiers,
  type ChosenModifier, type ModifierGroup,
} from "@/lib/menu";
import { billCharges, getChargeSettings } from "@/lib/charges";
import { recordMovement, saleChanges, tracksStock } from "@/lib/stock";
import { SHIFTS_CHANGED_EVENT, getOpenShift, type CashShift } from "@/lib/shifts";
import { discountNeedsApproval, getPosRules } from "@/lib/pos-rules";
import { getCurrentUser } from "@/lib/auth";
import {
  ORDER_TYPE_LABEL, fireOrder, getOpenOrders, getOrder, getTables, markOrderPaid, newId,
  nextOrderNumber, orderRef, orderSubtotal, saveOrder, stationFor, tableNames, voidLine,
  type Approval, type DiningTable, type KitchenTicket, type OrderLine, type OrderType, type RestaurantOrder,
} from "@/lib/restaurant";
import { awardPoints, loyaltyActive, redeemPoints, type LoyaltySettings } from "@/lib/loyalty";
import InvoicePrint from "@/components/invoice-print";
import InvoiceEdit from "@/components/invoice-edit";
import {
  getStoredServices, getStoredClients, getStoredInventory,
  getStoredStaff, getStoredAppointments, saveAppointments, saveClients, subscribeToStoredData,
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
  image?: string;
  variablePrice?: boolean;
  priceRangeMin?: number;
  priceRangeMax?: number;
  /** 86'd — off the menu for now (restaurant mode). */
  unavailable?: boolean;
  /** Restaurant mode: POS menu tab, and the option groups (lib/menu.ts) asked on adding. */
  menuCategory?: string;
  modifierGroupIds?: string[];
  /** Sold in sizes: the size (with its full price) is picked on adding; `price` is then 0. */
  sizes?: InventoryItem["sizes"];
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
  // Restaurant mode — see lib/restaurant.ts. A line keeps its order-line id so
  // saving the order again updates it rather than duplicating it.
  lineId?: string;
  /** Sent to the kitchen: quantity and removal are locked from here on. */
  firedAt?: string;
  /** Kitchen note — "no onions". */
  note?: string;
  /** Picked options; unitPrice already includes them. */
  modifiers?: ChosenModifier[];
}

/** The customize pop-up: adding `item`, or changing the cart line `cartId`. */
interface Customizing {
  item: CatalogItem;
  groups: ModifierGroup[];
  cartId?: string;
  initial: Record<string, string[]>;
  qty: number;
  note: string;
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

// Mirrors CATEGORY_CONFIG on the Products page, plus whatever categories the
// service catalogue uses. Anything unrecognised falls back to `other`.
const CATEGORY_COLORS: Record<string, { fg: string; bg: string }> = {
  general:     { fg: "#EA580C", bg: "#ffedd5" },
  food:        { fg: "#059669", bg: "#ecfdf5" },
  drinks:      { fg: "#0369a1", bg: "#e0f2fe" },
  apparel:     { fg: "#db2777", bg: "#fdf2f8" },
  electronics: { fg: "#4f46e5", bg: "#eef2ff" },
  supplies:    { fg: "#d97706", bg: "#fffbeb" },
  tools:       { fg: "#0f766e", bg: "#f0fdfa" },
  product:     { fg: "#d97706", bg: "#fffbeb" },
  other:       { fg: "#6b7280", bg: "#f9fafb" },
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

  // The catalogue, customers and staff were only read once on mount, so a till
  // opened straight after sign-in — before the first sync lands — showed an
  // empty menu until someone reloaded. Re-read whenever stored data changes.
  useEffect(() => {
    return subscribeToStoredData(() => {
      setServices(getStoredServices().filter(s => s.isActive));
      setInventory(getStoredInventory());
      setStaff(getStoredStaff().filter(s => s.isActive));
      setClients(getStoredClients());
    });
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

  // Pre-select the customer from ?client= — this is what the "New Sale" button
  // on the Clients page opens. Its own effect (rather than the mount effect
  // above) so it can read state declared here.
  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client");
    if (!clientId) return;
    queueMicrotask(() => {
      const client = getStoredClients().find(c => c.id === clientId);
      if (client) setSelectedClient(client);
    });
  }, []);

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
  const [showDiscount2, setShowDiscount2] = useState(false);
  const [loyaltyRedeem, setLoyaltyRedeem] = useState<number>(0);
  // No default — staff must actively pick a method (or Pay Later/Credit) before checkout,
  // otherwise sales were silently defaulting to "cash" even when no one confirmed that.
  const [payMethod,     setPayMethod]     = useState<PaymentMethod | null>(null);

  // ── Restaurant mode ───────────────────────────────────────────────────────
  // Only live for a restaurant or café (lib/business-types.ts). The cart then
  // belongs to an order: it can be held, sent to the kitchen in rounds, and
  // settled later from here or from the floor plan.
  const router = useRouter();
  const businessType = useBusinessType();
  const restaurant = businessType.restaurantMode;
  const [activeOrder,   setActiveOrder]   = useState<RestaurantOrder | null>(null);
  const [orderType,     setOrderType]     = useState<OrderType>("takeaway");
  const [orderTableIds, setOrderTableIds] = useState<string[]>([]);
  const [guests,        setGuests]        = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [rush,          setRush]          = useState(false);
  const [diningTables,  setDiningTables]  = useState<DiningTable[]>([]);
  const [openOrders,    setOpenOrders]    = useState<RestaurantOrder[]>([]);
  const [showOpenOrders, setShowOpenOrders] = useState(false);
  const [noteFor,       setNoteFor]       = useState<string | null>(null);
  const [voidFor,       setVoidFor]       = useState<CartEntry | null>(null);
  const [kotTickets,    setKotTickets]    = useState<KitchenTicket[] | null>(null);
  const [orderNotice,   setOrderNotice]   = useState<string | null>(null);
  const [sendingOrder,  setSendingOrder]  = useState(false);
  const [autoPrintKot,  setAutoPrintKot]  = useState(false);
  /** Line ids the loaded order had, to tell "removed here" from "added on another till". */
  const knownLineIds = useRef<Set<string>>(new Set());

  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  // Phase 4 — staff operations: the cash drawer's open shift, split payments,
  // change due, the staff discount and manager sign-off on big discounts.
  const [openShift,     setOpenShift]     = useState<CashShift | undefined>(undefined);
  const [split,         setSplit]         = useState(false);
  const [splitRows,     setSplitRows]     = useState<{ method: PaymentMethod; amount: string }[]>([]);
  const [cashGiven,     setCashGiven]     = useState("");
  const [staffDiscountOn, setStaffDiscountOn] = useState(false);
  const [askDiscountApproval, setAskDiscountApproval] = useState(false);
  const [customizing,   setCustomizing]   = useState<Customizing | null>(null);
  const [menuTab,       setMenuTab]       = useState("all");

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
    // Services are a salon thing — a restaurant or shop sells only its menu/products.
    const svc: CatalogItem[] = (businessType.bookings && catalogTab !== "products" ? services : [])
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
        // Restaurant mode prices by how the order is served (takeaway/delivery prices).
        id: i.id, type: "product", name: `${i.brand ? i.brand + " " : ""}${i.name}`,
        // A sized item's price comes from the size picked, so its base is 0.
        price: i.sizes?.length ? 0 : restaurant ? priceForOrderType(i, orderType) : i.retailPrice ?? 0,
        sizes: i.sizes,
        category: i.category, section: i.section, stock: i.currentStock, unit: i.unit, barcode: i.barcode, image: i.image,
        variablePrice: i.variablePrice, priceRangeMin: i.priceRangeMin, priceRangeMax: i.priceRangeMax,
        unavailable: i.unavailable, menuCategory: i.menuCategory?.trim() || undefined, modifierGroupIds: i.modifierGroupIds,
      }));
    return [...svc, ...prod];
  }, [services, inventory, catalogTab, catalogSearch, catalogSectionFilter, restaurant, orderType, businessType.bookings]);

  // Restaurant mode: menu tabs (Coffee, Bakery…) from the items' menu sections.
  const menuCategories = useMemo(() => {
    if (!restaurant) return [];
    const seen = new Set<string>();
    for (const i of inventory) {
      const c = i.menuCategory?.trim();
      if (c && ((i.retailPrice ?? 0) > 0 || i.variablePrice)) seen.add(c);
    }
    return [...seen];
  }, [inventory, restaurant]);
  const shownItems = restaurant && menuTab !== "all"
    ? catalogItems.filter(i => i.menuCategory === menuTab)
    : catalogItems;

  const dropClients = useMemo(() => {
    const q = clientQ.toLowerCase();
    return q
      ? clients.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 8)
      : clients.slice(0, 8);
  }, [clients, clientQ]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const cartLineItems: InvoiceItem[] = cart.map(e => ({
    id: e.cartId, type: e.type, description: lineDescription(e.name, e.modifiers),
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
  const loyaltyDiscount       = loyaltyActive(loyaltySettings) && cappedLoyaltyRedeem > 0
    ? Math.min(Math.floor(cappedLoyaltyRedeem * loyaltySettings.rupeePerPoint), Math.max(0, rawSubtotal - discountAmount - discountAmount2))
    : 0;
  const totalDiscountAmount   = Math.min(rawSubtotal, wholePkr(discountAmount + discountAmount2 + loyaltyDiscount));

  const { subtotal } = calcTotals(cartLineItems, totalDiscountAmount);
  const chargeSettings = getChargeSettings();
  const { serviceCharge: serviceChargeAmount, tax: taxAmount } = billCharges(
    subtotal - totalDiscountAmount, restaurant ? orderType : undefined, chargeSettings,
  );
  const total = Math.max(0, subtotal - totalDiscountAmount + serviceChargeAmount + taxAmount);
  const totalQty = cart.reduce((s, e) => s + e.qty, 0);
  const hasUnpricedVariable = cart.some(e => e.variablePrice && e.unitPrice <= 0);
  const posRules = getPosRules();
  const splitSum = splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const splitProblem = !split ? null
    : splitRows.filter(row => Number(row.amount) > 0).length < 2 ? "Split the bill between at least two payments"
    : Math.round(splitSum) !== total ? `Parts add up to ${pkr(splitSum)} — the bill is ${pkr(total)}`
    : null;
  const noPaymentSelected = split ? !!splitProblem : (!isCredit && !payMethod);
  const shiftBlocked = restaurant && posRules.requireOpenShift && !openShift;
  // The staff discount is the owner's own rule, so it never needs sign-off itself.
  const approvableDiscount = (staffDiscountOn && discType === "pct" && discount === posRules.staffDiscountRate ? 0 : discountAmount) + discountAmount2;
  const discountPct = rawSubtotal > 0 ? (approvableDiscount / rawSubtotal) * 100 : 0;
  const signedInRole = typeof window === "undefined" ? undefined : getCurrentUser()?.role;
  const discountNeedsSignOff = signedInRole === "staff" && discountNeedsApproval(discountPct, posRules);
  const cashChange = !split && payMethod === "cash" && Number(cashGiven) > 0 ? Number(cashGiven) - total : null;

  // ── Cart ops ──────────────────────────────────────────────────────────────
  /** Puts `qty` of an item on the cart with these options, joining an identical unsent line. */
  const addLine = useCallback((item: CatalogItem, modifiers: ChosenModifier[] = [], qty = 1, note = "") => {
    const unitPrice = item.price + modifiersTotal(modifiers);
    setCart(prev => {
      // A line the kitchen already has, or one with its own note, is its own
      // line — another of the same dish starts a fresh one. So is a different
      // size or milk: only an identical drink adds to an existing line.
      const hit = !note && prev.find(e => e.itemId === item.id && !e.firedAt && !e.note && sameModifiers(e.modifiers, modifiers));
      if (hit) return prev.map(e => e.cartId === hit.cartId ? { ...e, qty: e.qty + qty, total: (e.qty + qty) * e.unitPrice } : e);
      return [...prev, {
        cartId: crypto.randomUUID(), itemId: item.id, type: item.type, name: item.name, qty,
        unitPrice, total: unitPrice * qty, variablePrice: item.variablePrice,
        priceRangeMin: item.priceRangeMin, priceRangeMax: item.priceRangeMax,
        note: note || undefined, modifiers: modifiers.length ? modifiers : undefined,
      }];
    });
  }, []);

  /** What the customize pop-up asks: the item's sizes first, then (restaurant mode) its option groups. */
  const optionGroupsFor = useCallback((item: CatalogItem | undefined): ModifierGroup[] => {
    const size = sizeGroup(item);
    return [...(size ? [size] : []), ...(restaurant ? groupsForItem(item, modifierGroups) : [])];
  }, [modifierGroups, restaurant]);

  const addToCart = useCallback((item: CatalogItem) => {
    const groups = optionGroupsFor(item);
    if (groups.length > 0) {
      setCustomizing({ item, groups, initial: defaultSelection(groups), qty: 1, note: "" });
      return;
    }
    addLine(item);
  }, [addLine, optionGroupsFor]);

  /** Re-opens the customize pop-up for an unsent cart line. */
  function editEntryOptions(entry: CartEntry) {
    const item = catalogItems.find(i => i.id === entry.itemId) ?? inventoryCatalogItem(entry.itemId);
    if (!item) return;
    const groups = optionGroupsFor(item);
    if (groups.length === 0) return;
    setCustomizing({ item, groups, cartId: entry.cartId, initial: selectionFromModifiers(entry.modifiers), qty: entry.qty, note: entry.note ?? "" });
  }

  /** An inventory item as a catalog entry, for a cart line whose item a filter has hidden. */
  function inventoryCatalogItem(itemId: string): CatalogItem | undefined {
    const i = inventory.find(x => x.id === itemId);
    if (!i) return undefined;
    return {
      id: i.id, type: "product", name: `${i.brand ? i.brand + " " : ""}${i.name}`,
      price: i.sizes?.length ? 0 : priceForOrderType(i, orderType),
      category: i.category, modifierGroupIds: i.modifierGroupIds, sizes: i.sizes,
    };
  }

  /**
   * Switches dine-in / takeaway / delivery and re-prices the lines not yet sent,
   * since an item can cost more as takeaway or delivery. Sent lines keep the
   * price they went to the kitchen at.
   */
  function changeOrderType(next: OrderType) {
    setOrderType(next);
    setCart(prev => prev.map(e => {
      if (e.firedAt || e.type !== "product" || e.variablePrice) return e;
      const item = inventory.find(i => i.id === e.itemId);
      if (!item) return e;
      const unitPrice = priceForOrderType(item, next) + modifiersTotal(e.modifiers);
      return unitPrice === e.unitPrice ? e : { ...e, unitPrice, total: unitPrice * e.qty };
    }));
  }

  function confirmCustomizing(modifiers: ChosenModifier[], qty: number, note: string) {
    if (!customizing) return;
    const { item, cartId } = customizing;
    if (cartId) {
      const unitPrice = item.price + modifiersTotal(modifiers);
      setCart(prev => prev.map(e => e.cartId === cartId
        ? { ...e, modifiers: modifiers.length ? modifiers : undefined, qty, note: note || undefined, unitPrice, total: unitPrice * qty }
        : e));
    } else {
      addLine(item, modifiers, qty, note);
    }
    setCustomizing(null);
  }

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
    if (tracksStock(product) && product.currentStock <= 0) {
      setScanFeedback({ ok: false, message: `${product.name} is out of stock.` });
      return;
    }
    addToCart({
      id: product.id,
      type: "product",
      name: `${product.brand ? product.brand + " " : ""}${product.name}`,
      price: product.sizes?.length ? 0 : restaurant ? priceForOrderType(product, orderType) : product.retailPrice,
      sizes: product.sizes,
      modifierGroupIds: product.modifierGroupIds,
      category: product.category,
      stock: product.currentStock,
      unit: product.unit,
      barcode: product.barcode,
      image: product.image,
    });
    setScanFeedback({ ok: true, message: `${product.name} added to cart.` });
    setBarcodeInput("");
  }, [addToCart, inventory, orderType, restaurant]);

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
      if (!entry || entry.firedAt) return prev;
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
    setSplit(false); setSplitRows([]); setCashGiven(""); setStaffDiscountOn(false); setShowDiscount2(false);
    setSyncFailed(false);
    clearOrder();
  }

  // ── Restaurant orders ─────────────────────────────────────────────────────
  function refreshRestaurant() {
    setDiningTables(getTables());
    setOpenOrders(getOpenOrders());
  }

  function clearOrder() {
    setActiveOrder(null);
    setOrderTableIds([]); setGuests(""); setDeliveryAddress(""); setRush(false);
    setNoteFor(null);
    knownLineIds.current = new Set();
    if (window.location.search.includes("order=")) router.replace("/dashboard/pos");
  }

  /** Puts an order into the cart — resuming a held tab, or adding to a table's order. */
  function loadOrder(order: RestaurantOrder) {
    setActiveOrder(order);
    setOrderType(order.type);
    setOrderTableIds(order.tableIds);
    setGuests(order.guests ? String(order.guests) : "");
    setDeliveryAddress(order.deliveryAddress ?? "");
    setRush(!!order.rush);
    setSaleNotes(order.notes ?? "");
    setSelectedStaffId(order.waiterId ?? "");
    knownLineIds.current = new Set(order.lines.map(l => l.id));
    setCart(order.lines.filter(l => !l.voided).map(l => ({
      cartId: l.id, lineId: l.id, itemId: l.itemId, type: "product" as const, name: l.name,
      qty: l.qty, unitPrice: l.unitPrice, total: l.qty * l.unitPrice, firedAt: l.firedAt, note: l.note,
      modifiers: l.modifiers,
    })));
    const client = order.clientId ? getStoredClients().find(c => c.id === order.clientId) : undefined;
    setSelectedClient(client ?? (order.clientName ? { id: "", name: order.clientName, phone: order.clientPhone ?? "", tags: [], source: "walk-in", createdAt: "", totalVisits: 0, totalSpend: 0 } : null));
    setShowOpenOrders(false);
  }

  /**
   * The order as this screen has it now, merged over the stored copy: voided
   * lines and lines another terminal added since this one loaded the order
   * are kept, lines removed here (only possible before they were sent) go.
   */
  function buildOrder(): RestaurantOrder {
    const stored = activeOrder ? getOrder(activeOrder.id) ?? activeOrder : null;
    const staffMember = staff.find(s => s.id === selectedStaffId);
    const cartLines: OrderLine[] = cart.map(e => {
      const item = inventory.find(i => i.id === e.itemId);
      return {
        id: e.lineId ?? e.cartId,
        itemId: e.itemId,
        name: e.name,
        qty: e.qty,
        unitPrice: wholePkr(e.unitPrice),
        modifiers: e.modifiers?.length ? e.modifiers : undefined,
        note: e.note?.trim() || undefined,
        station: stationFor(item),
        firedAt: e.firedAt,
      };
    });
    const cartIds = new Set(cartLines.map(l => l.id));
    const kept = (stored?.lines ?? []).filter(l => !cartIds.has(l.id) && (l.voided || !knownLineIds.current.has(l.id)));
    return {
      id: stored?.id ?? newId("ord"),
      number: stored?.number ?? nextOrderNumber(),
      status: "open",
      createdAt: stored?.createdAt ?? new Date().toISOString(),
      ...stored,
      type: orderType,
      tableIds: orderType === "dine-in" ? orderTableIds : [],
      guests: parseInt(guests, 10) || undefined,
      deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() || undefined : undefined,
      rush,
      waiterId: staffMember?.id,
      waiterName: staffMember?.name,
      clientId: selectedClient?.id || undefined,
      clientName: selectedClient?.name || undefined,
      clientPhone: selectedClient?.phone || undefined,
      notes: saleNotes.trim() || undefined,
      lines: [...kept, ...cartLines],
    };
  }

  function orderProblem(): string | null {
    if (orderType === "dine-in" && orderTableIds.length === 0) return "Pick a table for a dine-in order.";
    if (orderType === "delivery" && !deliveryAddress.trim()) return "Add the delivery address.";
    return null;
  }

  /** Send to kitchen (fire = true) or hold the order for later (fire = false), then clear the till. */
  async function saveCurrentOrder(fire: boolean) {
    const problem = orderProblem();
    if (problem) { setOrderNotice(problem); return; }
    if (cart.length === 0) return;
    setSendingOrder(true);
    try {
      const order = buildOrder();
      if (fire) {
        const { tickets } = await fireOrder(order);
        setOrderNotice(tickets.length
          ? `${orderRef(order)} sent to ${tickets.map(t => t.station).join(" & ")}`
          : `${orderRef(order)} saved — nothing new to send`);
        if (tickets.length && autoPrintKot) setKotTickets(tickets);
      } else {
        await saveOrder(order);
        setOrderNotice(`${orderRef(order)} on hold`);
      }
      setCart([]); setDiscount(0); setDiscount2(0); setLoyaltyRedeem(0); setSaleNotes(""); setPayMethod(null);
      setSelectedClient(null); setClientQ(""); setSelectedStaffId(""); setIsCredit(false);
      setSplit(false); setSplitRows([]); setCashGiven(""); setStaffDiscountOn(false); setShowDiscount2(false); setShowDiscount2(false);
      clearOrder();
      refreshRestaurant();
    } finally {
      setSendingOrder(false);
    }
  }

  async function approveVoid(entry: CartEntry, approval: Approval) {
    if (!activeOrder || !entry.lineId) return;
    // Save what's on screen first so the void lands on the current lines.
    const current = buildOrder();
    const next = await voidLine(current, entry.lineId, approval);
    setActiveOrder(next);
    knownLineIds.current = new Set(next.lines.map(l => l.id));
    setCart(prev => prev.filter(e => e.cartId !== entry.cartId));
    setVoidFor(null);
  }

  function removeEntry(entry: CartEntry) {
    if (entry.firedAt) { setVoidFor(entry); return; }
    setCart(prev => prev.filter(e => e.cartId !== entry.cartId));
  }

  function setEntryNote(cartId: string, note: string) {
    setCart(prev => prev.map(e => e.cartId === cartId ? { ...e, note } : e));
  }

  // Restaurant setup: tables and open orders, ?order= from the floor plan, and
  // the per-terminal "print kitchen tickets" preference.
  useEffect(() => {
    if (!restaurant) return;
    const t = window.setTimeout(() => {
      refreshRestaurant();
      try { setAutoPrintKot(localStorage.getItem("pointly_pos_autoprint_kot") === "on"); } catch { /* storage blocked */ }
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("order");
      const order = orderId ? getOrder(orderId) : undefined;
      if (order && order.status === "open") {
        loadOrder(order);
        if (params.get("checkout")) setPosTab("cart");
      } else {
        setOrderType("takeaway");
      }
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the business type is known
  }, [restaurant]);

  // The cash drawer's shift — opened and closed on the Shifts page, possibly on another till.
  useEffect(() => {
    if (!restaurant) return;
    const load = () => setOpenShift(getOpenShift());
    const t = window.setTimeout(load, 0);
    const unsubscribe = subscribeToStoredData(load);
    window.addEventListener(SHIFTS_CHANGED_EVENT, load);
    return () => { window.clearTimeout(t); unsubscribe(); window.removeEventListener(SHIFTS_CHANGED_EVENT, load); };
  }, [restaurant]);

  // Option groups — re-read when edited on the Menu page or synced from another device.
  useEffect(() => {
    if (!restaurant) return;
    const load = () => setModifierGroups(getModifierGroups());
    const t = window.setTimeout(load, 0);
    const unsubscribe = subscribeToStoredData(load);
    window.addEventListener(MENU_CHANGED_EVENT, load);
    return () => { window.clearTimeout(t); unsubscribe(); window.removeEventListener(MENU_CHANGED_EVENT, load); };
  }, [restaurant]);

  useEffect(() => {
    if (!orderNotice) return;
    const t = window.setTimeout(() => setOrderNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [orderNotice]);

  // ── Complete sale ─────────────────────────────────────────────────────────
  async function completeSale(discountApproval?: Approval) {
    if (cart.length === 0 || completing) return;
    // Mirrors the Complete Sale button's disabled condition — a payment method (or
    // explicit Pay Later/Credit, or a split that adds up) must be chosen, never
    // silently defaulted.
    if (noPaymentSelected || shiftBlocked) return;
    if (discountNeedsSignOff && !discountApproval) { setAskDiscountApproval(true); return; }
    if (restaurant) {
      const problem = orderProblem();
      if (problem) { setOrderNotice(problem); return; }
    }
    setCompleting(true);
    try {
      // Restaurant mode: anything not yet sent goes to the kitchen now (a café
      // takes payment first), and the order is closed against the invoice below.
      let settledOrder: RestaurantOrder | null = null;
      if (restaurant) {
        const { order, tickets } = await fireOrder(buildOrder());
        settledOrder = order;
        if (tickets.length && autoPrintKot) setKotTickets(tickets);
      }
      const today = localDateKey();
      const staffMember = staff.find(s => s.id === selectedStaffId);
      const splitParts = splitRows
        .filter(row => Number(row.amount) > 0)
        .map(row => ({ method: row.method, amount: Math.round(Number(row.amount)) }));
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
        ...(taxAmount > 0 ? { taxLabel: chargeSettings.taxLabel } : {}),
        ...(serviceChargeAmount > 0 ? { serviceChargeAmount } : {}),
        paymentMethod: split
          ? [...splitParts].sort((a, b) => b.amount - a.amount)[0].method
          : isCredit ? "" : (payMethod as PaymentMethod),
        ...(split ? { payments: splitParts } : {}),
        cashierName: getCurrentUser()?.ownerName || undefined,
        ...(openShift && !isCredit ? { shiftId: getOpenShift()?.id ?? openShift.id } : {}),
        ...(discountApproval ? { approvedBy: discountApproval.approvedBy } : {}),
        date: today, status: isCredit ? "unpaid" : "paid",
        notes: [
          settledOrder ? orderRef(settledOrder) : "",
          saleNotes.trim(),
          discountApproval ? `Discount approved by ${discountApproval.approvedBy} — ${discountApproval.reason}` : "",
        ].filter(Boolean).join(" · "),
        source: "pos",
        ...(settledOrder ? {
          orderId: settledOrder.id,
          orderType: settledOrder.type,
          tableNames: tableNames(settledOrder.tableIds).join(" + ") || undefined,
          ...(settledOrder.type === "delivery" && settledOrder.deliveryAddress ? { deliveryAddress: settledOrder.deliveryAddress } : {}),
        } : {
          orderType: orderType,
          ...(orderType === "delivery" && deliveryAddress.trim() ? { deliveryAddress: deliveryAddress.trim() } : {}),
        }),
      });
      if (settledOrder) {
        await markOrderPaid(settledOrder.id, invoice);
        refreshRestaurant();
      }
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
        // A plain product comes off its own stock; a made-to-order item (one
        // with a recipe) takes its ingredients — options included — instead.
        // Recorded as a stock movement against the invoice (lib/stock.ts).
        const changes = saleChanges(
          soldProducts.map(e => ({ itemId: e.itemId, qty: e.qty, modifiers: e.modifiers })),
          getStoredInventory(), modifierGroups,
        );
        await recordMovement("sale", changes, { ref: invoice.number, refId: invoice.id, by: staffMember?.name || undefined });
        setInventory(getStoredInventory());
      }

      if (selectedClient?.id) {
        let updatedClient: Client = {
          ...selectedClient,
          totalVisits: selectedClient.totalVisits + 1,
          totalSpend:  selectedClient.totalSpend + total,
          lastVisitDate: today,
        };
        if (loyaltyActive(loyaltySettings)) {
          if (loyaltyDiscount > 0 && cappedLoyaltyRedeem > 0) {
            updatedClient = redeemPoints(updatedClient, cappedLoyaltyRedeem, `Redeemed at POS · ${invoice.number}`);
          }
          updatedClient = awardPoints(updatedClient, total, loyaltySettings, invoice.id);
        }
        // Read fresh from localStorage so we never map over stale React state
        const freshClients = getStoredClients();
        const found = freshClients.some(c => c.id === selectedClient.id);
        const updatedClients = found
          ? freshClients.map(c => c.id === selectedClient.id ? updatedClient : c)
          : [updatedClient, ...freshClients]; // client was quick-added and not yet in localStorage
        setClients(updatedClients);
        setSelectedClient(updatedClient); // keep selectedClient fresh in the current session
        saveClients(updatedClients);
      }

      setLastInvoice(invoice);
      setPrintInvoice(invoice);
      // The WhatsApp receipt is sent from the success banner's button, not
      // opened automatically: a wa.me tab opened after the checkout's awaits
      // lands on a blank page on any till without WhatsApp, after every sale.
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
  function buildThankYouMessage(invoice: Invoice, customerName: string): string {
    const thankYouTpl = (settingsStore.whatsapp as { posThankYou?: string }).posThankYou;
    const thankYou = thankYouTpl
      ? fillTemplate(thankYouTpl, { name: customerName, business_name: business.name })
      : `Thank you so much for visiting ${business.name} today, ${customerName}!`;
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

  /**
   * Hand the receipt to WhatsApp. A walk-in has no number on file and nothing
   * to send to, so the receipt is simply skipped — no prompt, no error.
   */
  function openWhatsAppThankYou(invoice: Invoice, client: Client | null) {
    if (!client?.phone?.trim()) { setWaStatus("idle"); return; }
    const opened = openWhatsAppChat(client.phone, buildThankYouMessage(invoice, client.name));
    setWaStatus(opened ? "opened" : "blocked");
  }

  // Manual, click-driven version: actually attaches the invoice PDF via the
  // OS share sheet (Web Share API) so WhatsApp receives a real file — a wa.me
  // link alone can only ever prefill text, never a file. Requires a real user
  // gesture (unlike openWhatsAppThankYou above), so this is only wired to the
  // button below, never to the automatic post-checkout attempt.
  async function sharePdfToWhatsApp(invoice: Invoice, client: Client | null) {
    if (!client?.phone) return;
    const message = buildThankYouMessage(invoice, client.name);
    const normalizedPhone = normalizePhone(client.phone);
    setWaPdfStatus("working");

    let file: File | null = null;
    try {
      const res = await fetch("/api/invoice-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice, business: { ...business, footer: businessType.receiptFooter } }),
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
            <div className="pos-brand-title" style={{ fontSize: 16, fontWeight: 900, color: "#1d1d2f", lineHeight: 1, whiteSpace: "nowrap" }}>Point of Sale</div>
            <div className="pos-brand-sub" style={{ fontSize: 11, color: "#9999b0", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} />
              {now.toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" })}
              &nbsp;·&nbsp;
              {now.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {restaurant && (
          <Link href="/dashboard/shifts" title={openShift ? "Cash drawer open — manage the shift" : "No shift open — open the cash drawer"}
            className="pos-top-chip" aria-label={openShift ? "Cash drawer open" : "Cash drawer closed"}
            style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 800, textDecoration: "none",
              border: `1px solid ${openShift ? "#a7f3d0" : "#fecaca"}`, background: openShift ? "#ecfdf5" : "#fef2f2", color: openShift ? "#047857" : "#b91c1c" }}>
            <Banknote size={13} />
            <span className="pos-chip-text">
              {openShift
                ? `Drawer open · ${new Date(openShift.openedAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}`
                : "Drawer closed"}
            </span>
          </Link>
        )}


        {restaurant && (
          <button type="button" onClick={() => { refreshRestaurant(); setShowOpenOrders(true); }}
            className="pos-top-chip" aria-label="Open orders"
            style={{ display: "flex", alignItems: "center", gap: 6, border: "1.5px solid #fed7aa", borderRadius: 10, padding: "8px 14px", background: "#fff", color: "#c2410c", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            <ListOrdered size={14} /> <span className="pos-chip-text">Open orders</span>
            {openOrders.length > 0 && <span style={{ background: "#EA580C", color: "#fff", borderRadius: 20, padding: "0 7px", fontSize: 11 }}>{openOrders.length}</span>}
          </button>
        )}

        {/* Cart badge pill */}
        {totalQty > 0 && !completed && (
          <div className="pos-cart-pill" style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, padding: "5px 14px" }}>
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
            {selectedClient ? (
              <Link
                href={`/dashboard/clients/${selectedClient.id}`}
                title="Open this customer's profile"
                style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#fff7ed", color: "#EA580C", borderRadius: 20, padding: "2px 8px", textDecoration: "none" }}
              >
                Selected · Profile
              </Link>
            ) : (
              <Link
                href="/dashboard/clients"
                title="Manage customers"
                style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#9999b0", textDecoration: "none" }}
              >
                All clients
              </Link>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

            {restaurant && (
              <div style={{ padding: 12, borderRadius: 12, border: "1.5px solid #fed7aa", background: "#fffaf5", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#9A3412", textTransform: "uppercase", letterSpacing: "0.07em", flex: 1 }}>
                    {activeOrder ? `Order #${activeOrder.number}` : "New order"}
                  </span>
                  {activeOrder && (
                    <button type="button" onClick={() => { setCart([]); setSelectedClient(null); setSelectedStaffId(""); setSaleNotes(""); clearOrder(); }}
                      title="Put this order back and start a new one"
                      style={{ border: "none", background: "none", color: "#9999b0", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                      Close
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                  {([
                    { id: "dine-in",  icon: UtensilsCrossed },
                    { id: "takeaway", icon: ShoppingBag },
                    { id: "delivery", icon: Bike },
                  ] as { id: OrderType; icon: React.ElementType }[]).map(({ id, icon: Icon }) => {
                    const on = orderType === id;
                    return (
                      <button key={id} type="button" onClick={() => changeOrderType(id)} aria-pressed={on}
                        style={{ padding: "7px 2px", borderRadius: 9, border: `1.5px solid ${on ? "#EA580C" : "#ececf4"}`, background: on ? "#fff7ed" : "#fff", color: on ? "#EA580C" : "#8a8aa6", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <Icon size={14} /> {ORDER_TYPE_LABEL[id]}
                      </button>
                    );
                  })}
                </div>
                {orderType === "dine-in" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 6 }}>
                    <select value={orderTableIds[0] ?? ""} onChange={e => setOrderTableIds(e.target.value ? [e.target.value] : [])} aria-label="Table"
                      style={{ height: 36, padding: "0 8px", borderRadius: 9, border: "1.5px solid #e8e8f4", fontSize: 12, background: "#fff", color: "#1d1d2f" }}>
                      <option value="">{diningTables.length ? "Choose table…" : "No tables — add them on Tables"}</option>
                      {diningTables.map(t => {
                        const busy = openOrders.some(o => o.id !== activeOrder?.id && o.tableIds.includes(t.id));
                        return <option key={t.id} value={t.id} disabled={busy}>{t.name}{t.area ? ` · ${t.area}` : ""}{busy ? " (occupied)" : ""}</option>;
                      })}
                    </select>
                    <input type="number" min={1} value={guests} onChange={e => setGuests(e.target.value)} placeholder="Guests" aria-label="Guests"
                      style={{ height: 36, padding: "0 8px", borderRadius: 9, border: "1.5px solid #e8e8f4", fontSize: 12, background: "#fff", boxSizing: "border-box", width: "100%" }} />
                  </div>
                )}
                {orderType === "dine-in" && orderTableIds.length > 1 && (
                  <div style={{ fontSize: 11, color: "#9999b0" }}>Merged: {tableNames(orderTableIds, diningTables).join(" + ")}</div>
                )}
                {orderType === "delivery" && (
                  <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={2} placeholder="Delivery address *"
                    style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #e8e8f4", fontSize: 12, background: "#fff", resize: "vertical", fontFamily: "inherit" }} />
                )}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: rush ? "#dc2626" : "#8a8aa6", cursor: "pointer" }}>
                    <input type="checkbox" checked={rush} onChange={e => setRush(e.target.checked)} style={{ accentColor: "#dc2626" }} />
                    <Flame size={12} /> Rush
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#8a8aa6", cursor: "pointer" }}
                    title="Opens the kitchen ticket to print every time an order is sent from this till">
                    <input type="checkbox" checked={autoPrintKot} style={{ accentColor: "#EA580C" }}
                      onChange={e => { setAutoPrintKot(e.target.checked); try { localStorage.setItem("pointly_pos_autoprint_kot", e.target.checked ? "on" : "off"); } catch { /* storage blocked */ } }} />
                    Print KOT
                  </label>
                </div>
              </div>
            )}

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
                    <div style={{ display: "grid", gridTemplateColumns: loyaltyActive(loyaltySettings) ? "1fr 1fr 1fr" : "1fr 1fr", gap: 6 }}>
                      {[
                        { label: "Visits", value: selectedClient.totalVisits, color: "#EA580C", bg: "rgba(234,88,12,0.07)" },
                        { label: "Spent", value: selectedClient.totalSpend >= 1000 ? `${(selectedClient.totalSpend / 1000).toFixed(1)}k` : selectedClient.totalSpend, color: "#059669", bg: "rgba(5,150,105,0.07)" },
                        ...(loyaltyActive(loyaltySettings) ? [{ label: "Points", value: selectedClient.loyaltyPoints ?? 0, color: "#d97706", bg: "rgba(217,119,6,0.07)" }] : []),
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
              <label style={{ fontSize: 11, fontWeight: 700, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>{restaurant ? "Waiter" : "Assigned Staff"}</label>
              <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}
                style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box" }}>
                <option value="">{restaurant ? "No waiter" : "Any available staff"}</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>{restaurant ? "Order Notes" : "Sale Notes"}</label>
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
                  placeholder={businessType.bookings ? "Search services & products…" : `Search ${businessType.productsLabel.toLowerCase()}…`}
                  style={{ width: "100%", height: 38, padding: "0 34px", borderRadius: 10, border: "1.5px solid #e8e8f4", fontSize: 13, color: "#1d1d2f", outline: "none", background: "#fafafe", boxSizing: "border-box" }} />
                {catalogSearch && (
                  <button type="button" onClick={() => setCatalogSearch("")}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={13} color="#9999b0" />
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#b0b0c8", flexShrink: 0 }}>
                {shownItems.length} item{shownItems.length !== 1 ? "s" : ""}
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

            {/* Tab switcher — only a business with services has anything to switch between */}
            {businessType.bookings && <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
              {([
                { id: "all",      label: "All Items", icon: Sparkles },
                { id: "services", label: "Services",  icon: Scissors },
                { id: "products", label: businessType.productsLabel, icon: Package  },
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
            </div>}

            {/* Section filter — locked to the active dashboard section when one is
                set (no picker needed, only that section is valid here); shown as
                an interactive picker otherwise, only once something is tagged. */}
            {getActiveSection() !== "all" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Lock size={11} color="#EA580C" />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#EA580C" }}>Showing {getActiveSection()} + unassigned catalog</span>
              </div>
            ) : businessType.sections && [...services, ...inventory].some(x => x.section) && (
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

          {/* Menu tabs — restaurant mode, once items have menu sections */}
          {menuCategories.length > 0 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", padding: "10px 16px 0", flexShrink: 0 }}>
              {["all", ...menuCategories].map(c => {
                const active = menuTab === c;
                return (
                  <button key={c} type="button" onClick={() => setMenuTab(c)} aria-pressed={active}
                    style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${active ? "#1d1d2f" : "#e8e8f4"}`, background: active ? "#1d1d2f" : "#fff", color: active ? "#fff" : "#5a5a78", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {c === "all" ? "All" : c}
                  </button>
                );
              })}
            </div>
          )}

          {/* Grid */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px" }}>
            {shownItems.length === 0 ? (
              <div style={{ padding: "80px 24px", textAlign: "center" }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "#f4f4fc", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Package size={28} color="#d0d0e8" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#b0b0c8" }}>No items found</div>
                <div style={{ fontSize: 12, color: "#c8c8d8", marginTop: 6, lineHeight: 1.6 }}>
                  {!businessType.bookings
                    ? `Give ${businessType.productsLabel.toLowerCase()} items a selling price to sell them here`
                    : catalogTab === "products"
                    ? "Set retail prices on inventory items to sell them here"
                    : "Add active services to display them in the catalog"}
                </div>
              </div>
            ) : (
              <div className="pos-catalog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}>
                {shownItems.map(item => {
                  const inCartQty = cart.filter(e => e.itemId === item.id).reduce((n, e) => n + e.qty, 0);
                  const inCart  = inCartQty > 0 ? { qty: inCartQty } : undefined;
                  const hasOptions = optionGroupsFor(item).length > 0;
                  const sizeRange = sizePriceRange(item);
                  const { fg, bg } = catColor(item.category, item.type);
                  // A restaurant sells made-to-order dishes, so stock doesn't gate
                  // them — the 86 list (kitchen display) does.
                  const outOfStock = restaurant
                    ? !!item.unavailable
                    : item.type === "product" && (item.stock ?? 999) === 0;
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

                        {/* Photo, falling back to the category icon */}
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, border: `1px solid ${fg}20`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, overflow: "hidden" }}>
                          {item.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : item.type === "service" ? <Scissors size={16} color={fg} /> : <Package size={16} color={fg} />}
                        </div>

                        {/* Name */}
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1d1d2f", marginBottom: 4, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {item.name}
                        </div>

                        {/* Price */}
                        <div style={{ fontSize: 15, fontWeight: 900, color: fg, marginBottom: 5 }}>
                          {sizeRange
                            ? (sizeRange[0] === sizeRange[1] ? pkr(sizeRange[0]) : `from ${pkr(sizeRange[0])}`)
                            : item.variablePrice
                            ? (item.priceRangeMin && item.priceRangeMax ? `${pkr(item.priceRangeMin)}–${pkr(item.priceRangeMax)}` : "Varies")
                            : pkr(item.price)}
                        </div>

                        {/* Badges */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <span style={{ padding: "2px 7px", borderRadius: 20, background: fg + "15", fontSize: 9, fontWeight: 800, color: fg, textTransform: "capitalize", letterSpacing: "0.03em" }}>
                            {item.type === "service" ? item.category : item.menuCategory || (businessType.bookings ? "product" : item.category)}
                          </span>
                          {hasOptions && (
                            <span style={{ padding: "2px 7px", borderRadius: 20, background: "#eff6ff", fontSize: 9, fontWeight: 800, color: "#1d4ed8" }}>Options</span>
                          )}
                          {restaurant ? (item.unavailable && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: "#dc2626" }}>86&apos;d</span>
                          )) : item.type === "product" && item.stock !== undefined && (
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
              {restaurant && activeOrder ? orderRef(activeOrder, diningTables) : "Cart"}
              {totalQty > 0 && (
                <span style={{ marginLeft: 8, background: "#EA580C", color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "2px 7px" }}>
                  {totalQty}
                </span>
              )}
            </span>
            {cart.length > 0 && !cart.some(e => e.firedAt) && (
              <button type="button" onClick={() => setCart([])}
                style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #fee2e2", borderRadius: 8, background: "#fff5f5", cursor: "pointer", padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#ef4444" }}>
                <Trash2 size={11} /> Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="pos-cart-lines" style={{ flex: cart.length === 0 ? 1 : "1 1 auto", minHeight: cart.length === 0 ? 0 : 96, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
            {cart.length === 0 ? (
              <div className="pos-cart-empty" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 16px", textAlign: "center" }}>
                <div className="pos-cart-empty-icon" style={{ width: 64, height: 64, borderRadius: 18, background: "#f4f4fc", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <ShoppingCart size={28} color="#d0d0e8" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#b0b0c8" }}>Your cart is empty</div>
                <div style={{ fontSize: 12, color: "#c8c8d8", marginTop: 6, lineHeight: 1.6, maxWidth: 180 }}>
                  {businessType.bookings ? "Click any service or product from the catalog to add it" : `Tap anything on the ${businessType.productsLabel.toLowerCase()} to add it`}
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
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1d1d2f", lineHeight: 1.3 }}>
                            {entry.name}
                            {entry.firedAt && (
                              <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "#059669", background: "#ecfdf5", borderRadius: 20, padding: "1px 7px", verticalAlign: "middle" }}>SENT</span>
                            )}
                          </div>
                          {entry.modifiers && entry.modifiers.length > 0 && (
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8", marginTop: 3, lineHeight: 1.4 }}>{modifierSummary(entry.modifiers)}</div>
                          )}
                          {!entry.firedAt && optionGroupsFor(catalogItems.find(i => i.id === entry.itemId) ?? inventoryCatalogItem(entry.itemId)).length > 0 && (
                            <button type="button" onClick={() => editEntryOptions(entry)}
                              style={{ marginTop: 3, border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#1d4ed8", textDecoration: "underline" }}>
                              Change options
                            </button>
                          )}
                          {restaurant && (entry.firedAt ? (
                            entry.note ? <div style={{ fontSize: 11, color: "#b45309", marginTop: 3 }}>» {entry.note}</div> : null
                          ) : noteFor === entry.cartId ? (
                            <input autoFocus value={entry.note ?? ""} onChange={e => setEntryNote(entry.cartId, e.target.value)}
                              onBlur={() => setNoteFor(null)} onKeyDown={e => { if (e.key === "Enter") setNoteFor(null); }}
                              placeholder="Kitchen note — no onions, extra spicy…" aria-label={`Kitchen note for ${entry.name}`}
                              style={{ marginTop: 5, width: "100%", fontSize: 11, padding: "5px 8px", borderRadius: 7, border: "1px solid #fcd34d", outline: "none", background: "#fffbeb", boxSizing: "border-box" }} />
                          ) : (
                            <button type="button" onClick={() => setNoteFor(entry.cartId)}
                              style={{ marginTop: 4, border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, color: entry.note ? "#b45309" : "#b0b0c8", display: "flex", alignItems: "center", gap: 4, textAlign: "left" }}>
                              <StickyNote size={11} /> {entry.note || "Add note"}
                            </button>
                          ))}
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
                        <button type="button" onClick={() => removeEntry(entry)}
                          title={entry.firedAt ? "Void — needs a manager" : "Remove"}
                          style={{ border: "none", background: entry.firedAt ? "#fef2f2" : "#f8f4ff", borderRadius: 6, cursor: "pointer", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <X size={12} color="#9999b0" />
                        </button>
                      </div>

                      {/* Qty + total row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {/* Qty controls */}
                        <div style={{ display: "flex", alignItems: "center", background: "#fff", border: "1.5px solid #e8e8f4", borderRadius: 10, overflow: "hidden" }}>
                          <button type="button" onClick={() => updateQty(entry.cartId, -1)} disabled={!!entry.firedAt}
                            style={{ opacity: entry.firedAt ? 0.35 : 1, width: 34, height: 34, border: "none", background: entry.qty === 1 ? "#fff5f5" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.1s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = entry.qty === 1 ? "#fee2e2" : "#f5f4ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = entry.qty === 1 ? "#fff5f5" : "#fff")}
                          >
                            {entry.qty === 1 ? <Trash2 size={12} color="#ef4444" /> : <Minus size={12} color="#EA580C" />}
                          </button>
                          <div style={{ width: 36, textAlign: "center", fontSize: 14, fontWeight: 900, color: "#1d1d2f" }}>{entry.qty}</div>
                          <button type="button" onClick={() => updateQty(entry.cartId, 1)} disabled={!!entry.firedAt}
                            style={{ opacity: entry.firedAt ? 0.35 : 1, width: 34, height: 34, border: "none", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
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
                  {posRules.staffDiscountRate > 0 && (
                    <button type="button" aria-pressed={staffDiscountOn}
                      onClick={() => {
                        if (staffDiscountOn) { setStaffDiscountOn(false); setDiscount(0); return; }
                        setStaffDiscountOn(true); setDiscType("pct"); setDiscount(posRules.staffDiscountRate);
                        setSaleNotes(n => n.includes("Staff discount") ? n : [n.trim(), "Staff discount"].filter(Boolean).join(" · "));
                      }}
                      title="Apply the staff discount set in Settings → POS Rules"
                      style={{ padding: "3px 8px", borderRadius: 7, border: `1px solid ${staffDiscountOn ? "#7c3aed" : "#e8e8f4"}`, background: staffDiscountOn ? "#f5f3ff" : "#fff", color: staffDiscountOn ? "#6d28d9" : "#8a8aa6", fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Staff {posRules.staffDiscountRate}%
                    </button>
                  )}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="number" min={0} value={discount || ""} onChange={e => { setDiscount(parseDiscountValue(e.target.value)); setStaffDiscountOn(false); }}
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

                {/* 2nd discount row — stacks on top of the discount above (e.g. a separate promo/staff discount).
                    Tucked behind a link until needed: the cart footer has to fit a laptop screen. */}
                {!showDiscount2 && discount2 === 0 ? (
                  <button type="button" onClick={() => setShowDiscount2(true)}
                    style={{ marginTop: 4, border: "none", background: "none", padding: "2px 4px", fontSize: 11, fontWeight: 700, color: "#8a8aa6", cursor: "pointer" }}>
                    + Second discount
                  </button>
                ) : (
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
                )}

                {discountAmount2 > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#059669", marginTop: 4, fontWeight: 700, padding: "0 4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Tag size={11} />Discount 2 applied</span>
                    <span>− {pkr(discountAmount2)}</span>
                  </div>
                )}

                {/* Loyalty redemption row */}
                {loyaltyActive(loyaltySettings) && selectedClient?.id && availableLoyaltyPts > 0 && (
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

                {serviceChargeAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4a4a6a", marginTop: 8, fontWeight: 700, padding: "0 4px" }}>
                    <span>Service charge ({chargeSettings.serviceChargeRate}%)</span>
                    <span>+ {pkr(serviceChargeAmount)}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4a4a6a", marginTop: 4, fontWeight: 700, padding: "0 4px" }}>
                    <span>{chargeSettings.taxLabel} ({chargeSettings.taxRate}%)</span>
                    <span>+ {pkr(taxAmount)}</span>
                  </div>
                )}
              </div>

              {restaurant && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
                  <button type="button" onClick={() => saveCurrentOrder(false)} disabled={sendingOrder}
                    title="Save the order without sending it to the kitchen"
                    style={{ height: 42, borderRadius: 11, border: "1.5px solid #e8e8f4", background: "#fff", color: "#5a5a78", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <Pause size={14} /> Hold
                  </button>
                  <button type="button" onClick={() => saveCurrentOrder(true)} disabled={sendingOrder || !cart.some(e => !e.firedAt)}
                    style={{ height: 42, borderRadius: 11, border: "none", background: cart.some(e => !e.firedAt) ? "#1d1d2f" : "#e8e8f0", color: cart.some(e => !e.firedAt) ? "#fff" : "#aaaabc", fontSize: 12, fontWeight: 800, cursor: cart.some(e => !e.firedAt) ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <Send size={14} /> {sendingOrder ? "Sending…" : "Send to kitchen"}
                  </button>
                </div>
              )}

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
                <div style={{ display: "flex", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ flex: 1, fontSize: 10, fontWeight: 800, color: "#9999b0", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Method</span>
                  <button type="button" aria-pressed={split}
                    onClick={() => {
                      if (split) { setSplit(false); setSplitRows([]); return; }
                      setSplit(true); setIsCredit(false);
                      setSplitRows([{ method: payMethod ?? "cash", amount: "" }, { method: payMethod === "card" ? "cash" : "card", amount: "" }]);
                    }}
                    style={{ border: "none", background: "none", padding: 0, fontSize: 11, fontWeight: 800, color: split ? "#EA580C" : "#8a8aa6", cursor: "pointer", textDecoration: "underline" }}>
                    {split ? "Single payment" : "Split payment"}
                  </button>
                </div>
                {split ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {splitRows.map((row, index) => {
                      const others = splitRows.reduce((sum, r2, i) => i === index ? sum : sum + (Number(r2.amount) || 0), 0);
                      return (
                        <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 96px 58px 26px", gap: 5, alignItems: "center" }}>
                          <select value={row.method} aria-label={`Payment ${index + 1} method`}
                            onChange={e => setSplitRows(rows => rows.map((x, i) => i === index ? { ...x, method: e.target.value as PaymentMethod } : x))}
                            style={{ height: 34, borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, padding: "0 6px", background: "#fff", fontWeight: 700, color: "#1d1d2f" }}>
                            {PAY_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                          </select>
                          <input type="number" min={0} value={row.amount} placeholder="0" aria-label={`Payment ${index + 1} amount`}
                            onChange={e => setSplitRows(rows => rows.map((x, i) => i === index ? { ...x, amount: e.target.value } : x))}
                            style={{ height: 34, padding: "0 8px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, textAlign: "right", fontWeight: 700, boxSizing: "border-box", width: "100%" }} />
                          <button type="button" onClick={() => setSplitRows(rows => rows.map((x, i) => i === index ? { ...x, amount: String(Math.max(0, total - others)) } : x))}
                            title="Put the rest of the bill on this payment"
                            style={{ height: 34, borderRadius: 8, border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Rest</button>
                          <button type="button" onClick={() => setSplitRows(rows => rows.filter((_, i) => i !== index))} disabled={splitRows.length <= 2} aria-label="Remove payment"
                            style={{ height: 26, width: 26, borderRadius: 7, border: "none", background: splitRows.length <= 2 ? "transparent" : "#fef2f2", cursor: splitRows.length <= 2 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: splitRows.length <= 2 ? 0.3 : 1 }}>
                            <X size={12} color="#dc2626" />
                          </button>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", fontSize: 11, fontWeight: 700 }}>
                      <button type="button" onClick={() => setSplitRows(rows => [...rows, { method: "cash", amount: "" }])}
                        style={{ border: "none", background: "none", padding: 0, color: "#6b6b8a", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>+ Add payment</button>
                      <span style={{ marginLeft: "auto", color: Math.round(splitSum) === total ? "#059669" : "#d97706" }}>
                        {Math.round(splitSum) === total ? "Adds up" : `${pkr(Math.abs(total - splitSum))} ${splitSum < total ? "left" : "over"}`}
                      </span>
                    </div>
                  </div>
                ) : (
                <div className="pos-pay-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
                  {PAY_METHODS.map(pm => {
                    const Icon = pm.icon;
                    const sel = payMethod === pm.value;
                    return (
                      <button key={pm.value} type="button" onClick={() => setPayMethod(pm.value)}
                        style={{ height: 34, padding: "0 6px", borderRadius: 9, border: `2px solid ${sel ? pm.color : "#e8e8f4"}`, background: sel ? pm.bg : "#fafafe", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 0.12s", minWidth: 0 }}>
                        <Icon size={13} color={sel ? pm.color : "#b0b0c8"} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: sel ? pm.color : "#9999b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
                )}
                {!split && payMethod === "cash" && !isCredit && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input type="number" min={0} value={cashGiven} onChange={e => setCashGiven(e.target.value)} placeholder="Cash received" aria-label="Cash received"
                      style={{ flex: 1, height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid #e8e8f4", fontSize: 12, fontWeight: 700, boxSizing: "border-box" }} />
                    {cashChange !== null && (
                      <span style={{ fontSize: 13, fontWeight: 900, color: cashChange < 0 ? "#dc2626" : "#059669", whiteSpace: "nowrap" }}>
                        {cashChange < 0 ? `${pkr(-cashChange)} short` : `Change ${pkr(cashChange)}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Pay Later toggle */}
              {!split && <button
                type="button"
                onClick={() => setIsCredit(c => !c)}
                style={{
                  width: "100%", padding: "7px 0", borderRadius: 10, marginBottom: 8,
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
              </button>}

              {hasUnpricedVariable && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#d97706" }}>
                  <AlertCircle size={13} /> Enter a price for the variable-priced item(s) before checkout
                </div>
              )}
              {!hasUnpricedVariable && noPaymentSelected && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#d97706" }}>
                  <AlertCircle size={13} /> {splitProblem ?? "Choose how they're paying"}
                </div>
              )}
              {shiftBlocked && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#b91c1c" }}>
                  <AlertCircle size={13} /> Open the cash drawer on the <Link href="/dashboard/shifts" style={{ color: "#b91c1c" }}>Shifts</Link> page before taking payment
                </div>
              )}
              {discountNeedsSignOff && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#6d28d9" }}>
                  <AlertCircle size={13} /> A {Math.round(discountPct)}% discount needs a manager to approve it
                </div>
              )}
              {/* Complete button */}
              <button type="button" onClick={() => completeSale()} disabled={completing || hasUnpricedVariable || noPaymentSelected || shiftBlocked}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 13, border: "none",
                  background: (completing || hasUnpricedVariable || noPaymentSelected || shiftBlocked) ? "#e8e8f0" : isCredit ? "linear-gradient(135deg,#d97706,#f59e0b)" : "linear-gradient(135deg,#9A3412,#F97316)",
                  color: (completing || hasUnpricedVariable || noPaymentSelected || shiftBlocked) ? "#aaaabc" : "#fff",
                  fontSize: 15, fontWeight: 900, cursor: (completing || hasUnpricedVariable || noPaymentSelected || shiftBlocked) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                  boxShadow: (completing || hasUnpricedVariable || noPaymentSelected || shiftBlocked) ? "none" : isCredit ? "0 5px 20px rgba(217,119,6,0.40)" : "0 5px 20px rgba(154,52,18,0.42)",
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
          {businessType.bookings ? <Scissors size={18} /> : <Package size={18} />}
          {businessType.bookings ? "Catalog" : businessType.productsLabel}
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
      {/* Order confirmations ("#12 sent to bar", "on hold", "pick a table") as a toast every screen size can see. */}
      {restaurant && orderNotice && (
        <div role="status" aria-live="polite" className="pos-toast"
          style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 450, display: "flex", alignItems: "center", gap: 8, background: "#1d1d2f", color: "#fff", borderRadius: 14, padding: "12px 18px", fontSize: 13, fontWeight: 700, boxShadow: "0 12px 32px rgba(0,0,0,0.25)", maxWidth: "calc(100vw - 32px)" }}>
          <ChefHat size={15} color="#fdba74" /> {orderNotice}
          <button type="button" onClick={() => setOrderNotice(null)} aria-label="Dismiss" style={{ border: "none", background: "none", color: "#9999b0", cursor: "pointer", display: "flex", padding: 0, marginLeft: 4 }}><X size={14} /></button>
        </div>
      )}
      {kotTickets && <KotPrint tickets={kotTickets} onClose={() => setKotTickets(null)} />}
      {askDiscountApproval && (
        <ManagerApproval
          title={`Approve a ${Math.round(discountPct)}% discount?`}
          detail={`${pkr(approvableDiscount)} off a ${pkr(rawSubtotal)} bill — over the ${posRules.discountApprovalOver}% a cashier can give.`}
          confirmLabel="Approve & complete sale"
          onClose={() => setAskDiscountApproval(false)}
          onApproved={(approval) => { setAskDiscountApproval(false); return completeSale(approval); }}
        />
      )}
      {customizing && (
        <CustomizeSheet
          name={customizing.item.name}
          basePrice={customizing.item.price}
          groups={customizing.groups}
          initial={customizing.initial}
          initialQty={customizing.qty}
          initialNote={customizing.note}
          editing={!!customizing.cartId}
          noteLabel={restaurant ? undefined : "Note"}
          money={pkr}
          onConfirm={confirmCustomizing}
          onClose={() => setCustomizing(null)}
        />
      )}
      {voidFor && (
        <ManagerApproval
          title={`Void ${voidFor.qty} × ${voidFor.name}?`}
          detail="The kitchen already has this item. It will show as void on the kitchen display and come off the bill."
          confirmLabel="Void item"
          onClose={() => setVoidFor(null)}
          onApproved={(approval) => approveVoid(voidFor, approval)}
        />
      )}
      {showOpenOrders && (
        <div onClick={() => setShowOpenOrders(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,15,30,.45)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, height: "100%", background: "#fff", padding: 20, overflowY: "auto", boxShadow: "-10px 0 40px rgba(0,0,0,.15)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
              <div style={{ flex: 1, fontSize: 16, fontWeight: 900, color: "#1d1d2f" }}>Open orders</div>
              <button type="button" onClick={() => setShowOpenOrders(false)} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: "#9999b0" }}><X size={18} /></button>
            </div>
            {cart.length > 0 && !activeOrder && (
              <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", borderRadius: 9, padding: "8px 10px", marginBottom: 10 }}>
                The current cart isn&apos;t saved — Hold it first, or opening another order will replace it.
              </div>
            )}
            {openOrders.length === 0 && <div style={{ fontSize: 13, color: "#9999b0" }}>No open orders.</div>}
            {openOrders.map(o => (
              <button key={o.id} type="button" onClick={() => loadOrder(o)}
                style={{ width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 12, border: `1.5px solid ${o.id === activeOrder?.id ? "#EA580C" : "#ececf4"}`, background: "#fff", marginBottom: 8, cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#1d1d2f", flex: 1 }}>{orderRef(o, diningTables)}</span>
                </div>
                <div style={{ fontSize: 11, color: "#9999b0", marginTop: 3 }}>
                  {ORDER_TYPE_LABEL[o.type]} · {o.lines.filter(l => !l.voided).length} items · {pkr(orderSubtotal(o))}
                  {o.lines.some(l => !l.voided && !l.firedAt) ? " · not all sent" : ""}
                  {o.waiterName ? ` · ${o.waiterName}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
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
