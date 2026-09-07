import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  type AppState,
  type Course,
  type DeadlineItem,
  type ManagedEvent,
  type Settings,
  type SyncRun,
} from '../domain/types';

const STATE_KEY = 'calendarSyncStateV1';

export interface StateStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const browserStore: StateStore = {
  get: (key) => browser.storage.local.get(key),
  set: (items) => browser.storage.local.set(items),
};

function emptyState(): AppState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    courses: {},
    deadlines: {},
    managedEvents: {},
  };
}

export class StateRepository {
  constructor(private readonly store: StateStore = browserStore) {}

  async initialize(): Promise<void> {
    await browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const stored = await this.read();
    await this.write(stored);
  }

  async read(): Promise<AppState> {
    const result = await this.store.get(STATE_KEY);
    const value = result[STATE_KEY] as Partial<AppState> | undefined;
    if (!value) return emptyState();

    return {
      settings: { ...DEFAULT_SETTINGS, ...value.settings },
      courses: value.courses ?? {},
      deadlines: value.deadlines ?? {},
      managedEvents: value.managedEvents ?? {},
      lastSync: value.lastSync,
    };
  }

  async write(state: AppState): Promise<void> {
    await this.store.set({ [STATE_KEY]: state });
  }

  async updateSettings(patch: Partial<Settings>): Promise<AppState> {
    const state = await this.read();
    if (patch.calendarId && patch.calendarId !== state.settings.calendarId) {
      state.settings.managedCalendarIds = Array.from(
        new Set([...state.settings.managedCalendarIds, patch.calendarId]),
      );
    }
    state.settings = { ...state.settings, ...patch };
    await this.write(state);
    return state;
  }

  async mergeCourses(courses: Course[]): Promise<AppState> {
    const state = await this.read();
    for (const course of courses) {
      state.courses[course.id] = {
        ...course,
        enabled: state.courses[course.id]?.enabled ?? course.enabled,
        colorId: state.courses[course.id]?.colorId ?? course.colorId,
      };
    }
    await this.write(state);
    return state;
  }

  async mergeDeadlines(deadlines: DeadlineItem[]): Promise<AppState> {
    const state = await this.read();
    for (const deadline of deadlines) state.deadlines[deadline.sourceId] = deadline;
    await this.write(state);
    return state;
  }

  async saveManagedEvent(event: ManagedEvent): Promise<void> {
    const state = await this.read();
    state.managedEvents[event.sourceId] = event;
    await this.write(state);
  }

  async saveSyncRun(run: SyncRun): Promise<void> {
    const state = await this.read();
    state.lastSync = run;
    await this.write(state);
  }
}
