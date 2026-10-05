import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from shared.test_support import run_example

FOUND = {"outcome": "MATCH", "agents": [{"agent": "dns", "name": "DNS Agent"}], "results": [{
    "agent": "dns", "capability": "check-dns", "name": "Check DNS", "readiness": "ready", "canStartThread": True,
}]}


class FlowTests(unittest.TestCase):
    def test_search_alone_never_acts(self):
        result, calls = run_example("general-assistant", "Check SPF and DMARC\n", lambda _call: {"body": FOUND})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["path"] for call in calls], ["/search"])
        self.assertIn("DNS Agent", result.stdout)

    def test_reviewed_action_uses_exact_ids_and_provider_result(self):
        def reply(call):
            if call["path"] == "/search":
                return {"body": FOUND}
            if call["path"] == "/act/threads":
                return {"body": {"thread": "t1", "cursor": "c1"}}
            return {"body": {"cursor": "c2", "messages": [{"from": "darwin", "type": "result",
                    "content": [{"type": "text", "text": "SPF present"}], "data": {"spf": True}}], "requests": [], "actions": []}}
        answers = 'Check SPF and DMARC\n1\na\n{"domain":"example.com"}\nyes\n'
        result, calls = run_example("general-assistant", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[1]["body"]["targetAgent"], "dns")
        self.assertEqual(calls[1]["body"]["messageContent"]["capability"], "check-dns")
        self.assertIn("SPF present", result.stdout)

    def test_authentication_requires_another_yes_then_resumes(self):
        reads = 0

        def reply(call):
            nonlocal reads
            if call["path"] == "/search":
                return {"body": FOUND}
            if call["path"] == "/act/threads":
                return {"body": {"thread": "t1", "cursor": "c1"}}
            if call["path"].startswith("/act/threads/t1"):
                reads += 1
                if reads == 1:
                    return {"body": {"cursor": "c2", "messages": [], "actions": [], "requests": [{"type": "authentication_request", "request": "auth-1", "status": "pending"}]}}
                return {"body": {"cursor": "c3", "messages": [{"from": "darwin", "type": "result", "content": [{"type": "text", "text": "Done"}], "data": {"ok": True}}], "actions": [], "requests": []}}
            if call["path"] == "/act/authentications":
                return {"body": {"authentication": "attempt-1", "url": "https://darwin.so/connect", "status": "awaiting_consent"}}
            raise AssertionError(call["path"])

        answers = 'Check SPF and DMARC\n1\na\n{}\nyes\nyes\n\n'
        result, calls = run_example("general-assistant", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["body"]["request"] for call in calls if call["path"] == "/act/authentications"], ["auth-1"])
        self.assertIn("Done", result.stdout)

    def test_stale_route_fails_without_retry(self):
        def reply(call):
            if call["path"] == "/search":
                return {"body": FOUND}
            return {"status": 409, "body": {"code": "ROUTE_REVISION_STALE", "message": "Search again"}}

        result, calls = run_example("general-assistant", 'Check SPF and DMARC\n1\na\n{}\nyes\n', reply, token="test-only")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(sum(call["path"] == "/act/threads" for call in calls), 1)
        self.assertIn("ROUTE_REVISION_STALE", result.stderr)


if __name__ == "__main__":
    unittest.main()
