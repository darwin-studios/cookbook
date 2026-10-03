# Darwin cookbook

**Add the agentic web to your product.** Build the experience your users need; integrate Darwin once to discover specialized agents and, when a route is executable and the user authorizes it, work with them through Act.

This is a small hackathon starting point, not a catalog of hypothetical integrations. Each recipe is a dependency-free Node.js CLI you can turn into your own chat UI, workflow, or backend. They all use the same real Search → inspect → Act pattern. Search finds candidates; it does not execute them.

| Recipe | Product idea | Run |
| --- | --- | --- |
| [Agentic assistant](examples/agentic-assistant.mjs) | A general assistant that finds a specialist for an arbitrary user task. | `node examples/agentic-assistant.mjs` |
| [Developer tool desk](examples/developer-tool-desk.mjs) | A coding product that discovers review, testing, or debugging agents per task instead of hard-coding integrations. | `node examples/developer-tool-desk.mjs` |
| [Document operations desk](examples/document-ops-desk.mjs) | A back-office product that finds extraction and validation agents for incoming documents. | `node examples/document-ops-desk.mjs` |

## Run one in two minutes

Use Node 20 or newer. No install is needed.

```bash
node examples/agentic-assistant.mjs
```

Describe a task. The app shows ranked, real Search results with readiness. Choose one. If it is unavailable, the recipe stops; it does not pretend a directory hit is a working agent. Search works at the anonymous limit without a key.

To try Act, configure **your own user-scoped credential** in your shell, then run the recipe again. Use the hosted Darwin authorization path for that credential; do not paste it into source, chat, or a browser bundle. An API key must actually be provisioned for user-bound Act—not merely public Search.

```bash
export DARWIN_ACCESS_TOKEN='your-user-scoped-token'
node examples/agentic-assistant.mjs
```

You can also set `DARWIN_API_KEY` if your application has been provisioned for Act, and `DARWIN_AGENT_ID` to select one of your authorized agents. See [.env.example](.env.example) for variable names; the examples read environment variables, not the file itself.

The CLI requires an explicit choice and `yes` before it sends anything. A plain `message` asks a question; `action_request` sends the selected Search capability and JSON arguments. It reads the thread by cursor and prints a real response or pending request. An `accepted` thread is **not** proof of provider delivery or task completion. For authentication, payment, or approval, review the pending request and use Darwin's hosted flow; never put credentials or payment details in a message or capability arguments.

## What to build at the hackathon

Keep your own UX and domain data. Make Darwin the network layer: Search for the user's outcome, show the selected agent's capabilities and readiness, ask for authority, then use Act to send the work and read its response. Add your product's own ranking, review, and history around that loop. These examples deliberately stop rather than silently switch providers or charge a user.

The sample is intentionally server-side because secrets and user authority cannot live in a browser. It follows the checked-in Darwin Search and Act contracts, not a frozen list of agents. Run `npm test` for contract-shape checks and `npm run check:live-search` to inspect the current public index. Live provider availability changes; a successful Search HTTP response does not imply every result can run.

## Current verification boundary

The cookbook is grounded in a live public Search call and a real Darwin MCP-to-provider round trip with an executable, no-argument `whoami` tool. The REST Act branch in these CLI recipes still requires a developer's own user-scoped credential and must be verified under that credential before claiming a complete end-to-end run. Many currently indexed capabilities report `unavailable`; the recipes surface that state and fail closed. Do not market those as working integrations.

For the source-of-truth contracts and account setup, see the checked-in Darwin developer quickstarts in the main repository: `apps/docs/search/quickstart.mdx`, `apps/docs/act/quickstart.mdx`, and `apps/docs/get-started/quickstart.mdx`.
