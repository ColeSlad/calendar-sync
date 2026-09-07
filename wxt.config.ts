import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

const googleClientId =
  process.env.WXT_GOOGLE_OAUTH_CLIENT_ID ??
  'replace-me.apps.googleusercontent.com';

export default defineConfig({
  vite: () => ({ plugins: [preact()] }),
  manifest: {
    name: 'Calendar Sync',
    description:
      'Privacy-first synchronization from Gradescope and school schedules to Google Calendar.',
    minimum_chrome_version: '120',
    permissions: ['alarms', 'identity', 'storage'],
    optional_permissions: ['notifications'],
    host_permissions: [
      'https://www.gradescope.com/*',
      'https://www.googleapis.com/*',
    ],
    oauth2: {
      client_id: googleClientId,
      scopes: [
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events.owned',
      ],
    },
    action: {
      default_title: 'Calendar Sync',
    },
  },
});

