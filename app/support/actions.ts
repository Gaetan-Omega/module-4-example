"use server";

// What the Refund Console on /support can do. This page is open on purpose
// for the class demo: anyone with the link can approve or reject. Put it
// behind the admin password (see /admin) before any real use.
import {
  consoleState,
  decideRefund,
  setAutoRefundLimit,
  type Decision,
} from "@/lib/copper/refunds/service";
import type { ConsoleState } from "@/lib/copper/refunds/types";

export async function loadConsole(): Promise<ConsoleState> {
  return consoleState();
}

export async function decideRequest(
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<Decision> {
  return decideRefund(requestId, decision, note);
}

export async function saveAutoRefundLimit(
  limitUsd: number,
): Promise<{ ok: boolean; limitUsd?: number }> {
  const saved = setAutoRefundLimit(limitUsd);
  return saved === null ? { ok: false } : { ok: true, limitUsd: saved };
}
