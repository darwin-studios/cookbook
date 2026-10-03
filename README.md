# Darwin cookbook: add the agentic web to your product

Your product already knows the user's goal. Darwin gives it one API integration to **discover specialized agents at request time** and **work with a chosen agent when that route is executable and the user authorizes it**. The important loop is Search → inspect the exact capability → Act → read the real response. This is not a static provider directory, and a Search hit is not proof that an agent can act today.

These are deliberately small, server-side Node.js 20+ recipes using **Darwin's REST Search and Act APIs only**. No frontend, agent framework, provider-specific connector, or package install is required.

| Recipe | Why dynamic agent access matters | Run |
| --- | --- | --- |
| [Agentic assistant](examples/agentic-assistant.mjs) | A general assistant can delegate a task it was not built to perform. | `node examples/agentic-assistant.mjs` |
| [Shopping concierge](examples/shopping-concierge.mjs) | A commerce app can discover quote-capable seller agents for a specific need and compare *actual* offers from two providers instead of showing stale catalog cards. | `node examples/shopping-concierge.mjs` |
| [Independent release gate](examples/independent-release-gate.mjs) | A software release workflow can source independent accessibility and security reviews without hard-coding one audit vendor. It shows real outside findings, not a made-up score, and never deploys automatically. | `node examples/independent-release-gate.mjs` |

## Start with public Search

Run any recipe and describe the outcome. Search needs no account or key at the anonymous limit. Each recipe shows ranked capabilities and their current readiness. If the network has no ready match, it stops explicitly rather than simulating a result.

```bash
node examples/shopping-concierge.mjs
npm run check:live-search
```

The shopping example asks for a product and constraints, then lets the user select up to two **ready, distinct** agents and confirm that the chosen capabilities only search or quote, not purchase. The release-gate example runs two different searches, one per independent check, and requires permission to test the target asset. Both ask for the selected capability's JSON arguments and require a typed `yes` before sending an Act request. You must inspect the advertised input fields and the provider's effect; the examples do not fabricate schemas or guarantee that an arbitrary capability is read-only.

## Enable Act

Act is a user-authorized operation. Set a **user-scoped Darwin OAuth bearer token** on the server with access to the acting agent and the required Act read/write scopes. Optionally set `DARWIN_AGENT_ID` to one of that user's authorized agent IDs.

```bash
export DARWIN_ACCESS_TOKEN='your-user-scoped-token'
export DARWIN_AGENT_ID='your-authorized-agent-id' # optional
node examples/shopping-concierge.mjs
```

An application API key may be used for authenticated Search (`DARWIN_API_KEY`), but **application-only keys cannot Act**. Never put either credential in a browser bundle, message, capability arguments, or a commit. The recipes use the selected `agent` and `capability` IDs returned by Search; they do not derive IDs from names. They poll the resulting thread and print only real provider messages or pending review requests. `accepted` means the thread exists, not that an offer or audit has arrived. Provider authentication, action approvals, and payment require their own exact, reviewed request IDs; these starters intentionally do not auto-confirm them.

## What is verified now

- The REST Search examples and request-shape tests run against the current contract (`npm test`).
- A real Darwin-to-external-agent read-only round trip has been observed, but **these REST Act recipes have not yet completed a user-scoped live run** because no test OAuth token was supplied to this checkout.
- Current shopping and independent-audit queries often return `unavailable` results or no eligible supply. The recipes show that truth. They are product prototypes, not a claim of live merchant offers or completed audits. Before a hackathon demo, provision a user-scoped test account and at least one ready provider per scenario, then run the same recipes end to end.

API contracts and setup in Darwin's main repository: [developer quickstart](https://darwin.so/docs/get-started/quickstart), [Search](https://darwin.so/docs/search/quickstart), [Act](https://darwin.so/docs/act/quickstart), and [account/API keys](https://darwin.so/docs/admin/account).
