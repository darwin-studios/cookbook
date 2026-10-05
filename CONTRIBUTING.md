# Contributing to the Darwin cookbook

Thanks for helping make the examples easier to run and understand. Open an issue for a broken example or unclear guide, or submit a pull request with a focused fix.

## Run the checks

Use Node.js 20+ for the original contract suite. The maintained TypeScript examples need their own `npm install`; Python examples use Python 3.11+ with no package dependencies.

```bash
npm test
```

The optional `npm run check:live-search` calls Darwin's live Search API. It can fail when an external agent is unavailable; include the observed result in your pull request rather than replacing it with a simulated success.

## Add or change an example

- Keep the TypeScript and Python versions behaviorally matched. Each folder needs a short README, environment template, one visible task flow, manifest, and focused tests.
- Explain the user task, the exact command, and what a successful provider response looks like.
- Preserve the distinction between a Search match, an accepted Act request, and a completed provider result.
- Require a person's explicit review before authentication, external effects, or payment. Do not include credentials, private data, or `.env` files in a commit.
- Update the root README, relevant links, OAuth helper, and live preflight when the featured examples change. Keep the old commands working until their links have migrated.
- Add a focused test when changing request construction, route selection, authorization, or result handling.

Darwin's [API and credential guide](docs/api-and-credentials.md) and [availability guide](docs/availability-and-verification.md) describe the current boundaries. If a live endpoint behaves differently, report the response and date without posting tokens or other secrets.
