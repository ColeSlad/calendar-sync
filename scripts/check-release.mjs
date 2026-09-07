import { readFile } from 'node:fs/promises';

const manifestPath = new URL('../.output/chrome-mv3/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const clientId = manifest.oauth2?.client_id ?? '';

if (!clientId || clientId.startsWith('replace-me')) {
  console.error('Release blocked: set WXT_GOOGLE_OAUTH_CLIENT_ID to the production Chrome Extension OAuth client ID.');
  process.exit(1);
}

if (!clientId.endsWith('.apps.googleusercontent.com')) {
  console.error('Release blocked: the Google OAuth client ID has an unexpected format.');
  process.exit(1);
}

console.log('Release configuration looks valid.');

