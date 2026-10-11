# General assistant · TypeScript

Give an assistant a way to find a capability for a task it was not built to handle. The Search example shows the exact capability, connection prompt, and current route status. No provider is hard-coded.

```bash
cd examples/typescript/general-assistant
npm install
npm start
```

Try “check live SPF and DMARC records for my domain.” Search needs no account at the anonymous limit. [Use the result in your own client](../../../docs/using-search-results.md) by verifying its indexed connection method and provider's current route. The optional Act preview uses `npm run act` and separately asks the person to approve account OAuth, the selected capability, and its arguments.

**Expected:** ranked capabilities or an honest no-match explanation. Search is not a provider answer. In the Act preview, a completed answer requires a real provider result, and any authentication or payment request requires separate review.

Read [index.ts](index.ts) for the full task flow. The [Search and Act API guide](../../../docs/api-and-credentials.md) explains credentials and endpoint names.
