import { render } from 'preact';
import { useMemo } from 'preact/hooks';
import { sendRuntimeMessage } from '../../lib/messaging/messages';
import { relativeTime } from '../../lib/ui/format';
import { useExtensionState } from '../../lib/ui/use-extension-state';
import './style.css';

function Popup() {
  const app = useExtensionState();
  const courses = useMemo(
    () => Object.values(app.state?.courses ?? {}),
    [app.state?.courses],
  );
  const selectedCalendar = app.calendars.find(
    (calendar) => calendar.id === app.state?.settings.calendarId,
  );
  const lastRun = app.state?.lastSync;

  async function syncNow() {
    app.setBusy('sync');
    app.setMessage(undefined);
    try {
      const response = await sendRuntimeMessage({
        type: 'START_GRADESCOPE_SYNC',
        trigger: 'manual',
      });
      if (!response.ok) throw new Error(response.error);
      if (!('run' in response)) throw new Error('The sync returned no result.');
      await app.refresh();
      const { counts } = response.run;
      app.setMessage({
        tone: response.run.successful ? 'success' : 'error',
        text: `${counts.created} created, ${counts.updated + counts.completed} updated, ${counts.failed} failed.`,
      });
    } catch (error) {
      app.setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Sync failed.',
      });
    } finally {
      app.setBusy(undefined);
    }
  }

  if (app.loading || !app.state) {
    return <main class="loading">Loading Calendar Sync…</main>;
  }

  return (
    <main>
      <header>
        <div class="mark">C</div>
        <div>
          <p class="eyebrow">CALENDAR SYNC</p>
          <h1>Deadline sync</h1>
        </div>
        <span class={`status-dot ${selectedCalendar ? 'online' : ''}`} title="Connection status" />
      </header>

      {app.message && <div class={`notice ${app.message.tone}`}>{app.message.text}</div>}

      <section class="hero-card">
        <div>
          <p class="label">GOOGLE CALENDAR</p>
          <strong>{selectedCalendar?.summary ?? 'Not connected'}</strong>
          <p>{selectedCalendar ? 'Ready to receive Gradescope deadlines' : 'Connect an owned calendar to begin'}</p>
        </div>
        {!selectedCalendar && (
          <button class="primary compact" disabled={!!app.busy} onClick={app.connect}>
            {app.busy === 'connect' ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </section>

      <section>
        <div class="section-heading">
          <div>
            <p class="label">GRADESCOPE</p>
            <h2>{courses.length ? `${courses.length} courses found` : 'Discover your courses'}</h2>
          </div>
          {courses.length === 0 && (
            <button
              class="text-button"
              onClick={() => chrome.tabs.create({ url: 'https://www.gradescope.com/account' })}
            >
              Open Gradescope ↗
            </button>
          )}
        </div>
        {courses.length > 0 && (
          <div class="course-list">
            {courses.map((course) => (
              <label class="course-row" key={course.id}>
                <span class="course-color" />
                <span>
                  <strong>{course.shortName}</strong>
                  <small>{course.term}</small>
                </span>
                <input
                  type="checkbox"
                  checked={course.enabled}
                  onChange={(event) =>
                    app.setCourseEnabled(course.id, event.currentTarget.checked)
                  }
                />
              </label>
            ))}
          </div>
        )}
      </section>

      {lastRun && (
        <section class="sync-summary">
          <div>
            <p class="label">LAST SYNC</p>
            <strong>{relativeTime(lastRun.finishedAt)}</strong>
          </div>
          <div class="metrics">
            <span><b>{lastRun.counts.created}</b> new</span>
            <span><b>{lastRun.counts.updated + lastRun.counts.completed}</b> changed</span>
            <span><b>{lastRun.counts.failed}</b> failed</span>
          </div>
        </section>
      )}

      <button
        class="primary sync-button"
        disabled={!!app.busy || !selectedCalendar || courses.length === 0}
        onClick={syncNow}
      >
        {app.busy === 'sync' ? 'Syncing safely…' : 'Sync now'}
      </button>
      <footer>
        <span>Automatic · every 2 hours</span>
        <button onClick={() => chrome.runtime.openOptionsPage()}>Settings</button>
      </footer>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
