# Calendar Sync

Calendar Sync is a privacy-first Chrome extension for keeping academic schedules
in Google Calendar. It synchronizes Gradescope deadlines and imports recurring
classes directly from rendered school schedule pages.

## Current features

- Manual, visit-triggered, and two-hour background synchronization.
- Google Calendar selection limited to calendars the user owns.
- Per-course inclusion and Google event colors.
- Deterministic event IDs and private metadata to prevent duplicates.
- Updates for changed deadlines and submitted assignments.
- User notes, locations, and reminder customizations are preserved.
- Missing assignments are not flagged until two complete successful scans.
- User-triggered class schedule capture from any rendered English-language school portal.
- Editable import review, recurring meetings, term boundaries, and optional break exclusions.
- Deterministic schedule parsing with Chrome's on-device Prompt API for ambiguous layouts.
- Idempotent class re-imports with explicit, opt-in removal of missing series.
- No backend, Gradescope password storage, or analytics.

## Import a class schedule

1. Open the school portal page where your enrolled classes are visibly rendered.
2. Open Calendar Sync and choose **Import current page**.
3. If offered, let Chrome download its on-device language model and analyze the page.
4. Confirm term dates, classes, meeting times, locations, and optional school breaks.
5. Choose **Add classes to calendar**.

The importer reads the active tab only after the button is clicked. It does not
work from a login page or from the raw source of a JavaScript application. See
[schedule importer details](docs/SCHEDULE_IMPORT.md).

## Development

Requirements: Node.js 24+ and Chrome 120+. Chrome's on-device Prompt API is
available to extensions in Chrome 138+ on supported desktop hardware; the local
rules-based extractor remains available on older or unsupported devices.

```sh
cp .env.example .env
npm install
npm run dev
```

Follow [the Google OAuth setup guide](docs/GOOGLE_OAUTH_SETUP.md), then set
`WXT_GOOGLE_OAUTH_CLIENT_ID`. Load `.output/chrome-mv3-dev` from
`chrome://extensions` with Developer mode enabled.

Useful commands:

```sh
npm run check          # types, unit tests, and production build
npm run release:check  # also rejects placeholder OAuth configuration
npm run zip            # Chrome Web Store archive
```

The production extension is emitted to `.output/chrome-mv3`.

## Privacy

All schedule parsing and synchronization runs in the browser. The extension
does not operate a backend, collect analytics, or store school credentials.
Read the full [privacy policy](PRIVACY.md).

## Project status

This is an early implementation. Parser fixtures cover known Gradescope and
generic schedule layouts, but live school portals and a configured Google OAuth
client are required for end-to-end acceptance testing before publishing.
