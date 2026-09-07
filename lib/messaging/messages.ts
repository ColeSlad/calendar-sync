import type {
  AppState,
  Course,
  DeadlineItem,
  Settings,
  SyncRun,
  SyncTrigger,
} from '../domain/types';
import type { CourseParseResult } from '../gradescope/parser';
import type { GoogleCalendar } from '../calendar/types';

export type RuntimeRequest =
  | { type: 'GET_STATE' }
  | { type: 'CONNECT_GOOGLE' }
  | { type: 'DISCONNECT_GOOGLE' }
  | { type: 'SAVE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'SET_COURSE_ENABLED'; courseId: string; enabled: boolean }
  | { type: 'DISCOVERED_COURSES'; courses: Course[] }
  | {
      type: 'COURSE_PAGE_SCAN';
      course: Course;
      result: CourseParseResult;
    }
  | { type: 'START_GRADESCOPE_SYNC'; trigger: SyncTrigger }
  | { type: 'REMOVE_MANAGED_EVENTS' }
  | { type: 'PARSE_DASHBOARD_HTML'; target: 'offscreen'; html: string; baseUrl: string }
  | {
      type: 'PARSE_COURSE_HTML';
      target: 'offscreen';
      html: string;
      course: Course;
      observedAt: string;
    };

export type RuntimeResponse =
  | { ok: true; state: AppState }
  | { ok: true; calendars: GoogleCalendar[] }
  | { ok: true; run: SyncRun }
  | { ok: true; removed: number }
  | { ok: true; courses: Course[] }
  | { ok: true; result: CourseParseResult }
  | { ok: false; error: string; code?: string };

export interface PageScanPayload {
  course: Course;
  deadlines: DeadlineItem[];
  complete: boolean;
}

export function sendRuntimeMessage(request: RuntimeRequest): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(request) as Promise<RuntimeResponse>;
}

