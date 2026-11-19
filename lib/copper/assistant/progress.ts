// What Ask Copper is doing, step by step, as it streams in: Gemini's thinking
// summaries, each tool call (with what went in and what came out), and the
// reply. The panel draws this as it changes.

export type ThinkingStep = { type: "thinking"; text: string };

export type ToolStep = {
  type: "tool";
  id: string;
  name: string;
  /** "calling" until the tool's result comes back. */
  state: "calling" | "done" | "error";
  input?: unknown;
  output?: unknown;
};

export type Step = ThinkingStep | ToolStep;

/** Who is answering: Copper, or the Refund specialist Copper hands refunds to. */
export type Agent = "copper" | "refund";

export type Progress = {
  /** The agent that wrote the reply (Copper when missing). */
  agent?: Agent;
  steps: Step[];
  reply: string;
  status: "working" | "done" | "error";
};

/** Every tool call in an answer, in order. */
export function toolCallsOf(progress: Progress) {
  return progress.steps
    .filter((step): step is ToolStep => step.type === "tool")
    .map(({ name, input, output }) => ({ name, input, output }));
}

/**
 * The tools Copper can use, and what each one does in plain English. The chat
 * panel lists these, so it lives here (and not in tools.ts, which reads the
 * database and can't be imported by a client component).
 */
export const TOOL_LABELS: Record<string, string> = {
  get_products: "Listing the products",
  get_prices: "Looking up prices",
  calculate_cost: "Working out the cost",
  check_availability: "Checking stock",
  search_docs: "Searching the documents",
  hand_to_refund: "Handing over to the Refund specialist",
  get_purchase_history: "Looking up your orders",
  get_refund_rules: "Checking the refund rules",
  request_refund: "Filing the refund",
  hand_to_copper: "Handing back to Copper",
};

export const AGENT_NAMES: Record<Agent, string> = {
  copper: "Copper",
  refund: "Refund specialist",
};

/** The tools each agent can use, for the panel's list. */
export const AGENT_TOOLS: Record<Agent, string[]> = {
  copper: [
    "get_products",
    "get_prices",
    "calculate_cost",
    "check_availability",
    "search_docs",
    "hand_to_refund",
  ],
  refund: [
    "get_purchase_history",
    "get_refund_rules",
    "request_refund",
    "hand_to_copper",
  ],
};
