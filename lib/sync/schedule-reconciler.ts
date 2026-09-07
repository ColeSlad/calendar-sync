import { CalendarApiError, type CalendarGateway } from '../calendar/client';
import { createScheduleEvent, patchScheduleEvent } from '../calendar/schedule-event-mapper';
import type { GoogleEvent } from '../calendar/types';
import { deterministicEventId } from '../core/hash';
import { EMPTY_COUNTS, type ManagedEvent, type RecurringMeetingItem, type SyncRun } from '../domain/types';
import type { StateRepository } from '../storage/repository';

export interface ScheduleReconcileInput {
  items: RecurringMeetingItem[];
  removeSourceIds?: string[];
}

function remoteSourceId(event: GoogleEvent): string | undefined {
  return event.extendedProperties?.private?.calendarSyncSourceId;
}

export class ScheduleReconciler {
  constructor(
    private readonly calendar: CalendarGateway,
    private readonly repository: StateRepository,
  ) {}

  async reconcile(input: ScheduleReconcileInput): Promise<SyncRun> {
    const startedAt = new Date().toISOString();
    const run: SyncRun = {
      id: crypto.randomUUID(),
      trigger: 'schedule-import',
      startedAt,
      successful: true,
      counts: { ...EMPTY_COUNTS },
      errors: [],
    };
    const state = await this.repository.read();
    const calendarId = state.settings.calendarId;
    if (!calendarId) throw new Error('Choose a Google Calendar before importing classes.');

    let remoteEvents: GoogleEvent[];
    try {
      remoteEvents = await this.calendar.listManagedEvents(calendarId);
    } catch (error) {
      run.successful = false;
      run.errors.push({ code: 'CALENDAR_LIST_FAILED', message: this.message(error) });
      run.finishedAt = new Date().toISOString();
      state.lastScheduleSync = run;
      await this.repository.write(state);
      return run;
    }
    const remoteBySource = new Map(remoteEvents.flatMap((event) => {
      const id = remoteSourceId(event);
      return id ? [[id, event] as const] : [];
    }));

    for (const item of input.items) {
      const existing = remoteBySource.get(item.sourceId);
      const managed = state.managedEvents[item.sourceId];
      try {
        const eventId = existing?.id ?? managed?.eventId ??
          await deterministicEventId(item.connectorId, item.sourceId);
        if (!existing) {
          let created: GoogleEvent;
          try {
            created = await this.calendar.insertEvent(
              calendarId,
              await createScheduleEvent(item, state.settings),
            );
          } catch (error) {
            if (!(error instanceof CalendarApiError) || error.status !== 409) throw error;
            const conflicted = await this.calendar.getEvent(calendarId, eventId);
            if (!conflicted) throw error;
            created = await this.calendar.patchEvent(
              calendarId,
              eventId,
              patchScheduleEvent(item, conflicted),
            );
          }
          state.managedEvents[item.sourceId] = this.mapping(
            item, calendarId, created.id ?? eventId, startedAt,
          );
          run.counts.created += 1;
        } else if (managed?.sourceHash === item.sourceHash) {
          managed.lastSeenAt = startedAt;
          run.counts.unchanged += 1;
        } else {
          await this.calendar.patchEvent(calendarId, eventId, patchScheduleEvent(item, existing));
          state.managedEvents[item.sourceId] = this.mapping(item, calendarId, eventId, startedAt);
          run.counts.updated += 1;
        }
        state.scheduleMeetings[item.sourceId] = item;
      } catch (error) {
        run.successful = false;
        run.counts.failed += 1;
        run.errors.push({ code: 'SCHEDULE_EVENT_SYNC_FAILED', message: this.message(error) });
      }
    }

    for (const sourceId of new Set(input.removeSourceIds ?? [])) {
      const managed = state.managedEvents[sourceId];
      if (managed?.connectorId !== 'schedule-page') continue;
      try {
        const existing = remoteBySource.get(sourceId);
        const eventId = existing?.id ?? managed.eventId;
        try {
          await this.calendar.deleteEvent(managed.calendarId, eventId);
        } catch (error) {
          if (!(error instanceof CalendarApiError) || error.status !== 404) throw error;
        }
        delete state.managedEvents[sourceId];
        delete state.scheduleMeetings[sourceId];
        run.counts.unavailable += 1;
      } catch (error) {
        run.successful = false;
        run.counts.failed += 1;
        run.errors.push({ code: 'SCHEDULE_EVENT_REMOVE_FAILED', message: this.message(error) });
      }
    }

    const first = input.items[0];
    if (first) {
      const record = {
        id: crypto.randomUUID(),
        sourceUrl: first.sourceUrl,
        sourceOrigin: new URL(first.sourceUrl).origin,
        termName: first.termName,
        importedAt: startedAt,
        sourceIds: input.items.map((item) => item.sourceId),
      };
      state.scheduleImports[record.id] = record;
    }
    run.finishedAt = new Date().toISOString();
    state.lastScheduleSync = run;
    await this.repository.write(state);
    return run;
  }

  private mapping(
    item: RecurringMeetingItem,
    calendarId: string,
    eventId: string,
    lastSeenAt: string,
  ): ManagedEvent {
    return {
      sourceId: item.sourceId,
      connectorId: item.connectorId,
      calendarId,
      eventId,
      sourceHash: item.sourceHash,
      lastSeenAt,
      missingCompleteScans: 0,
    };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'An unknown schedule synchronization error occurred.';
  }
}
