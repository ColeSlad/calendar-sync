import { describe, expect, it } from 'vitest';
import {
  MANAGED_END,
  MANAGED_START,
  createDeadlineEvent,
  mergeManagedDescription,
  patchDeadlineEvent,
} from '../lib/calendar/event-mapper';
import { DEFAULT_SETTINGS, type DeadlineItem } from '../lib/domain/types';

const deadline: DeadlineItem = {
  kind: 'deadline',
  connectorId: 'gradescope',
  sourceId: '123:456',
  courseId: '123',
  courseName: 'CS 101',
  title: 'Problem Set 1',
  dueAt: '2026-09-13T03:59:00.000Z',
  status: 'pending',
  url: 'https://www.gradescope.com/courses/123/assignments/456',
  observedAt: '2026-09-06T12:00:00.000Z',
  sourceHash: 'hash-one',
};

describe('deadline event mapping', () => {
  it('creates a deterministic rich event', async () => {
    const event = await createDeadlineEvent(deadline, undefined, DEFAULT_SETTINGS);
    expect(event.summary).toBe('[CS 101] Problem Set 1');
    expect(event.end?.dateTime).toBe('2026-09-13T04:14:00.000Z');
    expect(event.extendedProperties?.private?.calendarSyncSourceId).toBe('123:456');
  });

  it('preserves notes outside the managed block', () => {
    const original = `${MANAGED_START}\nOld details\n${MANAGED_END}\n\nBring calculator`;
    const merged = mergeManagedDescription(
      original,
      `${MANAGED_START}\nNew details\n${MANAGED_END}`,
    );
    expect(merged).toContain('New details');
    expect(merged).toContain('Bring calculator');
    expect(merged).not.toContain('Old details');
  });

  it('marks submitted work without replacing location or reminders', () => {
    const patch = patchDeadlineEvent(
      { ...deadline, status: 'submitted', sourceHash: 'hash-two' },
      { description: 'My note', location: 'Library' },
    );
    expect(patch.summary).toBe('✓ [CS 101] Problem Set 1');
    expect(patch.description).toContain('My note');
    expect(patch).not.toHaveProperty('location');
    expect(patch).not.toHaveProperty('reminders');
  });
});

