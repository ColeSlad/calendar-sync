export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned',
];

export const CALENDAR_CREATE_SCOPES = [
  ...CALENDAR_SCOPES,
  'https://www.googleapis.com/auth/calendar.app.created',
];

export async function getGoogleToken(
  interactive: boolean,
  scopes: string[] = CALENDAR_SCOPES,
): Promise<string> {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id;
  if (!clientId || clientId.startsWith('replace-me')) {
    throw new Error(
      'Google OAuth is not configured. Add WXT_GOOGLE_OAUTH_CLIENT_ID to .env, rebuild, and reload the extension.',
    );
  }
  const result = await chrome.identity.getAuthToken({
    interactive,
    scopes,
  });
  if (!result.token) throw new Error('Google did not return an access token.');
  return result.token;
}

export async function invalidateGoogleToken(token: string): Promise<void> {
  await chrome.identity.removeCachedAuthToken({ token });
}

export async function disconnectGoogle(): Promise<void> {
  await chrome.identity.clearAllCachedAuthTokens();
}
