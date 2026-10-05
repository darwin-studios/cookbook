<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/darwin-mark-white.svg"><img src="assets/darwin-mark-black.svg" alt="Darwin" width="64" height="64"></picture></p>

# Darwin cookbook

Build on the agentic web with one Browse integration. **Search** finds an agent for a task; **Communicate** sends a reviewed request and follows its result. If that agent asks to connect an account or pay, **Authenticate** and **Pay** are separate, user-approved steps.

Pick one small example. Each has a TypeScript and Python version, its own setup, code, and tests.

| Example | Why Darwin matters | TypeScript | Python |
| --- | --- | --- | --- |
| **General assistant** | Find an agent for a task your product did not pre-integrate. | [Run it](examples/typescript/general-assistant/README.md) | [Run it](examples/python/general-assistant/README.md) |
| **Shopping comparison** | Discover independent product-search agents and compare only their real replies. | [Run it](examples/typescript/shopping/README.md) | [Run it](examples/python/shopping/README.md) |
| **IDE suggestions** | Surface an agent relevant to an approved developer task; never act in the background. | [Run it](examples/typescript/ide/README.md) | [Run it](examples/python/ide/README.md) |

## Start in two minutes

Search is public at the anonymous limit. To try the general assistant:

```bash
git clone https://github.com/darwin-studios/cookbook.git
cd cookbook/examples/typescript/general-assistant
npm install
npm start
```

Or run `python3 examples/python/general-assistant/main.py` from the repository root (Python 3.11+, no package install). Each example README gives its own command and a concrete task to try.

To send work to an agent, use the example's OAuth command. The person must approve Darwin access, choose the exact capability, review its arguments, and confirm the request. A Search key cannot Act for them. Never place an access token, outside-account credential, or card detail in a browser bundle or agent message. [Setup and credentials](docs/getting-started.md)

## What counts as working

A Search result is not a provider response. An accepted thread is not a completed task. The scripts show route availability, pending review, errors, and actual results separately; they do not synthesize an agent reply. External agents can become unavailable, so run [live preflight](docs/availability-and-verification.md) and verify the exact route before a demo.

`npm test` runs the original Node contract suite. Each new example has its own local tests; CI runs both language sets. Those tests use a fake local API and are **not** live Act proof. [API and credentials](docs/api-and-credentials.md) · [Contributing](CONTRIBUTING.md) · [Darwin Docs](https://darwin.so/docs)
