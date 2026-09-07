import { describe, expect, it } from 'vitest';
import type { CalendarGateway } from '../lib/calendar/client';
import type { GoogleCalendar, GoogleEvent } from '../lib/calendar/types';
import { DEFAULT_SETTINGS, type AppState, type DeadlineItem } from '../lib/domain/types';
import { StateRepository, type StateStore } from '../lib/storage/repository';
import { DeadlineReconciler } from '../lib/sync/reconciler';

class MemoryStore implements StateStore {
  data: Record<string, unknown> = {};
  async get(key: string) {
    return { [key]: this.data[key] };
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, items);
  }
}

class FakeCalendar implements CalendarGateway {
  events: GoogleEvent[] = [];
  patches: GoogleEvent[] = [];
  async listOwnedCalendars(): Promise<GoogleCalendar[]> {
    return [];
  }
  async listManagedEvents() {
    return this.events;
  }
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
  async deleteEvent() {}
}

function item(sourceHash = 'hash'): DeadlineItem {
  return {
    kind: 'deadline',
    connectorId: 'gradescope',
    sourceId: '123:456',
    courseId: '123',
    courseName: 'CS 101',
    title: 'Problem Set 1',
    dueAt: '2126-09-13T03:59:00.000Z',
    status: 'pending',
    url: 'https://www.gradescope.com/courses/123/assignments/456',
    observedAt: '2026-09-06T12:00:00.000Z',
    sourceHash,
  };
}

async function setup() {
  const store = new MemoryStore();
  const repository = new StateRepository(store);
  const initial: AppState = {
    settings: { ...DEFAULT_SETTINGS, calendarId: 'primary' },
    courses: {},
    deadlines: {},
    scheduleMeetings: {},
    scheduleImports: {},
    managedEvents: {},
  };
  await repository.write(initial);
  const calendar = new FakeCalendar();
  return { repository, calendar, reconciler: new DeadlineReconciler(calendar, repository) };
}

describe('DeadlineReconciler', () => {
  it('creates once and remains idempotent', async () => {
    const { reconciler, calendar } = await setup();
    const first = await reconciler.reconcile({
      deadlines: [item()],
      completeCourseIds: new Set(['123']),
      trigger: 'manual',
    });
    const second = await reconciler.reconcile({
      deadlines: [item()],
      completeCourseIds: new Set(['123']),
      trigger: 'manual',
    });
    expect(first.counts.created).toBe(1);
    expect(second.counts.unchanged).toBe(1);
    expect(calendar.events).toHaveLength(1);
  });

  it('only marks a missing future assignment after two complete scans', async () => {
    const { reconciler, calendar } = await setup();
    await reconciler.reconcile({
      deadlines: [item()],
      completeCourseIds: new Set(['123']),
      trigger: 'manual',
    });
    const firstMissing = await reconciler.reconcile({
      deadlines: [],
      completeCourseIds: new Set(['123']),
      trigger: 'manual',
    });
    const secondMissing = await reconciler.reconcile({
      deadlines: [],
      completeCourseIds: new Set(['123']),
      trigger: 'manual',
    });
    expect(firstMissing.counts.unavailable).toBe(0);
    expect(secondMissing.counts.unavailable).toBe(1);
    expect(calendar.patches.at(-1)?.summary).toMatch(/^⚠ /);
  });

  it('does nothing destructive after an incomplete scan', async () => {
    const { reconciler, calendar } = await setup();
    await reconciler.reconcile({
      deadlines: [item()],
      completeCourseIds: new Set(['123']),
      trigger: 'manual',
    });
    await reconciler.reconcile({
      deadlines: [],
      completeCourseIds: new Set(),
      trigger: 'manual',
    });
    expect(calendar.patches).toHaveLength(0);
  });

  it('does not create historical events during first sync', async () => {
    const { reconciler, calendar } = await setup();
    const run = await reconciler.reconcile({
      deadlines: [{ ...item(), dueAt: '2020-01-01T12:00:00.000Z' }],
      completeCourseIds: new Set(['123']),
      trigger: 'onboarding',
    });
    expect(run.counts.created).toBe(0);
    expect(calendar.events).toHaveLength(0);
  });

  it('restores a reappearing assignment after an unavailable marker', async () => {
    const { reconciler, calendar } = await setup();
    await reconciler.reconcile({ deadlines: [item()], completeCourseIds: new Set(['123']), trigger: 'manual' });
    await reconciler.reconcile({ deadlines: [], completeCourseIds: new Set(['123']), trigger: 'manual' });
    await reconciler.reconcile({ deadlines: [], completeCourseIds: new Set(['123']), trigger: 'manual' });
    const result = await reconciler.reconcile({ deadlines: [item()], completeCourseIds: new Set(['123']), trigger: 'manual' });
    expect(result.counts.updated).toBe(1);
    expect(calendar.events[0]?.summary).not.toMatch(/^⚠ /);
  });
});
