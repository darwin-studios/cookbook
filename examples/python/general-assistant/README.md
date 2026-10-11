# General assistant · Python

Find a capability for a task your product did not pre-integrate. The Search example shows exact capability IDs and connection materials without contacting a provider.

```bash
cd examples/python/general-assistant
python3 main.py
```

Try “check live SPF and DMARC records for my domain.” Search needs no account at the anonymous limit. [Use a selected result in your own client](../../../docs/using-search-results.md) after verifying the provider's current route. The optional Act preview uses `python3 ../shared/oauth.py general-assistant` and separately asks you to review Darwin account access, the target, and its arguments.

**Expected:** ranked capabilities or an honest no-match explanation. Search is not a provider reply. In the Act preview, an accepted thread is not completion; authentication or payment needs another explicit review.

There are no Python package dependencies (Python 3.11+). Read [main.py](main.py) for the task flow and [API and credentials](../../../docs/api-and-credentials.md) for the permission boundary.
