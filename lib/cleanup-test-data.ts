"use client";

import { recordDeletions, persistEntity } from "@/lib/turso-sync";
import { getInvoices, saveInvoices } from "@/lib/invoices";
import { getPurchaseOrders, getSuppliers, saveSuppliers, getMovements } from "@/lib/stock";
import { entityStorageKey } from "@/lib/sync-records";

/**
 * Ensures test data (SI-2026-0001..0003, PO-0001, TEST-Supplier, associated stock movements)
 * is purged locally and tombstoned so sync will never restore it on any device.
 */
export async function purgeTestDataLocally(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const targetInvoiceNumbers = new Set(["SI-2026-0001", "SI-2026-0002", "SI-2026-0003"]);
    const invoices = getInvoices();
    const badInvoices = invoices.filter((inv) => targetInvoiceNumbers.has(inv.number) || targetInvoiceNumbers.has(inv.id));
    if (badInvoices.length > 0) {
      const badIds = badInvoices.map((i) => i.id);
      await recordDeletions("invoices", badIds);
      saveInvoices(invoices.filter((inv) => !targetInvoiceNumbers.has(inv.number) && !targetInvoiceNumbers.has(inv.id)));
    }

    const pos = getPurchaseOrders();
    const badPOs = pos.filter((po) => po.number === "PO-0001" || po.id === "PO-0001");
    if (badPOs.length > 0) {
      const badIds = badPOs.map((p) => p.id);
      await recordDeletions("purchase_orders", badIds);
      const updatedPOs = pos.filter((po) => po.number !== "PO-0001" && po.id !== "PO-0001");
      localStorage.setItem(entityStorageKey("purchase_orders"), JSON.stringify(updatedPOs));
    }

    const suppliers = getSuppliers();
    const badSuppliers = suppliers.filter((s) => s.name.trim().toLowerCase() === "test-supplier" || s.id.trim().toLowerCase() === "test-supplier");
    if (badSuppliers.length > 0) {
      const badIds = badSuppliers.map((s) => s.id);
      await saveSuppliers(suppliers.filter((s) => s.name.trim().toLowerCase() !== "test-supplier" && s.id.trim().toLowerCase() !== "test-supplier"), badIds);
    }

    const testRefs = new Set(["SI-2026-0001", "SI-2026-0002", "SI-2026-0003", "PO-0001"]);
    const movements = getMovements();
    const badMovements = movements.filter((m) => (m.ref && testRefs.has(m.ref)) || (m.refId && testRefs.has(m.refId)));
    if (badMovements.length > 0) {
      const badIds = badMovements.map((m) => m.id);
      const remaining = movements.filter((m) => (!m.ref || !testRefs.has(m.ref)) && (!m.refId || !testRefs.has(m.refId)));
      await persistEntity("stock_movements", remaining, { inferDeletes: false, deletedIds: badIds });
    }
  } catch (err) {
    console.error("[cleanup-test-data] Error purging local test data:", err);
  }
}
