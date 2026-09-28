#!/usr/bin/env node
/**
 * scripts/cleanup-test-data.mjs
 *
 * Purges test data from Turso database (business_data table):
 *  - Invoices: SI-2026-0001, SI-2026-0002, SI-2026-0003
 *  - Purchase Orders: PO-0001
 *  - Suppliers: TEST-Supplier
 *  - Stock movements & wastage history
 *
 * Appends tombstones for all deleted records to deleted_records entity
 * so sync points drop them permanently and prevent resurrection.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (!process.env.TURSO_DATABASE_URL) {
  console.log("TURSO_DATABASE_URL is not set. Skipping remote database cleanup script execution.");
  process.exit(0);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  console.log("Connecting to Turso DB to clean test data...");
  const rowsRes = await db.execute("SELECT entity, data FROM business_data");
  if (rowsRes.rows.length === 0) {
    console.log("No business_data rows found.");
    return;
  }

  const now = new Date().toISOString();
  let totalPurgedInvoices = 0;
  let totalPurgedPOs = 0;
  let totalPurgedSuppliers = 0;
  let totalPurgedMovements = 0;

  // Group business_data rows by key / entity
  const tableData = new Map();
  for (const row of rowsRes.rows) {
    const entityKey = String(row.entity);
    let items = [];
    try {
      items = JSON.parse(String(row.data) || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
    tableData.set(entityKey, items);
  }

  // Determine base keys/namespaces present in business_data (e.g. "user_loc_invoices" or "invoices")
  const entityTypes = ["invoices", "purchase_orders", "suppliers", "stock_movements", "deleted_records"];

  // Process each business_data entry
  for (const [entityKey, items] of tableData.entries()) {
    const isInvoiceKey = entityKey.endsWith("invoices") || entityKey === "invoices";
    const isPOKey = entityKey.endsWith("purchase_orders") || entityKey === "purchase_orders";
    const isSupplierKey = entityKey.endsWith("suppliers") || entityKey === "suppliers";
    const isMovementKey = entityKey.endsWith("stock_movements") || entityKey === "stock_movements";

    if (!isInvoiceKey && !isPOKey && !isSupplierKey && !isMovementKey) continue;

    // Determine corresponding deleted_records key for this prefix
    let prefix = "";
    if (entityKey.includes(":")) {
      prefix = entityKey.substring(0, entityKey.lastIndexOf(":") + 1);
    }
    const deletedKey = `${prefix}deleted_records`;
    let tombstones = tableData.get(deletedKey) || [];

    const purgedIds = [];

    if (isInvoiceKey) {
      const targetNumbers = new Set(["SI-2026-0001", "SI-2026-0002", "SI-2026-0003"]);
      const remaining = items.filter((inv) => {
        const num = String(inv.number || "").trim();
        const id = String(inv.id || "").trim();
        const match = targetNumbers.has(num) || targetNumbers.has(id);
        if (match) {
          purgedIds.push({ id, entity: "invoices" });
          totalPurgedInvoices++;
          return false;
        }
        return true;
      });
      tableData.set(entityKey, remaining);
    }

    if (isPOKey) {
      const targetNumbers = new Set(["PO-0001"]);
      const remaining = items.filter((po) => {
        const num = String(po.number || "").trim();
        const id = String(po.id || "").trim();
        const match = targetNumbers.has(num) || targetNumbers.has(id);
        if (match) {
          purgedIds.push({ id, entity: "purchase_orders" });
          totalPurgedPOs++;
          return false;
        }
        return true;
      });
      tableData.set(entityKey, remaining);
    }

    if (isSupplierKey) {
      const remaining = items.filter((sup) => {
        const name = String(sup.name || "").trim().toLowerCase();
        const id = String(sup.id || "").trim().toLowerCase();
        const match = name === "test-supplier" || id === "test-supplier";
        if (match) {
          purgedIds.push({ id: sup.id, entity: "suppliers" });
          totalPurgedSuppliers++;
          return false;
        }
        return true;
      });
      tableData.set(entityKey, remaining);
    }

    if (isMovementKey) {
      const testRefs = new Set(["SI-2026-0001", "SI-2026-0002", "SI-2026-0003", "PO-0001"]);
      const remaining = items.filter((mv) => {
        const ref = String(mv.ref || "").trim();
        const refId = String(mv.refId || "").trim();
        const match = testRefs.has(ref) || testRefs.has(refId);
        if (match) {
          purgedIds.push({ id: mv.id, entity: "stock_movements" });
          totalPurgedMovements++;
          return false;
        }
        return true;
      });
      tableData.set(entityKey, remaining);
    }

    // Append tombstones
    if (purgedIds.length > 0) {
      const existingTombstoneIds = new Set(tombstones.map((t) => `${t.id}:${t.entity}`));
      for (const p of purgedIds) {
        if (!existingTombstoneIds.has(`${p.id}:${p.entity}`)) {
          tombstones.push({ id: p.id, entity: p.entity, deletedAt: now });
        }
      }
      tableData.set(deletedKey, tombstones);
    }
  }

  // Write updated rows back to Turso
  for (const [entityKey, items] of tableData.entries()) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO business_data (entity, data, updated_at) VALUES (?, ?, ?)",
      args: [entityKey, JSON.stringify(items), now],
    });
  }

  console.log(`Cleanup completed!
  - Invoices purged: ${totalPurgedInvoices}
  - Purchase Orders purged: ${totalPurgedPOs}
  - Suppliers purged: ${totalPurgedSuppliers}
  - Stock movements purged: ${totalPurgedMovements}
  - Tombstones written to business_data table.`);
}

main().catch((err) => {
  console.error("Error cleaning test data:", err);
  process.exit(1);
});
