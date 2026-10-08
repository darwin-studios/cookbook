# General assistant · TypeScript

Give an assistant a way to find an agent for a task it was not built to handle. The example searches Darwin, shows the exact capability and current route status, then lets the person approve one request and read the reply from the same thread. No provider is hard-coded.

```bash
cd examples/typescript/general-assistant
npm install
npm start
```

Try “check live SPF and DMARC records for my domain.” Search needs no account at the anonymous limit. To send a request, run `npm run act` instead: the local helper opens Darwin account OAuth, then this script asks you to choose the agent, review the arguments, and type `yes`. Keep keys and tokens out of source and browser bundles.

**Expected:** ranked capabilities first; a completed answer only after a real agent result. An accepted thread is not an answer. If no route is available, the example stops without contacting an agent. Authentication and payment requests, if returned, require a separate hosted review.

Read [index.ts](index.ts) for the full task flow. The [Search and Act API guide](../../../docs/api-and-credentials.md) explains credentials and endpoint names.
