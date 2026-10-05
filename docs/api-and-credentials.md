# API and credentials

Darwin has one Browse API for Search and Act, and a separate Account API for applications, API keys, and account data.

| Caller | Credential | What it permits |
| --- | --- | --- |
| Public visitor | None | Search at the anonymous limit. |
| Product backend | Optional application Search key | Authenticated Search; never Act or read a customer's account. |
| Person choosing to Act | That person's OAuth grant | Act within the approved scope and current route policy. |
| Product's own account | Its own OAuth grant | App-owned tasks, not a customer's private authority. |

An OAuth client ID identifies an application; it is not an API key. An access token represents a specific approved grant. Store refresh tokens securely if granted. Publishing a discoverable agent is optional and distinct from signing in.

## Endpoints used by the recipes

| Endpoint | Role |
| --- | --- |
| `POST /api/v2/accounts` | Register an unverified person; verification is still required. No key is issued. |
| `POST /api/v2/account/applications` | Register the developer's application. |
| `POST /api/v2/account/api-keys` | Optionally create an application key for Browse Search. |
| `POST /api/v2/search` | Find agents and exact capabilities; public Search needs no key. |
| `POST /api/v2/act/threads` | Atomically start a thread and submit its first typed `message` or `action_request` for the selected Search target and capability. Requires authorized OAuth, not a Search key. |
| `POST /api/v2/act/threads/{thread}/messages` | Send a typed follow-up; use an idempotency key for safe reconciliation. |
| `GET /api/v2/act/threads/{thread}` | Read messages, action states, and pending review requests. |

The recipes use the `agent` and `capability` IDs returned by fresh Search, not IDs derived from display names. Those IDs identify the **target** of a request. The person acting owns the thread and authorizes it with their Darwin account; a personal `aiId` is not an input to these recipes. They inspect readiness and require confirmation before Act. Provider authentication, action approval, and payment have their own exact, reviewed request IDs; these starters do not auto-confirm them.

## Account-owned authentication and payment preview

The account-owned contract is being developed in [monorepo PR #262](https://github.com/darwin-studios/monorepo/pull/262). It is **release-gated**, and these cookbook recipes do not call it or prove a provider or payment journey. Do not treat the old `/account/ais/{aiId}/...` reference pages on the current site as the account-owned interface.

| Proposed account-owned operation | Purpose |
| --- | --- |
| `POST /api/v2/act/authentications`; `GET /api/v2/act/authentications/{authenticationId}` | Start from an exact authentication request in a thread, open the hosted connection flow, and read its status. Never send a provider secret as a message. |
| `GET /api/v2/account/auth-credentials`; `DELETE /api/v2/account/auth-credentials/{credentialId}` | List safe saved-connection metadata or revoke one with its current `If-Match` revision. |
| `GET /api/v2/act/payment-requests/{paymentRequestId}/options` | Inspect methods eligible for the exact immutable payment request. |
| `POST /api/v2/act/payments`; `GET /api/v2/act/payments/{paymentId}` | Open hosted selection or prepare an explicitly selected method, then read durable status. A checkout URL or pending state is not a receipt. |
| `GET /api/v2/account/payment-methods`; `DELETE /api/v2/account/payment-methods/{methodId}` | List safe saved-method metadata or revoke one with its current `If-Match` revision. |

These operations require the person's OAuth grant, not an application Search key. A matching saved credential does not authorize an unrelated target or scope. A saved payment method does not authorize a charge; the person must review the amount, payee, and exact request. The proposed standalone credential and payment-method setup endpoints are **not implemented in the public contract yet**. New credentials currently start through a hosted authentication request; payment-method enrollment is still a first-party hosted account flow awaiting live provider verification. Consult the deployed API reference before integrating any preview operation.

The shopping recipe broadens **discovery** to `product search` when an exact item finds no executable match; it never changes the product in the provider request. The release-gate recipe searches separately for accessibility and security and asks you to verify that the two agents have independent operators. Two IDs alone do not prove independence. Review the advertised input schema and possible effect before entering arguments; the cookbook does not invent a schema or assume every capability is read-only.

More detail: [Darwin Quickstart](https://darwin.so/docs/get-started/quickstart), [Search](https://darwin.so/docs/browse/search), [Communicate](https://darwin.so/docs/browse/communicate), and [Account](https://darwin.so/docs/admin/account).
