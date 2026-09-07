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

V2 will add `activeTab` and `scripting` permissions only when the feature ships.
The shared `CalendarItem`, deterministic identity, managed metadata, storage,
and reconciliation concepts introduced in V1 are intended to support it without
an architectural rewrite.

