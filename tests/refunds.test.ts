// Module 4: the refund rules, the Refund agent's tools, and what an admin's
// decision does. No model, no database: the in-memory demo store stands in.
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { readInventory } from "@/lib/copper/inventory";
import { checkRefund } from "@/lib/copper/refunds/rules";
import {
  cleanEmail,
  consoleState,
  decideRefund,
  fileRefund,
  purchaseHistory,
  refundRules,
  setAutoRefundLimit,
} from "@/lib/copper/refunds/service";
import { resetStore } from "@/lib/copper/refunds/store";
import { refundTools } from "@/lib/copper/refunds/tools";
import type { Order } from "@/lib/copper/refunds/types";

const NOW = new Date("2026-11-18T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

const device = (days: number, extra: Partial<Order> = {}): Order => ({
  id: "ORD-T1",
  customerEmail: "t@example.com",
  kind: "device",
  product: "Copper Home",
  sku: "CH-POL",
  amountUsd: 149,
  purchasedAt: daysAgo(days),
  refundStatus: "none",
  ...extra,
});
const plan = (
  billing: "monthly" | "annual",
  days: number,
  amountUsd: number,
): Order => ({
  id: "ORD-T2",
  customerEmail: "t@example.com",
  kind: "plan",
  product: "Copper Plus",
  billing,
  amountUsd,
  purchasedAt: daysAgo(days),
  refundStatus: "none",
});

describe("refund rules", () => {
  it("refunds a device within 30 days: day 30 yes, day 31 no", () => {
    expect(checkRefund(device(30), 100, NOW).eligible).toBe(true);
    expect(checkRefund(device(31), 100, NOW).eligible).toBe(false);
  });

  it("refunds Copper Plus annual within 14 days: day 14 yes, day 15 no", () => {
    expect(checkRefund(plan("annual", 14, 79), 100, NOW).eligible).toBe(true);
    expect(checkRefund(plan("annual", 15, 79), 100, NOW).eligible).toBe(false);
  });

  it("never refunds Copper Plus monthly for a partial month", () => {
    const check = checkRefund(plan("monthly", 1, 7.99), 100, NOW);
    expect(check).toMatchObject({ eligible: false, refundUsd: 0 });
    expect(check.reason).toMatch(/partial months/);
  });

  it("allows one request per order: pending or refunded orders are not eligible again", () => {
    for (const refundStatus of ["pending", "refunded"] as const)
      expect(checkRefund(device(2, { refundStatus }), 100, NOW).eligible).toBe(
        false,
      );
  });

  it("approves automatically only when eligible and strictly below the limit", () => {
    expect(checkRefund(plan("annual", 3, 79), 100, NOW).autoApproved).toBe(
      true,
    );
    expect(checkRefund(device(3), 100, NOW).autoApproved).toBe(false); // $149
    expect(checkRefund(plan("annual", 3, 79), 79, NOW).autoApproved).toBe(
      false,
    ); // equal
    expect(checkRefund(plan("annual", 3, 79), 79.01, NOW).autoApproved).toBe(
      true,
    );
    expect(checkRefund(device(40), 1000, NOW).autoApproved).toBe(false); // ineligible
  });
});

beforeEach(() => resetStore());

describe("the Refund agent's tools", () => {
  it("shows a customer only their own orders", () => {
    const history = purchaseHistory("ava@example.com");
    expect(history).toMatchObject({ status: "ok" });
    if (history.status !== "ok") return;
    expect(history.orders.map((o) => o.id)).toEqual(["ORD-1001"]);
    expect(purchaseHistory(null)).toEqual({ status: "need_email" });
    expect(purchaseHistory(cleanEmail("not an email"))).toEqual({
      status: "need_email",
    });
  });

  it("answers get_refund_rules for the customer's own order, and not_found for anyone else's", () => {
    expect(refundRules("ava@example.com", "ORD-1001")).toMatchObject({
      status: "ok",
      eligible: true,
      refundUsd: 149,
      autoApproved: false,
      autoRefundLimitUsd: 100,
    });
    expect(refundRules("ava@example.com", "ORD-1002")).toEqual({
      status: "not_found",
    });
    expect(refundRules(null, "ORD-1001")).toEqual({ status: "need_email" });
  });

  it("auto-approves a refund under the limit and puts a returned device back in stock", async () => {
    // cara's $79 annual plan: automatic, and a plan never changes stock.
    const before = await stockOf("CH-NSK");
    expect(
      fileRefund("cara@example.com", "ORD-1003", "Changed my mind"),
    ).toMatchObject({
      status: "auto_approved",
      refundUsd: 79,
    });
    expect(await stockOf("CH-NSK")).toBe(before);
    const state = await consoleState();
    expect(state.pending).toHaveLength(0);
    expect(state.decided[0]).toMatchObject({
      status: "approved",
      adminNote: "Auto-approved: under the $100 limit",
    });

    // A device under a raised limit is automatic too, and adds one unit.
    setAutoRefundLimit(500);
    expect(fileRefund("ava@example.com", "ORD-1001", "Too big")).toMatchObject({
      status: "auto_approved",
    });
    expect(await stockOf("CH-NSK")).toBe(before + 1);
  });

  it("makes a refund at or over the limit wait for a person", () => {
    expect(fileRefund("ava@example.com", "ORD-1001", "Too big")).toMatchObject({
      status: "created",
      requestId: "REQ-1001",
    });
    // Filing again is refused: one request per order.
    expect(fileRefund("ava@example.com", "ORD-1001", "Again")).toMatchObject({
      status: "not_eligible",
    });
  });

  it("never files an ineligible refund, however it is asked", () => {
    for (const [email, order] of [
      ["ben@example.com", "ORD-1004"], // past 30 days
      ["dan@example.com", "ORD-1005"], // past 14 days
      ["eve@example.com", "ORD-1006"], // monthly
    ])
      expect(fileRefund(email, order, "Please, I insist")).toMatchObject({
        status: "not_eligible",
      });
  });

  it("won't file a refund on another customer's order or without an email", () => {
    expect(fileRefund("finn@example.com", "ORD-1001", "Not mine")).toEqual({
      status: "not_found",
    });
    expect(fileRefund(null, "ORD-1001", "Who am I")).toEqual({
      status: "need_email",
    });
  });

  it("fixes the email on the server: the model can't pass one", async () => {
    const tools = refundTools("ava@example.com");
    expect(Object.keys(tools).sort()).toEqual([
      "get_purchase_history",
      "get_refund_rules",
      "hand_to_copper",
      "request_refund",
    ]);
    expect(Object.keys(tools)).not.toContain("update_availability");
    const run = tools.get_purchase_history.execute!;
    const result = await run(
      {},
      { toolCallId: "t", messages: [], context: {} },
    );
    expect(JSON.stringify(result)).toContain("ORD-1001");
    expect(JSON.stringify(result)).not.toContain("ORD-1002");
  });
});

describe("admin decisions", () => {
  it("approves a waiting request: the order is refunded, a device goes back in stock, and the customer's notice is written", async () => {
    fileRefund("ava@example.com", "ORD-1001", "Too big");
    const before = await stockOf("CH-NSK");
    const decision = decideRefund("REQ-1001", "approve", "Looks fine");
    expect(decision).toMatchObject({
      ok: true,
      notice: { status: "approved", customerEmail: "ava@example.com" },
    });
    if (!decision.ok) return;
    expect(decision.notice.message).toMatch(/approved your refund REQ-1001/);
    expect(decision.notice.message).toMatch(/has been issued/);
    expect(await stockOf("CH-NSK")).toBe(before + 1);
    expect(refundRules("ava@example.com", "ORD-1001")).toMatchObject({
      eligible: false,
    });
  });

  it("rejects a waiting request: the money stays, stock is untouched and the order can be tried again", async () => {
    fileRefund("finn@example.com", "ORD-1002", "Changed my mind");
    const before = await stockOf("CH-POL");
    const decision = decideRefund("REQ-1001", "reject");
    expect(decision).toMatchObject({
      ok: true,
      notice: { status: "rejected", customerEmail: "finn@example.com" },
    });
    if (!decision.ok) return;
    expect(decision.notice.message).toMatch(/did not approve it/);
    expect(decision.notice.message).toMatch(/not refunded/);
    expect(await stockOf("CH-POL")).toBe(before);
    expect(refundRules("finn@example.com", "ORD-1002")).toMatchObject({
      eligible: true,
    });
  });

  it("decides a request only once", () => {
    fileRefund("ava@example.com", "ORD-1001", "Too big");
    expect(decideRefund("REQ-1001", "approve")).toMatchObject({ ok: true });
    expect(decideRefund("REQ-1001", "reject")).toMatchObject({ ok: false });
    expect(decideRefund("REQ-9999", "approve")).toMatchObject({ ok: false });
  });

  it("never changes stock for a plan refund", async () => {
    const all = JSON.stringify(await readInventory());
    fileRefund("cara@example.com", "ORD-1003", "Changed my mind");
    expect(JSON.stringify(await readInventory())).toBe(all);
  });
});

describe("the auto-refund limit", () => {
  it("starts at $100, can be saved, and the next refund uses it", async () => {
    expect((await consoleState()).autoRefundLimitUsd).toBe(100);
    expect(setAutoRefundLimit(150)).toBe(150);
    expect((await consoleState()).autoRefundLimitUsd).toBe(150);
    // ava's $149 refund is now under the limit, so no admin is needed.
    expect(refundRules("ava@example.com", "ORD-1001")).toMatchObject({
      autoApproved: true,
    });
    expect(setAutoRefundLimit(-5)).toBeNull();
    expect(setAutoRefundLimit(Number.NaN)).toBeNull();
  });
});

async function stockOf(sku: string) {
  return (await readInventory())!.find((row) => row.sku === sku)!
    .units_in_stock;
}
