import { deterministicEventId } from '../core/hash';
import type { Course, DeadlineItem, Settings } from '../domain/types';
import type { GoogleEvent } from './types';

export const MANAGED_START = '--- Calendar Sync details ---';
export const MANAGED_END = '--- End Calendar Sync details ---';

function managedDescription(deadline: DeadlineItem): string {
  const status = deadline.status === 'pending' ? 'Not submitted' : 'Submitted';
  return [
    MANAGED_START,
    `Course: ${deadline.courseName}`,
    `Status: ${status}`,
    `Open in Gradescope: ${deadline.url}`,
    MANAGED_END,
  ].join('\n');
}

export function mergeManagedDescription(
  existing: string | undefined,
  managed: string,
): string {
  if (!existing) return managed;
  const start = existing.indexOf(MANAGED_START);
  const end = existing.indexOf(MANAGED_END);
  if (start < 0 || end < start) return `${managed}\n\n${existing}`;

  const before = existing.slice(0, start).trimEnd();
  const after = existing.slice(end + MANAGED_END.length).trimStart();
  return [before, managed, after].filter(Boolean).join('\n\n');
}

function title(deadline: DeadlineItem, unavailable = false): string {
  const prefix = unavailable ? '⚠' : deadline.status === 'pending' ? '' : '✓';
  return `${prefix ? `${prefix} ` : ''}[${deadline.courseName}] ${deadline.title}`;
}

function managedProperties(deadline: DeadlineItem): Record<string, string> {
  return {
    calendarSyncManaged: 'true',
    calendarSyncConnector: deadline.connectorId,
    calendarSyncSourceId: deadline.sourceId,
    calendarSyncSchema: '1',
  };
}

export async function createDeadlineEvent(
  deadline: DeadlineItem,
  course: Course | undefined,
  settings: Settings,
): Promise<GoogleEvent> {
  const end = new Date(new Date(deadline.dueAt).getTime() + 15 * 60_000).toISOString();
  return {
    id: await deterministicEventId(deadline.connectorId, deadline.sourceId),
    summary: title(deadline),
    description: managedDescription(deadline),
    colorId: course?.colorId,
    transparency: deadline.status === 'pending' ? 'opaque' : 'transparent',
    start: { dateTime: deadline.dueAt },
    end: { dateTime: end },
    reminders: {
      useDefault: false,
      overrides: settings.reminderMinutes.map((minutes) => ({ method: 'popup', minutes })),
    },
    extendedProperties: { private: managedProperties(deadline) },
  };
}

export function patchDeadlineEvent(
  deadline: DeadlineItem,
  existing: GoogleEvent,
  course?: Course,
): GoogleEvent {
  const end = new Date(new Date(deadline.dueAt).getTime() + 15 * 60_000).toISOString();
  return {
    summary: title(deadline),
    description: mergeManagedDescription(existing.description, managedDescription(deadline)),
    colorId: course?.colorId,
    transparency: deadline.status === 'pending' ? 'opaque' : 'transparent',
    start: { dateTime: deadline.dueAt },
    end: { dateTime: end },
    extendedProperties: { private: managedProperties(deadline) },
  };
}

export function patchUnavailableEvent(
  deadline: DeadlineItem,
  existing: GoogleEvent,
): GoogleEvent {
  const note = [
    MANAGED_START,
    `Course: ${deadline.courseName}`,
    'Status: No longer listed in Gradescope. Review before removing.',
    `Last known Gradescope link: ${deadline.url}`,
    MANAGED_END,
  ].join('\n');
  return {
    summary: title(deadline, true),
    description: mergeManagedDescription(existing.description, note),
    transparency: 'transparent',
  };
}

