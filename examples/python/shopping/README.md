# Shopping comparison · Python

Enter one exact item and its constraints, then discover product-search capabilities and their connection materials. The example does not invent offers or buy anything for you.

```bash
cd examples/python/shopping
python3 main.py
```

Try “refurbished MacBook Air M4” with a budget and warranty requirement. Search is public at the anonymous limit. To compare real offers, [connect selected results in your own client](../../../docs/using-search-results.md) and use only the providers' actual replies. The optional Act preview uses `python3 ../shared/oauth.py shopping` and separately reviews each request, account connection, or payment.

**Expected:** Search matches or a clear no-match explanation. A Search hit is not a verified offer. In the Act preview, an accepted thread, checkout URL, or pending charge is not a receipt.

Python 3.11+ needs no package install. Read [main.py](main.py) and [API and credentials](../../../docs/api-and-credentials.md).
