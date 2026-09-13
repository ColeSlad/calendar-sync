import { describe, expect, it } from 'vitest';
import {
  DEDICATED_CALENDAR_MARKER,
  DEDICATED_CALENDAR_NAME,
  DedicatedCalendarService,
  type CalendarSetupGateway,
} from '../lib/calendar/dedicated-calendar';
import type { GoogleCalendar, GoogleCalendarInput } from '../lib/calendar/types';
import { StateRepository, type StateStore } from '../lib/storage/repository';

class MemoryStore implements StateStore {
  data: Record<string, unknown> = {};
  async get(key: string) { return { [key]: this.data[key] }; }
  async set(items: Record<string, unknown>) { Object.assign(this.data, items); }
}

class FakeCalendar implements CalendarSetupGateway {
  calendars: GoogleCalendar[] = [];
  createCalls: GoogleCalendarInput[] = [];

  async listOwnedCalendars(): Promise<GoogleCalendar[]> {
    return this.calendars;
  }

  async createCalendar(input: GoogleCalendarInput): Promise<GoogleCalendar> {
    this.createCalls.push(input);
    const created: GoogleCalendar = {
      id: 'class-schedule-id',
      summary: input.summary,
      description: input.description,
      timeZone: input.timeZone,
      accessRole: 'owner',
    };
    return created;
  }
}

describe('DedicatedCalendarService', () => {
  it('creates and selects a dedicated calendar with the local timezone', async () => {
    const repository = new StateRepository(new MemoryStore());
    const calendar = new FakeCalendar();
    const result = await new DedicatedCalendarService(calendar, repository)
      .createOrSelect('America/New_York');

    expect(result.created).toBe(true);
    expect(calendar.createCalls).toEqual([{
      summary: DEDICATED_CALENDAR_NAME,
      description: expect.stringContaining(DEDICATED_CALENDAR_MARKER),
      timeZone: 'America/New_York',
    }]);
    expect(result.state.settings.calendarId).toBe('class-schedule-id');
    expect(result.state.settings.dedicatedCalendarId).toBe('class-schedule-id');
    expect(result.state.settings.managedCalendarIds).toContain('class-schedule-id');
  });

  it('reuses a marked calendar instead of creating a duplicate', async () => {
    const repository = new StateRepository(new MemoryStore());
    const calendar = new FakeCalendar();
    calendar.calendars = [{
      id: 'existing-id',
      summary: DEDICATED_CALENDAR_NAME,
      description: `Managed [${DEDICATED_CALENDAR_MARKER}]`,
      accessRole: 'owner',
    }];

    const first = await new DedicatedCalendarService(calendar, repository)
      .createOrSelect('America/New_York');
    const second = await new DedicatedCalendarService(calendar, repository)
      .createOrSelect('America/New_York');

    expect(first.created).toBe(false);
    expect(second.created).toBe(false);
    expect(calendar.createCalls).toHaveLength(0);
    expect(second.state.settings.calendarId).toBe('existing-id');
  });
});
