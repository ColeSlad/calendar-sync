import type { AppState } from '../domain/types';
import type { StateRepository } from '../storage/repository';
import type { GoogleCalendar, GoogleCalendarInput } from './types';

export const DEDICATED_CALENDAR_NAME = 'Class Schedule';
export const DEDICATED_CALENDAR_MARKER = 'calendar-sync:dedicated-calendar:v1';

export interface CalendarSetupGateway {
  listOwnedCalendars(interactive?: boolean): Promise<GoogleCalendar[]>;
  createCalendar(input: GoogleCalendarInput): Promise<GoogleCalendar>;
}

export interface DedicatedCalendarResult {
  state: AppState;
  calendars: GoogleCalendar[];
  created: boolean;
}

export class DedicatedCalendarService {
  constructor(
    private readonly calendar: CalendarSetupGateway,
    private readonly repository: StateRepository,
  ) {}

  async createOrSelect(timeZone: string): Promise<DedicatedCalendarResult> {
    const state = await this.repository.read();
    const calendars = await this.calendar.listOwnedCalendars(true);
    const existing = calendars.find(
      (item) => item.id === state.settings.dedicatedCalendarId,
    ) ?? calendars.find(
      (item) => item.description?.includes(DEDICATED_CALENDAR_MARKER),
    );

    if (existing) {
      return {
        state: await this.repository.updateSettings({
          calendarId: existing.id,
          dedicatedCalendarId: existing.id,
        }),
        calendars,
        created: false,
      };
    }

    const created = await this.calendar.createCalendar({
      summary: DEDICATED_CALENDAR_NAME,
      description:
        `Created and managed by Calendar Sync. [${DEDICATED_CALENDAR_MARKER}]`,
      timeZone,
    });

    return {
      state: await this.repository.updateSettings({
        calendarId: created.id,
        dedicatedCalendarId: created.id,
      }),
      calendars: [...calendars.filter((item) => item.id !== created.id), created],
      created: true,
    };
  }
}
