// Where orders, refund requests, the auto-refund limit and returned stock
// live. For now it is an in-memory demo store that resets when the server
// restarts (the schema for a real database is in supabase/schema.sql). This
// is the only file that knows where that data is kept.
import { startingLimit } from "@/lib/copper/refunds/rules";
import type { Order, RefundRequest } from "@/lib/copper/refunds/types";

type Store = {
  orders: Order[];
  requests: RefundRequest[];
  limitUsd: number;
  /** Units added back per SKU after a device refund. */
  restocked: Record<string, number>;
  nextRequest: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function seed(): Store {
  const ago = (days: number) =>
    new Date(Date.now() - days * DAY_MS).toISOString();
  const order = (
    id: string,
    customerEmail: string,
    rest: Omit<Order, "id" | "customerEmail" | "refundStatus">,
  ): Order => ({ id, customerEmail, refundStatus: "none", ...rest });
  return {
    orders: [
      order("ORD-1001", "ava@example.com", {
        kind: "device",
        product: "Copper Home",
        color: "Night Sky",
        sku: "CH-NSK",
        amountUsd: 149,
        purchasedAt: ago(10),
      }),
      order("ORD-1002", "finn@example.com", {
        kind: "device",
        product: "Copper Home",
        color: "Polished Copper",
        sku: "CH-POL",
        amountUsd: 149,
        purchasedAt: ago(10),
      }),
      order("ORD-1003", "cara@example.com", {
        kind: "plan",
        product: "Copper Plus",
        billing: "annual",
        amountUsd: 79,
        purchasedAt: ago(5),
      }),
      order("ORD-1004", "ben@example.com", {
        kind: "device",
        product: "Copper Notes",
        color: "Brushed Copper",
        sku: "CN-BRC",
        amountUsd: 129,
        purchasedAt: ago(45),
      }),
      order("ORD-1005", "dan@example.com", {
        kind: "plan",
        product: "Copper Plus",
        billing: "annual",
        amountUsd: 79,
        purchasedAt: ago(40),
      }),
      order("ORD-1006", "eve@example.com", {
        kind: "plan",
        product: "Copper Plus",
        billing: "monthly",
        amountUsd: 7.99,
        purchasedAt: ago(20),
      }),
    ],
    requests: [],
    limitUsd: startingLimit(),
    restocked: {},
    nextRequest: 1001,
  };
}

// One store per server, kept on globalThis so a dev-mode reload does not wipe it.
const holder = globalThis as unknown as { __copperRefundStore?: Store };

export function store(): Store {
  return (holder.__copperRefundStore ??= seed());
}

/** Starts over with the demo data (used by tests). */
export function resetStore(): void {
  holder.__copperRefundStore = seed();
}

export function ordersFor(email: string): Order[] {
  const wanted = email.trim().toLowerCase();
  return store().orders.filter((o) => o.customerEmail === wanted);
}

export function findOrder(id: string): Order | undefined {
  return store().orders.find((o) => o.id === id);
}
