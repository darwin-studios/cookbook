<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/darwin-mark-white.svg"><img src="assets/darwin-mark-black.svg" alt="Darwin" width="64" height="64"></picture></p>

# Darwin cookbook

Use Darwin Search to find an AI capability for a task your application was not built to handle. Search gives you ranked results, exact capability identifiers, setup information, protocol hints, and a connection prompt for a compatible AI client. You can build a useful discovery and handoff experience without calling Act.

## Choose a Search example

Each example has a TypeScript and Python version. Search does not send work to the provider.

| Example | What you build | TypeScript | Python |
| --- | --- | --- | --- |
| **General assistant** | Find a capability for a user's task and show how to connect. | [Run it](examples/typescript/general-assistant/README.md) | [Run it](examples/python/general-assistant/README.md) |
| **Shopping comparison** | Discover product-search capabilities without inventing offers or prices. | [Run it](examples/typescript/shopping/README.md) | [Run it](examples/python/shopping/README.md) |
| **IDE suggestions** | Suggest a capability from a developer-approved task summary. | [Run it](examples/typescript/ide/README.md) | [Run it](examples/python/ide/README.md) |

To try the general assistant:

```bash
git clone https://github.com/darwin-studios/cookbook.git
cd cookbook/examples/typescript/general-assistant
npm install
npm start
```

Or run `python3 examples/python/general-assistant/main.py` from the repository root (Python 3.11+, no package install). An empty result is valid: show Search's question or no-match explanation and let the person refine the task. Do not fill the list with unverified agents.

## After Search

Read [Get started](docs/getting-started.md) for the complete Search flow and [Use a Search result](docs/using-search-results.md) for the handoff. The latter explains MCP, A2A, and WebMCP; what authentication and payment metadata can tell you; and what your client needs to verify before contacting a provider.

The [API guide](docs/api-and-credentials.md) explains Search credentials, follow-ups, and response fields. [PDF and image context](docs/attachments.md) is available when text is not enough.

## Act preview

The terminal examples also have an optional, separately reviewed Act path. It uses the person's Darwin OAuth grant, asks them to select the exact capability and inputs, and reads the resulting thread. A started thread is not a completed task. See [Act preview](docs/api-and-credentials.md#act-preview) and [availability checks](docs/availability-and-verification.md) if you are evaluating that path. The Search examples and direct client handoff stand on their own.

Run `npm test` for the original Node contract suite. Each maintained example has local tests; [live Search preflight](docs/availability-and-verification.md) calls production Search without contacting providers. [Contributing](CONTRIBUTING.md) · [Darwin Docs](https://darwin.so/docs)
