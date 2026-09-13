import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarClient } from '../lib/calendar/client';

describe('GoogleCalendarClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a secondary calendar with the app-created scope', async () => {
    const getAuthToken = vi.fn().mockResolvedValue({ token: 'test-token' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'calendar-id',
      summary: 'Class Schedule',
      timeZone: 'America/New_York',
    }), { status: 200 }));
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'test.apps.googleusercontent.com' } }),
      },
      identity: { getAuthToken },
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await new GoogleCalendarClient().createCalendar({
      summary: 'Class Schedule',
      timeZone: 'America/New_York',
    });

    expect(created).toMatchObject({ id: 'calendar-id', accessRole: 'owner' });
    expect(getAuthToken).toHaveBeenCalledWith(expect.objectContaining({
      interactive: true,
      scopes: expect.arrayContaining([
        'https://www.googleapis.com/auth/calendar.app.created',
      ]),
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
