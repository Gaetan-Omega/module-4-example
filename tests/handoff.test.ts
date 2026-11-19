// Module 4: Copper hands refund requests to the separate Refund agent and
// takes them back. A mock model plays both agents, so this needs no AI key.
// @vitest-environment node
import type { LanguageModelV4StreamPart as ModelStreamPart } from "@ai-sdk/provider";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalValue } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import { toolCallsOf } from "@/lib/copper/assistant/progress";
import { REFUND_INSTRUCTIONS } from "@/lib/copper/refunds/instructions";
import { resetStore } from "@/lib/copper/refunds/store";

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

const usage = {
  inputTokens: {
    total: 500,
    noCache: 500,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

type StreamPart = Parameters<
  typeof convertArrayToReadableStream<ModelStreamPart>
>[0][number];

const finish = (reason: "stop" | "tool-calls") => ({
  type: "finish" as const,
  finishReason: { unified: reason, raw: undefined },
  usage,
});

const says = (text: string): StreamPart[] => [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  finish("stop"),
];

let callNumber = 0;
const calls = (toolName: string, input: unknown): StreamPart[] => {
  const id = `call-${++callNumber}`;
  return [
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: JSON.stringify(input) },
    { type: "tool-input-end", id },
    {
      type: "tool-call",
      toolCallId: id,
      toolName,
      input: JSON.stringify(input),
    },
    finish("tool-calls"),
  ];
};

function modelStreaming(...steps: StreamPart[][]) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(steps[step++] ?? says("")),
    }),
  });
}

const toolNames = (call: number) =>
  (model.doStreamCalls[call].tools ?? []).map((t) => t.name).sort();
const systemOf = (call: number) =>
  JSON.stringify(
    model.doStreamCalls[call].prompt.find((m) => m.role === "system")?.content,
  );

const REFUND_ASK = [
  { role: "user" as const, content: "I want a refund for my Copper Home" },
];

