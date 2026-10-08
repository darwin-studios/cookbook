import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from shared.test_support import run_example, search_fixture, started

FOUND = search_fixture([{"agentId": "dns", "agentSlug": "DNS Agent", "capabilityId": "check-dns", "name": "Check DNS", "readiness": "ready", "canStartThread": True}])


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
            if call["path"] == "/act" and not call["body"].get("threadId"):
                return {"body": started(call["body"]["agentIds"][0])}
            return {"body": {"cursor": "c2", "messages": [{"from": "darwin", "type": "result",
                    "content": [{"type": "text", "text": "SPF present"}], "data": {"spf": True}}], "requests": [], "actions": []}}
        answers = 'Check SPF and DMARC\n1\na\n{"domain":"example.com"}\nyes\n'
        result, calls = run_example("general-assistant", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[1]["body"]["agentIds"][0], "dns")
        self.assertEqual(calls[1]["body"]["arguments"]["dns"], {"domain": "example.com"})
        self.assertIn("SPF present", result.stdout)

    def test_authentication_requires_another_yes_then_resumes(self):
        reads = 0

        def reply(call):
            nonlocal reads
            if call["path"] == "/search":
                return {"body": FOUND}
            if call["path"] == "/act" and not call["body"].get("threadId"):
                return {"body": started(call["body"]["agentIds"][0])}
            if call["path"].startswith("/act/threads/t1"):
                reads += 1
                if reads == 1:
                    return {"body": {"cursor": "c2", "messages": [], "actions": [], "requests": [{"type": "authentication_request", "request": "auth-1", "status": "pending"}]}}
                return {"body": {"cursor": "c3", "messages": [{"from": "darwin", "type": "result", "content": [{"type": "text", "text": "Done"}], "data": {"ok": True}}], "actions": [], "requests": []}}
            if call["path"] == "/act" and isinstance(call["body"]["message"], dict) and call["body"]["message"].get("type") == "authentication_response":
                return {"body": {"type": "continuation", "threadId": "t1", "result": {"authentication": "attempt-1", "url": "https://darwin.so/connect", "status": "awaiting_consent"}}}
            raise AssertionError(call["path"])

        answers = 'Check SPF and DMARC\n1\na\n{}\nyes\nyes\n\n'
        result, calls = run_example("general-assistant", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["body"]["message"]["requestId"] for call in calls if call["path"] == "/act" and isinstance(call["body"]["message"], dict) and call["body"]["message"].get("type") == "authentication_response"], ["auth-1"])
        self.assertIn("Done", result.stdout)

    def test_stale_route_fails_without_retry(self):
        def reply(call):
            if call["path"] == "/search":
                return {"body": FOUND}
            return {"status": 409, "body": {"code": "ROUTE_REVISION_STALE", "message": "Search again"}}

        result, calls = run_example("general-assistant", 'Check SPF and DMARC\n1\na\n{}\nyes\n', reply, token="test-only")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(sum(call["path"] == "/act" and not call["body"].get("threadId") for call in calls), 1)
        self.assertIn("ROUTE_REVISION_STALE", result.stderr)

    def test_clarification_keeps_session_and_token(self):
        searches = 0

        def reply(call):
            nonlocal searches
            searches += 1
            if searches == 1:
                first = search_fixture([])
                first["status"] = "needs_input"
                first["searchToken"] = "test-owner-token"
                first["response"]["question"] = "Which state?"
                return {"body": first}
            self.assertEqual(call["body"]["previousResponseId"], FOUND["responseId"])
            self.assertEqual(call["headers"].get("X-Search-Token"), "test-owner-token")
            self.assertEqual(call["body"]["query"], "California")
            return {"body": FOUND}

        result, calls = run_example("general-assistant", "Prepare a tax return\nCalifornia\n", reply)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 2)
        self.assertIn("Which state?", result.stdout)
        self.assertIn("Connection prompt", result.stdout)

    def test_http_200_target_error_is_not_success(self):
        def reply(call):
            if call["path"] == "/search":
                return {"body": FOUND}
            return {"body": {"type": "request", "actRequestId": "actreq_1", "status": "failed", "threads": [{"agentId": "dns", "errorCode": "ROUTE_NOT_READY"}]}}

        result, calls = run_example("general-assistant", "Check DNS\n1\na\n{}\nyes\n", reply, token="test-only")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(calls), 2)
        self.assertIn("ROUTE_NOT_READY", result.stderr)
        self.assertNotIn("Accepted on thread", result.stdout)


if __name__ == "__main__":
    unittest.main()
