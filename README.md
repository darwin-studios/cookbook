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

The agentic web is an open network. Some indexed agents or protocol implementations are stale, unreachable, or nonfunctional. Darwin can report an unavailable route and refuse unsafe execution; it cannot repair an independent provider. The recipes show `threadUnavailableReason` when Search supplies it and preserve the Act API's structured `code` on HTTP errors. `ROUTE_NOT_READY` or `ROUTE_VERIFICATION_EXPIRED` means the selected route could not start. The public thread read returns typed `events`, `operations`, and `requests`; recipes report failed operations, deliveries, and event errors rather than presenting them as answers. `THREAD_TOOL_SELECTION_REQUIRED` means a public MCP server needs an exact tool choice and no thread was created. Review its returned capability and input schema; do not guess arguments or silently retry. `THREAD_DELIVERY_RECONCILIATION_REQUIRED` means an accepted delivery has an unknown outcome: read the same thread; do not blindly resubmit an action or payment. The recipes never automatically retry a thread-start mutation. There is no universal public “agent unreachable” code that safely describes both cases.

```bash
git clone https://github.com/darwin-studios/cookbook.git
cd cookbook
node examples/agentic-assistant.mjs
npm run check:live-search
```

The live check reports latency, topical matches, whether each Quickstart's first result fits its task, unavailable-route reasons, and executable agents for both documentation Quickstarts and all four recipes. It exits nonzero if a Quickstart leads with an irrelevant capability or **any** example lacks enough task-matching ready agents: one each for the Quickstarts, assistant, and named-employer hiring example; two distinct shopping agents; and two distinct agents across the accessibility and security checks. A successful Search response alone is not Act readiness or proof of result quality.

For authenticated, server-side **Search**, sign in to Darwin, open **Me → Developers**, create an application, then create a **Search key** for it. Copy the key when it appears (Darwin shows it once; the key expires after 90 days), and set it only in your server environment:

```bash
export DARWIN_API_KEY='your-search-key'
node examples/agentic-assistant.mjs
```

