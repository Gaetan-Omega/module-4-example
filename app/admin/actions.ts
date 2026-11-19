"use server";

// What the protected Refund Console on /admin can do. Every action checks the
// admin cookie first, so the buttons can't be used without signing in.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  isAdmin,
  passwordMatches,
  sessionToken,
} from "@/lib/copper/refunds/admin-auth";
import {
  consoleState,
  decideRefund,
  setAutoRefundLimit,
  type Decision,
} from "@/lib/copper/refunds/service";
import type { ConsoleState } from "@/lib/copper/refunds/types";

export async function signIn(
  _previous: string,
  form: FormData,
): Promise<string> {
  if (!passwordMatches(String(form.get("password") ?? "")))
    return "That password isn't right.";
  (await cookies()).set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/admin");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin");
}

export async function loadAdminConsole(): Promise<ConsoleState> {
  if (!(await isAdmin())) throw new Error("Not signed in.");
  return consoleState();
}

export async function decideAdminRequest(
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<Decision> {
  if (!(await isAdmin())) return { ok: false, error: "Not signed in." };
  return decideRefund(requestId, decision, note);
}

export async function saveAdminLimit(
  limitUsd: number,
): Promise<{ ok: boolean; limitUsd?: number }> {
  if (!(await isAdmin())) return { ok: false };
  const saved = setAutoRefundLimit(limitUsd);
  return saved === null ? { ok: false } : { ok: true, limitUsd: saved };
}
