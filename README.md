# Calendar Sync

Calendar Sync is a privacy-first Chrome extension for sending Gradescope
deadlines to Google Calendar. A later connector will import recurring class
meetings from school schedule pages using Chrome's on-device AI.

## Development

Requirements: Node.js 22+ and Chrome 120+.

```sh
cp .env.example .env
npm install
npm run dev
```

Set `WXT_GOOGLE_OAUTH_CLIENT_ID` to a Chrome Extension OAuth client with the
Google Calendar API enabled. Load `.output/chrome-mv3-dev` from
`chrome://extensions` with Developer mode enabled.

## Privacy

All assignment parsing and synchronization runs in the browser. The extension
does not operate a backend, collect analytics, or store Gradescope credentials.

