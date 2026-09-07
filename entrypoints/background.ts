import { disconnectGoogle } from '../lib/calendar/auth';
import { GoogleCalendarClient } from '../lib/calendar/client';
import { GradescopeSyncService } from '../lib/gradescope/service';
import type { RuntimeRequest, RuntimeResponse } from '../lib/messaging/messages';
import { StateRepository } from '../lib/storage/repository';
import { DeadlineReconciler } from '../lib/sync/reconciler';
import { ScheduleReconciler } from '../lib/sync/schedule-reconciler';

const ALARM_NAME = 'calendar-sync-gradescope';

export default defineBackground(() => {
  const repository = new StateRepository();
  const calendar = new GoogleCalendarClient();
  const reconciler = new DeadlineReconciler(calendar, repository);
  const scheduleReconciler = new ScheduleReconciler(calendar, repository);
  const gradescope = new GradescopeSyncService(repository, reconciler, calendar);

  async function configureAlarm(): Promise<void> {
    const { settings } = await repository.read();
    await chrome.alarms.clear(ALARM_NAME);
    if (settings.autoSyncEnabled) {
      await chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: settings.syncIntervalMinutes,
        periodInMinutes: settings.syncIntervalMinutes,
      });
    }
  }

  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await repository.initialize();
    await configureAlarm();
    if (reason === 'install') await chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onStartup.addListener(configureAlarm);

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    try {
      await gradescope.run('alarm');
    } catch (error) {
      console.warn('Automatic Gradescope sync failed:', error);
    }
  });

  chrome.runtime.onMessage.addListener(
    (request: RuntimeRequest, _sender, sendResponse: (response: RuntimeResponse) => void) => {
      if ('target' in request && request.target === 'offscreen') return false;

      const handle = async (): Promise<RuntimeResponse> => {
        switch (request.type) {
          case 'GET_STATE':
            return { ok: true, state: await repository.read() };
          case 'CONNECT_GOOGLE':
            return { ok: true, calendars: await calendar.listOwnedCalendars(true) };
          case 'LIST_CALENDARS':
            return { ok: true, calendars: await calendar.listOwnedCalendars(false) };
          case 'DISCONNECT_GOOGLE':
            await disconnectGoogle();
            return { ok: true, state: await repository.updateSettings({ calendarId: undefined }) };
          case 'SAVE_SETTINGS': {
            const state = await repository.updateSettings(request.patch);
            await configureAlarm();
            return { ok: true, state };
          }
          case 'SET_COURSE_ENABLED': {
            const state = await repository.read();
            const course = state.courses[request.courseId];
            if (course) course.enabled = request.enabled;
            await repository.write(state);
            return { ok: true, state };
          }
          case 'SET_COURSE_COLOR': {
            const state = await repository.read();
            const course = state.courses[request.courseId];
            if (course) course.colorId = request.colorId;
            await repository.write(state);
            return { ok: true, state };
          }
          case 'DISCOVERED_COURSES':
            return { ok: true, state: await repository.mergeCourses(request.courses) };
          case 'COURSE_PAGE_SCAN': {
            await repository.mergeCourses([request.course]);
            await repository.mergeDeadlines(request.result.deadlines);
            const state = await repository.read();
            if (!state.settings.calendarId) return { ok: true, state };
            const run = await reconciler.reconcile({
              deadlines: request.result.deadlines,
              completeCourseIds: request.result.complete
                ? new Set([request.course.id])
                : new Set(),
              trigger: 'page-visit',
            });
            return { ok: true, run };
          }
          case 'START_GRADESCOPE_SYNC':
            return { ok: true, run: await gradescope.run(request.trigger) };
          case 'IMPORT_SCHEDULE_MEETINGS':
            return {
              ok: true,
              run: await scheduleReconciler.reconcile({
                items: request.items,
                removeSourceIds: request.removeSourceIds,
              }),
            };
          case 'REMOVE_MANAGED_EVENTS':
            return { ok: true, removed: await gradescope.removeManagedEvents() };
          default:
            return { ok: false, error: 'Unknown request.' };
        }
      };

      handle().then(sendResponse).catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'An unexpected error occurred.',
        });
      });
      return true;
    },
  );

  repository.initialize().catch((error) => {
    console.error('Could not initialize Calendar Sync storage:', error);
  });
});
