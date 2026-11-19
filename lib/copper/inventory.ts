// How many of each product color are on the shelf, and when the next shipment
// lands (Product Bible Section 10). Stock changes, so check_availability reads
// it fresh every time instead of remembering it.
// This is the only file that knows where stock is kept, so swapping the JSON
// file for something else later means changing only readInventory().
import data from "./data/inventory.json";
import { store } from "@/lib/copper/refunds/store";

/** One row of stock, named like the database columns it will come from. */
export type InventoryRow = {
  sku: string;
  product: string;
  color: string;
  units_in_stock: number;
  next_shipment: string;
};

/** Every stock row, or `null` when stock can't be read right now. */
export async function readInventory(): Promise<InventoryRow[] | null> {
  // Units that came back with approved device refunds are on the shelf again.
  const restocked = store().restocked;
  return structuredClone(data.inventory).map((row) => ({
    ...row,
    units_in_stock: row.units_in_stock + (restocked[row.sku] ?? 0),
  }));
}
