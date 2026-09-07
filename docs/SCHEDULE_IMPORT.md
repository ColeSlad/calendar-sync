# Schedule page importer

Calendar Sync can import recurring classes from rendered English-language school
portal pages without a school-specific host permission or backend.

## Use

1. Sign in to the school portal and navigate until the enrolled class meetings
   are visible on the page.
2. Open Calendar Sync and select **Import current page**.
3. Review every detected meeting in the importer tab.
4. Enter or confirm the term's first and last class dates. Add school break
   ranges when classes should not recur.
5. Confirm the destination calendar and select **Add classes to calendar**.

Re-importing the same term updates matching managed series. Previously imported
series absent from the current page are shown separately and are never removed
unless explicitly selected.

## Extraction behavior

The first pass recognizes common course codes, weekday forms, 12/24-hour time
ranges, and labeled schedule tables. Ambiguous layouts can be analyzed with
Chrome's on-device Prompt API using a strict JSON schema. Low-confidence rows
must be acknowledged before import.

The Prompt API requires Chrome 138 or newer, supported desktop hardware, enough
free storage, and an unmetered model download. When it is unavailable, the
rules-based results remain editable. Model status can be inspected at
`chrome://on-device-internals`.

## Privacy and limitations

Only the active tab is read, and only after the user clicks the import action.
Page captures are temporary and are not sent to a cloud model. The initial
version does not read raw page source, PDFs, images, cross-origin embedded
frames, or non-English schedules. It does not infer school holidays; enter break
ranges in the review screen.
