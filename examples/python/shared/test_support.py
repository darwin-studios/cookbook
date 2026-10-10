"""Local fake HTTP transport for deterministic recipe tests; never used as live proof."""

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_example(folder, answers, respond, token=None, args=None):
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def handle_call(self):
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            call = {"path": self.path, "method": self.command, "body": json.loads(raw) if raw else None,
                    "authorization": self.headers.get("Authorization"), "headers": dict(self.headers)}
            calls.append(call)
            result = respond(call)
            self.send_response(result.get("status", 200))
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            body = result.get("body", {})
            if self.command == "GET" and self.path.startswith("/act/requests/") and result.get("status", 200) == 200:
                thread_id = parse_qs(urlparse(self.path).query)["threadId"][0]
                body = {"type": "request", "actRequestId": "actreq_1", "threads": [{"agentId": "fixture", "threadId": thread_id, "state": {"thread": thread_id, **body}}]}
            self.wfile.write(json.dumps(body).encode())

        do_GET = handle_call
        do_POST = handle_call

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = {**os.environ, "DARWIN_API_BASE": f"http://127.0.0.1:{server.server_port}"}
    env.pop("DARWIN_ACCESS_TOKEN", None)
    env.pop("DARWIN_API_KEY", None)
    if token:
        env["DARWIN_ACCESS_TOKEN"] = token
    try:
        result = subprocess.run([sys.executable, str(ROOT / folder / "main.py"), *(args or [])],
                                input=answers, text=True, capture_output=True, env=env, timeout=10)
        return result, calls
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def search_fixture(agents=None):
    agents = agents or []
    return {"searchId": "srch_00000000-0000-4000-8000-000000000001", "responseId": "sresp_00000000-0000-4000-8000-000000000001", "previousResponseId": None, "contractVersion": "search-v3.0", "status": "completed" if agents else "no_match", "response": {"agents": [{"agentSlug": a["agentId"], "capabilityRevision": 1, "rank": i + 1, "selected": i == 0, "reasons": [], "uncertainties": [], "providerCheck": "not_attempted", "connectionPrompt": "Use https://index.darwin.so/agent/" + a["agentId"], **a} for i, a in enumerate(agents)], "plan": None, "question": None, "noMatchReason": None if agents else "No match"}}


def started(agent_id, thread_id="t1"):
    return {"type": "request", "actRequestId": "actreq_1", "status": "completed", "threads": [{"agentId": agent_id, "threadId": thread_id, "messageId": "m1"}]}
