import { render } from 'preact';
import { useMemo } from 'preact/hooks';
import { sendRuntimeMessage } from '../../lib/messaging/messages';
import { nextSync, relativeTime } from '../../lib/ui/format';
import { useExtensionState } from '../../lib/ui/use-extension-state';
import './style.css';

function Options() {
  const app = useExtensionState();
  const courses = useMemo(
    () => Object.values(app.state?.courses ?? {}),
    [app.state?.courses],
  );
  const scheduleMeetings = useMemo(
    () => Object.values(app.state?.scheduleMeetings ?? {}),
    [app.state?.scheduleMeetings],
  );

  async function removeEvents() {
    if (!confirm('Remove every Google Calendar event managed by Calendar Sync? This cannot be undone.')) return;
    app.setBusy('remove');
    const response = await sendRuntimeMessage({ type: 'REMOVE_MANAGED_EVENTS' });
    if (response.ok && 'removed' in response) {
      app.setMessage({ tone: 'success', text: `Removed ${response.removed} managed events.` });
      await app.refresh();
    } else {
      app.setMessage({ tone: 'error', text: response.ok ? 'Cleanup failed.' : response.error });
    }
    app.setBusy(undefined);
  }

  async function removeScheduleMeetings(sourceIds: string[], label: string) {
    if (sourceIds.length === 0) return;
    if (!confirm(`Remove ${label} from Google Calendar? This removes only class schedule events managed by Calendar Sync.`)) return;
    app.setBusy('remove-schedule');
    app.setMessage(undefined);
    try {
      const response = await sendRuntimeMessage({ type: 'REMOVE_SCHEDULE_MEETINGS', sourceIds });
      if (!response.ok) throw new Error(response.error);
      if (!('run' in response)) throw new Error('The schedule cleanup returned no result.');
      if (response.run.errors.length) {
        throw new Error(response.run.errors.map((error) => error.message).join(' '));
      }
      app.setMessage({
        tone: 'success',
        text: `Removed ${response.run.counts.unavailable} class schedule event${response.run.counts.unavailable === 1 ? '' : 's'}.`,
      });
      await app.refresh();
    } catch (error) {
      app.setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not remove the class schedule events.',
      });
    } finally {
      app.setBusy(undefined);
    }
  }

  if (app.loading || !app.state) return <main><p>Loading setup…</p></main>;
  const settings = app.state.settings;

  return (
    <main>
      <aside>
        <div class="brand"><span>C</span><strong>Calendar Sync</strong></div>
        <p>Private academic calendar automation that stays on your device.</p>
        <nav>
          <a href="#setup">Setup</a>
          <a href="#courses">Courses</a>
          <a href="#preferences">Preferences</a>
          <a href="#class-schedules">Class schedules</a>
          <a href="#privacy">Privacy & data</a>
        </nav>
        <small>Version 0.2.1 · Early development</small>
      </aside>

      <div class="content">
        <header>
          <p class="eyebrow">GRADESCOPE CONNECTOR</p>
          <h1>Your deadlines, without the busywork.</h1>
          <p>Connect both services once. Calendar Sync handles updates in your browser and shows you exactly what changed.</p>
        </header>

        {app.message && <div class={`notice ${app.message.tone}`}>{app.message.text}</div>}

        <section id="setup">
          <div class="section-title"><span>01</span><div><h2>Connect your accounts</h2><p>No Gradescope password is requested or stored.</p></div></div>
          <div class="connection-grid">
            <article>
              <div class="service-icon gradescope">G</div>
              <div><h3>Gradescope</h3><p>{courses.length ? `${courses.length} courses discovered` : 'Visit your dashboard while signed in'}</p></div>
              <button onClick={() => chrome.tabs.create({ url: 'https://www.gradescope.com/account' })}>{courses.length ? 'Refresh' : 'Open dashboard'} ↗</button>
            </article>
            <article>
              <div class="service-icon google">31</div>
              <div><h3>Google Calendar</h3><p>{settings.calendarId ? 'Connected' : 'Not connected'}</p></div>
              <button onClick={app.connect} disabled={app.busy === 'connect'}>{settings.calendarId ? 'Reconnect' : 'Connect'}</button>
            </article>
          </div>
          {app.calendars.length > 0 && (
            <label class="field">
              <span>Destination calendar</span>
              <select value={settings.calendarId} onChange={(event) => app.saveSettings({ calendarId: event.currentTarget.value })}>
                {app.calendars.map((calendar) => <option value={calendar.id}>{calendar.summary}{calendar.primary ? ' (primary)' : ''}</option>)}
              </select>
            </label>
          )}
        </section>

        <section id="courses">
          <div class="section-title"><span>02</span><div><h2>Choose courses</h2><p>Only enabled courses are fetched during automatic sync.</p></div></div>
          {courses.length === 0 ? (
            <div class="empty">Open the Gradescope dashboard to discover your current courses.</div>
          ) : (
            <div class="course-grid">
              {courses.map((course) => (
                <label class="course-card" key={course.id}>
                  <input type="checkbox" checked={course.enabled} onChange={(event) => app.setCourseEnabled(course.id, event.currentTarget.checked)} />
                  <span><strong>{course.shortName}</strong><small>{course.fullName}<br />{course.term}</small></span>
                  <select
                    aria-label={`Color for ${course.shortName}`}
                    value={course.colorId ?? ''}
                    onChange={(event) => app.setCourseColor(course.id, event.currentTarget.value || undefined)}
                  >
                    <option value="">Default color</option>
                    <option value="1">Lavender</option><option value="2">Sage</option>
                    <option value="3">Grape</option><option value="4">Flamingo</option>
                    <option value="5">Banana</option><option value="6">Tangerine</option>
                    <option value="7">Peacock</option><option value="8">Graphite</option>
                    <option value="9">Blueberry</option><option value="10">Basil</option>
                    <option value="11">Tomato</option>
                  </select>
                </label>
              ))}
            </div>
          )}
        </section>

        <section id="preferences">
          <div class="section-title"><span>03</span><div><h2>Sync preferences</h2><p>User edits in Google Calendar are preserved.</p></div></div>
          <div class="settings-list">
            <label><span><strong>Automatic sync</strong><small>{nextSync(settings.syncIntervalMinutes)} while Chrome is running</small></span><input type="checkbox" checked={settings.autoSyncEnabled} onChange={(event) => app.saveSettings({ autoSyncEnabled: event.currentTarget.checked })} /></label>
            <label><span><strong>New-event reminders</strong><small>Existing event reminders are never overwritten</small></span><select value={settings.reminderMinutes.join(',')} onChange={(event) => app.saveSettings({ reminderMinutes: event.currentTarget.value ? event.currentTarget.value.split(',').map(Number) : [] })}><option value="1440,60">1 day + 1 hour</option><option value="1440">1 day</option><option value="60">1 hour</option><option value="">None</option></select></label>
          </div>
          {app.state.lastSync && <p class="last-sync">Last sync: {relativeTime(app.state.lastSync.finishedAt)} · {app.state.lastSync.successful ? 'Successful' : `${app.state.lastSync.errors.length} issues`}</p>}
        </section>

        <section id="class-schedules">
          <div class="section-title schedule-title"><span>04</span><div><h2>Imported class schedules</h2><p>Recurring series tagged and managed by Calendar Sync.</p></div>{scheduleMeetings.length > 0 && <button class="danger remove-all-schedules" disabled={app.busy === 'remove-schedule'} onClick={() => removeScheduleMeetings(scheduleMeetings.map((item) => item.sourceId), 'all imported classes')}>Remove all classes</button>}</div>
          {scheduleMeetings.length === 0 ? (
            <div class="empty">Open a visible school schedule page, then choose Import current page from the extension.</div>
          ) : (
            <div class="course-grid">
              {scheduleMeetings.map((item) => (
                <article class="schedule-card" key={item.sourceId}>
                  <div class="service-icon schedule">S</div>
                  <div><h3>{item.courseCode ?? item.courseName}</h3><p>{item.component ?? 'Class'} · {item.meeting.days.join('/')} · {item.meeting.startTime}–{item.meeting.endTime}<br />{item.termName}{item.meeting.location ? ` · ${item.meeting.location}` : ''}</p><small class="managed-tag">Calendar Sync managed</small></div>
                  <button class="remove-series" disabled={app.busy === 'remove-schedule'} onClick={() => removeScheduleMeetings([item.sourceId], `${item.courseCode ?? item.courseName} ${item.component ?? 'class'}`)}>Remove</button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="privacy">
          <div class="section-title"><span>05</span><div><h2>Privacy & data</h2><p>Your academic data is stored only inside this browser profile.</p></div></div>
          <div class="privacy-box"><p>Calendar Sync uses your existing Gradescope session and talks directly to Google Calendar. There is no Calendar Sync server, analytics pipeline, password collection, or sale of data.</p><button class="danger" disabled={app.busy === 'remove'} onClick={removeEvents}>{app.busy === 'remove' ? 'Removing…' : 'Remove managed calendar events'}</button></div>
        </section>
      </div>
    </main>
  );
}

render(<Options />, document.getElementById('app')!);
