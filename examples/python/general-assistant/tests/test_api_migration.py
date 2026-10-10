import sys
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'shared'))
import browse

class ApiMigrationTests(unittest.TestCase):
    def test_receipt_polls_exact_child_and_returns_provider_result(self):
        page = {'thread': 'child', 'cursor': 'c2', 'messages': [{'from': 'agent', 'type': 'result'}], 'errors': []}
        with patch.object(browse, 'request', return_value={'threads': [{'threadId': 'child', 'state': page}]}) as send:
            result = browse.read_thread('child', 'c1', act_request_id='receipt')
            self.assertTrue(browse.has_result(result['messages']))
            path = send.call_args.args[0]
            self.assertIn('/act/requests/receipt?', path)
            self.assertIn('includeThreadState=true', path)
            self.assertIn('threadId=child', path)
            self.assertIn('cursor=c1', path)

    def test_missing_state_is_not_completion(self):
        with patch.object(browse, 'request', return_value={'threads': [{'threadId': 'child'}]}):
            with self.assertRaisesRegex(ValueError, 'matching thread state'):
                browse.read_thread('child', None, act_request_id='receipt')

    def test_followup_omits_limits(self):
        result = {'searchId': 's', 'responseId': 'r', 'response': {'agents': []}}
        with patch.object(browse, 'request', return_value=result) as send:
            browse.search('refine task', previousResponseId='previous')
            self.assertNotIn('maxResults', send.call_args.args[1])
            self.assertNotIn('agentCount', send.call_args.args[1])

    def test_file_context_uses_actual_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'invoice.pdf'
            file.write_bytes(b'%PDF sample')
            item = browse.file_context(file)
            self.assertEqual(item['mimeType'], 'application/pdf')
            self.assertEqual(browse.base64.b64decode(item['data']), b'%PDF sample')
            with self.assertRaisesRegex(ValueError, 'Use PDF'):
                browse.file_context(Path(folder) / 'video.mp4')
