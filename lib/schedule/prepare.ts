import { sha256Base32Hex, sourceHash } from '../core/hash';
import type { RecurringMeetingItem } from '../domain/types';
import type { ScheduleExtraction } from './types';
import type { ScheduleMeetingDraft } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COURSE_COLORS = ['7', '10', '3', '6', '4', '9', '5', '11', '2', '1', '8'];

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function courseIdentity(meeting: ScheduleMeetingDraft): string {
  return normalized(meeting.courseCode || meeting.courseName);
}

export function assignDefaultScheduleColors(
  meetings: ScheduleMeetingDraft[],
): ScheduleMeetingDraft[] {
  const courseColors = new Map<string, string>();
  for (const meeting of meetings) {
    const key = courseIdentity(meeting);
    if (!courseColors.has(key)) {
      courseColors.set(key, COURSE_COLORS[courseColors.size % COURSE_COLORS.length]!);
    }
  }
  return meetings.map((meeting) => ({
    ...meeting,
    colorId: meeting.colorId || courseColors.get(courseIdentity(meeting)),
  }));
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

export async function prepareScheduleItems(
  extraction: ScheduleExtraction,
): Promise<RecurringMeetingItem[]> {
  const errors: string[] = [];
  if (!extraction.termName.trim()) errors.push('Enter a term name.');
  if (!validDate(extraction.termStart)) errors.push('Enter a valid term start date.');
  if (!validDate(extraction.termEnd)) errors.push('Enter a valid term end date.');
  if (
    validDate(extraction.termStart) && validDate(extraction.termEnd) &&
    (extraction.termEnd < extraction.termStart || daysBetween(extraction.termStart, extraction.termEnd) > 370)
  ) {
    errors.push('The term must end after it starts and span no more than 370 days.');
  }
  if (!validTimezone(extraction.timezone)) errors.push('Choose a valid IANA timezone.');
  for (const range of extraction.exclusions) {
    if (!validDate(range.start) || !validDate(range.end) || range.end < range.start) {
      errors.push('Each break must have valid start and end dates.');
      break;
    }
  }

  const enabled = assignDefaultScheduleColors(extraction.meetings)
    .filter((meeting) => meeting.enabled);
  if (enabled.length === 0) errors.push('Select at least one class meeting.');
  for (const meeting of enabled) {
    if (!meeting.courseName.trim()) errors.push('Every meeting needs a course name.');
    if (meeting.days.length === 0) errors.push(`${meeting.courseName || 'A meeting'} needs a weekday.`);
    if (!TIME.test(meeting.startTime) || !TIME.test(meeting.endTime) || meeting.startTime >= meeting.endTime) {
      errors.push(`${meeting.courseName || 'A meeting'} needs a valid start and end time.`);
    }
    if (!meeting.confirmed) {
      errors.push(`Confirm the uncertain details for ${meeting.courseCode || meeting.courseName || 'each meeting'}.`);
    }
  }
  if (errors.length) throw new Error(Array.from(new Set(errors)).join(' '));

  const origin = new URL(extraction.sourceUrl).origin;
  return Promise.all(enabled.map(async (meeting) => {
    const identity = [
      origin,
      normalized(extraction.termName),
      normalized(meeting.courseCode || meeting.courseName),
      normalized(meeting.section),
      normalized(meeting.component || 'meeting'),
      meeting.occurrence,
    ].join('|');
    const sourceId = `schedule:${(await sha256Base32Hex(identity)).slice(0, 32)}`;
    const canonical = {
      courseName: meeting.courseName.trim(),
      courseCode: meeting.courseCode?.trim(),
      section: meeting.section?.trim(),
      component: meeting.component?.trim(),
      instructor: meeting.instructor?.trim(),
      termName: extraction.termName.trim(),
      termStart: extraction.termStart,
      termEnd: extraction.termEnd,
      timezone: extraction.timezone,
      meeting: {
        days: meeting.days,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        location: meeting.location?.trim(),
      },
      exclusions: extraction.exclusions,
      colorId: meeting.colorId,
      sourceUrl: extraction.sourceUrl,
    };
    return {
      kind: 'recurring-meeting' as const,
      connectorId: 'schedule-page' as const,
      sourceId,
      ...canonical,
      confidence: meeting.confidence,
      warnings: meeting.warnings,
      sourceHash: await sourceHash(canonical),
    };
  }));
}
