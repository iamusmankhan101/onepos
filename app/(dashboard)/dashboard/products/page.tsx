"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { getStoredInventory, saveInventory, subscribeToStoredData } from "@/lib/storage";
import { settingsStore } from "@/lib/settings-store";
import { sanitizeForLink } from "@/lib/whatsapp-link";
import type { InventoryItem, InventoryCategory, InventoryUnit } from "@/lib/types";
import { getSectionOptions, getActiveSection, inSection, defaultSectionForNewRecord } from "@/lib/sections";
import MobilePageHeader from "@/components/mobile-page-header";
import PageTitle from "@/components/page-title";
import {
  Search, X, Plus, AlertTriangle, Package, ChevronDown,
  Edit2, Trash2, Bell, Copy, CheckCircle, TrendingDown,
  MessageCircle, DollarSign, Tag, ToggleLeft, ToggleRight,
  Upload, Download, FileSpreadsheet, Check, Image as ImageIcon,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<InventoryCategory, { label: string; color: string; bg: string }> = {
  "general":     { label: "General",     color: "#EA580C", bg: "#FFEDD5" },
  "food":        { label: "Food",        color: "#059669", bg: "#ecfdf5" },
  "drinks":      { label: "Drinks",      color: "#0369a1", bg: "#e0f2fe" },
  "apparel":     { label: "Apparel",     color: "#db2777", bg: "#fdf2f8" },
  "electronics": { label: "Electronics", color: "#4f46e5", bg: "#eef2ff" },
  "supplies":    { label: "Supplies",    color: "#d97706", bg: "#fffbeb" },
  "tools":       { label: "Tools",       color: "#0f766e", bg: "#f0fdfa" },
  "other":       { label: "Other",       color: "#6b7280", bg: "#f9fafb" },
};

const UNITS: InventoryUnit[]      = ["pcs", "pack", "box", "kg", "g", "l", "ml", "bottle"];
const CATEGORIES = Object.keys(CATEGORY_CONFIG) as InventoryCategory[];

import { fmtCurrency as fmt } from "@/lib/format";
const fmtV = (n: number) => {
  const currency = settingsStore.business.currency || "PKR";
  return n >= 1_000_000 ? `${currency} ${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${currency} ${Math.round(n / 1_000)}K`
    : fmt(n);
};

function priceLabel(item: InventoryItem): string | undefined {
  if (item.variablePrice && item.priceRangeMin && item.priceRangeMax) {
    const currency = settingsStore.business.currency || "PKR";
    return `${currency} ${Math.round(item.priceRangeMin).toLocaleString("en-PK")} - ${Math.round(item.priceRangeMax).toLocaleString("en-PK")}`;
  }
  return item.retailPrice ? fmt(item.retailPrice) : undefined;
}

/** Category config for an item, tolerating a value that is no longer in the list. */
function catOf(item: InventoryItem) {
  return CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.other;
}

function stockStatus(item: InventoryItem): "out" | "low" | "ok" {
  if (item.currentStock === 0)              return "out";
  if (item.currentStock <= item.minStock)   return "low";
  return "ok";
}

const STATUS_BADGE = {
  out: { label: "Out of Stock", color: "#dc2626", bg: "#fef2f2" },
  low: { label: "Low Stock",    color: "#d97706", bg: "#fffbeb" },
  ok:  { label: "In Stock",     color: "#059669", bg: "#ecfdf5" },
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #e8e8f0", fontSize: 13, color: "#1a1a2e",
  outline: "none", background: "#fff",
};

const IMAGE_MAX_EDGE = 512;   // px on the longest side after downscaling
const IMAGE_MAX_INPUT = 8 * 1024 * 1024;

/**
 * Read a picked image into a small data URL: downscaled to IMAGE_MAX_EDGE and
 * re-encoded as JPEG. The whole catalogue is one JSON blob in localStorage and
 * one row in the database, so a raw 4 MB phone photo per product would blow
 * both — this lands each one at roughly 30-60 KB.
 */
function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("That file is not an image."));
    if (file.size > IMAGE_MAX_INPUT)     return reject(new Error("That image is too large — pick one under 8 MB."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Could not process that image."));
        // White behind transparency — the result is JPEG, which has no alpha.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

/** Square product thumbnail, falling back to the category icon. */
function ProductThumb({ item, size = 38 }: { item: InventoryItem; size?: number }) {
  const cat = catOf(item);
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.26), background: cat.bg,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden",
    }}>
      {item.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <Package size={Math.round(size * 0.45)} color={cat.color} />}
    </div>
  );
}

/** The configured currency code, for price field labels. */
function cur() {
  return (settingsStore.business.currency as string) || "PKR";
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "#9898b0", marginTop: -2 }}>{hint}</div>}
      {children}
    </div>
  );
}

// ── Item Form (shared by Add + Edit modals) ───────────────────────────────────
type ItemForm = {
  name: string; brand: string; category: InventoryCategory | "";
  section: string;
  unit: InventoryUnit; currentStock: string; minStock: string;
  costPrice: string; retailPrice: string; supplier: string; notes: string;
  barcode: string; image: string;
  variablePrice: boolean; priceRangeMin: string; priceRangeMax: string;
};

const EMPTY_FORM: ItemForm = {
  name: "", brand: "", category: "", section: "", unit: "pcs",
  currentStock: "", minStock: "", costPrice: "",
  retailPrice: "", barcode: "", image: "", supplier: "", notes: "",
  variablePrice: false, priceRangeMin: "", priceRangeMax: "",
};

function itemToForm(item: InventoryItem): ItemForm {
  return {
    name: item.name, brand: item.brand, category: item.category,
    section: item.section ?? defaultSectionForNewRecord(),
    unit: item.unit,
    currentStock: String(item.currentStock), minStock: String(item.minStock),
    costPrice: String(item.costPrice), retailPrice: item.retailPrice ? String(item.retailPrice) : "",
    barcode: item.barcode ?? "", image: item.image ?? "", supplier: item.supplier ?? "", notes: item.notes ?? "",
    variablePrice: item.variablePrice ?? false,
    priceRangeMin: item.priceRangeMin ? String(item.priceRangeMin) : "",
    priceRangeMax: item.priceRangeMax ? String(item.priceRangeMax) : "",
  };
}

function formToItem(form: ItemForm, existing?: InventoryItem): InventoryItem {
  return {
    id: existing?.id ?? "i_" + Date.now(),
    name: form.name, brand: form.brand,
    category: form.category as InventoryCategory,
    section: form.section || undefined,
    unit: form.unit,
    currentStock: Number(form.currentStock),
    minStock: Number(form.minStock),
    costPrice: Number(form.costPrice),
    retailPrice: form.variablePrice
      ? (form.priceRangeMin ? Number(form.priceRangeMin) : undefined)
      : (form.retailPrice ? Number(form.retailPrice) : undefined),
    variablePrice: form.variablePrice,
    priceRangeMin: form.variablePrice && form.priceRangeMin ? Number(form.priceRangeMin) : undefined,
    priceRangeMax: form.variablePrice && form.priceRangeMax ? Number(form.priceRangeMax) : undefined,
    barcode: form.barcode.trim() || undefined,
    image: form.image || undefined,
    supplier: form.supplier || undefined,
    notes: form.notes || undefined,
    lastRestocked: existing?.lastRestocked ?? new Date().toLocaleDateString("en-CA"),
  };
}

