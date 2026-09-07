import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AppState, DateRange, RecurringMeetingItem, Weekday } from '../../lib/domain/types';
import type { GoogleCalendar } from '../../lib/calendar/types';
import { sendRuntimeMessage } from '../../lib/messaging/messages';
import { extractSchedule, getAiAvailability } from '../../lib/schedule/ai-extractor';
import { clearScheduleCapture, loadScheduleCapture } from '../../lib/schedule/draft-store';
import { extractScheduleWithRules } from '../../lib/schedule/parser';
import { prepareScheduleItems } from '../../lib/schedule/prepare';
import type {
  AiAvailability,
  ScheduleExtraction,
  ScheduleMeetingDraft,
  SchedulePageCapture,
} from '../../lib/schedule/types';
import './style.css';

const DAYS: Array<{ id: Weekday; label: string }> = [
  { id: 'MO', label: 'M' }, { id: 'TU', label: 'Tu' }, { id: 'WE', label: 'W' },
  { id: 'TH', label: 'Th' }, { id: 'FR', label: 'F' }, { id: 'SA', label: 'Sa' },
  { id: 'SU', label: 'Su' },
];

type Notice = { tone: 'success' | 'error' | 'info'; text: string };

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ''; }
}

function ImportPage() {
  const [capture, setCapture] = useState<SchedulePageCapture>();
  const [extraction, setExtraction] = useState<ScheduleExtraction>();
  const [appState, setAppState] = useState<AppState>();
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [prepared, setPrepared] = useState<RecurringMeetingItem[]>([]);
  const [validation, setValidation] = useState('');
  const [removeSourceIds, setRemoveSourceIds] = useState<Set<string>>(new Set());
  const [aiAvailability, setAiAvailability] = useState<AiAvailability>('unavailable');
  const [busy, setBusy] = useState<'ai' | 'import'>();
  const [downloadProgress, setDownloadProgress] = useState<number>();
  const [notice, setNotice] = useState<Notice>();
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    void (async () => {
      const [savedCapture, stateResponse, calendarResponse] = await Promise.all([
        loadScheduleCapture(),
        sendRuntimeMessage({ type: 'GET_STATE' }),
        sendRuntimeMessage({ type: 'LIST_CALENDARS' }),
      ]);
      if (!savedCapture) {
        setNotice({ tone: 'error', text: 'No captured schedule was found. Return to the visible schedule page and import it again.' });
        return;
      }
      setCapture(savedCapture);
      const rules = extractScheduleWithRules(savedCapture);
      setExtraction(rules);
      if (stateResponse.ok && 'state' in stateResponse) setAppState(stateResponse.state);
      if (calendarResponse.ok && 'calendars' in calendarResponse) setCalendars(calendarResponse.calendars);
      try {
        const availability = await getAiAvailability();
        setAiAvailability(availability);
        if (rules.meetings.length === 0 && availability === 'available') {
          setBusy('ai');
          const analyzed = await extractSchedule(savedCapture, { forceAi: true });
          setExtraction(analyzed);
          setBusy(undefined);
        }
      } catch {
        setAiAvailability('unavailable');
      }
    })();
  }, []);

  useEffect(() => {
    if (!extraction) return;
    let cancelled = false;
    void prepareScheduleItems(extraction).then((items) => {
      if (cancelled) return;
      setPrepared(items);
      setValidation('');
    }).catch((error: unknown) => {
      if (cancelled) return;
      setPrepared([]);
      setValidation(error instanceof Error ? error.message : 'Review the highlighted schedule fields.');
    });
    return () => { cancelled = true; };
  }, [extraction]);

  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === appState?.settings.calendarId,
  );

  const existingById = appState?.scheduleMeetings ?? {};
  const changes = useMemo(() => prepared.reduce(
    (counts, item) => {
      const existing = existingById[item.sourceId];
      if (!existing) counts.created += 1;
      else if (existing.sourceHash === item.sourceHash) counts.unchanged += 1;
      else counts.updated += 1;
      return counts;
    },
    { created: 0, updated: 0, unchanged: 0 },
  ), [existingById, prepared]);

  const obsolete = useMemo(() => {
    if (!extraction?.termName) return [];
    const currentIds = new Set(prepared.map((item) => item.sourceId));
    const origin = originOf(extraction.sourceUrl);
    return Object.values(existingById).filter((item) =>
      originOf(item.sourceUrl) === origin &&
      item.termName.toLowerCase() === extraction.termName.toLowerCase() &&
      !currentIds.has(item.sourceId),
    );
  }, [existingById, extraction, prepared]);

  function updateExtraction(patch: Partial<ScheduleExtraction>) {
    setExtraction((current) => current ? { ...current, ...patch } : current);
  }

  function updateMeeting(id: string, patch: Partial<ScheduleMeetingDraft>) {
    setExtraction((current) => current ? {
      ...current,
      meetings: current.meetings.map((meeting) =>
        meeting.id === id ? { ...meeting, ...patch } : meeting,
      ),
    } : current);
  }

  function toggleDay(meeting: ScheduleMeetingDraft, day: Weekday) {
    const days = meeting.days.includes(day)
      ? meeting.days.filter((value) => value !== day)
      : DAYS.map(({ id }) => id).filter((value) => [...meeting.days, day].includes(value));
    updateMeeting(meeting.id, { days });
  }

  function updateExclusion(index: number, patch: Partial<DateRange>) {
    if (!extraction) return;
    updateExtraction({
      exclusions: extraction.exclusions.map((range, position) =>
        position === index ? { ...range, ...patch } : range,
      ),
    });
  }

  async function analyzeWithAi() {
    if (!capture) return;
    setBusy('ai');
    setNotice(undefined);
    setDownloadProgress(aiAvailability === 'available' ? undefined : 0);
    const result = await extractSchedule(capture, {
      forceAi: true,
      onDownloadProgress: setDownloadProgress,
    });
    setExtraction(result);
    setBusy(undefined);
    setDownloadProgress(undefined);
    if (result.method === 'rules') {
      setNotice({ tone: 'error', text: result.warnings.at(-1) ?? 'On-device AI could not analyze this page.' });
    }
  }

  async function importMeetings() {
    if (!extraction) return;
    setBusy('import');
    setNotice(undefined);
    try {
      if (!appState?.settings.calendarId) {
        throw new Error('Connect Google Calendar and choose a destination calendar first.');
      }
      const items = await prepareScheduleItems(extraction);
      const response = await sendRuntimeMessage({
        type: 'IMPORT_SCHEDULE_MEETINGS',
        items,
        removeSourceIds: Array.from(removeSourceIds),
      });
      if (!response.ok) throw new Error(response.error);
      if (!('run' in response)) throw new Error('The calendar import returned no result.');
      const { counts, errors } = response.run;
      if (errors.length) throw new Error(errors.map((error) => error.message).join(' '));
      await clearScheduleCapture().catch(() => undefined);
      setComplete(true);
      setNotice({
        tone: 'success',
        text: `${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.unavailable} removed.`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not import this schedule.' });
    } finally {
      setBusy(undefined);
    }
  }

  async function cancelImport() {
    await clearScheduleCapture().catch(() => undefined);
    window.close();
  }

  if (!extraction) {
    return <main class="shell"><p class="loading">{notice?.text ?? 'Reading the rendered schedule page…'}</p></main>;
  }

  return (
    <main class="shell">
      <header>
        <div class="brand-mark">C</div>
        <div class="header-copy">
          <p class="eyebrow">CLASS SCHEDULE IMPORT</p>
          <h1>{complete ? 'Your classes are on the calendar.' : 'Review what we found.'}</h1>
          <p>{extraction.sourceTitle || originOf(extraction.sourceUrl)} · Nothing is written until you confirm.</p>
        </div>
        {!complete && <button class="cancel" onClick={cancelImport}>Cancel import</button>}
      </header>

      {notice && <div class={`notice ${notice.tone}`}>{notice.text}</div>}

      {complete ? (
        <section class="complete-card">
          <h2>Import complete</h2>
          <p>Your recurring events were added to {selectedCalendar?.summary ?? 'your selected Google Calendar'}.</p>
          <a href="https://calendar.google.com/" target="_blank" rel="noreferrer">Open Google Calendar ↗</a>
        </section>
      ) : (
        <>
          <section class="source-card">
            <div>
              <span class={`method ${extraction.method}`}>{extraction.method === 'rules' ? 'Local rules' : 'On-device AI'}</span>
              <strong>{extraction.meetings.length} meeting pattern{extraction.meetings.length === 1 ? '' : 's'} detected</strong>
              <small>Page content stays on this device and is discarded after import.</small>
            </div>
            <button class="secondary" disabled={busy === 'ai' || aiAvailability === 'unavailable'} onClick={analyzeWithAi}>
              {busy === 'ai'
                ? downloadProgress === undefined
                  ? 'Analyzing…'
                  : `Downloading AI… ${Math.round(downloadProgress * 100)}%`
                : aiAvailability === 'downloadable' || aiAvailability === 'downloading'
                  ? 'Download AI & analyze'
                  : aiAvailability === 'unavailable'
                    ? 'On-device AI unavailable'
                    : 'Analyze with on-device AI'}
            </button>
          </section>

          {extraction.warnings.length > 0 && (
            <div class="warning-list">{extraction.warnings.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}</div>
          )}

          <section>
            <div class="section-title"><span>01</span><div><h2>Term details</h2><p>Confirm the range used for weekly recurrence.</p></div></div>
            <div class="term-grid">
              <label><span>Term name</span><input value={extraction.termName} placeholder="Fall 2026" onInput={(event) => updateExtraction({ termName: event.currentTarget.value })} /></label>
              <label><span>Timezone</span><input value={extraction.timezone} onInput={(event) => updateExtraction({ timezone: event.currentTarget.value })} /></label>
              <label><span>First class date</span><input type="date" value={extraction.termStart} onInput={(event) => updateExtraction({ termStart: event.currentTarget.value })} /></label>
              <label><span>Last class date</span><input type="date" value={extraction.termEnd} onInput={(event) => updateExtraction({ termEnd: event.currentTarget.value })} /></label>
            </div>
          </section>

          <section>
            <div class="section-title"><span>02</span><div><h2>Detected meetings</h2><p>Correct anything uncertain before importing.</p></div></div>
            {extraction.meetings.length === 0 ? (
              <div class="empty">No meetings were detected. Make sure the classes are visible on the source page, then try the on-device AI.</div>
            ) : (
              <div class="meeting-list">
                {extraction.meetings.map((meeting) => (
                  <article class={!meeting.enabled ? 'disabled' : ''} key={meeting.id}>
                    <label class="include"><input type="checkbox" checked={meeting.enabled} onChange={(event) => updateMeeting(meeting.id, { enabled: event.currentTarget.checked })} /><span>Include</span></label>
                    <div class="meeting-grid">
                      <label><span>Course code</span><input value={meeting.courseCode ?? ''} placeholder="CMSC131" onInput={(event) => updateMeeting(meeting.id, { courseCode: event.currentTarget.value })} /></label>
                      <label class="wide"><span>Course name</span><input value={meeting.courseName} onInput={(event) => updateMeeting(meeting.id, { courseName: event.currentTarget.value })} /></label>
                      <label><span>Section</span><input value={meeting.section ?? ''} onInput={(event) => updateMeeting(meeting.id, { section: event.currentTarget.value })} /></label>
                      <label><span>Component</span><input value={meeting.component ?? ''} placeholder="Lecture" onInput={(event) => updateMeeting(meeting.id, { component: event.currentTarget.value })} /></label>
                      <label class="wide"><span>Instructor</span><input value={meeting.instructor ?? ''} onInput={(event) => updateMeeting(meeting.id, { instructor: event.currentTarget.value })} /></label>
                      <div class="day-field"><span>Days</span><div>{DAYS.map((day) => <button key={day.id} type="button" class={meeting.days.includes(day.id) ? 'selected' : ''} onClick={() => toggleDay(meeting, day.id)}>{day.label}</button>)}</div></div>
                      <label><span>Starts</span><input type="time" value={meeting.startTime} onInput={(event) => updateMeeting(meeting.id, { startTime: event.currentTarget.value })} /></label>
                      <label><span>Ends</span><input type="time" value={meeting.endTime} onInput={(event) => updateMeeting(meeting.id, { endTime: event.currentTarget.value })} /></label>
                      <label class="wide"><span>Location</span><input value={meeting.location ?? ''} onInput={(event) => updateMeeting(meeting.id, { location: event.currentTarget.value })} /></label>
                    </div>
                    {meeting.warnings.length > 0 && <p class="meeting-warning">{meeting.warnings.join(' ')}</p>}
                    {!meeting.confirmed && meeting.enabled && (
                      <label class="confirm-row"><input type="checkbox" checked={meeting.confirmed} onChange={(event) => updateMeeting(meeting.id, { confirmed: event.currentTarget.checked })} /><span>I checked these uncertain details</span></label>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div class="section-title"><span>03</span><div><h2>School breaks</h2><p>Optional date ranges will be excluded from matching class series.</p></div></div>
            <div class="break-list">
              {extraction.exclusions.map((range, index) => (
                <div class="break-row" key={index}>
                  <input aria-label="Break starts" type="date" value={range.start} onInput={(event) => updateExclusion(index, { start: event.currentTarget.value })} />
                  <span>through</span>
                  <input aria-label="Break ends" type="date" value={range.end} onInput={(event) => updateExclusion(index, { end: event.currentTarget.value })} />
                  <button onClick={() => updateExtraction({ exclusions: extraction.exclusions.filter((_, position) => position !== index) })}>Remove</button>
                </div>
              ))}
              <button class="secondary add-break" onClick={() => updateExtraction({ exclusions: [...extraction.exclusions, { start: '', end: '' }] })}>+ Add break</button>
            </div>
          </section>

          {obsolete.length > 0 && (
            <section>
              <div class="section-title"><span>04</span><div><h2>Previously imported series</h2><p>Nothing is removed unless you explicitly select it.</p></div></div>
              <div class="obsolete-list">{obsolete.map((item) => (
                <label key={item.sourceId}><input type="checkbox" checked={removeSourceIds.has(item.sourceId)} onChange={(event) => {
                  const next = new Set(removeSourceIds);
                  if (event.currentTarget.checked) next.add(item.sourceId); else next.delete(item.sourceId);
                  setRemoveSourceIds(next);
                }} /><span>Remove {item.courseCode ?? item.courseName} · {item.component ?? item.meeting.days.join('/')}</span></label>
              ))}</div>
            </section>
          )}

          <div class="import-bar">
            <div>
              <strong>{selectedCalendar ? selectedCalendar.summary : 'Google Calendar not connected'}</strong>
              <span>{changes.created} new · {changes.updated} updates · {changes.unchanged} unchanged · {removeSourceIds.size} removals</span>
              {validation && <small>{validation}</small>}
            </div>
            <button class="primary" disabled={busy === 'import' || prepared.length === 0 || !selectedCalendar} onClick={importMeetings}>
              {busy === 'import' ? 'Adding classes…' : 'Add classes to calendar'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

render(<ImportPage />, document.getElementById('app')!);
