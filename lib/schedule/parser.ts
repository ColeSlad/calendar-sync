import type { Weekday } from '../domain/types';
import type {
  ScheduleCaptureBlock,
  ScheduleExtraction,
  ScheduleMeetingDraft,
  SchedulePageCapture,
} from './types';

const DAY_ORDER: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_TOKENS: Record<string, Weekday[]> = {
  M: ['MO'],
  MO: ['MO'],
  MON: ['MO'],
  MONDAY: ['MO'],
  T: ['TU'],
  TU: ['TU'],
  TUE: ['TU'],
  TUES: ['TU'],
  TUESDAY: ['TU'],
  W: ['WE'],
  WE: ['WE'],
  WED: ['WE'],
  WEDNESDAY: ['WE'],
  R: ['TH'],
  TH: ['TH'],
  THU: ['TH'],
  THUR: ['TH'],
  THURS: ['TH'],
  THURSDAY: ['TH'],
  F: ['FR'],
  FR: ['FR'],
  FRI: ['FR'],
  FRIDAY: ['FR'],
  SA: ['SA'],
  SAT: ['SA'],
  SATURDAY: ['SA'],
  SU: ['SU'],
  SUN: ['SU'],
  SUNDAY: ['SU'],
  MW: ['MO', 'WE'],
  MF: ['MO', 'FR'],
  WF: ['WE', 'FR'],
  MWF: ['MO', 'WE', 'FR'],
  TR: ['TU', 'TH'],
  TTH: ['TU', 'TH'],
  TUTH: ['TU', 'TH'],
};

const TIME_RANGE = /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|[01]?\d:\d{2}|2[0-3]:\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|[01]?\d:\d{2}|2[0-3]:\d{2})\b/i;
const COURSE_CODE = /\b([A-Z]{2,8})\s*[- ]?\s*(\d{3,4}[A-Z]?)\b/;

function normalizeMeridian(value: string): string {
  return value.toLowerCase().replace(/[.\s]/g, '');
}

function normalizedTime(value: string, inheritedMeridian?: 'am' | 'pm'): string | undefined {
  const compact = normalizeMeridian(value);
  const match = compact.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '00');
  const meridian = (match[3] as 'am' | 'pm' | undefined) ?? inheritedMeridian;
  if (minute > 59 || hour > (meridian ? 12 : 23) || hour === 0 && meridian) return undefined;
  if (meridian === 'am' && hour === 12) hour = 0;
  if (meridian === 'pm' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseTimeRange(value: string): { startTime: string; endTime: string } | undefined {
  const match = value.match(TIME_RANGE);
  if (!match?.[1] || !match[2]) return undefined;
  const endMeridian = normalizeMeridian(match[2]).match(/(am|pm)$/)?.[1] as
    | 'am'
    | 'pm'
    | undefined;
  const startMeridian = normalizeMeridian(match[1]).match(/(am|pm)$/)?.[1] as
    | 'am'
    | 'pm'
    | undefined;
  let inferredStart = startMeridian ?? endMeridian;
  if (!startMeridian && endMeridian === 'pm') {
    const startHour = Number(match[1].match(/^\d{1,2}/)?.[0]);
    const endHour = Number(match[2].match(/^\d{1,2}/)?.[0]);
    if (endHour === 12 && startHour !== 12) inferredStart = 'am';
  }
  const startTime = normalizedTime(match[1], inferredStart);
  const endTime = normalizedTime(match[2], startMeridian ?? endMeridian);
  if (!startTime || !endTime || startTime >= endTime) return undefined;
  return { startTime, endTime };
}

export function parseDays(value: string): Weekday[] {
  const normalized = value
    .toUpperCase()
    .replace(/\bAND\b/g, ' ')
    .replace(/[,&/+]/g, ' ')
    .replace(/\./g, ' ');
  const found = new Set<Weekday>();
  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    for (const day of DAY_TOKENS[token] ?? []) found.add(day);
  }
  return DAY_ORDER.filter((day) => found.has(day));
}

function indexOfHeader(headers: string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header));
}

function cell(row: string[], index: number): string {
  return index >= 0 ? row[index] ?? '' : '';
}

