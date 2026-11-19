// update_availability: puts one unit back in stock. Code runs it, only after a
// device refund is approved (by the agent under the limit, or by an admin). It
// is never a tool the chat model can call.
import { store } from "@/lib/copper/refunds/store";

export function updateAvailability(sku: string): void {
  const restocked = store().restocked;
  restocked[sku] = (restocked[sku] ?? 0) + 1;
}
