# PDF and image context

Search accepts PDF, PNG, JPEG and WebP context through the same POST. This helps match an agent to the actual input; it does not upload a file into a provider account or execute the task.

## JavaScript / TypeScript

Run from the cookbook root with Node 20+ (or import the same helper in a TypeScript starter):

```js
import { fileContext, search, choices } from './lib/darwin.mjs';

const found = await search('Read invoice line items and check that totals add up', {
  context: [await fileContext('./invoice.pdf')],
});
console.log(found.response.overview ?? found.response.assessment?.explanation);
console.log(choices(found).map(({name, readiness, requiredSetup}) => ({name, readiness, requiredSetup})));
```

Use a local file you intend to send to Darwin. The helper rejects unsupported formats, empty files and base64 data over 7,000,000 characters (roughly 5 MB). The API accepts at most ten context items and 14,000,000 combined context characters. Do not put credentials in file/text context.

## Python

Run from the cookbook root:

```python
import sys
sys.path.insert(0, 'examples/python/shared')
from browse import file_context, search

found = search('Read invoice line items and check that totals add up',
               context=[file_context('./invoice.pdf')])
print(found['response'].get('overview') or found['response'].get('assessment', {}).get('explanation'))
```

For a small CSV, send its contents as a text item (maximum 4,000 characters per item). CSV, arbitrary binary files, video and audio are not accepted as raw file MIME types by this Search contract. The web interface's video-frame normalization is a separate client flow; this helper does not promise video or audio processing.

For a multi-step request such as invoice-to-CSV, require coverage of both extraction and CSV creation. Do not treat an extraction-only plan as successful. Provider file access, account setup and execution still need to be checked on the selected route; a connection prompt is not a file-transfer receipt.
