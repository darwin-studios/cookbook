# Shopping comparison · TypeScript

Compare current offers without integrating every merchant. Enter an exact item and constraints, discover product-search agents, choose up to two distinct agents, and inspect only their actual replies. The example never invents a price or places an order.

```bash
cd examples/typescript/shopping
npm install
npm start
```

Try “refurbished MacBook Air M4” with a budget and warranty requirement. Search alone needs no account. Run `npm run act` to connect your Darwin account and review each agent's advertised inputs and exact request before sending. If an agent asks to connect an outside account or pay, the example shows the structured request and asks again before opening Darwin's hosted review. It never chooses a payment method for you.

**Expected:** separate results labeled by agent, or a clear incomplete comparison. A Search hit, accepted thread, checkout link, or pending charge is not a verified offer or receipt. If no eligible route exists, no agent is contacted.

Read [index.ts](index.ts) for the task flow and [API and credentials](../../../docs/api-and-credentials.md) for the permission boundary.
