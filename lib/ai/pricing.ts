import type { ModelId } from "@/lib/ai/models";

// US dollars per million tokens: Google's list prices as of 2026-10.
// Billing may differ slightly; these are for cost estimates.
export const PRICING: Record<ModelId, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-3-flash": { input: 0.5, output: 3 },
  // ESTIMATE: 3.1 Flash-Lite wasn't on Google's pricing page when this was
  // added, so this uses the price listed for 3.5 Flash-Lite (2026-11).
  "google/gemini-3.1-flash-lite": { input: 0.3, output: 2.5 },
};

export function costUsd(
  model: ModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[model];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
