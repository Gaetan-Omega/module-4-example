// Module 4: the Refund Console on /support and the chat docked beside it.
// The in-memory demo store stands in for a database; no model is called.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileRefund } from "@/lib/copper/refunds/service";
import { resetStore } from "@/lib/copper/refunds/store";

beforeEach(() => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
  resetStore();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderSupport() {
  const { default: Support } = await import("@/app/support/page");
  render(<Support />);
  return within(await screen.findByTestId("ask-copper"));
}

describe("the Refund Console", () => {
  it("shows the auto-refund limit, a refund waiting for approval, and every order", async () => {
    fileRefund("ava@example.com", "ORD-1001", "Too big");
    await renderSupport();
    const waiting = await screen.findByTestId("pending-REQ-1001");
    expect(waiting.textContent).toContain("ava@example.com");
    expect(waiting.textContent).toContain("$149");
    expect(waiting.textContent).toContain("Too big");
    expect(screen.getByTestId("limit-input")).toHaveValue("100");
    for (const email of [
      "ava@example.com",
      "finn@example.com",
      "cara@example.com",
      "ben@example.com",
      "dan@example.com",
      "eve@example.com",
    ])
      expect(screen.getAllByText(email).length).toBeGreaterThan(0);
  });

  it("saves a new limit", async () => {
    await renderSupport();
    const input = await screen.findByTestId("limit-input");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/limit saved: \$150/i)).toBeInTheDocument();
    expect(screen.getByTestId("limit-input")).toHaveValue("150");
  });

  it("saving without editing the box keeps the limit instead of setting it to $0", async () => {
    await renderSupport();
    await screen.findByTestId("limit-input");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/limit saved: \$100/i)).toBeInTheDocument();
    expect(screen.getByTestId("limit-input")).toHaveValue("100");
  });

  it("Approve refunds the order and tells the chat of the customer whose email is in the box", async () => {
    fileRefund("ava@example.com", "ORD-1001", "Too big");
    const chat = await renderSupport();
    fireEvent.change(chat.getByLabelText("Your order email"), {
      target: { value: "Ava@Example.com" },
    });
    const waiting = await screen.findByTestId("pending-REQ-1001");
    fireEvent.click(within(waiting).getByRole("button", { name: "Approve" }));

    const notice = await chat.findByTestId("refund-notice");
    expect(notice.textContent).toMatch(/approved your refund REQ-1001/);
    expect(notice.textContent).toMatch(/has been issued/);
    expect(notice.textContent).toContain("Refund specialist");
    await waitFor(() =>
      expect(screen.queryByTestId("pending-REQ-1001")).toBeNull(),
    );
    expect((await screen.findByTestId("decided-REQ-1001")).textContent).toMatch(
      /Refunded \$149/,
    );
  });

  it("Reject keeps the money and tells the customer it was not refunded", async () => {
    fileRefund("finn@example.com", "ORD-1002", "Changed my mind");
    const chat = await renderSupport();
    fireEvent.change(chat.getByLabelText("Your order email"), {
      target: { value: "finn@example.com" },
    });
    const waiting = await screen.findByTestId("pending-REQ-1001");
    fireEvent.click(within(waiting).getByRole("button", { name: "Reject" }));

    const notice = await chat.findByTestId("refund-notice");
    expect(notice.textContent).toMatch(/did not approve it/);
    expect(notice.textContent).toMatch(/not refunded/);
    expect((await screen.findByTestId("decided-REQ-1001")).textContent).toMatch(
      /Rejected/,
    );
  });

  it("doesn't tell the chat when the email in the box is someone else's", async () => {
    fileRefund("ava@example.com", "ORD-1001", "Too big");
    const chat = await renderSupport();
    fireEvent.change(chat.getByLabelText("Your order email"), {
      target: { value: "cara@example.com" },
    });
    const waiting = await screen.findByTestId("pending-REQ-1001");
    fireEvent.click(within(waiting).getByRole("button", { name: "Approve" }));
    await screen.findByTestId("decided-REQ-1001");
    expect(chat.queryByTestId("refund-notice")).toBeNull();
  });
});