function ItemFormFields({ form, set, items }: { form: ItemForm; set: (k: keyof ItemForm, v: string | boolean) => void; items: InventoryItem[] }) {
  const [imageError, setImageError] = useState("");
  const [reading, setReading] = useState(false);

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    setReading(true);
    try {
      set("image", await readImageAsDataUrl(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setReading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Photo" hint="Optional. Shown on the POS tile and in this list.">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 14, border: "1px solid #e8e8f0", background: "#faf9fb",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0,
          }}>
            {form.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={form.image} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <ImageIcon size={20} color="#c8c8d8" />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9,
              border: "1px solid #e3e0eb", background: "#fff", fontSize: 12, fontWeight: 700,
              color: "#6b6b8a", cursor: reading ? "default" : "pointer", width: "fit-content",
            }}>
              <Upload size={13} /> {reading ? "Processing…" : form.image ? "Replace photo" : "Upload photo"}
              <input type="file" accept="image/*" onChange={pickImage} disabled={reading} style={{ display: "none" }} />
            </label>
            {form.image && (
              <button type="button" onClick={() => { set("image", ""); setImageError(""); }}
                style={{ border: "none", background: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "#dc2626", cursor: "pointer", width: "fit-content" }}>
                Remove photo
              </button>
            )}
          </div>
        </div>
        {imageError && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>{imageError}</div>}
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Product Name *"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 500ml Water Bottle" style={INP} /></Field>
        <Field label="Brand"><input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Nestle" style={INP} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Category *">
          <select value={form.category} onChange={(e) => set("category", e.target.value)} style={INP}>
            <option value="">Select…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
          </select>
        </Field>
        <Field label="Unit *">
          <select value={form.unit} onChange={(e) => set("unit", e.target.value)} style={INP}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Section">
        <select value={form.section} onChange={(e) => set("section", e.target.value)} style={INP}>
          <option value="">Unassigned</option>
          {getSectionOptions(items).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Current Stock *"><input type="number" min="0" value={form.currentStock} onChange={(e) => set("currentStock", e.target.value)} placeholder="0" style={INP} /></Field>
        <Field label="Min Stock (alert threshold) *"><input type="number" min="0" value={form.minStock} onChange={(e) => set("minStock", e.target.value)} placeholder="0" style={INP} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={`Cost Price (${cur()}) *`}><input type="number" min="0" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} placeholder="0" style={INP} /></Field>
        {!form.variablePrice && (
          <Field
            label={`Selling Price (${cur()})`}
            hint={form.retailPrice ? "Shown in the POS." : "Leave empty to track stock only — it won't appear in the POS."}
          >
            <input type="number" min="0" value={form.retailPrice} onChange={(e) => set("retailPrice", e.target.value)} placeholder="0" style={INP} />
          </Field>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={form.variablePrice} onChange={(e) => set("variablePrice", e.target.checked)}
          style={{ width: 14, height: 14, accentColor: "#EA580C", cursor: "pointer" }} />
        <span style={{ fontSize: 12, color: "#6b6b8a", fontWeight: 500 }}>Price is not fixed (varies per unit/batch)</span>
      </label>
      {form.variablePrice && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={`Min Price (${cur()}) *`}><input type="number" min="0" value={form.priceRangeMin} onChange={(e) => set("priceRangeMin", e.target.value)} placeholder="e.g. 500" style={INP} /></Field>
          <Field label={`Max Price (${cur()}) *`}><input type="number" min="0" value={form.priceRangeMax} onChange={(e) => set("priceRangeMax", e.target.value)} placeholder="e.g. 1500" style={INP} /></Field>
        </div>
      )}
      <Field label="Product Barcode / SKU">
        <input value={form.barcode} onChange={(e) => set("barcode", e.target.value.trim())} placeholder="Scan or enter barcode" style={INP} inputMode="numeric" />
      </Field>
      <Field label="Supplier"><input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="e.g. Metro Cash & Carry" style={INP} /></Field>
      <Field label="Notes"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any notes…" rows={2} style={{ ...INP, resize: "none", lineHeight: 1.5 }} /></Field>
    </div>
  );
}

function priceFieldsValid(form: ItemForm): boolean {
  if (!form.variablePrice) return true;
  const min = Number(form.priceRangeMin);
  const max = Number(form.priceRangeMax);
  return Boolean(form.priceRangeMin && form.priceRangeMax && min > 0 && max >= min);
}

// ── Import / Export ────────────────────────────────────────────────────────────
const PRODUCT_EXPORT_COLS = [
  "Item ID", "Name", "Brand", "Category", "Section", "Unit", "Current Stock", "Min Stock",
  "Cost Price", "Variable Price", "Retail Price", "Min Price", "Max Price", "Barcode", "Supplier", "Last Restocked", "Notes",
];

type ProductImportRecord = { item: InventoryItem; mode: "add" | "update" };
type ProductImportResult = { added: number; updated: number; skipped: number; errors: string[] };

