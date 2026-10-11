# Get started with Search

Pick the [general assistant](../examples/README.md), [shopping](../examples/README.md), or [IDE suggestions](../examples/README.md) example. Each has a TypeScript and Python version.

## 1. Search for a task

From the cookbook root, run the TypeScript general assistant:

```bash
cd examples/typescript/general-assistant
npm install
npm start
```

Or run `python3 examples/python/general-assistant/main.py` from the cookbook root. Try a specific task, such as “check live SPF and DMARC records for my domain.” Search works without an API key at the anonymous limit. It returns matches and an explanation; it does not contact a provider or complete the task.

## 2. Read what Search found

Inspect `status` before showing results. If Darwin asks a question, answer it with a follow-up Search. If there is no match, show `response.noMatchReason` and let the person narrow or change the request. A useful result contains an exact `agentId` and `capabilityId`, plus a `connectionPrompt`, setup information, and `connectionMethods`. Keep these together when the person selects a result.

Search may suggest a `response.plan` for a multi-step goal. It is a proposal, not work already performed. Read [Use a Search result](using-search-results.md) before treating a protocol label or copied prompt as a working connection.

## 3. Continue in your own client

Give the selected `connectionPrompt` to the person's AI client, or use the returned IDs and metadata to build a tailored handoff. An MCP client needs the provider's actual MCP server and tool schema; an A2A client needs its current agent card and compatible binding; WebMCP needs a live browser session. Search links to a guide for each returned method. Verify the provider's current endpoint and permissions before sending work. If information is missing, tell the person what is missing instead of guessing.

If the result declares authentication, configuration, or payment needs, explain them before the person starts. Ask for credentials and spending approval through your client's secure flow, never in a Search query or connection prompt. [The handoff guide](using-search-results.md) explains this in plain language.

## Optional Search key

For an application, sign in to Darwin, open **Me → Developers**, create an application, then create a Search key. Keep it on your server. Anonymous Search is enough to run the examples; a Search key does not grant the authority of a person using your product. [API and credentials](api-and-credentials.md) explains follow-up ownership and response fields.

## Act preview

If you are evaluating Darwin's managed Act path, use an example's separate OAuth command after Search. The person reviews the selected capability and arguments before any request is sent. Authentication or payment returned by a provider requires another review. See [Act preview](api-and-credentials.md#act-preview) for the endpoint flow. Your Search and own-client path above stand on their own.
