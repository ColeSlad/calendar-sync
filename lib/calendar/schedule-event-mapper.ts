import { deterministicEventId } from '../core/hash';
import type { RecurringMeetingItem, Settings, Weekday } from '../domain/types';
import { MANAGED_END, MANAGED_START, mergeManagedDescription } from './event-mapper';
import type { GoogleEvent } from './types';

const WEEKDAY_FROM_NUMBER: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function weekday(date: string): Weekday {
  return WEEKDAY_FROM_NUMBER[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

function firstOccurrence(item: RecurringMeetingItem): string {
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(item.termStart, offset);
    if (item.meeting.days.includes(weekday(candidate))) return candidate;
  }
  throw new Error(`No meeting day was found for ${item.courseName}.`);
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!, second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let result = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(result)).map((part) => [part.type, part.value]),
    );
    const observed = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    result += desired - observed;
  }
  return new Date(result);
}

function recurrence(item: RecurringMeetingItem): string[] {
  const untilDate = addDays(item.termEnd, 1);
  const until = zonedDateTimeToUtc(untilDate, '00:00:00', item.timezone)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('.000', '');
  const values = [`RRULE:FREQ=WEEKLY;BYDAY=${item.meeting.days.join(',')};UNTIL=${until}`];
  const exclusions: string[] = [];
  for (const range of item.exclusions) {
    let date = range.start < item.termStart ? item.termStart : range.start;
    const end = range.end > item.termEnd ? item.termEnd : range.end;
    while (date <= end) {
      if (item.meeting.days.includes(weekday(date))) {
        exclusions.push(`${date.replaceAll('-', '')}T${item.meeting.startTime.replace(':', '')}00`);
      }
      date = addDays(date, 1);
    }
  }
  if (exclusions.length) {
    values.push(`EXDATE;TZID=${item.timezone}:${exclusions.join(',')}`);
  }
  return values;
}

function title(item: RecurringMeetingItem): string {
  if (!item.courseCode || item.courseCode === item.courseName) return item.courseName;
  return `${item.courseCode} — ${item.courseName}`;
}

function managedDescription(item: RecurringMeetingItem): string {
  return [
    MANAGED_START,
    `Term: ${item.termName}`,
    item.section ? `Section: ${item.section}` : undefined,
    item.component ? `Component: ${item.component}` : undefined,
    item.instructor ? `Instructor: ${item.instructor}` : undefined,
    `Imported from: ${item.sourceUrl}`,
    MANAGED_END,
  ].filter(Boolean).join('\n');
}

function properties(item: RecurringMeetingItem): Record<string, string> {
  return {
    calendarSyncManaged: 'true',
    calendarSyncConnector: item.connectorId,
    calendarSyncSourceId: item.sourceId,
    calendarSyncSchema: '1',
  };
}

function scheduleFields(item: RecurringMeetingItem): GoogleEvent {
  const date = firstOccurrence(item);
  return {
    summary: title(item),
    description: managedDescription(item),
    location: item.meeting.location,
    colorId: item.colorId,
    start: { dateTime: `${date}T${item.meeting.startTime}:00`, timeZone: item.timezone },
    end: { dateTime: `${date}T${item.meeting.endTime}:00`, timeZone: item.timezone },
    recurrence: recurrence(item),
    transparency: 'opaque',
    extendedProperties: { private: properties(item) },
  };
}

export async function createScheduleEvent(
  item: RecurringMeetingItem,
  settings: Settings,
): Promise<GoogleEvent> {
  return {
    id: await deterministicEventId(item.connectorId, item.sourceId),
    ...scheduleFields(item),
    reminders: {
      useDefault: false,
      overrides: settings.reminderMinutes.map((minutes) => ({ method: 'popup', minutes })),
    },
  };
}

export function patchScheduleEvent(
  item: RecurringMeetingItem,
  existing: GoogleEvent,
): GoogleEvent {
  const desired = scheduleFields(item);
  return {
    ...desired,
    description: mergeManagedDescription(existing.description, desired.description!),
    extendedProperties: {
      private: { ...existing.extendedProperties?.private, ...properties(item) },
    },
  };
}
