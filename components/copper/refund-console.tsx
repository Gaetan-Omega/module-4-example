"use client";

// The Refund Console: the auto-refund limit, refunds waiting for a person,
// refunds already decided and every order. It asks the server for fresh data
// every 3 seconds, so a request the Refund agent files shows up without a
// reload. Approve and Reject also tell the chat (a window event) so the
// customer is told the result.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/copper/catalog";
import type { Decision } from "@/lib/copper/refunds/service";
import {
  DECISION_EVENT,
  type ConsoleState,
  type RefundRequest,
} from "@/lib/copper/refunds/types";

export type ConsoleActions = {
  load: () => Promise<ConsoleState>;
  decide: (
    requestId: string,
    decision: "approve" | "reject",
    note?: string,
  ) => Promise<Decision>;
  saveLimit: (limitUsd: number) => Promise<{ ok: boolean; limitUsd?: number }>;
};

const REFRESH_MS = 3000;

export function RefundConsole({
  actions,
  detailed = false,
}: {
  actions: ConsoleActions;
  /** The admin page also shows the rule, the agent's recommendation, a note box and stock. */
  detailed?: boolean;
}) {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [limit, setLimit] = useState("");
  const [limitTouched, setLimitTouched] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const { load } = actions;

  const refresh = useCallback(async () => {
    try {
      setState(await load());
    } catch {
      // Try again at the next refresh.
    }
  }, [load]);

  // Ask the server now, then every 3 seconds.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const fresh = await load();
        if (active) setState(fresh);
      } catch {
        // Try again at the next refresh.
      }
    };
    void tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);

  // Show the saved limit until the person starts typing a new one.
  const shownLimit = limitTouched
    ? limit
    : String(state?.autoRefundLimitUsd ?? "");

  async function decide(
    request: RefundRequest,
    decision: "approve" | "reject",
  ) {
    const result = await actions.decide(
      request.id,
      decision,
      notes[request.id],
    );
    if (!result.ok) {
      setMessage(result.error);
    } else {
      setMessage(
        `${request.id} ${decision === "approve" ? "approved" : "rejected"}.`,
      );
      window.dispatchEvent(
        new CustomEvent(DECISION_EVENT, { detail: result.notice }),
      );
    }
    await refresh();
  }

  async function saveLimit() {
    if (!shownLimit.trim()) {
      setMessage("Enter a number from 0 to 100000.");
      return;
    }
    const result = await actions.saveLimit(Number(shownLimit));
    if (result.ok) {
      setLimitTouched(false);
      setMessage(`Auto-refund limit saved: ${formatUsd(result.limitUsd!)}.`);
    } else {
      setMessage("Enter a number from 0 to 100000.");
    }
    await refresh();
  }

  if (!state)
    return <p className="text-muted-foreground text-sm">Loading refunds…</p>;

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="limit-heading"
        className="bg-card rounded-xl border p-4"
      >
        <h2 id="limit-heading" className="font-semibold">
          Auto-refund limit
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          An eligible refund under this amount is approved automatically. At or
          over it, a person decides.
        </p>
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveLimit();
          }}
        >
          <span className="text-sm">$</span>
          <Input
            data-testid="limit-input"
            aria-label="Auto-refund limit in dollars"
            inputMode="decimal"
            value={shownLimit}
            onChange={(event) => {
              setLimitTouched(true);
              setLimit(event.target.value);
            }}
            className="w-28"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </section>

      {message && (
        <p role="status" className="bg-accent/15 rounded-lg px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <section aria-labelledby="waiting-heading">
        <h2 id="waiting-heading" className="font-semibold">
          Waiting for approval ({state.pending.length})
        </h2>
        {state.pending.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            No refunds are waiting.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {state.pending.map((request) => (
              <li
                key={request.id}
                data-testid={`pending-${request.id}`}
                className="bg-card rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {request.id} · {request.product}
                  </p>
                  <p className="font-mono">{formatUsd(request.amountUsd)}</p>
                </div>
                <p className="text-muted-foreground text-sm">
                  {request.customerEmail}
                </p>
                <p className="mt-2 text-sm">Reason: {request.reason}</p>
                {detailed && (
                  <div className="text-muted-foreground mt-2 space-y-1 text-xs">
                    <p>Rule: {request.ruleApplied}</p>
                    <p>Agent: {request.agentSummary}</p>
                    <p>Recommendation: {request.recommendation}</p>
                  </div>
                )}
                {detailed && (
                  <Input
                    aria-label={`Note for ${request.id}`}
                    placeholder="Admin note (optional)"
                    value={notes[request.id] ?? ""}
                    onChange={(event) =>
                      setNotes((all) => ({
                        ...all,
                        [request.id]: event.target.value,
                      }))
                    }
                    className="mt-2"
                  />
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => decide(request, "approve")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide(request, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decided-heading">
        <h2 id="decided-heading" className="font-semibold">
          Decided ({state.decided.length})
        </h2>
        {state.decided.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Nothing decided yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.decided.map((request) => (
              <li
                key={request.id}
                data-testid={`decided-${request.id}`}
                className="bg-card rounded-xl border p-3 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {request.id} · {request.product} · {request.customerEmail}
                  </span>
                  <span>
                    {request.status === "approved" ? "Refunded" : "Rejected"}{" "}
                    {formatUsd(request.amountUsd)}
                  </span>
                </div>
                {request.adminNote && (
                  <p className="text-muted-foreground">{request.adminNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="orders-heading">
        <h2 id="orders-heading" className="font-semibold">
          All orders
        </h2>
        <div className="bg-card mt-2 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Refund</th>
              </tr>
            </thead>
            <tbody>
              {state.orders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{order.id}</td>
                  <td className="px-3 py-2">{order.customerEmail}</td>
                  <td className="px-3 py-2">
                    {order.product}
                    {order.color ? `, ${order.color}` : ""}
                    {order.billing ? ` (${order.billing})` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatUsd(order.amountUsd)}
                  </td>
                  <td className="px-3 py-2">
                    {order.refundStatus === "none"
                      ? "None"
                      : order.refundStatus === "pending"
                        ? "Pending"
                        : "Refunded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detailed && (
        <section aria-labelledby="stock-heading">
          <h2 id="stock-heading" className="font-semibold">
            Stock
          </h2>
          <div className="bg-card mt-2 overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <tbody>
                {state.stock.map((row) => (
                  <tr key={row.sku} className="border-t first:border-t-0">
                    <td className="px-3 py-2 font-mono">{row.sku}</td>
                    <td className="px-3 py-2">
                      {row.product}, {row.color}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {row.units_in_stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
