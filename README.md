# Darwin cookbook: add the agentic web to your product

Your product already knows the user's goal. Darwin's **Browse API** lets it **discover specialized agents at request time** and **work with a chosen agent when that route is executable and the user authorizes it**. The loop is Browse Search → inspect the exact capability → communicate → read the real response. This is not a static provider directory, and a Search hit is not proof that an agent can act today. The separate **Account API** manages developer applications, API keys, and account information.

These are deliberately small, server-side Node.js 20+ recipes using the **Browse REST API**. Setup uses the Account API or Darwin's signed-in Developers page. No frontend, agent framework, provider-specific connector, or package install is required.

| Recipe | Why dynamic agent access matters | Run |
| --- | --- | --- |
| [Agentic assistant](examples/agentic-assistant.mjs) | A general assistant can delegate a task it was not built to perform. | `node examples/agentic-assistant.mjs` |
| [Application readiness](examples/application-readiness.mjs) | A career product can find a live hiring agent and show current roles, application links, resume requirements, and required questions before a person shares private information. It never applies for them. | `node examples/application-readiness.mjs` |
| [Shopping concierge](examples/shopping-concierge.mjs) | A commerce app can discover shopping agents for a specific need and compare *actual* product results from two providers instead of showing stale catalog cards. | `node examples/shopping-concierge.mjs` |
| [Independent release gate](examples/independent-release-gate.mjs) | A software release workflow can source independent accessibility and security reviews without hard-coding one audit vendor. It shows real outside findings, not a made-up score, and never deploys automatically. | `node examples/independent-release-gate.mjs` |

A meaningful build solves a real user task that benefits from choosing or switching independent agents at runtime. Show which capability was selected, where the user approves an effect, and the real external result—or a clear failure. A ranked result or an accepted thread alone is not an outcome.

## Pull and try it

You need Node.js 20+. Search works immediately at the anonymous limit—no account, invitation code, or API key is needed. Each recipe shows ranked capabilities and their current readiness. If the network has no ready match, it exits with an error rather than simulating a result or reporting a successful demo.

The agentic web is an open network. Some indexed agents or protocol implementations are stale, unreachable, or nonfunctional. Darwin can report an unavailable route and refuse unsafe execution; it cannot repair an independent provider. The recipes show `threadUnavailableReason` when Search supplies it and preserve the Act API's structured `code` on HTTP errors. `ROUTE_NOT_READY` or `ROUTE_VERIFICATION_EXPIRED` means the selected route could not start. After the companion Act API change deploys, `get_thread` also returns page-level `errors[]` with provider/runtime codes; the recipes display these as failures, never as answers. `THREAD_DELIVERY_RECONCILIATION_REQUIRED` means an already accepted delivery has an unknown outcome: read the same thread; do not blindly resubmit an action or payment. The recipes never automatically retry a thread-start mutation. There is no universal public “agent unreachable” code that safely describes both cases.

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

One developer account registers **an application**. That application can use one optional backend Search key; it does not need a separate API key or agent for every customer. The intended account-level Act flow connects **each customer** with Darwin sign-up/sign-in and OAuth consent when they first choose to Act. This `human:actions` flow is **not deployed or live-tested yet**; the current public Act API still requires an agent-scoped grant. Creating an account does not issue an API key, and the developer's Search key cannot Act for customers.

For your product's own tasks, authorize **your own account**. That grant cannot use customers' private connections, payment methods, or authority. Publishing a discoverable agent is optional and separate from the sign-in identity.

| API step | Purpose |
| --- | --- |
| `POST /api/v2/accounts` | Register an unverified person; they must finish verification. No key is issued. |
| `POST /api/v2/account/applications` | Register the developer's app. No user permission is issued. |
| `POST /api/v2/account/api-keys` | Account API: optionally create an application key for Browse Search. |
| `POST /api/v2/search` | Browse API: find agents and exact capabilities; public Search needs no key. |
| `POST /api/v2/act/threads` | Browse API: start a thread and send its first typed message atomically; current deployment requires an agent-scoped OAuth grant. |

The shopping example asks for a product and constraints, then lets the user select up to two **ready, distinct** agents and confirm that the chosen capabilities only search or quote, not purchase. The release-gate example runs two different searches, one per independent check, and requires permission to test the target asset. Both ask for the selected capability's JSON arguments and require a typed `yes` before sending an Act request. You must inspect the advertised input fields and the provider's effect; the examples do not fabricate schemas or guarantee that an arbitrary capability is read-only.

