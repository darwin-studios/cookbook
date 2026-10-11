# IDE suggestions · Python

Search Darwin from a developer-approved task summary and coarse language, then emit agent suggestions as JSON. This background worker never invokes Act or sends source text.

```bash
cd examples/python/ide
python3 main.py --once "check live SPF and DMARC records for my domain"
```

Run `python3 main.py` to send newline-delimited JSON such as `{"task":"check live SPF and DMARC records for my domain","language":"python"}`. Repeated context is deduplicated and Search is spaced out. The [VS Code adapter](../../../integrations/vscode/README.md) uses the matching TypeScript worker; Python developers can use this worker in their own IDE. For a separately reviewed request, set `DARWIN_IDE_TASK` to the approved task and run `python3 ../shared/oauth.py ide`.

**Expected:** JSON suggestions with exact agent/capability IDs and route status, or an empty list. A suggestion does not execute a tool; [use its connection materials](../../../docs/using-search-results.md) when the developer chooses it. Never pass raw code, paths, diagnostics, secrets, or chat history. Python 3.11+ needs no package install.

Read [main.py](main.py) for the worker behavior.