function parseBool(value: unknown): boolean {
  return ["true", "yes", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeCategory(value: unknown): InventoryCategory {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return (CATEGORIES as string[]).includes(raw) ? (raw as InventoryCategory) : "general";
}

function normalizeUnit(value: unknown): InventoryUnit {
  const raw = String(value ?? "").trim().toLowerCase();
  return (UNITS as string[]).includes(raw) ? (raw as InventoryUnit) : "pcs";
}

function itemsToRows(list: InventoryItem[]) {
  return list.map((item) => ({
    "Item ID": item.id,
    "Name": item.name,
    "Brand": item.brand,
    "Category": item.category,
    "Section": item.section ?? "",
    "Unit": item.unit,
    "Current Stock": item.currentStock,
    "Min Stock": item.minStock,
    "Cost Price": item.costPrice,
    "Variable Price": item.variablePrice ? "Yes" : "No",
    "Retail Price": item.variablePrice ? "" : (item.retailPrice ?? ""),
    "Min Price": item.variablePrice ? (item.priceRangeMin ?? "") : "",
    "Max Price": item.variablePrice ? (item.priceRangeMax ?? "") : "",
    "Barcode": item.barcode ?? "",
    "Supplier": item.supplier ?? "",
    "Last Restocked": item.lastRestocked ?? "",
    "Notes": item.notes ?? "",
  }));
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportProducts(list: InventoryItem[], format: "xlsx" | "csv") {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(itemsToRows(list), { header: PRODUCT_EXPORT_COLS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const date = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `products-${date}.csv`);
  } else {
    XLSX.writeFile(wb, `products-${date}.xlsx`);
  }
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ProductImportModal({ existing, onClose, onImport }: {
  existing: InventoryItem[];
  onClose: () => void;
  onImport: (records: ProductImportRecord[]) => ProductImportResult;
}) {
  const [step, setStep] = useState<"pick" | "preview" | "done">("pick");
  const [parsed, setParsed] = useState<ProductImportRecord[]>([]);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setError("");
    setLoading(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rows.length === 0) {
        setError("File is empty or unreadable.");
        setLoading(false);
        return;
      }

      const byId = new Map(existing.map((i) => [i.id, i]));
      const byBarcode = new Map(existing.filter((i) => i.barcode).map((i) => [i.barcode!.trim(), i]));
      const byNameBrand = new Map(existing.map((i) => [`${i.name.trim().toLowerCase()}|${i.brand.trim().toLowerCase()}`, i]));
      const records: ProductImportRecord[] = [];
      const usedIds = new Set(existing.map((i) => i.id));

      for (const row of rows) {
        const name = String(row["Name"] ?? row["name"] ?? "").trim();
        if (!name) continue;
        const brand = String(row["Brand"] ?? row["brand"] ?? "").trim();

        const rawId = String(row["Item ID"] ?? row["ID"] ?? row["id"] ?? "").trim();
        const barcode = String(row["Barcode"] ?? row["barcode"] ?? row["SKU"] ?? "").trim();
        const nameBrandKey = `${name.toLowerCase()}|${brand.toLowerCase()}`;
        const existingItem = (rawId && byId.get(rawId)) || (barcode && byBarcode.get(barcode)) || byNameBrand.get(nameBrandKey);
        const id = existingItem?.id ?? (rawId || `inv_imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        if (!existingItem && usedIds.has(id)) continue;
        usedIds.add(id);

        const variablePrice = parseBool(row["Variable Price"] ?? row["Variable"]);
        const priceRangeMin = Number(row["Min Price"] ?? row["Price Range Min"] ?? "");
        const priceRangeMax = Number(row["Max Price"] ?? row["Price Range Max"] ?? "");
        const retailPriceRaw = Number(row["Retail Price"] ?? row["Price"] ?? "");
        const currentStock = Number(row["Current Stock"] ?? row["Stock"] ?? "");
        const minStock = Number(row["Min Stock"] ?? "");
        const costPrice = Number(row["Cost Price"] ?? row["Cost"] ?? "");

        records.push({
          mode: existingItem ? "update" : "add",
          item: {
            id,
            name,
            brand: brand || existingItem?.brand || "",
            category: normalizeCategory(row["Category"] ?? row["category"]),
            section: String(row["Section"] ?? row["section"] ?? "").trim()
              || defaultSectionForNewRecord()
              || undefined,
            unit: normalizeUnit(row["Unit"] ?? row["unit"]),
            currentStock: Number.isFinite(currentStock) ? currentStock : (existingItem?.currentStock ?? 0),
            minStock: Number.isFinite(minStock) ? minStock : (existingItem?.minStock ?? 0),
            costPrice: Number.isFinite(costPrice) ? costPrice : (existingItem?.costPrice ?? 0),
            retailPrice: variablePrice
              ? (Number.isFinite(priceRangeMin) && priceRangeMin > 0 ? priceRangeMin : undefined)
              : (Number.isFinite(retailPriceRaw) && retailPriceRaw > 0 ? retailPriceRaw : existingItem?.retailPrice),
            variablePrice,
            priceRangeMin: variablePrice && Number.isFinite(priceRangeMin) ? priceRangeMin : undefined,
            priceRangeMax: variablePrice && Number.isFinite(priceRangeMax) ? priceRangeMax : undefined,
            barcode: barcode || existingItem?.barcode || undefined,
            // Photos aren't a spreadsheet column — carry the existing one over
            // so re-importing a sheet never silently strips product images.
            image: existingItem?.image,
            supplier: String(row["Supplier"] ?? row["supplier"] ?? "").trim() || existingItem?.supplier,
            notes: String(row["Notes"] ?? row["notes"] ?? "").trim() || existingItem?.notes,
            lastRestocked: String(row["Last Restocked"] ?? "").trim() || existingItem?.lastRestocked || new Date().toLocaleDateString("en-CA"),
          },
        });
      }

      setParsed(records);
      setStep("preview");
    } catch (e) {
      setError(`Could not read file: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sample = [{
      "Item ID": "",
      "Name": "500ml Water Bottle",
      "Brand": "Nestle",
      "Category": "general",
      "Section": "",
      "Unit": "pcs",
      "Current Stock": 24,
      "Min Stock": 5,
      "Cost Price": 850,
      "Variable Price": "No",
      "Retail Price": 1500,
      "Min Price": "",
      "Max Price": "",
      "Barcode": "8901234567890",
      "Supplier": "Metro Cash & Carry",
      "Last Restocked": "",
      "Notes": "",
    }];
    const ws = XLSX.utils.json_to_sheet(sample, { header: PRODUCT_EXPORT_COLS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products Template");
    XLSX.writeFile(wb, "products-import-template.xlsx");
  }

  function confirmImport() {
    const importResult = onImport(parsed);
    setResult(importResult);
    setStep("done");
  }

  const addCount = parsed.filter((record) => record.mode === "add").length;
  const updateCount = parsed.filter((record) => record.mode === "update").length;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 540, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#9A3412,#F97316)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>Import Products</div>
              <div style={{ fontSize: 11, color: "#9898b0" }}>XLSX or CSV file</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={18} color="#9898b0" /></button>
        </div>

        {step === "pick" && (
          <>
            <label style={{ display: "block", border: "2px dashed #fed7aa", borderRadius: 14, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: "#faf9ff" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <Upload size={28} color="#EA580C" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "#9A3412", marginBottom: 4 }}>Click to choose file or drag & drop</div>
              <div style={{ fontSize: 12, color: "#9898b0" }}>Supports .xlsx, .xls, .csv</div>
            </label>
            {loading && <div style={{ textAlign: "center", marginTop: 16, color: "#EA580C", fontSize: 13, fontWeight: 600 }}>Reading file...</div>}
            {error && <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 13, color: "#dc2626" }}>{error}</div>}

            <div style={{ marginTop: 18, padding: "14px 16px", background: "#fff7ed", borderRadius: 12, fontSize: 12, color: "#9A3412", lineHeight: 1.8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <strong style={{ fontSize: 12 }}>Column format</strong>
                <button onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "1px solid #fdba74", background: "#fff", fontSize: 11, fontWeight: 700, color: "#9A3412", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <Download size={12} /> Download Template
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px", fontSize: 11 }}>
                {[
                  ["Name", "Required"], ["Brand", "Optional"], ["Category", CATEGORIES.join(" / ")], ["Unit", UNITS.join(" / ")],
                  ["Current Stock", "Number"], ["Min Stock", "Alert threshold"], ["Cost Price", "Number"], ["Barcode", "Used to match existing items"],
                ].map(([col, hint]) => <div key={col}><strong>{col}</strong>: {hint}</div>)}
              </div>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ padding: "14px 16px", background: "#f8f7ff", border: "1px solid #fed7aa", borderRadius: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>{parsed.length} item{parsed.length === 1 ? "" : "s"} ready</div>
              <div style={{ fontSize: 12, color: "#6b6b8a", marginTop: 4 }}>{addCount} new, {updateCount} update{updateCount === 1 ? "" : "s"}</div>
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #f0f0f8", borderRadius: 12 }}>
              {parsed.slice(0, 8).map((record) => (
                <div key={record.item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f8f8fc" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e" }}>{record.item.name}</div>
                    <div style={{ fontSize: 11, color: "#9898b0" }}>{record.item.brand || "—"} · {(CATEGORY_CONFIG[record.item.category] ?? CATEGORY_CONFIG.other).label} · {record.item.currentStock} {record.item.unit}</div>
                  </div>
                  <span style={{ alignSelf: "center", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 8px", background: record.mode === "add" ? "#ecfdf5" : "#eff6ff", color: record.mode === "add" ? "#059669" : "#2563eb" }}>{record.mode === "add" ? "Add" : "Update"}</span>
                </div>
              ))}
              {parsed.length > 8 && <div style={{ padding: "10px 12px", fontSize: 12, color: "#9898b0" }}>+{parsed.length - 8} more</div>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setStep("pick")} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 700, color: "#6b6b8a", cursor: "pointer" }}>Back</button>
              <button onClick={confirmImport} disabled={parsed.length === 0} style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: parsed.length ? "#EA580C" : "#e8e8f0", fontSize: 13, fontWeight: 700, color: parsed.length ? "#fff" : "#b0b0c8", cursor: parsed.length ? "pointer" : "not-allowed" }}>Import Products</button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <div style={{ textAlign: "center", padding: "24px 8px 8px" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Check size={28} color="#059669" /></div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e", marginBottom: 6 }}>Import Complete</div>
            <div style={{ fontSize: 13, color: "#6b6b8a", marginBottom: 20 }}>{result.added} added, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped` : ""}.</div>
            <button onClick={onClose} style={{ padding: "10px 32px", borderRadius: 10, border: "none", background: "#EA580C", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Modal ─────────────────────────────────────────────────────────────────
function AddModal({ onClose, onAdd, items }: { onClose: () => void; onAdd: (item: InventoryItem) => void; items: InventoryItem[] }) {
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const listedInPos = Boolean(form.variablePrice ? form.priceRangeMin : form.retailPrice);
  const [done, setDone] = useState(false);
  const set = useCallback((k: keyof ItemForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v })), []);
  const canSubmit = form.name && form.category && form.currentStock && form.minStock && form.costPrice && priceFieldsValid(form);

  if (done) return (
    <Overlay onClose={onClose}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#1a1a2e", marginBottom: 6 }}>Product Added!</div>
        <div style={{ fontSize: 13, color: "#9898b0", marginBottom: 24 }}>
          {listedInPos
            ? "It's on sale in the POS now."
            : "Saved for stock tracking. Give it a selling price to put it in the POS."}
        </div>
        <button onClick={onClose} style={{ padding: "10px 32px", borderRadius: 10, background: "linear-gradient(135deg, #9A3412, #F97316)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <ModalHeader title="Add Product" onClose={onClose} />
      <div style={{ padding: "22px 24px" }}>
        <ItemFormFields form={form} set={set} items={items} />
        <div style={{ display: "flex", gap: 10, paddingTop: 18, marginTop: 6, borderTop: "1px solid #f0f0f8" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { if (canSubmit) { onAdd(formToItem(form)); setDone(true); } }} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: canSubmit ? "linear-gradient(135deg, #9A3412, #F97316)" : "#e8e8f0", fontSize: 13, fontWeight: 600, color: canSubmit ? "#fff" : "#b0b0c8", cursor: canSubmit ? "pointer" : "not-allowed" }}>
            Add Item
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ item, onClose, onSave, items }: { item: InventoryItem; onClose: () => void; onSave: (updated: InventoryItem) => void; items: InventoryItem[] }) {
  const [form, setForm] = useState<ItemForm>(() => itemToForm(item));
  const [saved, setSaved] = useState(false);
  const set = useCallback((k: keyof ItemForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v })), []);
  const canSubmit = form.name && form.category && form.currentStock && form.minStock && form.costPrice && priceFieldsValid(form);

  if (saved) return (
    <Overlay onClose={onClose}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#1a1a2e", marginBottom: 6 }}>Changes Saved!</div>
        <div style={{ fontSize: 13, color: "#9898b0", marginBottom: 24 }}>{item.name} has been updated.</div>
        <button onClick={onClose} style={{ padding: "10px 32px", borderRadius: 10, background: "linear-gradient(135deg, #9A3412, #F97316)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <ModalHeader title={`Edit — ${item.name}`} onClose={onClose} />
      <div style={{ padding: "22px 24px" }}>
        <ItemFormFields form={form} set={set} items={items} />
        <div style={{ display: "flex", gap: 10, paddingTop: 18, marginTop: 6, borderTop: "1px solid #f0f0f8" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}>Cancel</button>
          <button
            onClick={() => { if (canSubmit) { onSave(formToItem(form, item)); setSaved(true); } }}
            style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: canSubmit ? "linear-gradient(135deg, #9A3412, #F97316)" : "#e8e8f0", fontSize: 13, fontWeight: 600, color: canSubmit ? "#fff" : "#b0b0c8", cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ item, onClose, onDelete }: { item: InventoryItem; onClose: () => void; onDelete: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "32px 28px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Trash2 size={22} color="#dc2626" />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2e", marginBottom: 8 }}>Remove Product?</div>
        <div style={{ fontSize: 13, color: "#9898b0", marginBottom: 24, lineHeight: 1.6 }}>
          <strong style={{ color: "#1a1a2e" }}>{item.name}</strong> will be permanently removed from your catalogue.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#6b6b8a", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { onDelete(); onClose(); }} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "#dc2626", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Restock Reminder Modal ────────────────────────────────────────────────────
function ReminderModal({ alertItems, onClose }: { alertItems: InventoryItem[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const businessName = settingsStore.business.name as string;

  const message = [
    `*Restock list — ${businessName || "OnePOS"}*`,
    `Date: ${new Date().toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    ``,
    `The following items need restocking:`,
    ``,
    ...alertItems.map((item) => {
      const st = stockStatus(item);
      return `${st === "out" ? "[OUT]" : "[LOW]"} *${item.name}*${item.brand ? ` (${item.brand})` : ""}\n   Current: ${item.currentStock} ${item.unit} | Min: ${item.minStock} ${item.unit}${item.supplier ? `\n   Supplier: ${item.supplier}` : ""}`;
    }),
  ].join("\n");

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // No recipient in the link: WhatsApp asks which supplier to send it to.
  const openWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(sanitizeForLink(message))}`, "_blank");

  return (
    <Overlay onClose={onClose}>
      <ModalHeader title="Restock List" onClose={onClose} />
      <div style={{ padding: "20px 24px 24px" }}>
        <div style={{ fontSize: 13, color: "#6b6b8a", marginBottom: 14 }}>
          {alertItems.length} item{alertItems.length !== 1 ? "s" : ""} need restocking. Copy the list, or open WhatsApp and pick the supplier to send it to.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {alertItems.map((item) => {
            const st = stockStatus(item);
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: st === "out" ? "#fef2f2" : "#fffbeb", borderRadius: 10, border: `1px solid ${st === "out" ? "#fecaca" : "#fed7aa"}` }}>
                <AlertTriangle size={14} color={st === "out" ? "#dc2626" : "#d97706"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: "#9898b0" }}>{item.brand ? `${item.brand} · ` : ""}{item.currentStock}/{item.minStock} {item.unit}{item.supplier ? ` · ${item.supplier}` : ""}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: st === "out" ? "#dc2626" : "#d97706", background: st === "out" ? "#fef2f2" : "#fffbeb", padding: "2px 8px", borderRadius: 20, border: `1px solid ${st === "out" ? "#fecaca" : "#fed7aa"}` }}>
                  {st === "out" ? "Out" : "Low"}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ background: "#f8f8fc", border: "1px solid #e8e8f0", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#6b6b8a", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto", marginBottom: 18, lineHeight: 1.7 }}>
          {message}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={copyToClipboard}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", borderRadius: 10, border: "1px solid #e8e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: copied ? "#059669" : "#6b6b8a", cursor: "pointer" }}
          >
            {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
            {copied ? "Copied!" : "Copy list"}
          </button>
          <button
            onClick={openWhatsApp}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", borderRadius: 10, border: "none", background: "#25D366", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}
          >
            <MessageCircle size={14} /> Send on WhatsApp
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Shared modal helpers ──────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-sheet" style={{ background: "#fff", borderRadius: 20, width: 500, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2e" }}>{title}</div>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}><X size={18} color="#9898b0" /></button>
    </div>
  );
}

// ── Item Table Row ─────────────────────────────────────────────────────────────
function ItemRow({ item, isLast, onEdit, onDelete }: {
  item: InventoryItem; isLast: boolean;
  onEdit: () => void; onDelete: () => void;
}) {
  const status = stockStatus(item);
  const badge  = STATUS_BADGE[status];
  const cat    = catOf(item);
  const rowBg  = status === "out" ? "#fff0f0" : status === "low" ? "#fffbeb" : "transparent";
  const leftBorder = status === "out" ? "4px solid #dc2626" : status === "low" ? "4px solid #f59e0b" : "4px solid transparent";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "2.2fr 110px 130px 100px 130px 110px 90px",
      padding: "13px 20px",
      borderBottom: isLast ? "none" : "1px solid #f4f4f8",
      borderLeft: leftBorder,
      alignItems: "center",
      background: rowBg,
      transition: "background 0.15s",
    }}>
      {/* Photo + name + brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <ProductThumb item={item} size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 6 }}>
            {item.name}
            {status !== "ok" && <AlertTriangle size={12} color={badge.color} />}
          </div>
          <div style={{ fontSize: 11, color: "#9898b0", marginTop: 1 }}>
            {item.brand}{item.supplier ? ` · ${item.supplier}` : ""}
          </div>
        </div>
      </div>

      {/* Category */}
      <span style={{ fontSize: 11, fontWeight: 600, color: cat.color, background: cat.bg, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", width: "fit-content" }}>
        {cat.label}
      </span>

      {/* Stock */}
      <div>
        <span style={{ fontSize: 13, fontWeight: 700, color: status === "out" ? "#dc2626" : status === "low" ? "#d97706" : "#1a1a2e" }}>
          {item.currentStock} {item.unit}
        </span>
        <div style={{ fontSize: 10, color: "#b0b0c8", marginTop: 1 }}>
          Min: {item.minStock} {item.unit}
        </div>
      </div>

      {/* Last restocked */}
      <div style={{ fontSize: 11, color: "#9898b0" }}>
        {item.lastRestocked ? new Date(item.lastRestocked + "T12:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short" }) : "—"}
      </div>

      {/* Cost / retail */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{fmt(item.costPrice)}</div>
        {priceLabel(item) && <div style={{ fontSize: 10, color: "#9898b0" }}>Retail: {priceLabel(item)}</div>}
      </div>

      {/* Status badge */}
      <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", width: "fit-content" }}>
        {badge.label}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button type="button" onClick={onEdit} aria-label={`Edit product: ${item.name}`} title="Edit" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #e8e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Edit2 size={13} color="#EA580C" />
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete product: ${item.name}`} title="Delete" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={13} color="#dc2626" />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const [tab, setTab]                   = useState<"stock" | "retail">("stock");
  const [items, setItems]               = useState<InventoryItem[]>([]);
  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState<InventoryCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out" | "ok">("all");
  const [sectionFilter, setSectionFilter] = useState(() => getActiveSection());
  const [showFilters, setShowFilters]   = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [editItem, setEditItem]         = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem]     = useState<InventoryItem | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Deferred a tick: the catalogue lives in localStorage, readable only once
  // this has hydrated in the browser. Deep-link support comes along for the
  // ride — /dashboard/products?id=<itemId> opens straight into that product.
  useEffect(() => {
    queueMicrotask(() => {
      const stored = getStoredInventory();
      setItems(stored);
      const id = new URLSearchParams(window.location.search).get("id");
      const item = id ? stored.find((i) => i.id === id) : undefined;
      if (item) setEditItem(item);
    });
    // A sync from another device (or another tab) rewrites the same store.
    return subscribeToStoredData(() => setItems(getStoredInventory()));
  }, []);

  const persist = useCallback((updated: InventoryItem[]) => {
    setItems(updated);
    saveInventory(updated);
  }, []);

  const toggleRetail = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    persist(items.map(i => i.id === id
      ? { ...i, retailPrice: i.retailPrice ? undefined : (i.costPrice || 0) }
      : i
    ));
  }, [items, persist]);

  const handleImportProducts = useCallback((records: ProductImportRecord[]): ProductImportResult => {
    const byId = new Map(items.map((i) => [i.id, i]));
    let added = 0;
    let updated = 0;
    const skipped = 0;

    for (const record of records) {
      if (byId.has(record.item.id)) updated += 1;
      else added += 1;
      byId.set(record.item.id, record.item);
    }

    persist(Array.from(byId.values()));
    return { added, updated, skipped, errors: [] };
  }, [items, persist]);

  const retailItems = useMemo(() => items.filter(i => (i.retailPrice ?? 0) > 0), [items]);

  const totalValue = useMemo(() => items.reduce((s, i) => s + i.costPrice * i.currentStock, 0), [items]);
  const alertItems = useMemo(() => items.filter((i) => stockStatus(i) !== "ok"), [items]);
  const lowCount   = alertItems.filter((i) => stockStatus(i) === "low").length;
  const outCount   = alertItems.filter((i) => stockStatus(i) === "out").length;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (catFilter !== "all" && item.category !== catFilter) return false;
      if (statusFilter !== "all" && stockStatus(item) !== statusFilter) return false;
      if (!inSection(item, sectionFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          (item.barcode ?? "").toLowerCase().includes(q) ||
          (item.supplier ?? "").toLowerCase().includes(q) ||
          catOf(item).label.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, search, catFilter, statusFilter, sectionFilter]);

  const activeFilters = [catFilter !== "all", statusFilter !== "all", getActiveSection() === "all" && sectionFilter !== "all"].filter(Boolean).length;

  return (
    <div className="dashboard-polish" style={{ background: "#f4f5f7", minHeight: "100vh" }}>

      {/* ── Modals (shared) ── */}
      {showAdd    && <AddModal    onClose={() => setShowAdd(false)}    onAdd={(item) => persist([item, ...items])} items={items} />}
      {editItem   && <EditModal   item={editItem} onClose={() => setEditItem(null)} onSave={(updated) => persist(items.map((i) => i.id === updated.id ? updated : i))} items={items} />}
      {deleteItem && <DeleteModal item={deleteItem} onClose={() => setDeleteItem(null)} onDelete={() => persist(getStoredInventory().filter((i) => i.id !== deleteItem.id))} />}
      {showReminder && <ReminderModal alertItems={alertItems} onClose={() => setShowReminder(false)} />}
      {showImport && (
        <ProductImportModal
          existing={items}
          onClose={() => setShowImport(false)}
          onImport={handleImportProducts}
        />
      )}

      {/* ══════════ MOBILE LAYOUT ══════════ */}

      {/* Mobile app bar */}
      <MobilePageHeader
        title="Products"
        subtitle={tab === "stock"
          ? `${items.length} items · ${fmtV(totalValue)}`
          : `${retailItems.length} in POS`}
        action={{ label: "+ Add", onClick: () => setShowAdd(true) }}
      />

      {/* Mobile hero card */}
      {tab === "stock" && (
        <div className="mobile-hero-card mobile-only">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="mobile-hero-label">Stock Value</div>
              <div className="mobile-hero-value">{fmtV(totalValue)}</div>
              <div className="mobile-hero-sub">{items.length} item{items.length !== 1 ? "s" : ""} tracked</div>
            </div>
            {alertItems.length > 0 && !alertDismissed && (
              <button
                onClick={() => setShowReminder(true)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                <Bell size={12} />
                {alertItems.length} alert{alertItems.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 18 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, textTransform: "uppercase" }}>Low Stock</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: lowCount > 0 ? "#fde68a" : "rgba(255,255,255,0.9)" }}>{lowCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, textTransform: "uppercase" }}>Out of Stock</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: outCount > 0 ? "#fca5a5" : "rgba(255,255,255,0.9)" }}>{outCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, textTransform: "uppercase" }}>Categories</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.9)" }}>{CATEGORIES.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab bar */}
      <div className="mobile-tab-bar mobile-only">
        {([
          { id: "stock",  label: "Stock", icon: Package },
          { id: "retail", label: "Retail", icon: Tag },
        ] as { id: "stock" | "retail"; label: string; icon: React.ElementType }[]).map(t => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`mobile-tab-btn ${active ? "active" : ""}`}>
              <Icon size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 5 }} />
              {t.label}
              {t.id === "retail" && retailItems.length > 0 && (
                <span style={{ marginLeft: 5, background: active ? "rgba(255,255,255,0.25)" : "#EA580C", color: "#fff", borderRadius: 20, fontSize: 9, fontWeight: 800, padding: "1px 6px" }}>
                  {retailItems.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile stock tab */}
      {tab === "stock" && (
        <div className="mobile-only">
          {/* Alert banner */}
          {alertItems.length > 0 && !alertDismissed && (
            <div className="mobile-alert-banner" style={{ background: outCount > 0 ? "#fef2f2" : "#fffbeb", border: `1px solid ${outCount > 0 ? "#fecaca" : "#fde68a"}`, color: outCount > 0 ? "#dc2626" : "#d97706" }}>
              <AlertTriangle size={16} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {outCount > 0 ? `${outCount} out of stock` : ""}{outCount > 0 && lowCount > 0 ? ", " : ""}{lowCount > 0 ? `${lowCount} running low` : ""}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 1, opacity: 0.8 }}>Tap the bell for a restock list</div>
              </div>
              <button onClick={() => setShowReminder(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <Bell size={15} color={outCount > 0 ? "#dc2626" : "#d97706"} />
              </button>
              <button onClick={() => setAlertDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={14} color={outCount > 0 ? "#dc2626" : "#d97706"} />
              </button>
            </div>
          )}

          {/* Search */}
          <div className="mobile-search-bar">
            <Search size={16} color="#9898b0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, barcode, supplier…" />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={14} color="#9898b0" />
              </button>
            )}
          </div>

          {/* Category filter chips */}
          <div className="mobile-filter-row">
            <button type="button" className={`mobile-filter-chip ${catFilter === "all" ? "active" : ""}`} onClick={() => setCatFilter("all")}>All</button>
            {CATEGORIES.map(c => (
              <button key={c} type="button" className={`mobile-filter-chip ${catFilter === c ? "active" : ""}`} onClick={() => setCatFilter(c)}>
                {CATEGORY_CONFIG[c].label}
              </button>
            ))}
          </div>

          {/* Status filter chips */}
          <div className="mobile-filter-row" style={{ paddingTop: 0 }}>
            {(["all", "ok", "low", "out"] as const).map(s => (
              <button key={s} type="button" className={`mobile-filter-chip ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(s)}>
                {s === "all" ? "All Status" : s === "ok" ? "In Stock" : s === "low" ? "Low Stock" : "Out of Stock"}
              </button>
            ))}
          </div>

          {/* Item list */}
          {filtered.length === 0 ? (
            <div className="mobile-empty">
              <div className="mobile-empty-icon"><Package size={26} color="#c8c8e0" /></div>
              <div className="mobile-empty-title">{items.length === 0 ? "No products yet" : "No items match"}</div>
              <div className="mobile-empty-sub">
                {items.length === 0
                  ? "Tap + Add to add your first product."
                  : "Try adjusting your search or filters."}
              </div>
            </div>
          ) : (
            <div className="mobile-list">
              {filtered.map((item) => {
                const status = stockStatus(item);
                const badge  = STATUS_BADGE[status];
                const cat    = catOf(item);
                const maxStock = Math.max(item.minStock * 3, item.currentStock, 1);
                const stockPct = Math.min(100, Math.round((item.currentStock / maxStock) * 100));
                const barColor = status === "out" ? "#dc2626" : status === "low" ? "#d97706" : "#059669";
                return (
                  <div key={item.id} className="mobile-list-card" onClick={() => setEditItem(item)}
                    style={status !== "ok" ? { borderLeft: `4px solid ${badge.color}`, background: status === "out" ? "#fff0f0" : "#fffbeb" } : {}}
                  >
                    <div className="mobile-list-icon" style={{ background: cat.bg, overflow: "hidden", padding: 0 }}>
                      {item.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <Package size={17} color={cat.color} />}
                    </div>
                    <div className="mobile-list-body">
                      <div className="mobile-list-title">{item.name}</div>
                      <div className="mobile-list-sub">
                        {item.brand}{item.supplier ? ` · ${item.supplier}` : ""} · {fmt(item.costPrice)}
                      </div>
                      <div className="mobile-stock-bar-wrap">
                        <div className="mobile-stock-bar" style={{ width: `${stockPct}%`, background: barColor }} />
                      </div>
                    </div>
                    <div className="mobile-list-right">
                      <div className="mobile-list-amount" style={{ fontSize: 13, color: status === "out" ? "#dc2626" : status === "low" ? "#d97706" : "#1a1a2e" }}>
                        {item.currentStock} {item.unit}
                      </div>
                      <span className="mobile-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Count footer */}
          {filtered.length > 0 && (
            <div style={{ padding: "12px 16px 8px", textAlign: "center" }}>
              <span style={{ fontSize: 11, color: "#b0b0c8", fontWeight: 600 }}>
                {filtered.length} of {items.length} items · {fmtV(filtered.reduce((s, i) => s + i.costPrice * i.currentStock, 0))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mobile retail tab */}
      {tab === "retail" && (
        <div className="mobile-only">
          {/* Info banner */}
          <div className="mobile-alert-banner" style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
            <Tag size={15} color="#d97706" />
            <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
              Products with a retail price appear in the POS. Toggle to list or unlist one.
            </div>
          </div>

          {/* Retail stats scroll */}
          <div className="mobile-stat-scroll">
            {[
              { label: "In POS",    value: String(retailItems.length), color: "#EA580C" },
              { label: "Not Listed", value: String(items.filter(i => !(i.retailPrice ?? 0)).length), color: "#9898b0" },
              { label: "Low/Out",   value: String(retailItems.filter(i => i.currentStock <= i.minStock).length), color: "#dc2626" },
              { label: "Retail Value", value: fmtV(retailItems.reduce((s, i) => s + (i.retailPrice ?? 0) * i.currentStock, 0)), color: "#059669" },
            ].map(s => (
              <div key={s.label} className="mobile-stat-card">
                <div className="mobile-stat-card-label">{s.label}</div>
                <div className="mobile-stat-card-value" style={{ fontSize: s.value.length > 8 ? 13 : 18, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Retail list */}
          {items.length === 0 ? (
            <div className="mobile-empty">
              <div className="mobile-empty-icon"><Tag size={26} color="#c8c8e0" /></div>
              <div className="mobile-empty-title">No items yet</div>
              <div className="mobile-empty-sub">Add a product first, then switch it on for the POS.</div>
            </div>
          ) : (
            <div className="mobile-list">
              {items.map((item) => {
                const isRetail = (item.retailPrice ?? 0) > 0;
                const cat      = catOf(item);
                const isLow    = item.currentStock <= item.minStock;
                const margin   = isRetail && item.costPrice ? Math.round(((item.retailPrice! - item.costPrice) / item.retailPrice!) * 100) : null;
                return (
                  <div key={item.id} className="mobile-list-card">
                    <div className="mobile-list-icon" style={{ background: cat.bg, overflow: "hidden", padding: 0 }}>
                      {item.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <Package size={17} color={cat.color} />}
                    </div>
                    <div className="mobile-list-body">
                      <div className="mobile-list-title">{item.name}</div>
                      <div className="mobile-list-sub">
                        {item.brand} · {item.currentStock} {item.unit}{isLow ? " ⚠️" : ""}
                        {isRetail
                          ? ` · ${priceLabel(item)}${margin !== null ? ` (${margin}%)` : ""}`
                          : " · Not listed"}
                      </div>
                    </div>
                    <div className="mobile-list-right" style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => setEditItem(item)}
                        style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e8e8f0", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        <Edit2 size={13} color="#9898b0" />
                      </button>
                      <button type="button" onClick={() => toggleRetail(item.id)} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                        {isRetail ? <ToggleRight size={28} color="#EA580C" /> : <ToggleLeft size={28} color="#c8c8d8" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {items.length > 0 && (
            <div style={{ padding: "12px 16px 8px", textAlign: "center" }}>
              <span style={{ fontSize: 11, color: "#b0b0c8", fontWeight: 600 }}>
                {retailItems.length} of {items.length} items enabled for POS
              </span>
            </div>
          )}
        </div>
      )}

      {/* ══════════ DESKTOP LAYOUT ══════════ */}
      <div className="dash-page dashboard-polish desktop-only" style={{ background: "#ffffff", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 20 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <PageTitle
            icon={<Package size={24} />}
            title="Products"
            subtitle={
              <>
                {tab === "stock"
                  ? `${items.length} items · ${fmtV(totalValue)} total value`
                  : `${retailItems.length} products available in POS · ${items.filter(i => !(i.retailPrice ?? 0)).length} not listed`}
                {tab === "stock" && alertItems.length > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 750, background: outCount > 0 ? "#fef2f2" : "#fffbeb", color: outCount > 0 ? "#dc2626" : "#d97706", border: `1px solid ${outCount > 0 ? "#fecaca" : "#fed7aa"}`, borderRadius: 20, padding: "3px 10px", boxShadow: `0 2px 8px ${outCount > 0 ? "rgba(220,38,38,0.1)" : "rgba(217,119,6,0.1)"}` }}>
                    {alertItems.length} alert{alertItems.length !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            }
          />
          <div style={{ display: "flex", gap: 10 }}>
            {tab === "stock" && alertItems.length > 0 && (
              <button onClick={() => setShowReminder(true)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 12, border: "1px solid #fed7aa", background: "#fffbeb", fontSize: 13, fontWeight: 750, color: "#d97706", cursor: "pointer", transition: "all 0.15s" }}
                className="hover-bg-light"
              >
                <Bell size={14} /> Restock List
              </button>
            )}
            <button
              onClick={() => setShowImport(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid #e3e0eb", background: "#fff", fontSize: 13, fontWeight: 750, color: "#6b6b8a", cursor: "pointer", transition: "all 0.18s ease" }}
              className="hover-bg-light"
            >
              <Upload size={15} /> Import
            </button>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowExportMenu((open) => !open)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", fontSize: 13, fontWeight: 750, color: "#059669", cursor: "pointer", transition: "all 0.18s ease" }}
              >
                <Download size={15} /> Export <ChevronDown size={12} style={{ transform: showExportMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {showExportMenu && (
                <>
                  <div onClick={() => setShowExportMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 20, width: 188, background: "#fff", border: "1px solid #e8e8f0", borderRadius: 12, boxShadow: "0 12px 34px rgba(16, 24, 40, 0.12)", padding: 6 }}>
                    {[
                      { fmt: "xlsx" as const, label: "Excel (.xlsx)" },
                      { fmt: "csv" as const, label: "CSV (.csv)" },
                    ].map(({ fmt, label }) => (
                      <button key={fmt} onClick={() => { setShowExportMenu(false); exportProducts(filtered, fmt); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", border: "none", background: "transparent", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#1a1a2e", cursor: "pointer", textAlign: "left" }} className="hover-bg-light">
                        <FileSpreadsheet size={14} color="#059669" /> {label}
                      </button>
                    ))}
                    <div style={{ padding: "7px 10px 4px", fontSize: 10, color: "#9898b0", borderTop: "1px solid #f0f0f8", marginTop: 4 }}>Exports {filtered.length} visible items</div>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowAdd(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, border: "none", background: "var(--accent-gradient)", fontSize: 13, fontWeight: 750, color: "#fff", cursor: "pointer", boxShadow: "0 4px 14px var(--accent-glow)", transition: "all 0.18s ease" }}
              className="page-header-btn hover-scale"
            >
              <Plus size={16} /> Add Product
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid #e3e0eb", borderRadius: 14, padding: 5, width: "fit-content", boxShadow: "0 2px 8px rgba(0,0,0,0.01)" }}>
          {([
            { id: "stock",  label: "Stock", icon: Package },
            { id: "retail", label: "Sold in POS",  icon: Tag },
          ] as { id: "stock" | "retail"; label: string; icon: React.ElementType }[]).map(t => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 10, border: "none", background: active ? "var(--accent-gradient)" : "transparent", color: active ? "#fff" : "#6b6b8a", fontSize: 13, fontWeight: 750, cursor: "pointer", transition: "all 0.15s", boxShadow: active ? "0 3px 10px var(--accent-glow)" : "none" }}>
                <Icon size={14} />
                {t.label}
                {t.id === "retail" && retailItems.length > 0 && (
                  <span style={{ background: active ? "rgba(255,255,255,0.25)" : "rgba(234,88,12,0.1)", color: active ? "#fff" : "var(--accent)", borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "2px 8px", marginLeft: 4 }}>
                    {retailItems.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Sold in POS Tab ── */}
        {tab === "retail" && (
          <>
            <div style={{ padding: "12px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 8px rgba(217,119,6,0.05)" }}>
              <Tag size={16} color="#d97706" />
              Products with a <strong style={{ fontWeight: 800 }}>retail price</strong> appear in the POS for sale. Toggle the switch to list or unlist a product.
            </div>

            <div className="stats-grid-4">
              {[
                { label: "Listed in POS",   value: retailItems.length,  iconColor: "var(--accent)", bg: "rgba(234, 88, 12, 0.08)" },
                { label: "Not Listed",      value: items.filter(i => !(i.retailPrice ?? 0)).length, iconColor: "#6b6b8a", bg: "#f4f4f8" },
                { label: "Low/Out Stock",   value: retailItems.filter(i => i.currentStock <= i.minStock).length, iconColor: "#dc2626", bg: "#fef2f2" },
                { label: "Retail Value",    value: fmtV(retailItems.reduce((s, i) => s + (i.retailPrice ?? 0) * i.currentStock, 0)), iconColor: "#059669", bg: "#ecfdf5" },
              ].map(({ label, value, iconColor, bg }) => (
                <div key={label} style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(226,223,235,0.8)", padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Tag size={22} color={iconColor} />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 850, color: iconColor, lineHeight: 1.1 }}>{value}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="table-scroll-wrap" style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(226,223,235,.95)", boxShadow: "0 8px 28px rgba(75,40,20,.04)", overflow: "hidden" }}>
              <div className="table-scroll-inner">
                <div className="inv-table-inner" style={{ background: "#fff" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 110px 120px 110px 100px", padding: "12px 20px", background: "#faf9fd", borderBottom: "1px solid #f0f0f5", alignItems: "center" }}>
                    {["PRODUCT", "CATEGORY", "STOCK", "COST PRICE", "RETAIL PRICE", "MARGIN", "IN POS"].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 800, color: "#8e89a3", letterSpacing: "0.08em" }}>{h}</div>
                    ))}
                  </div>

                  {items.length === 0 ? (
                    <div style={{ padding: "56px 20px", textAlign: "center" }}>
                      <Package size={32} color="#e0e0f0" style={{ marginBottom: 12 }} />
                      <div style={{ fontSize: 14, color: "#b0b0c8", fontWeight: 600 }}>No products yet</div>
                      <div style={{ fontSize: 12, color: "#c8c8d8", marginTop: 4 }}>Add a product first, then switch it on for the POS</div>
                    </div>
                  ) : (
                    items.map((item, i) => {
                      const isRetail = (item.retailPrice ?? 0) > 0;
                      const margin   = isRetail && item.costPrice ? Math.round(((item.retailPrice! - item.costPrice) / item.retailPrice!) * 100) : null;
                      const isLow    = item.currentStock <= item.minStock;
                      const cat      = catOf(item);
                      return (
                        <div key={item.id}
                          className="hover-bg-row"
                          style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 110px 120px 110px 100px", padding: "14px 20px", borderBottom: i < items.length - 1 ? "1px solid #f8f8fc" : "none", alignItems: "center", background: isRetail ? "#fafffe" : "transparent", transition: "background 0.2s" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <ProductThumb item={item} size={38} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 750, color: "#1a1a2e", letterSpacing: "-0.01em" }}>{item.brand ? `${item.brand} ` : ""}{item.name}</div>
                              <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2, fontWeight: 500 }}>{item.unit}</div>
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 750, color: cat.color, background: cat.bg, borderRadius: 10, padding: "2px 8px", width: "fit-content", textTransform: "uppercase", letterSpacing: "0.03em" }}>{cat.label}</span>
                          <div style={{ fontSize: 13, fontWeight: 750, color: isLow ? "#dc2626" : "#1a1a2e" }}>
                            {item.currentStock} {item.unit}
                            {isLow && <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 800, marginTop: 2 }}>Low</div>}
                          </div>
                          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{item.costPrice ? fmt(item.costPrice) : "—"}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: isRetail ? "var(--accent)" : "#c8c8d8" }}>
                            {isRetail ? priceLabel(item) : <span style={{ fontSize: 11, color: "#c8c8d8", fontWeight: 600 }}>Not set</span>}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 750, color: margin !== null && margin > 0 ? "#059669" : "#c8c8d8" }}>
                            {margin !== null ? `${margin}%` : "—"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button onClick={() => toggleRetail(item.id)} title={isRetail ? "Remove from POS" : "Enable in POS"}
                              style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", transition: "transform 0.15s" }}
                              className="hover-scale"
                            >
                              {isRetail
                                ? <ToggleRight size={30} color="var(--accent)" />
                                : <ToggleLeft  size={30} color="#c8c8d8" />}
                            </button>
                            <button onClick={() => setEditItem(item)}
                              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e3e0eb", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s" }}
                              className="hover-bg-light"
                            >
                              <Edit2 size={13} color="#9898b0" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {items.length > 0 && (
                    <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f5", background: "#faf9fd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#9898b0", fontWeight: 600 }}>{retailItems.length} of {items.length} items enabled for POS</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>Retail value: {fmtV(retailItems.reduce((s, i) => s + (i.retailPrice ?? 0) * i.currentStock, 0))}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Stock Tab ── */}
        {tab === "stock" && <>
          <div className="stats-grid-4">
            {[
              { label: "Total Items",  value: items.length,     icon: Package,       iconColor: "var(--accent)", bg: "rgba(234, 88, 12, 0.08)", valColor: "var(--accent)" },
              { label: "Total Value",  value: fmtV(totalValue), icon: DollarSign,    iconColor: "#059669", bg: "#ecfdf5", valColor: "#059669", small: true },
              { label: "Low Stock",    value: lowCount,         icon: TrendingDown,  iconColor: "#d97706", bg: "#fffbeb", valColor: "#d97706" },
              { label: "Out of Stock", value: outCount,         icon: AlertTriangle, iconColor: "#dc2626", bg: "#fef2f2", valColor: "#dc2626" },
            ].map(({ label, value, icon: Icon, iconColor, bg, valColor, small }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(226,223,235,0.8)", padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={22} color={iconColor} />
                </div>
                <div>
                  <div style={{ fontSize: small ? 18 : 24, fontWeight: 850, color: valColor, lineHeight: 1.1 }}>{value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9898b0", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {alertItems.length > 0 && !alertDismissed && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #fed7aa", boxShadow: "0 8px 24px rgba(217,119,6,0.06)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "linear-gradient(135deg, #fffbeb, #fff7ed)", borderBottom: "1px solid #fed7aa" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(217,119,6,0.15)" }}>
                    <Bell size={18} color="#d97706" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.01em" }}>
                      Stock Alert — {outCount > 0 ? `${outCount} out of stock` : ""}{outCount > 0 && lowCount > 0 ? ", " : ""}{lowCount > 0 ? `${lowCount} running low` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#92400e", marginTop: 2, fontWeight: 500 }}>Restock these items to avoid service disruptions</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowReminder(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#25D366", fontSize: 13, fontWeight: 750, color: "#fff", cursor: "pointer", boxShadow: "0 4px 12px rgba(37,211,102,0.2)", transition: "transform 0.15s" }}
                    className="hover-scale"
                  >
                    <MessageCircle size={14} /> WhatsApp Reminder
                  </button>
                  <button
                    onClick={() => setAlertDismissed(true)}
                    style={{ background: "rgba(255,255,255,0.5)", border: "1px solid #fed7aa", borderRadius: 10, cursor: "pointer", padding: "8px", display: "flex", alignItems: "center", color: "#92400e", transition: "background 0.15s" }}
                    className="hover-bg-light"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="stats-grid-3" style={{ gap: 0 }}>
                {alertItems.slice(0, 6).map((item, i) => {
                  const st = stockStatus(item);
                  return (
                    <div
                      key={item.id}
                      style={{ padding: "14px 20px", borderRight: (i + 1) % 3 !== 0 ? "1px solid #fef3c7" : "none", borderBottom: i < 3 && alertItems.length > 3 ? "1px solid #fef3c7" : "none", display: "flex", alignItems: "center", gap: 12, transition: "background 0.15s" }}
                      className="hover-bg-light"
                    >
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: st === "out" ? "#dc2626" : "#d97706", flexShrink: 0, boxShadow: `0 0 0 3px ${st === "out" ? "#fef2f2" : "#fffbeb"}` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "#9898b0", marginTop: 2, fontWeight: 600 }}>{item.currentStock}/{item.minStock} {item.unit}</div>
                      </div>
                      <button onClick={() => setEditItem(item)} style={{ fontSize: 11, fontWeight: 750, color: "var(--accent)", background: "rgba(234, 88, 12, 0.06)", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.15s" }}>
                        Restock
                      </button>
                    </div>
                  );
                })}
              </div>
              {alertItems.length > 6 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid #fef3c7", fontSize: 13, color: "#92400e", textAlign: "center", fontWeight: 600 }}>
                  +{alertItems.length - 6} more items need attention —{" "}
                  <button onClick={() => setStatusFilter("low")} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: 0 }}>View all</button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e3e0eb", borderRadius: 12, padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.01)", transition: "border-color 0.15s" }}>
              <Search size={15} color="#b0b0c8" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, brand, or supplier…"
                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "#1a1a2e", background: "transparent" }}
              />
              {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} color="#b0b0c8" /></button>}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 12, border: `1px solid ${activeFilters > 0 ? "var(--accent-light)" : "#e3e0eb"}`, background: activeFilters > 0 ? "rgba(234, 88, 12, 0.04)" : "#fff", fontSize: 13, fontWeight: 750, color: activeFilters > 0 ? "var(--accent)" : "#6b6b8a", cursor: "pointer", transition: "all 0.15s" }}
              className="hover-bg-light"
            >
              Filters
              {activeFilters > 0 && (
                <span style={{ background: "var(--accent-gradient)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px var(--accent-glow)" }}>
                  {activeFilters}
                </span>
              )}
              <ChevronDown size={13} style={{ transform: showFilters ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
          </div>

          {showFilters && (
            <div style={{ background: "#fff", border: "1px solid rgba(226,223,235,.95)", borderRadius: 14, padding: "16px 20px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end", boxShadow: "0 8px 24px rgba(75,40,20,.03)" }}>
              {[
                {
                  label: "Category", value: catFilter,
                  onChange: (v: string) => setCatFilter(v as InventoryCategory | "all"),
                  options: [["all", "All Categories"], ...CATEGORIES.map((c) => [c, CATEGORY_CONFIG[c].label])] as [string, string][],
                },
                {
                  label: "Stock Status", value: statusFilter,
                  onChange: (v: string) => setStatusFilter(v as "all" | "low" | "out" | "ok"),
                  options: [["all", "All"], ["ok", "In Stock"], ["low", "Low Stock"], ["out", "Out of Stock"]] as [string, string][],
                },
                {
                  // Locked to the active dashboard section when one is set — the
                  // only way to see other sections' products is to switch the
                  // global "Active Section" control, not this filter.
                  label: "Section", value: sectionFilter,
                  onChange: (v: string) => setSectionFilter(v),
                  options: getActiveSection() !== "all"
                    ? [[getActiveSection(), `${getActiveSection()} (locked)`]] as [string, string][]
                    : [["all", "All Sections"], ...getSectionOptions(items).map((s) => [s, s])] as [string, string][],
                  locked: getActiveSection() !== "all",
                },
              ].map(({ label, value, onChange, options, locked }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
                  <select value={value} onChange={(e) => onChange(e.target.value)} disabled={locked} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e3e0eb", fontSize: 13, color: "#1a1a2e", outline: "none", background: locked ? "#faf9fd" : "#fff", cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.75 : 1 }}>
                    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
              {activeFilters > 0 && (
                <button onClick={() => { setCatFilter("all"); setStatusFilter("all"); if (getActiveSection() === "all") setSectionFilter("all"); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, fontWeight: 700, color: "#dc2626", cursor: "pointer", transition: "all 0.15s" }}>
                  Clear all
                </button>
              )}
            </div>
          )}

          <div className="table-scroll-wrap" style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(226,223,235,.95)", boxShadow: "0 8px 28px rgba(75,40,20,.04)", overflow: "hidden" }}>
            <div className="table-scroll-inner">
              <div className="inv-table-inner" style={{ background: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2.2fr 110px 130px 100px 130px 110px 90px", padding: "12px 20px", borderBottom: "1px solid #f0f0f5", background: "#faf9fd", alignItems: "center" }}>
                  {["ITEM", "CATEGORY", "STOCK", "RESTOCKED", "COST PRICE", "STATUS", "ACTIONS"].map((h) => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 800, color: "#8e89a3", letterSpacing: "0.08em" }}>{h}</div>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div style={{ padding: "56px 20px", textAlign: "center" }}>
                    <Package size={32} color="#e0e0f0" style={{ marginBottom: 12 }} />
                    <div style={{ fontSize: 14, color: "#b0b0c8", fontWeight: 600 }}>No items match your filters</div>
                    <div style={{ fontSize: 12, color: "#c8c8d8", marginTop: 4 }}>Try adjusting your search or filter</div>
                  </div>
                ) : (
                  filtered.map((item, i) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isLast={i === filtered.length - 1}
                      onEdit={() => setEditItem(item)}
                      onDelete={() => setDeleteItem(item)}
                    />
                  ))
                )}

                {filtered.length > 0 && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f5", background: "#faf9fd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#9898b0", fontWeight: 600 }}>
                      Showing {filtered.length} of {items.length} items
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>
                      Total value: {fmtV(filtered.reduce((s, i) => s + i.costPrice * i.currentStock, 0))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>}
      </div>{/* /desktop-only */}
    </div>
  );
}
