# Product roadmap

## V1: Gradescope deadline sync

- Reliable browser-local polling, visit-triggered sync, and manual sync.
- Owned Google Calendar selection, course controls, colors, and reminders.
- Idempotent event reconciliation that preserves user notes and reminders.
- Clear diagnostics and deliberate managed-event cleanup.

## V2: school schedule page importer

The schedule importer will be a separate `schedule-page` source connector. The
user will invoke it on a school schedule page, review the extracted meetings,
and approve recurring Google Calendar series before any events are written.

The extraction pipeline will collect and sanitize visible schedule tables, use
deterministic parsing first, and use Chrome's on-device Prompt API with a strict
JSON Schema for ambiguous layouts. Source text will not be sent to a cloud
model. Invalid or low-confidence fields will require correction in the preview.

V2 uses `activeTab` and `scripting` only after an explicit import action. The
shared `CalendarItem`, deterministic identity, managed metadata, storage, and
reconciliation concepts introduced in V1 support schedule series without an
architectural rewrite.

Implemented initial scope:

- Rendered English-language HTML schedules, including tables, cards, and lists.
- Deterministic extraction with schema-constrained on-device AI fallback.
- Editable term, meeting, timezone, and school-break review.
- Idempotent recurring Google Calendar events and explicit removals.

Future iterations can add multilingual extraction, PDFs or image-based
schedules, and verified academic-calendar lookups.
