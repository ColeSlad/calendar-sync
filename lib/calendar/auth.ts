const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned',
];

export async function getGoogleToken(interactive: boolean): Promise<string> {
  const result = await chrome.identity.getAuthToken({
    interactive,
    scopes: CALENDAR_SCOPES,
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