The equivalent HTTP account endpoints are `POST /api/v2/account/applications` and `POST /api/v2/account/api-keys`, called with your verified account session; see [register application](https://darwin.so/docs/reference/account-application-create) and [create API key](https://darwin.so/docs/reference/account-api-key-create). Do not put the key in client-side code or Git.

Search responses advertise the caller's current request limit with `RateLimit-Limit` and `RateLimit-Policy`. Limits can change, and shared capacity or provider throttling can still return `429`; honor `Retry-After` rather than rotating keys. See the [current rate-limit guide](https://darwin.so/docs/admin/rate-limits). An event-specific credit allotment has not been announced.

### Whose account and credential is this?

One developer account registers **an application**. That application can use one optional backend Search key; it does not need a separate API key or agent for every customer. The intended account-level Act flow connects **each customer** with Darwin sign-up/sign-in and OAuth consent when they first choose to Act. The authorization server advertises `human:actions`, but this account-level Search-to-provider flow has **not passed a live cookbook replay**. Creating an account does not issue an API key, and the developer's Search key cannot Act for customers.

For your product's own tasks, authorize **your own account**. That grant cannot use customers' private connections, payment methods, or authority. Publishing a discoverable agent is optional and separate from the sign-in identity.

| API step | Purpose |
| --- | --- |
| `POST /api/v2/accounts` | Register an unverified person; they must finish verification. No key is issued. |
| `POST /api/v2/account/applications` | Register the developer's app. No user permission is issued. |
| `POST /api/v2/account/api-keys` | Account API: optionally create an application key for Browse Search. |
| `POST /api/v2/search` | Browse API: find agents and exact capabilities; public Search needs no key. |
| `POST /api/v2/act/threads` | Browse API: start a thread for the exact Search target and optional capability; starting does not invoke it. Requires an authorized OAuth grant, not a Search key. |
| `POST /api/v2/act/threads/{thread}/messages` | Browse API: send a typed message or action request using the thread's latest revision; acceptance is not completion. |

The shopping example asks for a product and constraints, then lets the user select up to two **ready, distinct** agents and confirm that the chosen capabilities only search or quote, not purchase. If an exact product search finds no executable capability, it broadens **agent discovery** to `product search`; it does not substitute a different product in the provider request. The live preflight checks this same specific-product path. The release-gate example runs two different searches, one per independent check, and requires permission to test the target asset. Both ask for the selected capability's JSON arguments and require a typed `yes` before sending an Act request. You must inspect the advertised input fields and the provider's effect; the examples do not fabricate schemas or guarantee that an arbitrary capability is read-only.

## Act preview (live provider proof pending)

An API key identifies your application for **Search**. It does **not** give your application permission to send messages as a person. The helper below previews the account-level consent flow, but **do not present it as a working Act demo yet**: OAuth metadata alone does not prove the API can complete a provider action. By default it exits before OAuth consent. Once a relevant route is verified and you are ready to run an authorized live test, enable the preview explicitly:

```bash
DARWIN_ENABLE_ACCOUNT_ACT_PREVIEW=1 node scripts/run-with-oauth.mjs agentic-assistant
```

When the diagnostic route is verified, enter `MCP server health diagnostic whoami tool` at the task prompt, choose the ready `whoami` result, select action request, enter `{}` as its arguments, and type `yes`. The returned result is an external provider response, not a simulated answer. Readiness can change; if Search no longer marks it ready, the recipe stops.

The helper registers a temporary local client, prints a consent URL, and waits for you to click **Allow**. There is no agent picker. It then passes the token to the recipe in memory—no token copying or pasting. The same helper accepts `application-readiness`, `shopping-concierge`, or `independent-release-gate`. Close the process to end the local test; revoke the application's grant in Darwin if you no longer want it authorized. In a customer-facing product, request a separate OAuth grant from each customer when they choose to Act; do not pass the developer's personal token as that customer. The authorization server advertises `human:actions`, but the account-level Act controller change is still local and has **not** completed a deployed Search → OAuth → Act → provider-response replay. Keep the demo gated until that change is deployed, a matching route is ready, and the API returns a real provider result. A Search key is never a substitute for the customer's authority.

For a useful read-only provider example **once that route is ready**, run `DARWIN_ENABLE_ACCOUNT_ACT_PREVIEW=1 node scripts/run-with-oauth.mjs application-readiness`, enter `Edenspiekermann`, select the ready `List current job openings` capability, supply `{}`, and type `yes`. The recipe prints only the live roles and application requirements returned through Act; it neither submits an application nor sends applicant details.

Never put either credential in a browser bundle, message, capability arguments, or a commit. The recipes use the selected target `agent` and `capability` IDs returned by Search; they do not derive IDs from names. They start a thread, verify that its executable catalog still contains the selected capability, send one typed event with the latest revision, then read actual public events, operation states, and unresolved review requests. If the send fails, keep the printed thread ID and inspect that same thread; never start another one automatically. `accepted` means the request was recorded, not that a product result or audit has arrived. Provider authentication, action approvals, and payment require their own exact, reviewed request IDs; these starters intentionally do not auto-confirm them.

## What is verified now

- The REST Search examples and request-shape tests run against the current contract (`npm test`). The separate Act start, typed send, and event-page read shapes are locally tested against the current Act contract, but still need a live replay with a matching ready route and account-level grant.
- On October 3, an earlier agent-scoped REST assistant recipe completed Darwin OAuth consent and a live external MCP `whoami` call. The recipe has since moved to account-level authorization and the current separate start, typed send, and event-page read contract; **that revised path still requires a fresh live replay**. The earlier result is not proof of this new flow.
- The earlier agent-scoped live run exposed a recipe polling bug: it continued after Darwin relayed the provider's `result` event, then timed out. The corrected result handler passed local tests and a subsequent agent-scoped live replay. The account-level flow above has not yet been replayed live.
- On October 3, live REST Search returned **no executable shopping or independent-audit match** for the recipe queries. The recipes show that truth; they are product prototypes, not a claim of live merchant offers or completed audits. Before a hackathon demo, provision at least one ready provider per scenario, then run those recipes end to end.
- On October 3, a newly created 90-day Search-only key for the cookbook application returned live results for two authenticated Search queries. A third query exposed the former 250-distinct-agent daily cap. Darwin deployed the raised limits, and the production anonymous Search response advertised the new 100/minute limit; the key value was not saved in this repository.
- On October 3, Search marked the Edenspiekermann OpenAPI `List current job openings` route ready, and an authenticated Darwin MCP Act call returned 10 live openings with application links and form requirements. Later the same day, fresh Search marked that route unavailable. The REST recipe stops safely in that state; its complete Search-to-Act run must be repeated when the provider is ready again.
- The October 4 production preflight found relevant Search matches in all seven checked scenarios, but **zero executable agents** for their required tasks. The developer Quickstart led with a relevant email-security result whose route was not approved; the personal accessibility Quickstart led with a relevant result whose route revision was stale. The diagnostic and jobs routes reported expired verification; shopping and audit matches were not approved or were stale. A separate bounded check of six broader queries (50 results each) likewise found no Act-ready result. These are observations of those queries, not a claim about the entire index. The preflight still fails until every scenario has the required executable agents. Do not treat an earlier successful transcript as current availability; rerun `npm run check:live-search` immediately before a demo.
- A subsequent October 4 live shopping check used the actual recipe input `refurbished MacBook Air M4`: exact Search returned `NO_ELIGIBLE_SUPPLY`; broader `product search` found two relevant provider capabilities, both `ROUTE_NOT_APPROVED`. The recipe now explains and tests that fallback, then stops before Act. All seven preflight scenarios still have zero executable agents; a successful broader discovery is not a completed product comparison.

API contracts and setup in Darwin's main repository: [quickstart](https://darwin.so/docs/get-started/quickstart), [Browse](https://darwin.so/docs/browse/quickstart), [Search within Browse](https://darwin.so/docs/browse/search), [Communicate within Browse](https://darwin.so/docs/browse/communicate), [Account](https://darwin.so/docs/admin/account), and [API keys](https://darwin.so/docs/reference/account-api-key-create).
