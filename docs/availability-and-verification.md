# Availability and verification

The agentic web is an open network. Some indexed agents or protocol implementations are stale, unreachable, or nonfunctional. Darwin can refuse an unsafe route and report why; it cannot repair an independent provider. Search discovery, thread acceptance, and a completed provider response are different states.

## Before a demo

1. Run `npm test` for local request shapes and result handling.
2. Run `npm run check:live-search` for fresh topical Search results, latency, and route availability. It intentionally exits nonzero if any Act-required example lacks enough task-matching ready agents. A first-use recheck candidate is not counted as ready.
3. For an Act demonstration, complete OAuth for the acting person, select an eligible capability, send its reviewed request, and read the provider's result from the same thread. Show a real result or the exact failure; do not simulate it.

The preflight covers the documentation Quickstarts and all three cookbook recipes. It requires one task-matching ready agent for each Act-required Quickstart, the personal AI assistant, and the proactive IDE companion, plus two distinct shopping agents for the concierge comparison. The Search-only invoice example checks result relevance without requiring an executable route. The live check also measures latency and fails above 5 seconds, or 10 seconds for shopping's exact-plus-fallback discovery. It does not execute provider actions.

## Interpreting a failure

| Code or state | Meaning | Safe response |
| --- | --- | --- |
| `ROUTE_NOT_APPROVED` | No reviewed executable route is active. | Choose another eligible route or wait for verification. |
| `ROUTE_REVISION_STALE` | Capability revision or receipt-bound activation proof no longer matches. | Search again; do not reuse the stale selection. |
| `ROUTE_VERIFICATION_EXPIRED` | The previous successful check has passed its validity window. | Request a reviewed recheck if Search explicitly permits it. |
| `ROUTE_NOT_READY` | The route cannot currently execute. | Show the reason; do not bypass Darwin by calling the provider directly. |
| `THREAD_TOOL_SELECTION_REQUIRED` | A public MCP server needs an exact tool choice; no thread was created. | Review the returned capability and input schema. Do not guess arguments. |
| `THREAD_DELIVERY_RECONCILIATION_REQUIRED` | An accepted delivery has an unknown outcome. | Inspect the same thread; do not blindly resubmit an action or payment. |

None of the route codes alone proves a provider is offline. There is no universal public “agent unreachable” code that safely describes every case. The recipes preserve Act's structured `code`, display `threadUnavailableReason` when Search supplies it, and report failed public actions and messages rather than treating them as answers.

Use the same idempotency key to reconcile an uncertain start. Never create a second, different mutation automatically. An `accepted` response means the request was recorded, not that the provider finished. Auth, approval, and payment require their own explicit review; these recipes do not silently grant or pay.

As of the October 4 live preflight, relevant Search matches appeared for all checked tasks, but Act-required scenarios had no executable matches. This is a snapshot of those queries, not a claim about the entire index or future readiness. Rerun the preflight immediately before a demo and obtain an authorized provider response before claiming an end-to-end Act success.
