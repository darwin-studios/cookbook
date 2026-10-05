# Choose an example

These are small terminal versions of product flows, not three names for the same Search call. Every example uses live Browse Search. Act runs only after the acting person completes OAuth, chooses an eligible capability, reviews the exact request, and types `yes`. No example fakes a provider result.

| Product you could build | Try Search | Try a reviewed Act request |
| --- | --- | --- |
| **Personal AI assistant:** your assistant finds a specialist for a task outside its own tools. | `node examples/agentic-assistant.mjs` | `node scripts/run-with-oauth.mjs agentic-assistant` |
| **Proactive IDE companion:** suggest useful specialists as an explicitly provided developer task or editor context changes. | `node examples/ide-companion.mjs --once "check live SPF and DMARC records"` | `DARWIN_IDE_TASK="check live SPF and DMARC records" node scripts/run-with-oauth.mjs ide-companion` |
| **Shopping concierge:** keep a specific item and constraints, discover product-search agents, and compare up to two real responses. | `node examples/shopping-concierge.mjs` | `node scripts/run-with-oauth.mjs shopping-concierge` |

Start with a Search-only run. It needs Node.js 20+ but no account or key at the anonymous limit. The output shows ranked capabilities, exact IDs, and current route status. If a route is unavailable, that is still a real Search result—not a completed task. [Setup and credentials](../docs/getting-started.md)

## What each flow demonstrates

### Personal AI assistant

Try a concrete task such as “Check live SPF and DMARC records for my sending domain” or “Find a tool to extract line items from invoice PDFs.” The code in [`agentic-assistant.mjs`](agentic-assistant.mjs) shows the full sequence: call Search with the exact task and objective, show ranked capabilities and readiness, let the person select an eligible result, ask whether to send a question or a schema-bound action request, start a thread, and read the provider response from that same thread.

In a real assistant, replace the terminal prompts with your own user-facing selection and approval UI. Keep the exact `agent` and `capability` IDs from Search. An LLM may help explain options, but it must not silently choose a provider, invent action arguments, or claim success from an accepted thread.

### Proactive IDE companion

The [`ide-companion.mjs`](ide-companion.mjs) worker takes the task the developer entered, editor language, and a coarse work area. It deduplicates context, spaces Search calls, filters weak matches locally, and returns suggestions through JSON lines. The optional [VS Code adapter](../integrations/vscode/README.md) displays them in a status item and picker. It sends no source text, file path, diagnostics, or chat history to Darwin. Selecting a suggestion opens a separate OAuth-and-review flow; saving a file never invokes Act.

This pattern is useful when a product already knows the user's current work. Replace the explicit task input only with a user-approved summary, not silent raw workspace upload.

### Shopping concierge

Try a specific request such as “refurbished MacBook Air M4,” then enter the condition, budget, delivery, and warranty requirements. [`shopping-concierge.mjs`](shopping-concierge.mjs) searches for research capabilities, broadens *provider discovery* if needed, and keeps the exact product request unchanged. The person chooses up to two different agents, reviews each advertised input schema and JSON arguments, and can send each request separately. The output labels each external response by provider; a missing result is an incomplete comparison.

In a real commerce app, map provider results into your own offer cards only when the external data includes the required product, price, and link. Do not fill gaps with invented offers. This starter does not purchase, approve a payment, or treat a checkout URL as a receipt.

## The reusable integration pattern

1. **Search** with the actual user task. Search is discovery, not execution.
2. **Inspect** the selected result's capability ID, input schema, readiness, and possible effect. Do not turn an unavailable match into a call.
3. **Authorize and review** for the acting person. An application Search key cannot Act for them.
4. **Act once** on the exact selected route with typed arguments and a stable idempotency key. Never blindly replay an uncertain mutation.
5. **Read the same thread** until there is an external result, a review request, or a failure. An accepted thread is not a completed outcome.

Run `npm test` for local behavior and `npm run check:live-search` immediately before a demo. The latter checks fresh supply but does not perform Act. [Availability and error meanings](../docs/availability-and-verification.md)
