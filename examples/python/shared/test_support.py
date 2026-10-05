"""Local fake HTTP transport for deterministic recipe tests; never used as live proof."""

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_example(folder, answers, respond, token=None, args=None):
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def handle_call(self):
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            call = {"path": self.path, "method": self.command, "body": json.loads(raw) if raw else None,
                    "authorization": self.headers.get("Authorization")}
            calls.append(call)
            result = respond(call)
            self.send_response(result.get("status", 200))
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result.get("body", {})).encode())

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
