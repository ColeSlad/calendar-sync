import type { CalendarGateway } from '../calendar/client';
import type { Course, DeadlineItem, SyncRun, SyncTrigger } from '../domain/types';
import type { RuntimeRequest, RuntimeResponse } from '../messaging/messages';
import type { StateRepository } from '../storage/repository';
import type { DeadlineReconciler } from '../sync/reconciler';

export class GradescopeSessionError extends Error {
  constructor(message = 'Sign in to Gradescope, then try again.') {
    super(message);
    this.name = 'GradescopeSessionError';
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  const url = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Parse Gradescope pages fetched during user-enabled background sync.',
  });
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`Gradescope returned HTTP ${response.status}.`);
  const html = await response.text();
  if (
    /\/login(?:\?|$)/.test(new URL(response.url).pathname) ||
    /name=["']session\[email\]["']/.test(html)
  ) {
    throw new GradescopeSessionError();
  }
  return { html, finalUrl: response.url };
}

async function parseInOffscreen<T>(request: RuntimeRequest): Promise<T> {
  await ensureOffscreenDocument();
  const response = (await chrome.runtime.sendMessage(request)) as RuntimeResponse;
  if (!response.ok) throw new Error(response.error);
  if ('courses' in response) return response.courses as T;
  if ('result' in response) return response.result as T;
  throw new Error('The offscreen parser returned an unexpected response.');
}

export class GradescopeSyncService {
  private inFlight?: Promise<SyncRun>;

  constructor(
    private readonly repository: StateRepository,
    private readonly reconciler: DeadlineReconciler,
    private readonly calendar: CalendarGateway,
  ) {}

  run(trigger: SyncTrigger): Promise<SyncRun> {
    if (!this.inFlight) {
      this.inFlight = this.performRun(trigger).finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  private async performRun(trigger: SyncTrigger): Promise<SyncRun> {
    const account = await fetchHtml('https://www.gradescope.com/account');
    const courses = await parseInOffscreen<Course[]>({
      type: 'PARSE_DASHBOARD_HTML',
      target: 'offscreen',
      html: account.html,
      baseUrl: account.finalUrl,
    });
    if (courses.length === 0) {
      throw new Error('No courses were found. Visit your Gradescope dashboard and try again.');
    }
    const state = await this.repository.mergeCourses(courses);
    const enabled = Object.values(state.courses).filter((course) => course.enabled);
    const deadlines: DeadlineItem[] = [];
    const completeCourseIds = new Set<string>();
    const parserErrors: SyncRun['errors'] = [];

    await Promise.all(
      enabled.map(async (course) => {
        try {
          const page = await fetchHtml(course.url);
          const result = await parseInOffscreen<{
            complete: boolean;
            deadlines: DeadlineItem[];
            warnings: string[];
          }>({
            type: 'PARSE_COURSE_HTML',
            target: 'offscreen',
            html: page.html,
            course,
            observedAt: new Date().toISOString(),
          });
          deadlines.push(...result.deadlines);
          if (result.complete) completeCourseIds.add(course.id);
          for (const warning of result.warnings) {
            parserErrors.push({ courseId: course.id, code: 'PARSER_WARNING', message: warning });
          }
        } catch (error) {
          parserErrors.push({
            courseId: course.id,
            code: 'COURSE_FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Could not read course.',
          });
        }
      }),
    );

    await this.repository.mergeDeadlines(deadlines);
    const latest = await this.repository.read();
    if (!latest.settings.calendarId) {
      throw new Error('Choose a Google Calendar before syncing assignments.');
    }
    const run = await this.reconciler.reconcile({ deadlines, completeCourseIds, trigger });
    run.errors.push(...parserErrors);
    run.successful = run.successful && parserErrors.every((error) => error.code === 'PARSER_WARNING');
    await this.repository.saveSyncRun(run);
    return run;
  }

  async removeManagedEvents(): Promise<number> {
    const state = await this.repository.read();
    const calendarIds = Array.from(
      new Set([
        ...state.settings.managedCalendarIds,
        ...(state.settings.calendarId ? [state.settings.calendarId] : []),
      ]),
    );
    let removed = 0;
    for (const calendarId of calendarIds) {
      const events = await this.calendar.listManagedEvents(calendarId);
      for (const event of events) {
        if (!event.id) continue;
        await this.calendar.deleteEvent(calendarId, event.id);
        removed += 1;
      }
    }
    state.managedEvents = {};
    state.scheduleMeetings = {};
    state.scheduleImports = {};
    state.lastScheduleSync = undefined;
    state.settings.managedCalendarIds = state.settings.calendarId
      ? [state.settings.calendarId]
      : [];
    await this.repository.write(state);
    return removed;
  }
}
