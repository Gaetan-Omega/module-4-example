// What the refund agent's tools and the Refund Console do with refunds. The
// rules (rules.ts) decide who is eligible; nothing here asks the model.
import { formatUsd } from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";
import { updateAvailability } from "@/lib/copper/refunds/availability";
import { checkRefund, daysSince } from "@/lib/copper/refunds/rules";
import { findOrder, ordersFor, store } from "@/lib/copper/refunds/store";
import type {
  ConsoleState,
  DecisionNotice,
  Order,
  RefundCheck,
  RefundRequest,
} from "@/lib/copper/refunds/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The customer's email if it looks like one, else null. */
export function cleanEmail(email: string | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return EMAIL.test(value) ? value : null;
}

export type PurchaseHistory =
  | {
      status: "ok";
      orders: {
        id: string;
        item: string;
        kind: Order["kind"];
        amountUsd: number;
        daysSincePurchase: number;
        refundStatus: Order["refundStatus"];
      }[];
    }
  | { status: "need_email" };

/** get_purchase_history: the signed-in customer's own orders only. */
export function purchaseHistory(email: string | null): PurchaseHistory {
  if (!email) return { status: "need_email" };
  return {
    status: "ok",
    orders: ordersFor(email).map((o) => ({
      id: o.id,
      item: describe(o),
      kind: o.kind,
      amountUsd: o.amountUsd,
      daysSincePurchase: daysSince(o.purchasedAt),
      refundStatus: o.refundStatus,
    })),
  };
}

function describe(order: Order): string {
  if (order.kind === "device")
    return order.color ? `${order.product}, ${order.color}` : order.product;
  return `${order.product} (${order.billing ?? "monthly"})`;
}

/** An order that belongs to this customer, or why not. */
function ownOrder(email: string | null, orderId: string) {
  if (!email) return { status: "need_email" as const };
  const order = findOrder(orderId);
  if (!order || order.customerEmail !== email)
    return { status: "not_found" as const };
  return { status: "ok" as const, order };
}

export type RefundRules =
  | ({ status: "ok"; orderId: string } & RefundCheck)
  | { status: "not_found" | "need_email" };

/** get_refund_rules: what the rules say about one of the customer's orders. */
export function refundRules(
  email: string | null,
  orderId: string,
): RefundRules {
  const found = ownOrder(email, orderId);
  if (found.status !== "ok") return { status: found.status };
  return {
    status: "ok",
    orderId,
    ...checkRefund(found.order, store().limitUsd),
  };
}

export type RefundFiled =
  | {
      status: "auto_approved";
      requestId: string;
      refundUsd: number;
      note: string;
    }
  | { status: "created"; requestId: string; refundUsd: number }
  | { status: "not_eligible"; reason: string; rule: string }
  | { status: "not_found" | "need_email" | "unavailable" };

/**
 * request_refund: files the refund. It checks the rules again itself, so a
 * refund the rules refuse can't be filed however the request is worded.
 */
export function fileRefund(
  email: string | null,
  orderId: string,
  reason: string,
): RefundFiled {
  const found = ownOrder(email, orderId);
  if (found.status !== "ok") return { status: found.status };
  const { order } = found;
  const check = checkRefund(order, store().limitUsd);
  if (!check.eligible)
    return { status: "not_eligible", reason: check.reason, rule: check.rule };

  const s = store();
  const request: RefundRequest = {
    id: `REQ-${s.nextRequest++}`,
    orderId: order.id,
    customerEmail: order.customerEmail,
    kind: order.kind,
    product: describe(order),
    sku: order.sku,
    reason: reason.trim() || "No reason given",
    agentSummary: `Customer asked to refund ${describe(order)} (${formatUsd(order.amountUsd)}), bought ${check.daysSincePurchase} days ago.`,
    amountUsd: check.refundUsd,
    ruleApplied: check.rule,
    recommendation: "Approve: the order is inside the refund window.",
    status: "pending",
    adminNote: "",
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  s.requests.push(request);

  if (check.autoApproved) {
    const note = `Auto-approved: under the ${formatUsd(check.autoRefundLimitUsd)} limit`;
    approve(request, order, note);
    return {
      status: "auto_approved",
      requestId: request.id,
      refundUsd: request.amountUsd,
      note,
    };
  }
  order.refundStatus = "pending";
  return {
    status: "created",
    requestId: request.id,
    refundUsd: request.amountUsd,
  };
}

function approve(request: RefundRequest, order: Order, note: string) {
  request.status = "approved";
  request.adminNote = note;
  request.decidedAt = new Date().toISOString();
  order.refundStatus = "refunded";
  // Only a device goes back on the shelf; a plan never changes stock.
  if (order.kind === "device" && order.sku) updateAvailability(order.sku);
}

export type Decision =
  | { ok: true; request: RefundRequest; notice: DecisionNotice }
  | { ok: false; error: string };

/** Approve or reject a waiting request. A request is decided only once. */
export function decideRefund(
  requestId: string,
  decision: "approve" | "reject",
  note = "",
): Decision {
  const request = store().requests.find((r) => r.id === requestId);
  if (!request) return { ok: false, error: "That request doesn't exist." };
  if (request.status !== "pending")
    return { ok: false, error: "That request was already decided." };
  const order = findOrder(request.orderId)!;
  if (decision === "approve") {
    approve(request, order, note.trim());
  } else {
    request.status = "rejected";
    request.adminNote = note.trim();
    request.decidedAt = new Date().toISOString();
    order.refundStatus = "none";
  }
  const approved = decision === "approve";
  return {
    ok: true,
    request,
    notice: {
      requestId: request.id,
      status: approved ? "approved" : "rejected",
      customerEmail: request.customerEmail,
      product: request.product,
      message: approved
        ? `Good news: a Copper admin approved your refund ${request.id} for your ${request.product} (${formatUsd(request.amountUsd)}). The refund has been issued.`
        : `Update on your refund ${request.id}: a Copper admin reviewed it and did not approve it, so your ${request.product} was not refunded and your payment stays as it was.`,
    },
  };
}

/** Everything the Refund Console shows. */
export async function consoleState(): Promise<ConsoleState> {
  const s = store();
  const stock = (await readInventory()) ?? [];
  const newestFirst = (a: RefundRequest, b: RefundRequest) =>
    (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt);
  return {
    autoRefundLimitUsd: s.limitUsd,
    pending: s.requests.filter((r) => r.status === "pending"),
    decided: s.requests.filter((r) => r.status !== "pending").sort(newestFirst),
    orders: structuredClone(s.orders),
    stock: stock.map(({ sku, product, color, units_in_stock }) => ({
      sku,
      product,
      color,
      units_in_stock,
    })),
  };
}

/** Saves the auto-refund limit. Returns the saved value, or null if invalid. */
export function setAutoRefundLimit(limitUsd: number): number | null {
  if (!Number.isFinite(limitUsd) || limitUsd < 0 || limitUsd > 100000)
    return null;
  store().limitUsd = Math.round(limitUsd * 100) / 100;
  return store().limitUsd;
}
