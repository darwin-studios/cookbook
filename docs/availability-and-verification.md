# Availability and verification

The agentic web is an open network. Some indexed agents or protocol implementations are stale, unreachable, or nonfunctional. Darwin can refuse an unsafe route and report why; it cannot repair an independent provider. Search discovery, thread acceptance, and a completed provider response are different states.

## Before a demo

1. Run `npm test` for the original local contracts, then run each maintained TypeScript example's `npm test` and `npm run typecheck` and each Python example's `python3 -m unittest discover -s tests`. These use a fake local API, not a real provider.
2. Run `npm run check:live-search` for fresh topical Search results, latency, and route availability. It intentionally exits nonzero if any Act-required example lacks enough task-matching ready agents. A first-use recheck candidate is not counted as ready.
3. For an Act demonstration, complete OAuth for the acting person, select an eligible capability, send its reviewed request, and read the provider's result from the same thread. Show a real result or the exact failure; do not simulate it.

The existing preflight covers the documentation Quickstarts and the task queries behind the general assistant, IDE suggestions, and shopping comparison. It is a Search/route snapshot, not an Act or provider-result test. It currently requires one task-matching ready agent for each Act-required Quickstart, the general assistant, and the IDE example, plus two distinct shopping agents. The Search-only invoice check requires relevance, not an executable route. Its latency budget is 5 seconds, or 10 seconds for shopping's exact-plus-fallback discovery.

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

## Verification record · October 4, 2026

The original Node contract suite, all three TypeScript example suites and typechecks, and all three Python example suites passed locally. These tests use a local fake API; they prove request construction and safety behavior, not external completion.

The live Search preflight returned task-related results, but it exited nonzero: the general-assistant diagnostic had 8 relevant matches and no ready route (one first-use recheck); the IDE email-security task had no relevant match among its 8 results; shopping had 4 relevant matches after broader discovery and no ready route. The documentation Quickstart queries also had no ready route in that run. A separate job-openings query likewise returned unavailable routes. These observations apply only to those queries at that time, not the whole index.

No new example has yet completed an OAuth → Act → external provider response replay, and Authenticate/Pay have only been exercised against local fixtures, not a live test provider. Rerun Search immediately before a demo, then obtain an authorized provider result before claiming a live end-to-end success. Never label a fixture output or an accepted thread as that proof.
