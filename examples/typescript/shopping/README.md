# Shopping comparison · TypeScript

Discover product-search capabilities without integrating every merchant. Enter an exact item and constraints, then inspect each result's connection materials. The example never invents a price or places an order.

```bash
cd examples/typescript/shopping
npm install
npm start
```

Try “refurbished MacBook Air M4” with a budget and warranty requirement. Search alone needs no account. To compare real offers, [connect the selected results in your own client](../../../docs/using-search-results.md) and use only the providers' actual replies. The optional Act preview uses `npm run act` and requires separate review of each request, account connection, or payment.

**Expected:** Search matches or a clear no-match explanation. A Search hit is not a verified offer. In the Act preview, an accepted thread, checkout link, or pending charge is not a receipt.

Read [index.ts](index.ts) for the task flow and [API and credentials](../../../docs/api-and-credentials.md) for the permission boundary.
