import type { Metadata } from "next";
import { AskCopper } from "@/components/copper/ask-copper";
import { RefundConsole } from "@/components/copper/refund-console";
import { SiteHeader } from "@/components/copper/site-header";
import { isAiConfigured } from "@/lib/ai/call";
import {
  decideRequest,
  loadConsole,
  saveAutoRefundLimit,
} from "@/app/support/actions";

export const metadata: Metadata = { title: "Support | Copper State Labs" };

export default function Support() {
  return (
    // Leaves room on the right for the docked chat.
    <div className="flex flex-1 flex-col lg:pr-[28rem]">
      <SiteHeader />
      <main
        data-testid="refund-console"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-8"
      >
        <h1 className="font-display text-3xl font-bold">Refund Console</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          Demo page, open to anyone with the link. Use the chat on the right to
          ask for a refund, then approve or reject it here.
        </p>
        <RefundConsole
          actions={{
            load: loadConsole,
            decide: decideRequest,
            saveLimit: saveAutoRefundLimit,
          }}
        />
      </main>
      <AskCopper aiConfigured={isAiConfigured()} docked />
    </div>
  );
}
