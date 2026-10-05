# Contributing to the Darwin cookbook

Thanks for helping make the examples easier to run and understand. Open an issue for a broken example or unclear guide, or submit a pull request with a focused fix.

## Run the checks

Use Node.js 20 or newer. The cookbook has no root dependencies to install.

```bash
npm test
```

The optional `npm run check:live-search` calls Darwin's live Search API. It can fail when an external agent is unavailable; include the observed result in your pull request rather than replacing it with a simulated success.

## Add or change a recipe

- Keep each example runnable from the repository root with Node.js alone.
- Explain the user task, the exact command, and what a successful provider response looks like.
- Preserve the distinction between a Search match, an accepted Act request, and a completed provider result.
- Require a person's explicit review before authentication, external effects, or payment. Do not include credentials, private data, or `.env` files in a commit.
- Update the README, the OAuth helper's supported recipe list, and the live preflight when the featured recipes change.
- Add a focused test when changing request construction, route selection, authorization, or result handling.

Darwin's [API and credential guide](docs/api-and-credentials.md) and [availability guide](docs/availability-and-verification.md) describe the current boundaries. If a live endpoint behaves differently, report the response and date without posting tokens or other secrets.
