# Cookbook verification · October 7, 2026

This update changes the cookbook's API calls and examples. It does not modify Darwin's database schema, Creora retrieval, provider adapters, or the account/payment broker implementation.

## Local contract checks

| Suite | Result |
| --- | --- |
| Root Node transport, original recipes, IDE worker, and OAuth tests | 28 passed |
| TypeScript general assistant | 7 passed; typecheck passed |
| TypeScript shopping | 3 passed; typecheck passed |
| TypeScript IDE | 2 passed; typecheck passed |
| Python general assistant | 6 passed |
| Python shopping | 3 passed |
| Python IDE | 2 passed |

**51 tests total.** Local HTTP fixtures exercise Search follow-ups and owner tokens; exact Search-to-Act selection; Act target failures inside HTTP 200; text/action continuations; hosted authentication/payment responses; provider completion versus acknowledgement; and withholding execution without user authorization. These tests prove the cookbook's request/response behavior, not a live external provider or payment settlement.

## Production checks

All six maintained starters ran against the production v3 API with exit code 0. The run was Search-only and removed user access tokens from child processes.

| Starter | Live observation |
| --- | --- |
| TypeScript general assistant | Agent listings and connection prompts; current routes unavailable |
| Python general assistant | Agent listings and connection prompts; current routes unavailable |
| TypeScript shopping | Broadened discovery retained original task; no available product-search route; no offers fabricated |
| Python shopping | Same safe behavior; no available product-search route |
| TypeScript IDE | Five relevant suggestions with exact IDs and connection prompts |
| Python IDE | Five relevant suggestions with exact IDs and connection prompts |

The independent three-query preflight returned five listings for the general assistant, a valid no-match for the exact shopping query, and five listings for the IDE query. None was Act-eligible in that snapshot. Provider availability and result counts can change.

A live Search follow-up with additional context preserved `searchId`, returned a new `responseId`, and linked it to the previous response. Search session: `srch_8b6181d2-947a-4ace-9ef2-dc990fd0a7f7`. The returned `index.darwin.so/agent/…` connection URL returned HTTP 200. This proves continuation and link reachability, not execution by another AI client.

## Remaining live proof

No authorized user OAuth token was available for these runs, and the sampled provider routes were unavailable. Consequently this update does **not** claim a live Search → OAuth → Act → external provider completion, provider authentication, or settled payment. The matching continuations passed local contract tests through `POST /api/v3/act`.

To verify a live provider journey: run a starter's OAuth command, select a currently eligible capability, review its documented arguments, confirm the request, and inspect its same-thread provider result. Authentication and payment requests require separate review. Preserve errors and pending states; do not label a thread opening or a redirect as completion.

## Repeat the production checks

```bash
npm run check:live-search
npm run check:live-examples
npm run check:live-continuation
```

The examples runner writes transcripts to a temporary directory and prints their paths. Set `DARWIN_LIVE_TRANSCRIPT_DIR` to choose a local destination; keep transcripts and credentials out of Git.
