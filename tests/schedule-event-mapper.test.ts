import { describe, expect, it } from 'vitest';
import { createScheduleEvent, patchScheduleEvent } from '../lib/calendar/schedule-event-mapper';
import { DEFAULT_SETTINGS, type RecurringMeetingItem } from '../lib/domain/types';

const item: RecurringMeetingItem = {
  kind: 'recurring-meeting',
  connectorId: 'schedule-page',
  sourceId: 'schedule:abc',
  courseName: 'Object-Oriented Programming I',
  courseCode: 'CMSC131',
  section: '0101',
  component: 'Lecture',
  instructor: 'Ada Lovelace',
  termName: 'Fall 2026',
  termStart: '2026-08-31',
  termEnd: '2026-12-14',
  timezone: 'America/New_York',
  meeting: { days: ['MO', 'WE', 'FR'], startTime: '10:00', endTime: '10:50', location: 'IRB 0324' },
  exclusions: [{ start: '2026-11-25', end: '2026-11-27' }],
  confidence: 1,
  warnings: [],
  colorId: '7',
  sourceUrl: 'https://app.testudo.umd.edu/#/main/schedule',
  sourceHash: 'hash',
};

describe('schedule event mapping', () => {
  it('creates a timezone-aware recurring event with break exclusions', async () => {
    const event = await createScheduleEvent(item, DEFAULT_SETTINGS);
    expect(event.summary).toBe('CMSC131 — Object-Oriented Programming I');
    expect(event.colorId).toBe('7');
    expect(event.start).toEqual({
      dateTime: '2026-08-31T10:00:00',
      timeZone: 'America/New_York',
    });
    expect(event.recurrence?.[0]).toContain('BYDAY=MO,WE,FR');
    expect(event.recurrence?.[1]).toContain('20261125T100000');
    expect(event.recurrence?.[1]).toContain('20261127T100000');
  });

  it('updates managed schedule fields while preserving user notes and reminders', () => {
    const patch = patchScheduleEvent(
      { ...item, meeting: { ...item.meeting, location: 'CSI 1115' } },
      {
        description: 'My note',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 5 }] },
        extendedProperties: { private: { anotherApp: 'keep' } },
      },
    );
    expect(patch.location).toBe('CSI 1115');
    expect(patch.description).toContain('My note');
    expect(patch).not.toHaveProperty('reminders');
    expect(patch.extendedProperties?.private?.anotherApp).toBe('keep');
  });
});
