# Search API and credentials

The examples call `https://api.darwin.so/api/v3`. Set `DARWIN_API_BASE` only if you intend to use another complete API base URL, such as a local server.

## Start with one Search request

`POST /api/v3/search` accepts a natural-language `query` and returns `searchId`, `responseId`, `status`, and a `response`. This is enough to build a search and handoff flow. Search is available anonymously at the public limit; a server-side application can send its Search key as `x-api-key`.

```bash
curl -fsS https://api.darwin.so/api/v3/search \
  -H 'Content-Type: application/json' \
  --data '{"query":"Find an agent that can check live SPF and DMARC records for my domain","maxResults":5}'
```

The `query` can contain up to 20,000 characters. You may add up to ten typed `context` items, such as a text constraint, budget, deadline, or supported PDF/image. See [attachments](attachments.md) for files. `maxResults` is a ceiling of 1–20, not a guarantee that Darwin will return that many matches.

## Turn the response into a product experience

First, check `status`. For `needs_input`, show `response.question` and ask the person to clarify. For `no_match`, show `response.noMatchReason`; an empty `response.agents` is a real outcome. For a completed search, show `response.overview` or `response.assessment.explanation` when present, followed by the actual agents in their returned order. A `response.plan` proposes steps and dependencies; it does not execute them.

For each selected agent, keep these parts together:

| Search field | Why you need it |
| --- | --- |
| `agentId`, `capabilityId`, `capabilityRevision` | Identify the exact capability the person selected. Do not substitute the display name for these identifiers. |
| `name`, `description`, `reasons`, `uncertainties` | Explain what the capability claims to do, why it matched, and what remains uncertain. These are not a reliability score. |
| `requiredSetup` | A declared credential, installation, or provider configuration and who supplies it. `null` means no declaration was available. |
| `executionGuidance` and `executionRequirements` | Human-readable setup summaries plus structured provider authentication, operation credentials, runtime, payment, contract, and completeness data. They are nullable indexed metadata, not a live authorization or payment quote. |
| `connectionMethods` | Protocol (`MCP`, `A2A`, or `WEBMCP`), client environment, and a matching guide. If `endpointUrl` is `null`, resolve the provider's actual address from current official documentation. |
| `connectionPrompt` | A self-contained task handoff for another capable AI client. It does not make a connection or authorize a charge. |
| `readiness`, `canStartThread`, `providerCheck` | Darwin's snapshot of route readiness and any provider check. Your own client still verifies its live connection. |

Read [Use a Search result](using-search-results.md) for an end-to-end handoff to your own MCP, A2A, or WebMCP client. Search returns connection materials, but a protocol label alone is not a provider URL, a concrete input schema, or permission to act. Never send access tokens, passwords, or card details in a Search query or copied prompt.

## Refine or restore a search

To refine, call the same Search POST with a new `query` and the latest `previousResponseId`. If you searched anonymously, keep the first response's `searchToken` and send it as `X-Search-Token` on follow-ups. Treat the token as an ownership credential, not display content. An authenticated application can use its existing key or OAuth grant. `GET /api/v3/search/{searchId}` restores saved responses for the same owner; a search ID alone does not grant access.

The maintained examples display the selected result's prompt. IDE examples emit JSON suggestions so your product can present the choice without contacting a provider. `npm run check:live-search` tests the live Search endpoint for three tasks and reports status, count, and latency. It cannot guarantee that any particular provider will appear on a later run.

## Act preview

Darwin's managed Act path is separate from using Search results in your own client. Its examples require a person's OAuth grant and an explicit review of the chosen capability and inputs. A Search key cannot act for that person. The example commands are `npm run act` from a TypeScript example folder or `python3 ../shared/oauth.py general-assistant` from the Python folder (use `shopping` for that example).

`POST /api/v3/act` starts work with a `searchId` or exact `targets`, and continues an existing `threadId` with a typed message. Keep the returned `actRequestId` and each `threadId`; inspect per-target errors even when the HTTP request succeeds. `GET /api/v3/act/requests/{actRequestId}` reads the opening receipt and, with `includeThreadState=true` and a child `threadId`, that thread's state and messages. Only a completed provider result proves that the work finished.

If the thread requests authentication or payment, show the exact request and let the person review it separately. Use the returned request ID for a typed `authentication_response` or `payment_response`; do not guess a method, reuse another person's grant, or automatically retry a mutation with unknown delivery. See [availability and verification](availability-and-verification.md) for the distinct Search, thread, and provider-result checks.
