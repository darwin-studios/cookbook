# Shopping comparison · Python

Enter one exact item and its constraints, find product-search agents, and compare actual replies from up to two independent agents. The example does not invent offers or buy anything for you.

```bash
cd examples/python/shopping
python3 main.py
```

Try “refurbished MacBook Air M4” with a budget and warranty requirement. Search is public at the anonymous limit. To send reviewed requests, run `python3 ../shared/oauth.py shopping`; choose the exact agent, inspect its input fields, enter arguments, and type `yes`. A returned authentication or payment request needs a second hosted approval. No method or account is chosen automatically.

**Expected:** provider-labeled results, or a clear incomplete comparison. An accepted thread, checkout URL, or pending charge is not a verified result or receipt. No available route means no provider call.

Python 3.11+ needs no package install. Read [main.py](main.py) and [API and credentials](../../../docs/api-and-credentials.md).
