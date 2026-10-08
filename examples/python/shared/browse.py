"""Small REST helpers shared by the three Python recipes; no provider SDK needed."""

import json
import os
import uuid
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

BASE = os.getenv("DARWIN_API_BASE", "https://api.darwin.so/api/v3").rstrip("/")


class DarwinError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code = status, code
        super().__init__(f"Darwin API {status} [{code or 'UNKNOWN'}]: {message}")


def request(path, body=None, method=None, idempotency_key=None, search_token=None):
    headers = {"Content-Type": "application/json"}
    if os.getenv("DARWIN_ACCESS_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['DARWIN_ACCESS_TOKEN']}"
    elif os.getenv("DARWIN_API_KEY"):
        headers["x-api-key"] = os.environ["DARWIN_API_KEY"]
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    if search_token:
        headers["X-Search-Token"] = search_token
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


_sessions = {}


def search(query, context=None, previousResponseId=None, searchToken=None, agentCount="auto", maxResults=5):
    if not query.strip():
        raise ValueError("Search query is required")
    if type(maxResults) is not int or not 1 <= maxResults <= 20:
        raise ValueError("maxResults must be 1–20")
    if not isinstance(context or [], list) or len(context or []) > 10:
        raise ValueError("Search accepts up to ten context items")
    previous = _sessions.get(previousResponseId, {})
    found = request("/search", {"query": query.strip(), "context": context or [],
        "agentCount": agentCount, "maxResults": maxResults,
        **({"previousResponseId": previousResponseId} if previousResponseId else {})},
        search_token=searchToken or previous.get("searchToken"))
    if not found.get("searchId") or not found.get("responseId") or not isinstance(found.get("response", {}).get("agents"), list):
        raise ValueError("Invalid Search response shape")
    _sessions[found["responseId"]] = {"searchToken": found.get("searchToken") or previous.get("searchToken"), "query": (previous.get("query", "") + "\n" + query).strip()}
    return found


def search_with_questions(query, **options):
    found = search(query, **options)
    for _ in range(3):
        if found["status"] != "needs_input":
            break
        answer = input((found["response"].get("question") or "Please clarify your task") + " ").strip()
        if not answer:
            break
        found = search(answer, previousResponseId=found["responseId"], searchToken=found.get("searchToken"))
    return found


def choices(found):
    session = _sessions.get(found.get("responseId"), {})
    return [{**item, "agent": item["agentId"], "capability": item["capabilityId"],
        "agentName": item.get("agentSlug") or item["agentId"], "searchId": found["searchId"],
        "responseId": found["responseId"], "searchToken": found.get("searchToken") or session.get("searchToken"),
        "query": session.get("query", item["name"])} for item in found["response"]["agents"]]


def eligible(item):
    return bool(item and item.get("readiness") != "unavailable" and (item.get("canStartThread") is True or item.get("readiness") in ("recheck_required", "authentication_required")))


def act(body, idempotency_key=None, search_token=None):
    if not os.getenv("DARWIN_ACCESS_TOKEN"):
        raise ValueError("Account OAuth is required to Act. An application Search key cannot act for a user.")
    return request("/act", body, idempotency_key=idempotency_key or uuid.uuid4().hex, search_token=search_token)


def start_thread(choice, message_type, content):
    if not eligible(choice):
        raise ValueError("Choose a currently eligible Search result")
    if message_type not in ("message", "action_request"):
        raise ValueError("Choose message or action_request")
    if message_type == "action_request" and not isinstance(content, dict):
        raise ValueError("Action arguments must be a JSON object")
    if message_type == "message" and (not isinstance(content, str) or not content.strip()):
        raise ValueError("A nonempty message is required")
    message = content.strip() if message_type == "message" else choice.get("query", choice["name"])
    if choice.get("searchId"):
        body = {"searchId": choice["searchId"], "agentIds": [choice["agent"]], "message": message,
                **({"arguments": {choice["agent"]: content}} if message_type == "action_request" else {})}
    else:
        body = {"targets": [{"agentId": choice["agent"], "capabilityId": choice["capability"],
                **({"arguments": content} if message_type == "action_request" else {})}], "message": message}
    result = act(body, search_token=choice.get("searchToken"))
    child = next((item for item in result.get("threads", []) if item["agentId"] == choice["agent"]), {})
    if not child.get("threadId"):
        raise DarwinError(422, child.get("errorCode", "ACT_TARGET_UNAVAILABLE"), "No thread was started for the selected agent")
    return {"thread": child["threadId"], "message": child.get("messageId"), "actRequestId": result["actRequestId"]}


def send_thread_message(thread, content):
    if not content.strip():
        raise ValueError("A nonempty reviewed message is required")
    return act({"threadId": thread, "message": {"type": "text", "text": content.strip()}})


def provider_messages(messages):
    return [message for message in messages if
            (message.get("from") == "agent" and message.get("type") in ("message", "result")) or
            (message.get("from") == "darwin" and message.get("type") == "result")]


def has_result(messages):
    return any(message.get("type") == "result" for message in provider_messages(messages))


def read_thread(thread, cursor, require_result=True):
    messages = []
    for _ in range(30):
        params = urlencode({"cursor": cursor}) if cursor else ""
        page = request(f"/act/threads/{quote(thread, safe='')}?{params}")
        cursor = page.get("cursor", cursor)
        messages.extend(page.get("messages", []))
        pending = [item for item in page.get("requests", []) if item.get("status") == "pending"]
        failed = [item for item in page.get("actions", []) if item.get("status") in ("failed", "cancelled", "withdrawn")]
        failed.extend(item for item in messages if item.get("status") == "failed")
        if pending or failed or (has_result(messages) if require_result else provider_messages(messages)):
            return {"thread": thread, "cursor": cursor, "messages": messages, "pending": pending, "errors": failed}
        if not page.get("hasMore"):
            time.sleep(1)
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
    message = {"type": "authentication_response", "requestId": pending["request"]} if pending["type"] == "authentication_request" else {"type": "payment_response", "requestId": pending["request"], "method": "hosted_checkout"}
    started = act({"threadId": outcome["thread"], "message": message})["result"]
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


def show_search_details(found):
    for key in ("question", "noMatchReason", "plan"):
        if found["response"].get(key):
            print(key + ":", json.dumps(found["response"][key]))
    show_connection_details(choices(found))


def show_connection_details(agents):
    for agent in agents:
        if agent.get("reasons"):
            print("Why", agent["agentName"] + ":", "; ".join(agent["reasons"]))
        if agent.get("uncertainties"):
            print("Uncertainties:", "; ".join(agent["uncertainties"]))
        print(f"Connection prompt for {agent['agentName']} (copy into a compatible AI client):\n{agent['connectionPrompt']}")
