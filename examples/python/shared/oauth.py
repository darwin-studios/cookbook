"""Local account OAuth helper. Usage: python examples/python/shared/oauth.py general-assistant"""

import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ISSUER = "https://darwin.so/api/customer/auth"
SCOPE = "openid profile directory:read human:actions"


def load(url, body=None, content_type="application/json"):
    request = Request(url, data=body, headers={"Content-Type": content_type})
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("general-assistant", "shopping", "ide"):
        raise SystemExit("Usage: python examples/python/shared/oauth.py <general-assistant|shopping|ide>")
    metadata = load(f"{ISSUER}/.well-known/openid-configuration")
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(24)

    class Callback(BaseHTTPRequestHandler):
        code = None
        error = None

        def do_GET(self):
            params = parse_qs(urlparse(self.path).query)
            if urlparse(self.path).path != "/callback" or params.get("state", [None])[0] != state:
                self.send_error(400, "Invalid callback or OAuth state")
                Callback.error = "Invalid callback or OAuth state"
                return
            Callback.code = params.get("code", [None])[0]
            Callback.error = params.get("error", [None])[0]
            self.send_response(200 if Callback.code else 400)
            self.end_headers()
            self.wfile.write(b"Return to the terminal. You can close this tab.")

        def log_message(self, *_args):
            pass

    with HTTPServer(("127.0.0.1", 0), Callback) as server:
        server.timeout = 10
        redirect = f"http://127.0.0.1:{server.server_port}/callback"
        registration = load(metadata["registration_endpoint"], json.dumps({
            "client_name": "Darwin cookbook local test", "redirect_uris": [redirect],
            "grant_types": ["authorization_code"], "response_types": ["code"],
            "token_endpoint_auth_method": "none", "scope": SCOPE,
        }).encode())
        client_id = registration["client_id"]
        params = urlencode({
            "response_type": "code", "client_id": client_id, "redirect_uri": redirect,
            "scope": SCOPE, "state": state, "code_challenge": challenge,
            "code_challenge_method": "S256", "resource": "https://api.darwin.so/api/v2",
        })
        print("Open this Darwin consent URL in your browser:\n" + metadata["authorization_endpoint"] + "?" + params, flush=True)
        for _ in range(60):
            server.handle_request()
            if Callback.code or Callback.error:
                break
        if not Callback.code:
            raise SystemExit(Callback.error or "OAuth consent timed out after 10 minutes")
        token = load(metadata["token_endpoint"], urlencode({
            "grant_type": "authorization_code", "code": Callback.code, "redirect_uri": redirect,
            "client_id": client_id, "code_verifier": verifier,
            "resource": "https://api.darwin.so/api/v2",
        }).encode(), "application/x-www-form-urlencoded")
    if not token.get("access_token"):
        raise SystemExit("OAuth did not return an access token")
    env = {**os.environ, "DARWIN_ACCESS_TOKEN": token["access_token"]}
    recipe = sys.argv[1]
    if recipe == "ide":
        recipe = "general-assistant"
        env["DARWIN_INITIAL_TASK"] = os.getenv("DARWIN_IDE_TASK", "")
    raise SystemExit(subprocess.call([sys.executable, str(ROOT / recipe / "main.py")], env=env))


if __name__ == "__main__":
    main()
