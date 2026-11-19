# Architecture

How the Copper State Labs app fits together. Each module adds a section at the
end (see [Adding a module](#adding-a-module)) when it changes how the app
works: new pages, tables or AI calls.

_Fictional — for educational use._

## The starter app (Module 0)

A Next.js app that builds, runs and deploys with **no environment variables**.
A Google AI Studio key is optional until a module needs one.

| Piece | Where | What it does |
|---|---|---|
| Pages | `app/` | `layout.tsx` sets the fonts and theme; `page.tsx` is the placeholder home page |
| Brand components | `components/copper/` | `Logo`, `SiteHeader`, `SiteFooter`, `ModeToggle` |
| UI kit | `components/ui/` (shadcn), `components/ai-elements/` (AI Elements) | The only UI libraries the app uses |
| Setup card | `components/setup-required.tsx` | `<SetupRequired service="ai" />`, shown instead of a page whose service isn't configured |
| Company catalog | `lib/copper/catalog.ts`, `lib/copper/data/catalog.json` | Product, plan and privacy facts from the Product Bible (Sections 3, 4, 8 and 10). Pages read prices and plan details from here instead of typing them (added in the Module 1 starter) |
| AI wrapper | `lib/ai/call.ts` | `callText` and `callObject`: every model call goes through these and is logged to the terminal |
| Models and prices | `lib/ai/models.ts`, `lib/ai/pricing.ts` | The approved Gemini models and their token prices |

## Data flow

1. A user opens a page in `app/`.
2. Server code checks what's configured (`isAiConfigured()`). If the key is
   missing, the page renders `<SetupRequired />` instead of crashing.
3. Data comes from files under `lib/copper/data/`.
4. AI requests go through `callText` / `callObject` in `lib/ai/call.ts`, which
   calls Google and then prints one `[ai_calls]` line: `module`, `feature`,
   `model`, tokens, `cost_usd`, `latency_ms`, `ok`.

```ts
const { text } = await callText(
  { module: 2, feature: "ask-copper" },
  { prompt },
);
```

## Two kinds of "AI tiers"

Don't mix these up:

- **Copper State Labs' product tiers** (On-device, Raw Ore, Refined, the
  Copper Cloud) are part of the fictional company. They are facts in the
  [Product Bible](copper-state-labs/product-bible.md) and rows in the `ai_tiers`
  table.
- **The models this app calls** are real Claude models listed in
  `lib/ai/models.ts`. Their cost is logged in `ai_calls`.

## Decisions

- **No environment variables required.** Every service is optional, so a fresh
  clone builds and deploys before any accounts are set up.
- **One AI wrapper.** Routing every call through `lib/ai/call.ts` gives one
  place to log cost and latency per module and feature.
- **No authentication or row-level security yet.** They arrive in a later
  module.

## Adding a module

When a module changes how the app fits together, add a section here:

```md
## Module N: <feature name>

**Summary:** one or two sentences: what this adds and why.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/...` | |
| Components | `components/...` | |
| Data | `lib/copper/data/...` | Data files added |
| AI calls | `lib/ai/call.ts` (module, feature) | Model, prompt purpose, expected cost per call |

**Data flow:** user action → page → server code → database / model → response.

**Decisions and trade-offs:** what you chose, the alternatives, and why.

**Risks and open questions:** cost, privacy, accuracy or safety risks, and how
you handle them.
```

## Module 3 starter: Ask Copper

**Summary:** Ask Copper, the Module 2 shopping chatbot, finished: a floating
chat panel that answers prices, totals and stock with four tools and shows
each step. Module 3 teaches it to answer from the customer documents.

| Piece | Where | What it does |
|---|---|---|
| Component | `components/copper/ask-copper.tsx` | The launcher and chat panel, mounted from `app/page.tsx` and opened by the header's `#ask` link. Draws each answer as stations: the tools on offer, thinking, each tool call, then the reply |
| Server Action | `lib/copper/assistant/ask.ts` | `askCopper()`: streams the conversation with `callStream`, up to 5 steps, and sends each step back as a live `Progress` |
| Tools | `lib/copper/assistant/tools.ts` | `copperTools`: `get_products`, `get_prices`, `calculate_cost`, `check_availability` |
| Instructions | `lib/copper/assistant/instructions.ts` | `COPPER_INSTRUCTIONS`. Copper says it can't help yet with warranty, setup, troubleshooting or privacy |
| Data | `lib/copper/inventory.ts`, `lib/copper/documents.ts` | Stock from `lib/copper/data/inventory.json`; `DOCUMENTS`: the four customer documents and their PDF paths under `public/docs/`. The PDFs are added in class |
| AI calls | `{ module: 2, feature: "ask-copper" }` | One streamed call per question |

## Module 3: Document passages and embeddings

**Summary:** The four customer PDFs in `public/docs/` are split into passages
of a few sentences and embedded with Gemini, so Ask Copper can find the
passages that answer a question and cite their page.

| Piece | Where | What it does |
|---|---|---|
| Build script | `scripts/embed-docs.mjs` (`npm run embed-docs`) | Reads each PDF in `DOCUMENTS` page by page (with `unpdf`), splits pages with `splitPage()`, embeds every passage and writes the JSON. Re-run it when a PDF changes |
| Splitter | `lib/copper/split-passages.ts` | `splitPage()`: drops the footer lines, then groups sentences three at a time (at most ~600 characters) |
| Data | `lib/copper/data/passages.json`, `lib/copper/passages.ts` | `PASSAGES`: `documentId`, `title`, `page`, `text` (starts with the document title) and `embedding`. Importing it loads every passage into memory once per server |
| Tool | `lib/copper/assistant/tools.ts` | `search_docs`: embeds the question, ranks every passage by cosine similarity and returns the 5 closest with title, page, a `/docs/<file>.pdf#page=N` link and a score. The tool card lists them with links; the instructions tell Copper to use it for setup, troubleshooting, warranty and policy questions and to cite the page |
| Citations | `lib/copper/assistant/citations.ts`, `lib/copper/assistant/instructions.ts` | Copper answers document questions only from `search_docs`, ends every sentence with `[Title, p. N]`, and says "I couldn't find that in our support docs" otherwise. `splitCitations()` lets the panel link each citation to that PDF page; unknown titles stay plain text |
| AI calls | `callEmbedMany` in `lib/ai/call.ts`, `{ module: 3, feature: "embed-docs" }` | `gemini-embedding-2` at 768 dimensions. One call per run of the script, plus one `{ module: 3, feature: "search-docs" }` call per search. Google doesn't report embedding tokens, so the log's tokens and cost are null |

**Data flow:** PDF → pages → passages → Gemini embeddings → `passages.json` →
`PASSAGES` in memory. Question → `search_docs` → question embedding → 5
closest passages → Copper answers from them and cites the page.

**Decisions and trade-offs:** A JSON file in memory instead of a vector
database: about 120 passages is under 1 MB, so searching all of them is
instant and needs no new service. 768 dimensions instead of 3072 keeps the
file small with little loss in accuracy. The title goes at the start of each
passage so similar passages from different documents (Copper Home vs. Copper
Notes) embed differently.

**Risks and open questions:** Questions must be embedded with the same model
and dimensions (`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`) or the search
returns nonsense. Tables lose their columns when turned into text. Embeddings match meaning
better than exact strings, so an error code like C-47 can rank below other
error-code passages (it was third in testing); keyword search alongside would fix that.

## Module 4 starter: Support page

**Summary:** An empty Support page titled "Refund Console", with Ask Copper
(as finished in Module 3) docked on the right. Module 4 builds refunds here: a
second agent, and a person approving the large ones.

| Piece | Where | What it does |
|---|---|---|
| Page | `app/support/page.tsx` | The "Refund Console" title and nothing else yet, linked from the header as Support |
| Chat panel | `components/copper/ask-copper.tsx` | With the `docked` prop it starts open and the page beside it stays clickable. It is the same single agent and tools as on the home page |

## Module 4: Refund agent

**Summary:** Copper (the shopping agent) hands a customer who wants money back
to a separate Refund agent in the same chat. The Refund agent looks up the
customer's orders, checks the refund rules and files a refund request. A
refund that is eligible and **strictly under the auto-refund limit** (default
$100) is approved automatically; one at or over it waits in the Refund Console
for a person to Approve or Reject, and the chat tells the customer the result.

| Piece | Where | What it does |
|---|---|---|
| Rules | `lib/copper/refunds/rules.ts` | Plain, tested code: devices within 30 days, Copper Plus annual within 14 days, monthly never, one request per order, auto-approval below the limit. The model never decides these |
| Store | `lib/copper/refunds/store.ts` | In-memory demo data (six customers, their orders, requests, the limit, returned stock). Resets when the server restarts; `supabase/schema.sql` and `seed.sql` hold the tables for a real database later |
| Service | `lib/copper/refunds/service.ts` | What the tools and console do: purchase history, rules, filing, approve/reject (once only), the console state, the limit |
| Refund agent | `lib/copper/refunds/tools.ts`, `instructions.ts` | Tools `get_purchase_history`, `get_refund_rules`, `request_refund`, `hand_to_copper`. The customer's email is fixed by the server, so the model can't read other customers' orders. `request_refund` re-checks the rules itself |
| Handoff | `lib/copper/assistant/ask.ts` | One conversation. `hand_to_refund` / `hand_to_copper` end an agent's turn, the other agent continues in the same answer (at most 2 handoffs) and only its words are kept |
| Restocking | `lib/copper/refunds/availability.ts` | `update_availability` adds one unit back after a **device** refund is approved. Code runs it, never the model |
| Console | `app/support/page.tsx`, `components/copper/refund-console.tsx` | The open Refund Console (limit, waiting, decided, all orders), refreshed every 3 seconds, with the chat docked beside it |
| Admin | `app/admin/`, `lib/copper/refunds/admin-auth.ts` | The same console behind one password (`ADMIN_PASSWORD`, signed httpOnly cookie using `ADMIN_SESSION_SECRET`), plus the rule, the agent's recommendation, a note box and stock |
| Chat panel | `components/copper/ask-copper.tsx` | An order-email box, a badge for who is answering, each agent's tool list, tool cards for the refund tools and messages from the console |

Data flow: customer → Copper → `hand_to_refund` → Refund agent →
`get_purchase_history` → `get_refund_rules` → `request_refund` → auto-approved
(stock +1 for a device) or pending → Refund Console → Approve / Reject →
window event → notice in the chat.

Limits: `/support` is open on purpose for the class demo, so anyone with the
link can approve; put it behind the admin password before any real use. The
refund payout is simulated. The in-memory store is per server instance, so on
Vercel it is not shared between instances and resets on restart. The default
model is Gemini 3.1 Flash-Lite, and its price in `lib/ai/pricing.ts` is an
estimate.
