import { CalendarApiError, type CalendarGateway } from '../calendar/client';
import {
  createDeadlineEvent,
  patchDeadlineEvent,
  patchUnavailableEvent,
} from '../calendar/event-mapper';
import type { GoogleEvent } from '../calendar/types';
import { deterministicEventId } from '../core/hash';
import {
  EMPTY_COUNTS,
  type DeadlineItem,
  type ManagedEvent,
  type SyncRun,
  type SyncTrigger,
} from '../domain/types';
import { StateRepository } from '../storage/repository';

function runId(): string {
  return crypto.randomUUID();
}

function sourceId(event: GoogleEvent): string | undefined {
  return event.extendedProperties?.private?.calendarSyncSourceId;
}

export interface ReconcileInput {
  deadlines: DeadlineItem[];
  completeCourseIds: Set<string>;
  trigger: SyncTrigger;
}

export class DeadlineReconciler {
  constructor(
    private readonly calendar: CalendarGateway,
    private readonly repository: StateRepository,
  ) {}

  async reconcile(input: ReconcileInput): Promise<SyncRun> {
    const startedAt = new Date().toISOString();
    const run: SyncRun = {
      id: runId(),
      trigger: input.trigger,
      startedAt,
      successful: true,
      counts: { ...EMPTY_COUNTS },
      errors: [],
    };
    const state = await this.repository.read();
    const calendarId = state.settings.calendarId;
    if (!calendarId) throw new Error('Choose a Google Calendar before syncing.');

    let remoteEvents: GoogleEvent[];
    try {
      remoteEvents = await this.calendar.listManagedEvents(calendarId);
    } catch (error) {
      run.successful = false;
      run.errors.push({ code: 'CALENDAR_LIST_FAILED', message: this.message(error) });
      run.finishedAt = new Date().toISOString();
      await this.repository.saveSyncRun(run);
      return run;
    }
    const remoteBySource = new Map(
      remoteEvents.flatMap((event) => {
        const id = sourceId(event);
        return id ? [[id, event] as const] : [];
      }),
    );
    const observed = new Set(input.deadlines.map((deadline) => deadline.sourceId));

    for (const deadline of input.deadlines) {
      const existing = remoteBySource.get(deadline.sourceId);
      const managed = state.managedEvents[deadline.sourceId];
      try {
        const eventId =
          existing?.id ?? managed?.eventId ??
          (await deterministicEventId(deadline.connectorId, deadline.sourceId));
        if (!existing) {
          const payload = await createDeadlineEvent(
            deadline,
            state.courses[deadline.courseId],
            state.settings,
          );
          let created: GoogleEvent;
          try {
            created = await this.calendar.insertEvent(calendarId, payload);
          } catch (error) {
            if (!(error instanceof CalendarApiError) || error.status !== 409) throw error;
            const conflicted = await this.calendar.getEvent(calendarId, eventId);
            if (!conflicted) throw error;
            created = await this.calendar.patchEvent(
              calendarId,
              eventId,
              patchDeadlineEvent(deadline, conflicted, state.courses[deadline.courseId]),
            );
          }
          state.managedEvents[deadline.sourceId] = this.mapping(
            deadline,
            calendarId,
            created.id ?? eventId,
          );
          run.counts.created += 1;
        } else if (managed?.sourceHash === deadline.sourceHash) {
          managed.lastSeenAt = startedAt;
          managed.missingCompleteScans = 0;
          run.counts.unchanged += 1;
        } else {
          const becameComplete =
            deadline.status !== 'pending' &&
            !existing.summary?.startsWith('✓ ');
          await this.calendar.patchEvent(
            calendarId,
            eventId,
            patchDeadlineEvent(deadline, existing, state.courses[deadline.courseId]),
          );
          state.managedEvents[deadline.sourceId] = this.mapping(
            deadline,
            calendarId,
            eventId,
          );
          if (becameComplete) run.counts.completed += 1;
          else run.counts.updated += 1;
        }
        state.deadlines[deadline.sourceId] = deadline;
      } catch (error) {
        run.successful = false;
        run.counts.failed += 1;
        run.errors.push({
          courseId: deadline.courseId,
          code: 'EVENT_SYNC_FAILED',
          message: this.message(error),
        });
      }
    }

    for (const [id, managed] of Object.entries(state.managedEvents)) {
      if (managed.connectorId !== 'gradescope' || observed.has(id)) continue;
      const deadline = state.deadlines[id];
      if (!deadline || !input.completeCourseIds.has(deadline.courseId)) continue;
      managed.missingCompleteScans += 1;
      if (managed.missingCompleteScans !== 2) continue;

      const existing = remoteBySource.get(id);
      if (!existing?.id) continue;
      try {
        await this.calendar.patchEvent(
          calendarId,
          existing.id,
          patchUnavailableEvent(deadline, existing),
        );
        run.counts.unavailable += 1;
      } catch (error) {
        run.successful = false;
        run.counts.failed += 1;
        run.errors.push({
          courseId: deadline.courseId,
          code: 'UNAVAILABLE_MARK_FAILED',
          message: this.message(error),
        });
      }
    }

    run.finishedAt = new Date().toISOString();
    state.lastSync = run;
    await this.repository.write(state);
    return run;
  }

  private mapping(
    deadline: DeadlineItem,
    calendarId: string,
    eventId: string,
  ): ManagedEvent {
    return {
      sourceId: deadline.sourceId,
      connectorId: deadline.connectorId,
      calendarId,
      eventId,
      sourceHash: deadline.sourceHash,
      lastSeenAt: new Date().toISOString(),
      missingCompleteScans: 0,
    };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'An unknown synchronization error occurred.';
  }
}

