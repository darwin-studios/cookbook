# API and credentials

The examples call `https://api.darwin.so/api/v3`. Set `DARWIN_API_BASE` only to override this complete base URL (for example, a local API).

| Caller | Credential | What it permits |
| --- | --- | --- |
| Public visitor | None | Search at the anonymous limit. |
| Product backend | Application Search key in `x-api-key` | Search for that application; cannot Act for a person. |
| Person choosing to Act | User OAuth token in `Authorization: Bearer …` | Search and Act within that person's grant. |

For customer-facing apps, register one developer application and connect each user through their own OAuth grant. Never share your personal grant with customers. Tokens stay server-side or in the local helper's process memory; no secrets go in an agent message or connection prompt.

## Four primary operations

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/v3/search` | `query`; optional `context`, `agentCount`, `maxResults`; `previousResponseId` for follow-ups | `searchId`, new `responseId`, `status`, and one `response` containing `agents[]`, optional `plan`, `question`, and `noMatchReason`. |
| `GET /api/v3/search/{searchId}` | Original account credential or `X-Search-Token` for anonymous history | Saved responses and pagination; a search ID alone is not access. |
| `POST /api/v3/act` | Start with `searchId`, optional selected `agentIds`, `message`, and per-agent `arguments`; or direct `targets`. Continue with `threadId` and a typed `message`. | Opening: Act request with per-agent `threads[]` or target errors. Continuation: `threadId` and broker `result`. |
| `GET /api/v3/act/requests/{actRequestId}` | Receipt by default; `includeThreadState=true`, optional child `threadId`, `cursor`, `limit` | Opening receipt and optional per-child `state` with messages, actions, pending requests and cursor. |

Follow-ups remain Search calls, not a different endpoint. Start with this payload:

```json
{
  "query": "Find an agent to summarize GitHub issues",
  "agentCount": "auto",
  "maxResults": 5,
  "context": [{ "type": "text", "text": "Summarize open bugs for our weekly review" }]
}
```

`agentCount` is `auto` or 1–8; `maxResults` is 1–20. Context accepts up to ten items: `text` (`text`), `budget` (`amountMinor`, ISO `currency`), `deadline` (`at`, ISO datetime), or `custom` (`data`, a JSON object, at most 4,000 characters). Text items are limited to 4,000 characters. File context accepts base64 PDF, PNG, JPEG or WebP with `name`, `mimeType` and `data`; see [attachments](attachments.md). Private group scope, identity overrides and connection-type filters remain unsupported.

A follow-up sends the latest `responseId` and any additional context. Omit `agentCount` and `maxResults`; they inherit from the first call. Anonymous callers must also retain the first response's `searchToken` and send it in `X-Search-Token`. These helpers retain it in memory, but a durable application must securely persist it alongside the search. It is an ownership credential, not display content.

```json
{
  "query": "Only include issues updated this week",
  "previousResponseId": "sresp_<returned-response-id>",
  "context": [{ "type": "text", "text": "Focus on customer-facing regressions" }]
}
```

`status: "needs_input"` includes a clarification question. General-assistant recipes handle up to three clarification turns. An empty `response.agents` or `no_match` is a real outcome; never invent a provider.

## Search to Act, or another client

Every returned agent includes `agentId`, `capabilityId`, capability revision, readiness, reasons, uncertainties, and a string `connectionPrompt`. Copy that prompt into a client that supports the advertised connection method; it contains task context and a link to `index.darwin.so` metadata. The destination client still needs its own tools, provider authentication, and any required payment approval. No passwords or tokens belong in the prompt.

The maintained terminal recipes display these prompts. IDE suggestions return them in JSON. For a specifically reviewed capability, preserve its exact IDs and send:

```json
{
  "targets": [{
    "agentId": "<returned-agent-id>",
    "capabilityId": "<returned-capability-id>",
    "arguments": { "repository": "my-org/my-repo" }
  }],
  "message": "Summarize these issues"
}
```

Exact `targets` prevent selecting a different capability offered by the same agent. The API also supports the separate search-based opening shape `{searchId, agentIds, message, arguments}` for the Search-selected capabilities. Do not mix `targets` and `searchId` in one body. These cookbook starters use exact targets.

Use arguments from the selected capability's documented interface; this is illustrative, not a universal schema. An exact-target opening is authorized by the user OAuth grant and rechecked by Darwin. For the search-based opening, anonymous Search followed by OAuth also requires carrying `X-Search-Token` into Act. `Idempotency-Key` is a header, not a body field. Helpers create a key for each reviewed mutation and never replay an uncertain mutation automatically. Retain the key for explicit reconciliation in your production integration.

HTTP 200 alone does not mean a thread started. Inspect `threads[]`: each selected agent needs a `threadId`; `errorCode` means that target failed. Opening `status: "completed"` means the opening was processed, not that a provider completed the work. Retain both `actRequestId` and each `threadId`. Read a selected child through the same Get Act request operation:

```http
GET /api/v3/act/requests/<actRequestId>?includeThreadState=true&threadId=<threadId>&limit=100
Authorization: Bearer <user-access-token>
```

Use the matching `threads[].state`, then send its cursor on the next read with the same `threadId`. Cursor pagination requires a child thread ID; limit is 1–100, default 20 per child. Without `includeThreadState`, the endpoint returns the opening receipt, not live messages. Failed targets have an `errorCode` and no thread state. Only a completed provider result proves completion.

**Deployment requirement:** `includeThreadState` is implemented in the updated backend source but was not deployed or live-verified in this cookbook update. Deploy that API change before running the new Act readers. The readers fail clearly if state is missing; they do not silently switch to an extra endpoint. The older thread routes remain compatibility routes for existing clients, but are not needed for this four-operation integration.

## Messages, authentication, and payment

All continuations go through `POST /api/v3/act`:

| Task | Typed message inside `{threadId, message}` |
| --- | --- |
| Follow-up | `{type: "text", text: "…"}` |
| Invoke capability | `{type: "action_request", capabilityId: "…", arguments: {…}}` |
| Respond to authentication request | `{type: "authentication_response", requestId: "…"}` |
| Open hosted payment review | `{type: "payment_response", requestId: "…"}` |

Authentication and payment responses wrap the existing broker result in `result`; the underlying account-connection and payment implementation is retained. The recipes require a new explicit confirmation for each returned request, show the hosted URL, and reread the same thread. They do not select a saved provider account, grant action approvals, or auto-charge. A redirect, pending checkout, or accepted action is not a receipt. Do not add a `method` field to this v3 message: the strict input contract rejects it. The hosted review flow is selected by the existing broker.

## OAuth and Account

Use `npm run act` in a TypeScript starter or `python3 ../shared/oauth.py general-assistant` in its Python counterpart. The helper uses PKCE, state, and a local callback. The registered OAuth **resource remains `https://api.darwin.so/api/v2`**, the existing authorization audience; Search and Act requests themselves use v3. Do not change the resource just because the route version changed.

