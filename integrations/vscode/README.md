# Proactive IDE companion (VS Code adapter)

This small adapter runs the cookbook's local Search worker while you code. It is an example extension, not a published marketplace package. It does not install another agent or send code to Darwin.

## Try it

Install Node.js 20+ and the [TypeScript IDE example](../../examples/typescript/ide/README.md) first. From the cookbook root, launch a VS Code window for the project you want to work on with the example extension loaded:

```bash
code --extensionDevelopmentPath="$PWD/integrations/vscode" --new-window /path/to/your-project
```

In that window run **Darwin: Set Current Task** from the Command Palette. Describe the actual engineering task without secrets or customer data. The extension sends that task, the active editor's language, and a coarse work area (for example, `tests` or `frontend`) to the local worker; Search runs when you set the task, change editor context, or save. Open **Darwin: Show Agent Suggestions** (or click the Darwin status item) to inspect ranked matches, the exact agent/capability, and route status. **Darwin: Search for This Task** requests another search when the context changes; identical context is deduplicated.

No source text, file paths, diagnostics, workspace name, or chat history are sent. The coarse work area is derived locally from the active file's type; the file name itself is never sent. Search is debounced and limited to one request per 30 seconds. The worker filters weak lexical matches locally; an empty list is better than an unrelated recommendation. Clearing the task stops new searches. This is a starting point for an IDE product: you can replace the explicit task input with your own user-approved task summary, but never transmit raw project context silently.

To try a usable capability, select an eligible suggestion and choose **Open reviewed Act flow**. A VS Code terminal starts the cookbook OAuth helper. Approve Darwin access, then review the freshly searched route, enter exact JSON arguments, and type `yes` to send. Search results can expire between the picker and the terminal; the second search and Darwin's route checks are intentional. The extension never automatically invokes tools, confirms effects, signs into a provider, or pays.

If `code` is unavailable, you can run the same Search worker directly:

```bash
DARWIN_IDE_LANGUAGE=typescript examples/typescript/ide/node_modules/.bin/tsx examples/typescript/ide/index.ts --once "I need an accessibility audit for a signup page"
```

For an always-on stdio integration, spawn `examples/typescript/ide/node_modules/.bin/tsx examples/typescript/ide/index.ts --stream` and write one JSON line whenever your IDE's user-approved task or editor language changes:

```json
{"task":"I need an accessibility audit for a signup page","language":"typescript"}
```

Each response is one JSON line containing ranked, relevance-filtered suggestions or an error. An OAuth access token is never returned to the IDE worker.

To run the reviewed Act path from a terminal instead of VS Code, set `DARWIN_IDE_TASK="your current task"` and run `node scripts/run-with-oauth.mjs ide` from the cookbook root. It asks for OAuth consent, re-searches, and requires exact capability selection and confirmation.
