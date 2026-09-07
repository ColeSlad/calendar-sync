import { getGoogleToken, invalidateGoogleToken } from './auth';
import type {
  GoogleCalendar,
  GoogleCalendarList,
  GoogleEvent,
  GoogleEventList,
} from './types';

const API_BASE = 'https://www.googleapis.com/calendar/v3';

export class CalendarApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

export interface CalendarGateway {
  listOwnedCalendars(interactive?: boolean): Promise<GoogleCalendar[]>;
  listManagedEvents(calendarId: string): Promise<GoogleEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<GoogleEvent | undefined>;
  insertEvent(calendarId: string, event: GoogleEvent): Promise<GoogleEvent>;
  patchEvent(
    calendarId: string,
    eventId: string,
    patch: GoogleEvent,
  ): Promise<GoogleEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

export class GoogleCalendarClient implements CalendarGateway {
  private async request<T>(
    path: string,
    init: RequestInit = {},
    interactive = false,
    authRetry = true,
  ): Promise<T> {
    const token = await getGoogleToken(interactive);
    let response: Response | undefined;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }

    if (response?.status === 401 && authRetry) {
      await invalidateGoogleToken(token);
      return this.request<T>(path, init, interactive, false);
    }

    throw new CalendarApiError(
      response?.status ?? 0,
      response ? await errorMessage(response) : 'Calendar request failed.',
    );
  }

  async listOwnedCalendars(interactive = false): Promise<GoogleCalendar[]> {
    const calendars: GoogleCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ minAccessRole: 'owner' });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await this.request<GoogleCalendarList>(
        `/users/me/calendarList?${query}`,
        {},
        interactive,
      );
      calendars.push(...(page.items ?? []).filter((item) => item.accessRole === 'owner'));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return calendars;
  }

  async listManagedEvents(calendarId: string): Promise<GoogleEvent[]> {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        privateExtendedProperty: 'calendarSyncManaged=true',
        showDeleted: 'false',
        maxResults: '2500',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await this.request<GoogleEventList>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      );
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return events;
  }

  async getEvent(calendarId: string, eventId: string): Promise<GoogleEvent | undefined> {
    try {
      return await this.request<GoogleEvent>(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
    } catch (error) {
      if (error instanceof CalendarApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  insertEvent(calendarId: string, event: GoogleEvent): Promise<GoogleEvent> {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  patchEvent(
    calendarId: string,
    eventId: string,
    patch: GoogleEvent,
  ): Promise<GoogleEvent> {
    return this.request(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  }

  deleteEvent(calendarId: string, eventId: string): Promise<void> {
    return this.request(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  }
}

