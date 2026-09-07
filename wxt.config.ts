import preact from '@preact/preset-vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'WXT_');
    const googleClientId =
      env.WXT_GOOGLE_OAUTH_CLIENT_ID ??
      process.env.WXT_GOOGLE_OAUTH_CLIENT_ID ??
      'replace-me.apps.googleusercontent.com';

    return {
    name: 'Calendar Sync',
    description:
      'Privacy-first synchronization from Gradescope to Google Calendar.',
    homepage_url: 'https://github.com/ColeSlad/calendar-sync',
    minimum_chrome_version: '120',
    permissions: ['alarms', 'identity', 'offscreen', 'storage'],
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
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    };
  },
});