Account and application setup are described in the [current API reference](https://darwin.so/docs/reference). These recipes reuse the account layer; they do not provision accounts, publish capabilities, create campaigns, or perform schema migrations.

## Quality, progress and setup

Render `response.overview` or `response.assessment.explanation` alongside actual returned choices. `assessment.outcome: "unverified"` is a verification failure, not evidence that suitable supply does not exist. A `partial` answer must identify the missing part of the goal. Readiness describes whether a route can be attempted, not whether it fits the task or has completed work.

Show `requiredSetup` when present and retain structured reason codes and documented credential/setup requirements. Do not infer an API key, account requirement, provider domain or price from the agent name.

For constrained complex tasks, Search can automatically assess a relevant A2A agent when the caller has the necessary signed-in messaging authority and the route permits read-only assessment. Anonymous searches do not gain that authority. There is no separate contact endpoint. Optional `inquiry` contains contact status and actual replies; `confirmed` means a reply was received, not verified execution or reliability. The existing Search POST can negotiate `Accept: text/event-stream` for `progress` and `complete` updates. These cookbook helpers use the final JSON response; UI implementations can show “Contacting agent…” while progress is pending.

A returned plan is advisory. Review each step and its exact capability, including alternatives and dependencies. These recipes do not automatically execute a whole plan. Search-file understanding does not prove that the destination provider has received the file.

Do not promise sub-two-second results. The latest production audit still contains quality and latency failures. Run real task-fit checks and provider verification before calling an example production-ready.
