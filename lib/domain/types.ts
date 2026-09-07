export type ConnectorId = 'gradescope' | 'schedule-page';

export interface Course {
  id: string;
  shortName: string;
  fullName: string;
  term: string;
  url: string;
  enabled: boolean;
  colorId?: string;
}

export type AssignmentStatus = 'pending' | 'submitted' | 'graded';

export interface DeadlineItem {
  kind: 'deadline';
  connectorId: 'gradescope';
  sourceId: string;
  courseId: string;
  courseName: string;
  title: string;
  dueAt: string;
  lateDueAt?: string;
  status: AssignmentStatus;
  url: string;
  observedAt: string;
  sourceHash: string;
}

export interface MeetingPattern {
  days: Array<'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'>;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface RecurringMeetingItem {
  kind: 'recurring-meeting';
  connectorId: 'schedule-page';
  sourceId: string;
  courseName: string;
  courseCode?: string;
  section?: string;
  termName: string;
  termStart: string;
  termEnd: string;
  timezone: string;
  meeting: MeetingPattern;
  sourceUrl: string;
  sourceHash: string;
}

export type CalendarItem = DeadlineItem | RecurringMeetingItem;

export interface ManagedEvent {
  sourceId: string;
  connectorId: ConnectorId;
  calendarId: string;
  eventId: string;
  sourceHash: string;
  lastSeenAt: string;
  missingCompleteScans: number;
}

export type SyncTrigger = 'manual' | 'page-visit' | 'alarm' | 'onboarding';

export interface SyncCounts {
  created: number;
  updated: number;
  unchanged: number;
  completed: number;
  unavailable: number;
  failed: number;
}

export interface SyncRun {
  id: string;
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt?: string;
  successful: boolean;
  counts: SyncCounts;
  errors: Array<{ courseId?: string; code: string; message: string }>;
}

export interface Settings {
  calendarId?: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  reminderMinutes: number[];
  notificationsEnabled: boolean;
}

export interface AppState {
  settings: Settings;
  courses: Record<string, Course>;
  deadlines: Record<string, DeadlineItem>;
  managedEvents: Record<string, ManagedEvent>;
  lastSync?: SyncRun;
}

export const DEFAULT_SETTINGS: Settings = {
  autoSyncEnabled: true,
  syncIntervalMinutes: 120,
  reminderMinutes: [1440, 60],
  notificationsEnabled: false,
};

export const EMPTY_COUNTS: SyncCounts = {
  created: 0,
  updated: 0,
  unchanged: 0,
  completed: 0,
  unavailable: 0,
  failed: 0,
};

