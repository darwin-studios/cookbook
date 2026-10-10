# Cookbook migration verification — October 9, 2026

This update aligns the cookbook with the four primary Search/Act operations in the current backend source. It does not deploy the backend or claim live provider completion.

## Changed behavior

- JavaScript/TypeScript and Python readers use `GET /api/v3/act/requests/{actRequestId}?includeThreadState=true&threadId=...` and read only the matching child's `state`.
- An opening receipt without state, or a state for another thread, fails clearly. It never counts as a provider response.
- Exact `targets` preserve the user-selected capability when an agent has multiple capabilities.
- Authentication/payment responses remain typed messages through `POST /api/v3/act`. Removed the unsupported payment `method` field.
- Search follow-ups omit initial result limits so the backend can inherit them.
- Added owner-aware Get search helpers, pagination, actual PDF/image file-context helpers, and missing-state/receipt tests.
- Existing recipes retain review before external requests, no automatic uncertain mutation retry, and separate pending consent from completed results.

## Checks completed

- Root Node suite: 33 passed.
- TypeScript starters: all three typechecks passed; 12 tests passed across general assistant, shopping and IDE.
- Python starters: 15 tests passed across the same three examples, including new migration/file-context cases.
- Cookbook-generated Search file input, exact-target Act opening and text continuation validated against the actual backend Zod input schemas: three passed.
- Live anonymous Search for academic-paper discovery returned `completed`, assessment `strong`, three candidates. Get search with the original owner token returned the same saved response. Combined time: 9.47 seconds. This checks discovery and ownership-aware retrieval, not paper retrieval or provider execution.
- `git diff --check` passed.

These counts are local fixture/component checks except for the explicitly named live Search/read pair. No live Act request was sent.

## Deployment boundary

The Get Act request `includeThreadState` option is currently implemented in the Darwin backend source but not live-verified or deployed by this cookbook update. Deploy it before using these new Act readers. Older separate thread routes still exist for compatibility; these cookbook helpers use the four-operation integration.

Local HTTP fixtures prove request construction and result handling, not provider capability, authentication setup or payment settlement. No external provider task, consent or payment was executed during this migration.

For a live check, use the person's OAuth grant, review the exact target and arguments, retain `actRequestId`/`threadId`, and wait for actual provider messages/results through Get Act request. Reconcile uncertain delivery with the original idempotency key; do not start duplicate work.

## Quality and latency

The October 9 backend audit of 200 production queries exposed relevance-verification failures, false-positive recommendations, incomplete plans and slow responses. It is not a passing quality gate or a concurrent-user load test. Local relevance improvements and targeted model checks do not establish the quality of every example or production results under two seconds. Test task scope and deliverables, not just HTTP success or ready counts.

The previous [October 7 record](verification-2026-10-07.md) remains historical evidence; its endpoint examples and results are not a current deployment guarantee.
