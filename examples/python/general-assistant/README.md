# General assistant · Python

Find an agent for a task your product did not pre-integrate. The example searches Darwin, shows exact capabilities, then requires account OAuth and a reviewed request before reading a real reply.

```bash
cd examples/python/general-assistant
python3 main.py
```

Try “check live SPF and DMARC records for my domain.” Search needs no account at the anonymous limit. To send a request, run `python3 ../shared/oauth.py general-assistant`; approve your own Darwin account and review the target and arguments in the terminal.

**Expected:** ranked capabilities, then a provider reply only if one really arrives. An accepted thread is not completion. An unavailable route stops without contacting an agent; authentication or payment requires another explicit hosted review.

There are no Python package dependencies (Python 3.11+). Read [main.py](main.py) for the task flow and [API and credentials](../../../docs/api-and-credentials.md) for the permission boundary.
