import { describe, expect, it } from 'vitest';
import type { CalendarGateway } from '../lib/calendar/client';
import type { GoogleCalendar, GoogleEvent } from '../lib/calendar/types';
import { DEFAULT_SETTINGS, type AppState, type RecurringMeetingItem } from '../lib/domain/types';
import { StateRepository, type StateStore } from '../lib/storage/repository';
import { ScheduleReconciler } from '../lib/sync/schedule-reconciler';

class MemoryStore implements StateStore {
  data: Record<string, unknown> = {};
  async get(key: string) { return { [key]: this.data[key] }; }
  async set(items: Record<string, unknown>) { Object.assign(this.data, items); }
}

class FakeCalendar implements CalendarGateway {
  events: GoogleEvent[] = [];
  patches: GoogleEvent[] = [];
  async listOwnedCalendars(): Promise<GoogleCalendar[]> { return []; }
  async listManagedEvents() { return this.events; }
  async getEvent(_calendarId: string, eventId: string) {
    return this.events.find((event) => event.id === eventId);
  }
  async insertEvent(_calendarId: string, event: GoogleEvent) {
    this.events.push(event);
    return event;
  }
  async patchEvent(_calendarId: string, eventId: string, patch: GoogleEvent) {
    this.patches.push(patch);
    const existing = this.events.find((event) => event.id === eventId) ?? { id: eventId };
    Object.assign(existing, patch);
    return existing;
  }
  async deleteEvent(_calendarId: string, eventId: string) {
    this.events = this.events.filter((event) => event.id !== eventId);
  }
}

function meeting(sourceHash = 'hash'): RecurringMeetingItem {
  return {
    kind: 'recurring-meeting', connectorId: 'schedule-page', sourceId: 'schedule:abc',
    courseName: 'Algorithms', courseCode: 'CMSC351', section: '0101', component: 'Lecture',
    termName: 'Fall 2026', termStart: '2026-08-31', termEnd: '2026-12-14',
    timezone: 'America/New_York',
    meeting: { days: ['MO', 'WE'], startTime: '09:00', endTime: '09:50' },
    exclusions: [], confidence: 1, warnings: [], sourceUrl: 'https://school.edu/schedule', sourceHash,
  };
}

async function setup() {
  const store = new MemoryStore();
  const repository = new StateRepository(store);
  const initial: AppState = {
    settings: { ...DEFAULT_SETTINGS, calendarId: 'primary' },
    courses: {}, deadlines: {}, scheduleMeetings: {}, scheduleImports: {}, managedEvents: {},
  };
  await repository.write(initial);
  const calendar = new FakeCalendar();
  return { repository, calendar, reconciler: new ScheduleReconciler(calendar, repository) };
}

describe('ScheduleReconciler', () => {
  it('creates once, stays idempotent, and updates changed meetings', async () => {
    const { reconciler, calendar } = await setup();
    const first = await reconciler.reconcile({ items: [meeting()] });
    const second = await reconciler.reconcile({ items: [meeting()] });
    const third = await reconciler.reconcile({ items: [meeting('changed')] });
    expect(first.counts.created).toBe(1);
    expect(second.counts.unchanged).toBe(1);
    expect(third.counts.updated).toBe(1);
    expect(calendar.events).toHaveLength(1);
    expect(calendar.patches).toHaveLength(1);
  });

  it('only removes a series when explicitly requested', async () => {
    const { reconciler, calendar, repository } = await setup();
    await reconciler.reconcile({ items: [meeting()] });
    expect(Object.keys((await repository.read()).scheduleImports)).toHaveLength(1);
    const untouched = await reconciler.reconcile({ items: [] });
    expect(untouched.counts.unavailable).toBe(0);
    expect(calendar.events).toHaveLength(1);
    const removed = await reconciler.reconcile({ items: [], removeSourceIds: ['schedule:abc'] });
    expect(removed.counts.unavailable).toBe(1);
    expect(calendar.events).toHaveLength(0);
    expect((await repository.read()).scheduleMeetings).toEqual({});
    expect((await repository.read()).scheduleImports).toEqual({});
  });
});
