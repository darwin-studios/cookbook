# Getting started

This cookbook uses server-side Node.js 20+ and the Browse REST API. No package install is required.

## 1. Search without an account

From the cookbook root:

```bash
node examples/agentic-assistant.mjs
```

Enter a task. The recipe shows ranked capabilities and each route's current status. Search is read-only: a result is not proof that the provider can act now.

For a different product idea, run one of the other [examples](../examples/) directly. The [VS Code adapter](../integrations/vscode/README.md) is optional.

## 2. Optional: create an application Search key

For authenticated server-side Search, sign in to Darwin and open **Me → Developers**. Create an application, then create a Search key for it. Copy the key when shown; Darwin shows it once and it expires after 90 days. Keep it in your server environment, never in a browser bundle or Git:

```bash
export DARWIN_API_KEY='your-search-key'
node examples/agentic-assistant.mjs
```

The equivalent Account API calls are [`POST /api/v2/account/applications`](https://darwin.so/docs/reference/account-application-create) and [`POST /api/v2/account/api-keys`](https://darwin.so/docs/reference/account-api-key-create), using your verified signed-in session. Creating a personal account does not automatically issue a key. No invitation code or event-specific credit allotment has been announced. Search responses expose current `RateLimit-Limit` and `RateLimit-Policy`; honor `Retry-After` on `429`. See [rate limits](https://darwin.so/docs/admin/rate-limits).

## 3. Try Act with your own authorization

An application Search key cannot act for a person. If Search returns an eligible route, use the local OAuth helper:

```bash
node scripts/run-with-oauth.mjs agentic-assistant
```

The helper registers a temporary local client and prints a Darwin consent URL. Sign in and click **Allow** for your own account. It holds the resulting token only in process memory. The recipe searches again, asks you to choose the exact capability, enter the advertised JSON arguments, and type `yes` before sending. Read the result from the same thread; an accepted request is not a provider result.

The helper also accepts `ide-companion` and `shopping-concierge`. For the IDE variant, set `DARWIN_IDE_TASK="your current task"` first. It never auto-acts in the background.

When the external MCP diagnostic is currently ready, a small read-only attempt is: enter `MCP server health diagnostic whoami tool`, choose the exact `whoami` capability, supply `{}`, and confirm. If it is not eligible, the recipe stops. Do not treat a named provider as a permanent availability guarantee.

OAuth discovery, client registration, and token exchange each have a 20-second timeout; consent waits up to 10 minutes. Close the local process after testing, and revoke its grant in Darwin if no longer needed. Never paste an access token, Search key, provider credential, or payment information into capability arguments or a message.

## 4. Building for customers

Register one developer application. Its optional Search key can serve your backend; you do not need a key or published agent for every customer. When a customer chooses to Act, connect **that customer's** Darwin account through sign-up/sign-in and OAuth consent. Their grant is separate from yours. Your personal grant cannot use their private connections, payment methods, or authority. See [API and credentials](api-and-credentials.md).
