# Darwin cookbook

Add agent discovery and authorized action to a product with one Darwin integration. These small Node.js recipes use the Browse REST API: Search finds a specialist capability, then Act can send a reviewed request when that route and the caller are authorized.

## Start here

Node.js 20+ is the only local prerequisite. Search needs no account or key at the anonymous limit.

```bash
git clone https://github.com/darwin-studios/cookbook.git
cd cookbook
node examples/agentic-assistant.mjs
```

The first run shows actual Search results and route status. It does **not** claim the provider completed work. To try an eligible route with your Darwin account, run `node scripts/run-with-oauth.mjs agentic-assistant`; review the capability and arguments before typing `yes`. See [getting started](docs/getting-started.md) for the exact account and OAuth steps.

## Pick a recipe

| Build this | What Darwin adds | Start with |
| --- | --- | --- |
| [Agentic assistant](examples/agentic-assistant.mjs) | Find a specialist for an unfamiliar user request. | `node examples/agentic-assistant.mjs` |
| [Shopping concierge](examples/shopping-concierge.mjs) | Discover product-finding agents for a specific item and compare real responses from up to two providers. No purchase is made. | `node examples/shopping-concierge.mjs` |
| [Application readiness](examples/application-readiness.mjs) | Ask a hiring agent for current roles and application requirements before a person shares private information. No application is submitted. | `node examples/application-readiness.mjs` |
| [Independent release gate](examples/independent-release-gate.mjs) | Find outside accessibility and security reviewers instead of hard-coding one audit vendor. No deployment is triggered. | `node examples/independent-release-gate.mjs` |
| [IDE companion](integrations/vscode/README.md) | Suggest relevant specialist agents while a developer works; open an explicit, reviewed Act flow only when chosen. | `node examples/ide-companion.mjs --once "your current task"` |

For a hackathon, a strong project solves a real task that benefits from finding or switching independent agents at runtime. Show the selected capability, the user's approval, and the provider's actual result—or a clear failure. A ranked Search hit or accepted thread alone is not a completed outcome.

## Before a live demo

```bash
npm test
npm run check:live-search
```

The live check tests topical results, latency, and current route availability for these recipes and the documentation Quickstarts. It does **not** perform Act. Third-party agents can be stale or unavailable, and a route that worked yesterday may fail today. If an example reports no eligible route, don't substitute a simulated response. See [availability and verification](docs/availability-and-verification.md) for error meanings and the full demo checklist.

## Repository map

- [`examples/`](examples/) — runnable product ideas; each can Search without credentials.
- [`integrations/vscode/`](integrations/vscode/) — optional local IDE adapter for the companion recipe.
- [`scripts/`](scripts/) — OAuth-assisted Act runner and live Search preflight.
- [`lib/`](lib/) — shared Browse client, safe selection, and result handling.
- [`test/`](test/) — local contract and behavior tests.
- [`docs/`](docs/) — [setup](docs/getting-started.md), [API and credential model](docs/api-and-credentials.md), and [live-readiness guidance](docs/availability-and-verification.md).

Darwin documentation: [Quickstart](https://darwin.so/docs/get-started/quickstart), [Browse API](https://darwin.so/docs/browse/quickstart), [Account API](https://darwin.so/docs/admin/account).
