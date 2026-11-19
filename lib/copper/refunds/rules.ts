// The refund rules, as plain code. The model never decides eligibility or
// auto-approval: get_refund_rules reports this, and request_refund checks it
// again on the server, so no wording from the model or a customer skips it.
import {
  DEFAULT_AUTO_REFUND_LIMIT_USD,
  type Order,
  type RefundCheck,
} from "@/lib/copper/refunds/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEVICE_DAYS = 30;
const ANNUAL_PLAN_DAYS = 14;

/** Whole days since the purchase (day 0 is the day it was bought). */
export function daysSince(purchasedAt: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(purchasedAt).getTime()) / DAY_MS);
}

/** The limit to start with: AUTO_REFUND_LIMIT_USD if set, else $100. */
export function startingLimit(): number {
  const fromEnv = Number(process.env.AUTO_REFUND_LIMIT_USD);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_AUTO_REFUND_LIMIT_USD;
}

export function checkRefund(
  order: Order,
  autoRefundLimitUsd: number,
  now: Date = new Date(),
): RefundCheck {
  const days = daysSince(order.purchasedAt, now);
  const verdict = (
    eligible: boolean,
    rule: string,
    reason: string,
  ): RefundCheck => {
    const refundUsd = eligible ? order.amountUsd : 0;
    return {
      eligible,
      rule,
      reason,
      refundUsd,
      daysSincePurchase: days,
      autoApproved: eligible && refundUsd > 0 && refundUsd < autoRefundLimitUsd,
      autoRefundLimitUsd,
    };
  };

  if (order.refundStatus !== "none") {
    return verdict(
      false,
      "One request per order",
      order.refundStatus === "pending"
        ? "A refund for this order is already waiting for approval."
        : "This order has already been refunded.",
    );
  }
  if (order.kind === "device") {
    const rule = `Devices: refund within ${DEVICE_DAYS} days`;
    return days <= DEVICE_DAYS
      ? verdict(
          true,
          rule,
          `Bought ${days} days ago, within the ${DEVICE_DAYS}-day window.`,
        )
      : verdict(
          false,
          rule,
          `Bought ${days} days ago, past the ${DEVICE_DAYS}-day window.`,
        );
  }
  if (order.billing === "monthly") {
    return verdict(
      false,
      "Copper Plus monthly: no partial-month refunds",
      "Monthly plans aren't refunded for partial months.",
    );
  }
  const rule = `Copper Plus annual: refund within ${ANNUAL_PLAN_DAYS} days`;
  return days <= ANNUAL_PLAN_DAYS
    ? verdict(
        true,
        rule,
        `Bought ${days} days ago, within the ${ANNUAL_PLAN_DAYS}-day window.`,
      )
    : verdict(
        false,
        rule,
        `Bought ${days} days ago, past the ${ANNUAL_PLAN_DAYS}-day window.`,
      );
}
