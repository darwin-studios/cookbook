"""Small REST helpers shared by the three Python recipes; no provider SDK needed."""

import json
import os
import uuid
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

BASE = os.getenv("DARWIN_API_BASE", "https://api.darwin.so/api/v2").rstrip("/")


class DarwinError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code = status, code
        super().__init__(f"Darwin API {status} [{code or 'UNKNOWN'}]: {message}")


def request(path, body=None, method=None):
    headers = {"Content-Type": "application/json"}
    if os.getenv("DARWIN_ACCESS_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['DARWIN_ACCESS_TOKEN']}"
    elif os.getenv("DARWIN_API_KEY"):
        headers["x-api-key"] = os.environ["DARWIN_API_KEY"]
    req = Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                  headers=headers, method=method or ("POST" if body is not None else "GET"))
    try:
        with urlopen(req, timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            data = json.load(error)
        except (ValueError, OSError):
            data = {}
        raise DarwinError(error.code, data.get("code"), data.get("message") or data.get("error") or error.reason) from None


def search(query, **options):
    if not query.strip():
        raise ValueError("Search query is required")
    return request("/search", {"query": query, "numResults": options.pop("numResults", 8), **options})


def choices(found):
    agents = {agent["agent"]: agent.get("name", agent["agent"]) for agent in found.get("agents", [])}
    return [{**item, "agentName": agents.get(item.get("agent"), item.get("agent"))} for item in found.get("results", [])]


def eligible(item):
    return bool(item and ((item.get("readiness") == "ready" and item.get("canStartThread")) or
                          (item.get("readiness") == "recheck_available" and item.get("canAttemptThread"))))


def start_thread(choice, message_type, content):
    if not eligible(choice):
        raise ValueError("Choose a currently executable or first-use-recheckable Search result")
    if not os.getenv("DARWIN_ACCESS_TOKEN"):
        raise ValueError("Account OAuth is required to communicate. A Search API key cannot Act.")
    if message_type not in ("message", "action_request"):
        raise ValueError("Choose message or action_request")
    if message_type == "action_request" and not isinstance(content, dict):
        raise ValueError("Action arguments must be a JSON object")
    if message_type == "message" and (not isinstance(content, str) or not content.strip()):
        raise ValueError("A nonempty message is required")
    return request("/act/threads", {
        "targetAgent": choice["agent"], "messageType": message_type,
        "messageContent": {"capability": choice["capability"], "arguments": content}
        if message_type == "action_request" else content.strip(),
        **({"capability": choice["capability"]} if message_type == "message" else {}),
        "idempotencyKey": uuid.uuid4().hex,
    })


def send_thread_message(thread, content):
    if not os.getenv("DARWIN_ACCESS_TOKEN") or not content.strip():
        raise ValueError("OAuth and a nonempty reviewed message are required")
    return request(f"/act/threads/{quote(thread, safe='')}/messages", {
        "messageType": "message", "messageContent": content.strip(), "idempotencyKey": uuid.uuid4().hex,
    })


def provider_messages(messages):
    return [message for message in messages if
            (message.get("from") == "agent" and message.get("type") in ("message", "result")) or
            (message.get("from") == "darwin" and message.get("type") == "result")]


def has_result(messages):
    return any(message.get("type") == "result" for message in provider_messages(messages))


def read_thread(thread, cursor, require_result=True):
    messages = []
    for _ in range(8):
        params = urlencode({"cursor": cursor, "wait": "true"}) if cursor else "wait=true"
        page = request(f"/act/threads/{quote(thread, safe='')}?{params}")
        cursor = page.get("cursor", cursor)
        messages.extend(page.get("messages", []))
        pending = [item for item in page.get("requests", []) if item.get("status") == "pending"]
        failed = [item for item in page.get("actions", []) if item.get("status") in ("failed", "cancelled", "withdrawn")]
        failed.extend(item for item in messages if item.get("status") == "failed")
        if pending or failed or (has_result(messages) if require_result else provider_messages(messages)):
            return {"thread": thread, "cursor": cursor, "messages": messages, "pending": pending, "errors": failed}
    return {"thread": thread, "cursor": cursor, "messages": messages, "pending": [], "errors": []}


def show_outcome(label, outcome):
    print(f"\n{label} — thread {outcome['thread']}")
    for item in provider_messages(outcome["messages"]):
        print(" ".join(part.get("text", f"[{part.get('type', 'content')}]") for part in item.get("content", [])))
        if item.get("type") == "result" and "data" in item:
            print(json.dumps(item["data"], indent=2))
    if outcome["errors"]:
        print("Provider/runtime error; inspect the thread before retrying")
    if not has_result(outcome["messages"]):
        print("No completed provider result. An accepted thread is not success.")


def review_pending(outcome):
    if not outcome["pending"]:
        return outcome
    pending = outcome["pending"][0]
    print("Review required:", json.dumps(pending, indent=2))
    if pending.get("type") not in ("authentication_request", "payment_request"):
        return outcome
    if input("Open this exact hosted review flow? Type yes: ").strip() != "yes":
        return outcome
    body = {"request": pending["request"], "idempotencyKey": uuid.uuid4().hex}
    path = "/act/payments" if pending["type"] == "payment_request" else "/act/authentications"
    started = request(path, body)
    url = started.get("url") or started.get("authorizationUrl") or started.get("paymentUrl")
    if url:
        print("Complete review on Darwin:", url)
    print("Status:", started.get("status", "pending"), "— a redirect is not completion")
    if started.get("status") in ("denied", "failed", "expired", "uncertain"):
        return outcome
    if started.get("status") == "settled" and not started.get("receipt"):
        return outcome
    if not url and started.get("status") not in ("connected", "settled"):
        return outcome
    if url and input("After completing the hosted flow, press Enter to read this thread (or type stop): ").strip() == "stop":
        return outcome
    resumed = read_thread(outcome["thread"], outcome["cursor"])
    if resumed["pending"]:
        print("Still pending. Resume this thread later; do not start another payment")
    return resumed
