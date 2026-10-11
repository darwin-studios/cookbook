# Use a Search result in your own client

Search helps you choose a capability and prepare a connection. It does not send the user's task to the selected provider. This guide describes what to show a person and what your client must check before doing that work.

## Make a result understandable

Show the capability's `name` and `description`, then its `reasons` and `uncertainties`. Keep the result's `agentId`, `capabilityId`, and `capabilityRevision` behind the selection: names can change or repeat, while these fields identify what the person chose. If Search supplies `response.plan`, explain the proposed order and dependencies, and let the person review each step.

Show `requiredSetup.description` when present. It names a declared credential, installation, or provider configuration and who is expected to supply it. `executionGuidance.credentialSummary` and `setupSummary` can add context. `executionRequirements` has more precise facts: `providerAuthentication` describes declared methods and scopes; `operationCredentials` names sensitive inputs; `runtime` describes the expected environment; `payment` indicates whether payment was declared; and `providerContract` describes how complete the indexed route and schemas are. `derivation.completeness: PARTIAL`, an unknown state, or a `null` field means you still need to check the provider's current documentation. These fields never contain a password, token, or card number.

`readiness` and `canStartThread` describe Darwin's Search snapshot. They are not a reliability score and do not prove that your own client can connect. A copied `connectionPrompt` is a handoff instruction, not evidence of execution.

## Find the connection you can use

For each selected result, read `connectionMethods`. Every entry names a `protocol`, an `environment`, and a `documentationUrl` for the matching connection guide. `endpointUrl: null` with `endpointStatus: not_published` means Search has not supplied a verified provider address. The public agent page linked in `connectionPrompt` helps you inspect the indexed capability; it is not necessarily the provider's connection endpoint.

| Method | What your client needs next |
| --- | --- |
| [MCP](https://darwin.so/docs/search/connect-mcp) | Get the provider's current MCP server URL from its official documentation, connect, list its tools, and match the task to a real tool and input schema. Darwin's own MCP server URL is not a substitute for the provider's server. |
| [A2A](https://darwin.so/docs/search/connect-a2a) | Obtain the provider's current agent card, choose a binding your client supports, and verify the advertised skill and authentication requirements. |
| [WebMCP](https://darwin.so/docs/search/connect-webmcp) | Open the provider's site in a supported browser, confirm the tool is exposed in that session, and ask the person to approve browser access. A WebMCP result is not a remote API address. |

If your client already supports the method, pass the selected `connectionPrompt` unchanged as task context. Your client still resolves the provider's actual connection, validates its present schema, and gets the person's approval where needed. If it does not support the method, show the connection guide or another compatible client. Never derive an endpoint from a name, logo, or website alone.

## Treat access and payment as separate decisions

Use `requiredSetup` and `executionRequirements` to prepare the user, then confirm the provider's live requirements. If an account connection is necessary, use your client's secure authentication flow and request the exact scopes needed. If the provider asks for payment, show the amount, currency, payee, and terms that the provider actually supplies before asking the person to authorize it. Search does not approve access, accept a charge, or carry credential values. A `null` requirement means the indexed information is missing; it does not mean access or payment is free.

After a provider call, report the provider's real response and any unfinished steps. If a connection fails, show the missing endpoint, schema, access, or payment requirement. Do not claim success from a Search result, copied prompt, or accepted transport request.

For response fields and follow-up calls, see [API and credentials](api-and-credentials.md). For an optional managed execution path, see its separate [Act preview](api-and-credentials.md#act-preview).
