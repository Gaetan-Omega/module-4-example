"use server";

// The server action the Ask Copper chat calls. It streams the conversation to
// the model through callStream (lib/ai/call.ts), with or without the tools,
// and sends back each step as it happens, so the panel can show Copper
// thinking and using its tools.
// Module 4: there are two agents, Copper and the Refund specialist. The chat
// is one conversation; the panel says which agent answers next. When an agent
// calls a hand_to_* tool, the answer continues with the other agent in the
// same turn (at most twice), and only the last agent's words are kept.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type {
  Agent,
  Progress,
  ToolStep,
} from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";
import { REFUND_INSTRUCTIONS } from "@/lib/copper/refunds/instructions";
import { cleanEmail } from "@/lib/copper/refunds/service";
import { refundTools, type Handoff } from "@/lib/copper/refunds/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
  /** Who answers first (the agent that answered last). Copper when missing. */
  agent?: Agent;
  /** The email typed into the panel. The server fixes it for the tools. */
  email?: string;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per agent. */
const MAX_STEPS = 5;
/** At most this many times one question can pass between the agents. */
const MAX_HANDOFFS = 2;

const SORRY = "Sorry, something went wrong on my end. Please try again.";

function setupFor(agent: Agent, email: string | null, summary: string | null) {
  const passed = summary
    ? `\n\nThe other agent passed this chat to you with this summary: ${summary}`
    : "";
  return agent === "refund"
    ? {
        instructions: REFUND_INSTRUCTIONS + passed,
        tools: refundTools(email),
      }
    : { instructions: COPPER_INSTRUCTIONS + passed, tools: copperTools };
}

/** True when a step's tool result is a handoff, so the agent stops there. */
function isHandoff(value: unknown): value is Handoff {
  const v = value as Partial<Handoff> | null;
  return (
    !!v &&
    (v.handoff === "refund" || v.handoff === "copper") &&
    typeof v.summary === "string"
  );
}

export async function askCopper({
  messages,
  useTools,
  agent: startAgent = "copper",
  email,
}: AskCopperRequest): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  let agent: Agent = useTools ? startAgent : "copper";
  const progress: Progress = {
    agent,
    steps: [],
    reply: "",
    status: "working",
  };
  // A fresh copy each time, so earlier updates never change underneath the
  // panel.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });
  const toolStep = (id: string) =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );
  const customer = cleanEmail(email);

  // Read the stream in the background, so the panel gets the first update now.
  void (async () => {
    try {
      let summary: string | null = null;
      for (let handoffs = 0; ; handoffs++) {
        // Without tools, send no instructions either: "always use your tools"
        // with no tools makes the model answer with nothing.
        const setup = setupFor(agent, customer, summary);
        const result = callStream(
          agent === "refund"
            ? { module: 4, feature: "refund-agent" }
            : { module: 2, feature: "ask-copper" },
          {
            messages,
            providerOptions: THOUGHT_SUMMARIES,
            ...(useTools && {
              instructions: setup.instructions,
              tools: setup.tools,
              stopWhen: [
                stepCountIs(MAX_STEPS),
                ({ steps }) =>
                  steps.at(-1)?.toolResults.some((r) => isHandoff(r.output)) ??
                  false,
              ],
            }),
          },
        );

        let handoff: Handoff | null = null;
        for await (const part of result.fullStream) {
          switch (part.type) {
            case "reasoning-delta": {
              const last = progress.steps.at(-1);
              if (last?.type === "thinking") last.text += part.text;
              else progress.steps.push({ type: "thinking", text: part.text });
              break;
            }
            case "tool-input-start":
              progress.steps.push({
                type: "tool",
                id: part.id,
                name: part.toolName,
                state: "calling",
              });
              break;
            case "tool-call": {
              const step = toolStep(part.toolCallId);
              if (step) step.input = part.input;
              else
                progress.steps.push({
                  type: "tool",
                  id: part.toolCallId,
                  name: part.toolName,
                  state: "calling",
                  input: part.input,
                });
              break;
            }
            case "tool-result": {
              const step = toolStep(part.toolCallId);
              if (step)
                Object.assign(step, { output: part.output, state: "done" });
              if (isHandoff(part.output)) handoff = part.output;
              break;
            }
            case "tool-error": {
              const step = toolStep(part.toolCallId);
              const message =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              if (step)
                Object.assign(step, { output: message, state: "error" });
              break;
            }
            case "text-delta":
              progress.reply += part.text;
              break;
            case "error":
              throw part.error;
            default:
              continue;
          }
          update(snapshot());
        }

        if (!handoff || handoffs >= MAX_HANDOFFS) break;
        // The other agent takes over: its answer replaces anything said so far.
        const next: Handoff = handoff;
        agent = next.handoff;
        summary = next.summary;
        progress.agent = agent;
        progress.reply = "";
        update(snapshot());
      }
      progress.status = "done";
      if (!progress.reply.trim()) progress.reply = SORRY;
    } catch {
      progress.status = "error";
      if (!progress.reply.trim()) progress.reply = SORRY;
    }
    done(snapshot());
  })();

  return { progress: live };
}
