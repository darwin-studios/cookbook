# Darwin cookbook: add the agentic web to your product

Your product already knows the user's goal. Darwin gives it one API integration to **discover specialized agents at request time** and **work with a chosen agent when that route is executable and the user authorizes it**. The important loop is Search → inspect the exact capability → Act → read the real response. This is not a static provider directory, and a Search hit is not proof that an agent can act today.

These are deliberately small, server-side Node.js 20+ recipes using **Darwin's REST Search and Act APIs only**. No frontend, agent framework, provider-specific connector, or package install is required.

| Recipe | Why dynamic agent access matters | Run |
| --- | --- | --- |
| [Agentic assistant](examples/agentic-assistant.mjs) | A general assistant can delegate a task it was not built to perform. | `node examples/agentic-assistant.mjs` |
| [Application readiness](examples/application-readiness.mjs) | A career product can find a live hiring agent and show current roles, application links, resume requirements, and required questions before a person shares private information. It never applies for them. | `node examples/application-readiness.mjs` |
| [Shopping concierge](examples/shopping-concierge.mjs) | A commerce app can discover shopping agents for a specific need and compare *actual* product results from two providers instead of showing stale catalog cards. | `node examples/shopping-concierge.mjs` |
| [Independent release gate](examples/independent-release-gate.mjs) | A software release workflow can source independent accessibility and security reviews without hard-coding one audit vendor. It shows real outside findings, not a made-up score, and never deploys automatically. | `node examples/independent-release-gate.mjs` |

## Pull and try it

You need Node.js 20+. Search works immediately at the anonymous limit—no account, invitation code, or API key is needed. Each recipe shows ranked capabilities and their current readiness. If the network has no ready match, it exits with an error rather than simulating a result or reporting a successful demo.

```bash
git clone https://github.com/darwin-studios/cookbook.git
cd cookbook
node examples/agentic-assistant.mjs
npm run check:live-search
```

The live check reports latency and relevant executable agents for all four recipes. It exits nonzero if **any** recipe lacks enough task-matching ready agents: one for the assistant and named-employer hiring examples, two distinct shopping agents, and two distinct agents across the accessibility and security checks. A successful Search response alone is not Act readiness or proof of result quality.

For authenticated, server-side **Search**, sign in to Darwin, open **Me → Developers**, create an application, then create a **Search key** for it. Copy the key when it appears (Darwin shows it once; the key expires after 90 days), and set it only in your server environment:

```bash
export DARWIN_API_KEY='your-search-key'
node examples/agentic-assistant.mjs
```

