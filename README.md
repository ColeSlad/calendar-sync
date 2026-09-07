# Calendar Sync

Calendar Sync is a privacy-first Chrome extension for keeping Gradescope
deadlines in Google Calendar. It discovers courses from the user's existing
Gradescope session, updates deadlines in the background, preserves user edits,
and clearly reports what changed.

A later connector will import recurring class meetings from school schedule
pages using Chrome's on-device AI. See [the roadmap](docs/ROADMAP.md).

## Current features

- Manual, visit-triggered, and two-hour background synchronization.
- Google Calendar selection limited to calendars the user owns.
- Per-course inclusion and Google event colors.
- Deterministic event IDs and private metadata to prevent duplicates.
- Updates for changed deadlines and submitted assignments.
- User notes, locations, and reminder customizations are preserved.
- Missing assignments are not flagged until two complete successful scans.
- No backend, Gradescope password storage, or analytics.

## Development

Requirements: Node.js 24+ and Chrome 120+.

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

All assignment parsing and synchronization runs in the browser. The extension
does not operate a backend, collect analytics, or store Gradescope credentials.
Read the full [privacy policy](PRIVACY.md).

## Project status

This is an early implementation. Parser fixtures cover known Gradescope markup,
but a live Gradescope account and a configured Google OAuth client are required
for end-to-end acceptance testing before publishing.
