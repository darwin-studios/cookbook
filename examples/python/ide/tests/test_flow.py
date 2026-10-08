import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from shared.test_support import run_example, search_fixture, started


class FlowTests(unittest.TestCase):
    def test_approved_summary_searches_without_act(self):
        result, calls = run_example("ide", "", lambda _call: {"body": search_fixture([])},
                                    args=["--once", "check live SPF and DMARC records for my domain"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["path"] for call in calls], ["/search"])
        self.assertIn("SPF and DMARC", calls[0]["body"]["query"])
        self.assertEqual(json.loads(result.stdout)["type"], "suggestions")

    def test_stream_ignores_source_text(self):
        payload = json.dumps({"task": "check live SPF and DMARC records for my domain", "language": "python", "source": "SECRET_SOURCE_DO_NOT_SEND"}) + "\n"
        result, calls = run_example("ide", payload, lambda _call: {"body": search_fixture([])})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 1)
        self.assertNotIn("SECRET_SOURCE_DO_NOT_SEND", json.dumps(calls[0]["body"]))


if __name__ == "__main__":
    unittest.main()
