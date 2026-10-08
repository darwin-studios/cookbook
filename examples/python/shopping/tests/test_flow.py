import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from shared.test_support import run_example, search_fixture, started as start_fixture

FOUND = search_fixture([{"agentId": agent, "capabilityId": f"{agent}-search", "name": "product search", "description": "Search current product offers", "readiness": "ready", "canStartThread": True} for agent in ("a", "b")])


class FlowTests(unittest.TestCase):
    def test_two_real_responses_no_payment(self):
        count = 0

        def reply(call):
            nonlocal count
            if call["path"] == "/search":
                return {"body": FOUND}
            if call["path"] == "/act" and not call["body"].get("threadId"):
                count += 1
                return {"body": start_fixture(call["body"]["agentIds"][0], f"t{count}")}
            return {"body": {"cursor": "c2", "messages": [{"from": "darwin", "type": "result",
                    "content": [{"type": "text", "text": "Current offer"}], "data": {"price": 850}}], "actions": [], "requests": []}}

        answers = 'MacBook Air M4\nunder $900\n1,2\n{"query":"MacBook Air M4"}\nyes\n{"query":"MacBook Air M4"}\nyes\n'
        result, calls = run_example("shopping", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["body"]["agentIds"][0] for call in calls if call["path"] == "/act" and not call["body"].get("threadId")], ["a", "b"])
        self.assertFalse(any("/payments" in call["path"] for call in calls))
        self.assertIn("Current offer", result.stdout)

    def test_payment_request_needs_separate_review(self):
        def reply(call):
            if call["path"] == "/search":
                return {"body": FOUND}
            if call["path"] == "/act" and not call["body"].get("threadId"):
                return {"body": start_fixture(call["body"]["agentIds"][0])}
            return {"body": {"cursor": "c2", "messages": [], "actions": [], "requests": [{"type": "payment_request", "request": "p1", "status": "pending", "acceptedMethods": ["hosted_checkout"]}]}}

        answers = 'MacBook Air M4\nunder $900\n1\n{"query":"MacBook Air M4"}\nyes\nno\n'
        result, calls = run_example("shopping", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(any("/payments" in call["path"] for call in calls))

    def test_selected_offer_can_enter_one_hosted_payment_review(self):
        reads = 0

        def reply(call):
            nonlocal reads
            if call["path"] == "/search":
                return {"body": FOUND}
            if call["path"] == "/act" and not call["body"].get("threadId"):
                return {"body": start_fixture(call["body"]["agentIds"][0])}
            if call["path"] == "/act" and isinstance(call["body"]["message"], dict) and call["body"]["message"].get("type") == "text":
                return {"body": {"status": "accepted"}}
            if call["path"].startswith("/act/threads/t1"):
                reads += 1
                if reads == 1:
                    return {"body": {"cursor": "c2", "messages": [{"from": "darwin", "type": "result", "content": [{"type": "text", "text": "Offer found"}], "data": {"price": 850}}], "actions": [], "requests": []}}
                if reads == 2:
                    return {"body": {"cursor": "c3", "messages": [], "actions": [], "requests": [{"type": "payment_request", "request": "pay-1", "status": "pending", "acceptedMethods": ["hosted_checkout"]}]}}
                return {"body": {"cursor": "c4", "messages": [{"from": "darwin", "type": "result", "content": [{"type": "text", "text": "Provider completed"}], "data": {"completed": True}}], "actions": [], "requests": []}}
            if call["path"] == "/act" and isinstance(call["body"]["message"], dict) and call["body"]["message"].get("type") == "payment_response":
                return {"body": {"type": "continuation", "threadId": "t1", "result": {"request": "pay-1", "url": "https://darwin.so/pay", "status": "selection_required"}}}
            raise AssertionError(call["path"])

        answers = 'MacBook Air M4\nunder $900\n1\n{"query":"MacBook Air M4"}\nyes\n1\nPlease continue with this offer\nyes\nyes\n\n'
        result, calls = run_example("shopping", answers, reply, token="test-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        pays = [call for call in calls if call["path"] == "/act" and isinstance(call["body"]["message"], dict) and call["body"]["message"].get("type") == "payment_response"]
        self.assertEqual(len(pays), 1)
        self.assertEqual(pays[0]["body"]["message"]["requestId"], "pay-1")
        self.assertEqual(pays[0]["body"]["message"]["method"], "hosted_checkout")
        self.assertIn("Provider completed", result.stdout)


if __name__ == "__main__":
    unittest.main()
