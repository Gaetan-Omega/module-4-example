// The shapes the refund agent, the Refund Console and the tests share. Plain
// types only, so client components can import this file too.

export type OrderKind = "device" | "plan";
export type RefundStatus = "none" | "pending" | "refunded";

export type Order = {
  id: string;
  customerEmail: string;
  kind: OrderKind;
  product: string;
  /** Devices only. */
  color?: string;
  /** Devices only: the stock row this order came from. */
  sku?: string;
  /** Plans only. */
  billing?: "monthly" | "annual";
  amountUsd: number;
  /** ISO date and time. */
  purchasedAt: string;
  refundStatus: RefundStatus;
};

export type RefundRequestStatus = "pending" | "approved" | "rejected";

export type RefundRequest = {
  id: string;
  orderId: string;
  customerEmail: string;
  kind: OrderKind;
  product: string;
  sku?: string;
  reason: string;
  agentSummary: string;
  amountUsd: number;
  ruleApplied: string;
  recommendation: string;
  status: RefundRequestStatus;
  adminNote: string;
  createdAt: string;
  decidedAt: string | null;
};

/** What the rules say about one order. The model never decides this. */
export type RefundCheck = {
  eligible: boolean;
  rule: string;
  reason: string;
  refundUsd: number;
  daysSincePurchase: number;
  /** Eligible and strictly below the auto-refund limit. */
  autoApproved: boolean;
  autoRefundLimitUsd: number;
};

export type StockRow = {
  sku: string;
  product: string;
  color: string;
  units_in_stock: number;
};

/** Everything the Refund Console draws. */
export type ConsoleState = {
  autoRefundLimitUsd: number;
  pending: RefundRequest[];
  decided: RefundRequest[];
  orders: Order[];
  stock: StockRow[];
};

/** What the console tells the chat when someone clicks Approve or Reject. */
export type DecisionNotice = {
  requestId: string;
  status: "approved" | "rejected";
  customerEmail: string;
  product: string;
  /** The message the customer sees in the chat. */
  message: string;
};

export const DEFAULT_AUTO_REFUND_LIMIT_USD = 100;

export const DEMO_EMAILS = [
  "ava@example.com",
  "finn@example.com",
  "cara@example.com",
  "ben@example.com",
  "dan@example.com",
  "eve@example.com",
] as const;

/** The window event the console sends and the chat panel listens for. */
export const DECISION_EVENT = "copper:refund-decided";
