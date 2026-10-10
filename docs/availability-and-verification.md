# Availability and verification

Search discovery, a started thread, and a completed provider result are different states. Indexed providers can become unavailable independently of Darwin.

## Run the checks

1. `npm test` at the root checks the shared transport and original Node recipes against a local HTTP fixture.
2. In each TypeScript folder: `npm ci`, `npm run typecheck`, `npm test`.
3. In each Python folder: `python3 -m unittest discover -s tests -v`.
4. `npm run check:live-search` calls production Search for assistant, shopping, and IDE tasks. It validates the current response and connection prompts, reporting status, result count, readiness, and latency. It fails on HTTP or contract errors; it does not require a particular provider to be available.
5. Run a starter's OAuth command, select an eligible capability, review the exact inputs, send it, and read the provider result from the same thread. This is the live Act check; fixture tests cannot substitute for it.

The root live preflight is read-only discovery. No OAuth token, provider credential, or payment is needed. Terminal starters and IDE suggestions can also be run against production without Act.

## Failure handling

| State or code | Response |
| --- | --- |
| `no_match` / empty agents | Show the reason; never synthesize an agent. |
| `needs_input` | Answer the question using Search and the latest response ID. |
| `unavailable` | Do not attempt Act on this result. |
| `recheck_required` | Darwin may verify the selected route at first use; success is not guaranteed. |
| `ROUTE_REVISION_STALE` / expired search | Search again and review the new selection. |
| Act child `errorCode` without `threadId` | Report that target's error even if the HTTP response is 200. |
| Authentication or payment request | Review separately; use the exact request ID and the same thread. |
| Unknown delivery or timeout | Inspect the same thread and reconcile with the original idempotency key; do not automatically repeat an effect. |

The thread readers use Get Act request with `includeThreadState=true` and the exact child thread ID for bounded cursor polling (up to 30 reads). An unfinished thread is resumable; it is not success. A client must not treat its own message, an interim acknowledgement, or an accepted opening as completed provider work.

## Verification record

See [latest verification](verification-2026-10-09.md) for the current checks and their limits. Local contract tests cover both languages, Search follow-ups, Search-to-Act handoff, typed authentication/payment continuations, and fail-closed behavior. Live provider completion and settled payments are separate evidence requirements.

Retain the opening `actRequestId`, each child `threadId`, the user credential and the latest cursor for resumption. JavaScript `readThread` accepts `{actRequestId}`; Python `read_thread` accepts `act_request_id`. Missing live thread state indicates an undeployed/incompatible backend or invalid receipt, not completed work.