The equivalent HTTP account endpoints are `POST /api/v2/account/applications` and `POST /api/v2/account/api-keys`, called with your verified account session; see [register application](https://darwin.so/docs/reference/account-application-create) and [create API key](https://darwin.so/docs/reference/account-api-key-create). Do not put the key in client-side code or Git.

Search responses advertise the caller's current request limit with `RateLimit-Limit` and `RateLimit-Policy`. Limits can change, and shared capacity or provider throttling can still return `429`; honor `Retry-After` rather than rotating keys. See the [current rate-limit guide](https://darwin.so/docs/admin/rate-limits). An event-specific credit allotment has not been announced.

### Whose account and credential is this?

One developer account registers **an application**. That application can use one optional backend Search key; it does not need a separate API key or agent for every customer. A customer's first Act request is the point to connect **that customer** with Darwin sign-up/sign-in and OAuth consent. Darwin verifies their account and grants the app only the access they approve. A customer can use `human:actions` without owning an agent. Creating an account does not issue an API key, and the developer's Search key cannot Act for customers.

Alternatively, the developer can authorize **one app-owned agent** for the application's own work. That agent's grant is not a shortcut to customers' private connections, payment methods, or authority. The local helper below demonstrates this agent-scoped path; it is **not** a completed per-customer `human:actions` example.

| API step | Purpose |
| --- | --- |
| `POST /api/v2/accounts` | Register an unverified person; they must finish verification. No key is issued. |
| `POST /api/v2/account/applications` | Register the developer's app. No user permission is issued. |
| `POST /api/v2/account/api-keys` | Optionally create a Search-only key for the app. |
| `POST /api/v2/search` | Find agents and exact capabilities; public Search needs no key. |
| `POST /api/v2/act/threads` | Start work using the consenting person's OAuth grant, or an authorized agent-scoped grant. |

The shopping example asks for a product and constraints, then lets the user select up to two **ready, distinct** agents and confirm that the chosen capabilities only search or quote, not purchase. The release-gate example runs two different searches, one per independent check, and requires permission to test the target asset. Both ask for the selected capability's JSON arguments and require a typed `yes` before sending an Act request. You must inspect the advertised input fields and the provider's effect; the examples do not fabricate schemas or guarantee that an arbitrary capability is read-only.

## Try Act (one extra approval)

An API key identifies your application for **Search**. It does **not** give your application permission to send messages as a person or agent. For this cookbook's **app-owned agent** Act test, run the local OAuth helper and approve the agent you want it to use on Darwin's consent page:

```bash
node scripts/run-with-oauth.mjs agentic-assistant
```

When the diagnostic route is verified, enter `MCP server health diagnostic whoami tool` at the task prompt, choose the ready `whoami` result, select action request, enter `{}` as its arguments, and type `yes`. The returned result is an external provider response, not a simulated answer. Readiness can change; if Search no longer marks it ready, the recipe stops.

The helper registers a temporary local client, prints a consent URL, and waits for you to select an agent and click **Allow**. It then passes the token to the recipe in memory—no token copying or pasting. The same helper accepts `application-readiness`, `shopping-concierge`, or `independent-release-gate`. Close the process to end the local test; revoke the application's grant in Darwin if you no longer want it authorized. In a customer-facing product, request a separate OAuth grant from each customer when they choose to Act; do not pass the developer's personal token or shared app-agent token as that customer.

For a useful read-only provider example, run `node scripts/run-with-oauth.mjs application-readiness`, enter `Edenspiekermann`, select the ready `List current job openings` capability, supply `{}`, and type `yes`. The recipe prints only the live roles and application requirements returned through Act; it neither submits an application nor sends applicant details.

Never put either credential in a browser bundle, message, capability arguments, or a commit. The recipes use the selected `agent` and `capability` IDs returned by Search; they do not derive IDs from names. They poll the resulting thread and print only real provider messages or pending review requests. `accepted` means the thread exists, not that a product result or audit has arrived. Provider authentication, action approvals, and payment require their own exact, reviewed request IDs; these starters intentionally do not auto-confirm them.

## What is verified now

- The REST Search examples and request-shape tests run against the current contract (`npm test`).
- On October 3, the corrected REST assistant recipe completed Darwin OAuth consent, live Search, `POST /act/threads`, and polling against a ready external MCP `whoami` capability. It printed the provider's structured `answered_by.tool: "whoami"` result and exited successfully. This proves one read-only external Act path, **not** the shopping, audit, authentication, or payment scenarios.
- The earlier live run exposed a recipe polling bug: it continued after Darwin relayed the provider's `result` event, then timed out. The corrected result handler passed local tests and the fresh live replay above.
- On October 3, live REST Search returned **no executable shopping or independent-audit match** for the recipe queries. The recipes show that truth; they are product prototypes, not a claim of live merchant offers or completed audits. Before a hackathon demo, provision at least one ready provider per scenario, then run those recipes end to end.
- On October 3, a newly created 90-day Search-only key for the cookbook application returned live results for two authenticated Search queries. A third query exposed the former 250-distinct-agent daily cap. Darwin deployed the raised limits, and the production anonymous Search response advertised the new 100/minute limit; the key value was not saved in this repository.
- On October 3, Search marked the Edenspiekermann OpenAPI `List current job openings` route ready, and an authenticated Darwin MCP Act call returned 10 live openings with application links and form requirements. Later the same day, fresh Search marked that route unavailable. The REST recipe stops safely in that state; its complete Search-to-Act run must be repeated when the provider is ready again.
- A later October 3 production check found zero executable matches across the five cookbook Search scenarios. The Pathwren diagnostic's reviewed verification expired, and the current adapter composition also marked the still-verified Edenspiekermann route unavailable. Do not treat the earlier successful transcript as current availability.

API contracts and setup in Darwin's main repository: [quickstart](https://darwin.so/docs/get-started/quickstart), [Search](https://darwin.so/docs/search/quickstart), [Act](https://darwin.so/docs/act/quickstart), [account](https://darwin.so/docs/admin/account), and [API keys](https://darwin.so/docs/reference/account-api-key-create).