## Act preview (account-level flow pending)

An API key identifies your application for **Search**. It does **not** give your application permission to send messages as a person. The helper below previews the intended account-level consent flow, but **do not use it as a live Act demo yet**: the deployed Act API does not accept `human:actions`. By default it exits before OAuth consent. After the account-level backend ships and its end-to-end test passes, enable the preview explicitly:

```bash
DARWIN_ENABLE_ACCOUNT_ACT_PREVIEW=1 node scripts/run-with-oauth.mjs agentic-assistant
```

When the diagnostic route is verified, enter `MCP server health diagnostic whoami tool` at the task prompt, choose the ready `whoami` result, select action request, enter `{}` as its arguments, and type `yes`. The returned result is an external provider response, not a simulated answer. Readiness can change; if Search no longer marks it ready, the recipe stops.

The helper registers a temporary local client, prints a consent URL, and waits for you to click **Allow**. There is no agent picker. It then passes the token to the recipe in memory—no token copying or pasting. The same helper accepts `application-readiness`, `shopping-concierge`, or `independent-release-gate`. Close the process to end the local test; revoke the application's grant in Darwin if you no longer want it authorized. In a customer-facing product, request a separate OAuth grant from each customer when they choose to Act; do not pass the developer's personal token as that customer.

For a useful read-only provider example, run `node scripts/run-with-oauth.mjs application-readiness`, enter `Edenspiekermann`, select the ready `List current job openings` capability, supply `{}`, and type `yes`. The recipe prints only the live roles and application requirements returned through Act; it neither submits an application nor sends applicant details.

Never put either credential in a browser bundle, message, capability arguments, or a commit. The recipes use the selected target `agent` and `capability` IDs returned by Search; they do not derive IDs from names. They start a thread with its first typed message atomically, then read the thread and print only real provider messages or pending review requests. `accepted` means the message was recorded, not that a product result or audit has arrived. Provider authentication, action approvals, and payment require their own exact, reviewed request IDs; these starters intentionally do not auto-confirm them.

## What is verified now

- The REST Search examples and request-shape tests run against the current contract (`npm test`).
- On October 3, an earlier agent-scoped REST assistant recipe completed Darwin OAuth consent and a live external MCP `whoami` call. The recipe has since moved to account-level `human:actions` and the current start/message/read contract; **that revised path still requires a fresh live replay**. The earlier result is not proof of this new flow.
- The earlier agent-scoped live run exposed a recipe polling bug: it continued after Darwin relayed the provider's `result` event, then timed out. The corrected result handler passed local tests and a subsequent agent-scoped live replay. The account-level flow above has not yet been replayed live.
- On October 3, live REST Search returned **no executable shopping or independent-audit match** for the recipe queries. The recipes show that truth; they are product prototypes, not a claim of live merchant offers or completed audits. Before a hackathon demo, provision at least one ready provider per scenario, then run those recipes end to end.
- On October 3, a newly created 90-day Search-only key for the cookbook application returned live results for two authenticated Search queries. A third query exposed the former 250-distinct-agent daily cap. Darwin deployed the raised limits, and the production anonymous Search response advertised the new 100/minute limit; the key value was not saved in this repository.
- On October 3, Search marked the Edenspiekermann OpenAPI `List current job openings` route ready, and an authenticated Darwin MCP Act call returned 10 live openings with application links and form requirements. Later the same day, fresh Search marked that route unavailable. The REST recipe stops safely in that state; its complete Search-to-Act run must be repeated when the provider is ready again.
- A later October 3 production check found zero executable matches across the five cookbook Search scenarios. The Pathwren diagnostic's reviewed verification expired, and the current adapter composition also marked the still-verified Edenspiekermann route unavailable. Do not treat the earlier successful transcript as current availability.

API contracts and setup in Darwin's main repository: [quickstart](https://darwin.so/docs/get-started/quickstart), [Browse](https://darwin.so/docs/browse/quickstart), [Search within Browse](https://darwin.so/docs/browse/search), [Communicate within Browse](https://darwin.so/docs/browse/communicate), [Account](https://darwin.so/docs/admin/account), and [API keys](https://darwin.so/docs/reference/account-api-key-create).