function meetingFromText(
  text: string,
  values: Partial<ScheduleMeetingDraft> = {},
): ScheduleMeetingDraft | undefined {
  const time = parseTimeRange(values.startTime && values.endTime
    ? `${values.startTime}-${values.endTime}`
    : text);
  const days = values.days?.length ? values.days : parseDays(text);
  const codeMatch = text.match(COURSE_CODE);
  const courseCode = values.courseCode || (codeMatch ? `${codeMatch[1]}${codeMatch[2]}` : undefined);
  const courseName = values.courseName?.trim() || courseCode || '';
  if (!time || days.length === 0 || !courseName) return undefined;

  return {
    id: crypto.randomUUID(),
    enabled: true,
    courseName,
    courseCode,
    section: values.section,
    component: values.component,
    instructor: values.instructor,
    days,
    startTime: time.startTime,
    endTime: time.endTime,
    location: values.location,
    occurrence: 0,
    confidence: values.confidence ?? 0.95,
    warnings: values.warnings ?? [],
  };
}

function parseTable(block: ScheduleCaptureBlock): ScheduleMeetingDraft[] {
  const headers = (block.headers ?? []).map((header) => header.toLowerCase());
  const indexes = {
    code: indexOfHeader(headers, /course|class|subject|catalog|code/),
    name: indexOfHeader(headers, /title|course name|description/),
    days: indexOfHeader(headers, /days?|meets?/),
    time: indexOfHeader(headers, /times?|hours?/),
    location: indexOfHeader(headers, /location|room|building|where/),
    section: indexOfHeader(headers, /section/),
    component: indexOfHeader(headers, /component|type|activity/),
    instructor: indexOfHeader(headers, /instructor|faculty|professor/),
  };

  return (block.rows ?? []).flatMap((row) => {
    const joined = row.join(' | ');
    const codeCell = cell(row, indexes.code);
    const nameCell = cell(row, indexes.name);
    const dayText = cell(row, indexes.days) || joined;
    const timeText = cell(row, indexes.time) || joined;
    const time = parseTimeRange(timeText);
    const codeMatch = (codeCell || joined).match(COURSE_CODE);
    const courseCode = codeMatch ? `${codeMatch[1]}${codeMatch[2]}` : undefined;
    const courseName = nameCell || codeCell || courseCode;
    const result = meetingFromText(`${dayText} ${timeText} ${joined}`, {
      courseName,
      courseCode,
      section: cell(row, indexes.section) || undefined,
      component: cell(row, indexes.component) || undefined,
      instructor: cell(row, indexes.instructor) || undefined,
      days: parseDays(dayText),
      startTime: time?.startTime,
      endTime: time?.endTime,
      location: cell(row, indexes.location) || undefined,
    });
    return result ? [result] : [];
  });
}

function assignOccurrences(meetings: ScheduleMeetingDraft[]): ScheduleMeetingDraft[] {
  const occurrences = new Map<string, number>();
  return meetings.map((meeting) => {
    const key = [
      meeting.courseCode ?? meeting.courseName,
      meeting.section ?? '',
      meeting.component ?? 'meeting',
    ].join('|').toLowerCase();
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return { ...meeting, occurrence };
  });
}

export function extractScheduleWithRules(capture: SchedulePageCapture): ScheduleExtraction {
  const meetings: ScheduleMeetingDraft[] = [];
  for (const block of capture.blocks) {
    if (block.kind === 'table') meetings.push(...parseTable(block));
    else {
      const joined = (block.lines ?? []).join(' | ');
      const result = meetingFromText(joined, { confidence: 0.75 });
      if (result) meetings.push(result);
    }
  }

  const deduplicated = Array.from(
    new Map(
      meetings.map((meeting) => [
        [meeting.courseCode ?? meeting.courseName, meeting.section, meeting.component,
          meeting.days.join(','), meeting.startTime, meeting.endTime, meeting.location]
          .join('|')
          .toLowerCase(),
        meeting,
      ]),
    ).values(),
  );

  return {
    method: 'rules',
    sourceUrl: capture.url,
    sourceTitle: capture.title,
    timezone: capture.timezone,
    termName: '',
    termStart: '',
    termEnd: '',
    exclusions: [],
    meetings: assignOccurrences(deduplicated),
    warnings: deduplicated.length === 0
      ? ['No complete course, day, and time combinations were recognized with local rules.']
      : [],
  };
}