async function ask(request: {
  agent?: "copper" | "refund";
  email?: string;
  useTools?: boolean;
  messages?: { role: "user" | "assistant"; content: string }[];
}) {
  const { askCopper } = await import("@/lib/copper/assistant/ask");
  const { progress } = await askCopper({
    messages: request.messages ?? REFUND_ASK,
    useTools: request.useTools ?? true,
    agent: request.agent,
    email: request.email,
  });
  return finalValue(progress);
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  resetStore();
  callNumber = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("handoff between Copper and the Refund agent", () => {
  it("passes a refund request from Copper to the Refund agent in the same turn, swapping tools and instructions", async () => {
    model = modelStreaming(
      calls("hand_to_refund", { summary: "Wants to refund a Copper Home." }),
      calls("get_purchase_history", {}),
      says("Your refund is waiting for a Copper admin."),
    );
    const answer = await ask({ email: "ava@example.com" });

    expect(answer.status).toBe("done");
    expect(answer.agent).toBe("refund");
    expect(answer.reply).toBe("Your refund is waiting for a Copper admin.");
    expect(toolCallsOf(answer).map((t) => t.name)).toEqual([
      "hand_to_refund",
      "get_purchase_history",
    ]);
    // Copper had its own tools plus the handoff...
    expect(toolNames(0)).toEqual([
      "calculate_cost",
      "check_availability",
      "get_prices",
      "get_products",
      "hand_to_refund",
      "search_docs",
    ]);
    expect(systemOf(0)).toContain(COPPER_INSTRUCTIONS.slice(0, 40));
    // ...then the Refund agent has its own, and was told what Copper learned.
    expect(toolNames(1)).toEqual([
      "get_purchase_history",
      "get_refund_rules",
      "hand_to_copper",
      "request_refund",
    ]);
    expect(systemOf(1)).toContain(REFUND_INSTRUCTIONS.slice(0, 40));
    expect(systemOf(1)).toContain("Wants to refund a Copper Home.");
    expect(systemOf(1)).not.toContain(COPPER_INSTRUCTIONS.slice(0, 40));
  });

  it("gives the customer's email to the Refund agent's tools, and update_availability is never offered", async () => {
    model = modelStreaming(
      calls("hand_to_refund", { summary: "Refund please." }),
      calls("get_purchase_history", {}),
      says("Found it."),
    );
    const answer = await ask({ email: "ava@example.com" });
    const history = toolCallsOf(answer).find(
      (t) => t.name === "get_purchase_history",
    );
    expect(JSON.stringify(history?.output)).toContain("ORD-1001");
    expect(JSON.stringify(history?.output)).not.toContain("ORD-1002");
    for (const call of [0, 1])
      expect(toolNames(call)).not.toContain("update_availability");
  });

  it("asks for the email, instead of guessing, when none was given", async () => {
    model = modelStreaming(
      calls("hand_to_refund", { summary: "Refund please." }),
      calls("get_purchase_history", {}),
      says("What email did you order with?"),
    );
    const answer = await ask({});
    const history = toolCallsOf(answer).find(
      (t) => t.name === "get_purchase_history",
    );
    expect(history?.output).toEqual({ status: "need_email" });
  });

  it("starts with the Refund agent when the chat is already with it, and hands back to Copper for other questions", async () => {
    model = modelStreaming(
      calls("hand_to_copper", { summary: "Asks about colors." }),
      says("Copper Home comes in three colors."),
    );
    const answer = await ask({
      agent: "refund",
      email: "ava@example.com",
      messages: [{ role: "user", content: "What colors does it come in?" }],
    });
    expect(toolNames(0)).toContain("get_refund_rules");
    expect(systemOf(0)).toContain(REFUND_INSTRUCTIONS.slice(0, 40));
    expect(toolNames(1)).toContain("get_products");
    expect(answer.agent).toBe("copper");
    expect(answer.reply).toBe("Copper Home comes in three colors.");
  });

  it("keeps only the last agent's words and stops after two handoffs", async () => {
    model = modelStreaming(
      calls("hand_to_refund", { summary: "one" }),
      calls("hand_to_copper", { summary: "two" }),
      calls("hand_to_refund", { summary: "three" }),
      says("This should never be asked for."),
    );
    const answer = await ask({ email: "ava@example.com" });
    expect(model.doStreamCalls).toHaveLength(3);
    expect(answer.reply).toMatch(/something went wrong/);
  });

  it("sends no instructions, no tools and no handoff when tools are off", async () => {
    model = modelStreaming(says("I guess so."));
    const answer = await ask({ useTools: false, agent: "refund" });
    expect(answer.agent).toBe("copper");
    expect(toolNames(0)).toEqual([]);
    expect(systemOf(0)).toBeUndefined();
  });

  it("logs the Refund agent's turns as module 4, feature refund-agent", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    model = modelStreaming(says("Hi."));
    await ask({ agent: "refund" });
    await vi.waitFor(() => expect(info).toHaveBeenCalled());
    const row = JSON.parse(
      info.mock.calls.find(([tag]) => tag === "[ai_calls]")![1] as string,
    );
    expect(row).toMatchObject({ module: 4, feature: "refund-agent", ok: true });
  });
});

describe("what each agent is told", () => {
  it("tells Copper to hand refunds over, and the Refund agent to follow the rules without guessing", () => {
    expect(COPPER_INSTRUCTIONS).toMatch(/hand_to_refund/);
    expect(COPPER_INSTRUCTIONS).toMatch(/refund policy/i);
    expect(REFUND_INSTRUCTIONS).toMatch(/get_purchase_history first/);
    expect(REFUND_INSTRUCTIONS).toMatch(/get_refund_rules/);
    expect(REFUND_INSTRUCTIONS).toMatch(/Never say it is approved or issued/);
    expect(REFUND_INSTRUCTIONS).toMatch(/hand_to_copper/);
    expect(REFUND_INSTRUCTIONS).toMatch(/Copper Crew/);
  });
});
