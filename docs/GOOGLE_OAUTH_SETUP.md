# Google OAuth setup

Calendar Sync needs a Google Cloud project controlled by the publisher.

1. Create a Google Cloud project and enable the Google Calendar API.
2. Configure the OAuth consent screen for an external app.
3. Add these scopes:
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.events.owned`
4. Build the extension once and load it unpacked in Chrome.
5. Copy its stable extension ID from `chrome://extensions`.
6. Create an OAuth client with application type **Chrome Extension**, using that
   extension ID.
7. Put the client ID in `.env` as `WXT_GOOGLE_OAUTH_CLIENT_ID`.
8. Add the production Chrome Web Store extension ID to the production OAuth
   client before publishing.
9. Complete Google's verification process and host the privacy policy at a
   publicly accessible URL.

The extension must never contain an OAuth client secret. Run
`npm run release:check` before packaging; it rejects placeholder client IDs.

