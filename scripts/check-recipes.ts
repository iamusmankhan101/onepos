/**
 * Self-check for recipe deduction and costing (lib/stock.ts).
 * Run (the symlink resolves the "@/" import alias):
 *   npx tsc scripts/check-recipes.ts --outDir /tmp/rc --rootDir . --module commonjs --target es2022 --esModuleInterop --skipLibCheck --noCheck \
 *     && mkdir -p /tmp/rc/node_modules && ln -sfn /tmp/rc /tmp/rc/node_modules/@ && node /tmp/rc/scripts/check-recipes.js
 */
import assert from "node:assert/strict";
import { lineCost, saleChanges } from "../lib/stock";
import { SIZE_GROUP_ID } from "../lib/menu";
import type { InventoryItem } from "../lib/types";

const ing = (id: string, unit: InventoryItem["unit"], costPrice: number): InventoryItem =>
  ({ id, name: id, brand: "", category: "food", unit, currentStock: 100, minStock: 0, costPrice });

const items: InventoryItem[] = [
  ing("patty", "pcs", 120), ing("bun", "pcs", 30), ing("lettuce", "kg", 400),
  ing("paste", "kg", 600), ing("garlic", "kg", 800), ing("dough", "kg", 200), ing("cheese", "kg", 2000),
  // Burger: 1 patty, 1 bun, 20 g lettuce at 10% prep loss.
  { ...ing("burger", "pcs", 0), retailPrice: 650, recipe: [
    { itemId: "patty", qty: 1, unit: "pcs" }, { itemId: "bun", qty: 1, unit: "pcs" }, { itemId: "lettuce", qty: 20, unit: "g", waste: 10 },
  ] },
  // Sauce sub-recipe: one batch makes 2 kg.
  { ...ing("sauce", "kg", 0), recipeYield: 2, recipe: [{ itemId: "paste", qty: 500, unit: "g" }, { itemId: "garlic", qty: 30, unit: "g" }] },
  // Pizza: per-size recipes, each using 100 g of sauce.
  { ...ing("pizza", "pcs", 0), recipe: [{ itemId: "dough", qty: 180, unit: "g" }], sizes: [
    { id: "s", name: "Small", price: 900, recipe: [{ itemId: "dough", qty: 180, unit: "g" }, { itemId: "sauce", qty: 100, unit: "g" }] },
    { id: "l", name: "Large", price: 1800, recipe: [{ itemId: "dough", qty: 350, unit: "g" }, { itemId: "cheese", qty: 220, unit: "g" }, { itemId: "sauce", qty: 100, unit: "g" }] },
  ] },
];
const by = (changes: { itemId: string; qty: number }[]) => Object.fromEntries(changes.map((c) => [c.itemId, c.qty]));
const size = (optionId: string) => [{ groupId: SIZE_GROUP_ID, group: "Size", optionId, name: optionId, price: 0 }];

// 10 burgers: −10 patties, −10 buns, −220 g lettuce (200 g + 10%).
assert.deepEqual(by(saleChanges([{ itemId: "burger", qty: 10 }], items, [])), { patty: -10, bun: -10, lettuce: -0.22 });
// Burger cost: 120 + 30 + 0.022 kg × 400 = 158.8.
assert.equal(Math.round(lineCost({ itemId: "burger" }, items, []) * 100) / 100, 158.8);

// 1 large pizza: its own recipe, sauce through the 2 kg batch (100 g = 1/20 of it).
assert.deepEqual(by(saleChanges([{ itemId: "pizza", qty: 1, modifiers: size("l") }], items, [])),
  { dough: -0.35, cheese: -0.22, paste: -0.025, garlic: -0.0015 });
// A small one uses the small recipe.
assert.deepEqual(by(saleChanges([{ itemId: "pizza", qty: 2, modifiers: size("s") }], items, [])),
  { dough: -0.36, paste: -0.05, garlic: -0.003 });

console.log("recipe checks passed");
