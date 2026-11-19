// The Refund agent's tools, and the hand_to_refund tool Copper uses to pass a
// refund request over. The customer's email is fixed by the server for each
// chat (see refundTools), so the model can't look at anyone else's orders.
// update_availability is not here: code runs it after an approval.
import { tool } from "ai";
import { z } from "zod";
import {
  fileRefund,
  purchaseHistory,
  refundRules,
} from "@/lib/copper/refunds/service";

/** What a hand_to_* tool returns: who takes over, and what they need to know. */
export type Handoff = { handoff: "refund" | "copper"; summary: string };

const summary = z
  .string()
  .min(2)
  .describe(
    "One or two sentences for the next agent: what the customer wants and anything already known.",
  );

export const handToRefund = tool({
  description:
    "Hands the chat to the Refund specialist. Use it when the shopper wants a refund or to return something they bought.",
  inputSchema: z.object({ summary }),
  execute: async ({ summary }): Promise<Handoff> => ({
    handoff: "refund",
    summary,
  }),
});

export const handToCopper = tool({
  description:
    "Hands the chat back to Copper, the shopping assistant. Use it for anything that isn't about refunding an order they bought.",
  inputSchema: z.object({ summary }),
  execute: async ({ summary }): Promise<Handoff> => ({
    handoff: "copper",
    summary,
  }),
});

/** The Refund agent's tools for one customer (`email` is null until they give it). */
export function refundTools(email: string | null) {
  return {
    get_purchase_history: tool({
      description:
        "Lists the signed-in customer's orders: what they bought, how much, how many days ago and any refund already filed.",
      inputSchema: z.object({}),
      execute: async () => purchaseHistory(email),
    }),
    get_refund_rules: tool({
      description:
        "Checks one order against the refund rules. Returns whether it is eligible, the rule, the reason, the refund amount and whether it would be approved automatically.",
      inputSchema: z.object({
        orderId: z
          .string()
          .describe("An order id from get_purchase_history, like ORD-1001."),
      }),
      execute: async ({ orderId }) => refundRules(email, orderId),
    }),
    request_refund: tool({
      description:
        "Files a refund request for one eligible order. Refunds under the auto-refund limit are approved at once; larger ones wait for a person.",
      inputSchema: z.object({
        orderId: z.string().describe("An order id from get_purchase_history."),
        reason: z
          .string()
          .min(2)
          .describe("Why the customer wants the refund, in their words."),
      }),
      execute: async ({ orderId, reason }) =>
        fileRefund(email, orderId, reason),
    }),
    hand_to_copper: handToCopper,
  };
}
