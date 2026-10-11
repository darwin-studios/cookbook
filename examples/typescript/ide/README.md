# IDE suggestions · TypeScript

Use a developer-approved task summary to discover a relevant capability. The worker returns suggestions; it never sends source text or starts work in the background.

```bash
cd examples/typescript/ide
npm install
npx tsx index.ts --once "check live SPF and DMARC records for my domain"
```

Run `npx tsx index.ts --stream` for newline-delimited JSON input such as `{"task":"check live SPF and DMARC records for my domain","language":"typescript"}`. Repeated context is deduplicated and Search is spaced out. The optional [VS Code adapter](../../../integrations/vscode/README.md) displays these suggestions and opens a separate reviewed OAuth flow when a person chooses one.

**Expected:** JSON suggestions with exact agent/capability IDs and route status, or an empty list. A suggestion does not execute a tool. [Use the returned connection materials](../../../docs/using-search-results.md) when the developer chooses a result. Do not send code, paths, diagnostics, secrets, or chat history as the task summary.

Read [index.ts](index.ts) for the worker behavior.
