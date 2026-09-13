import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AppState } from '../domain/types';
import type { GoogleCalendar } from '../calendar/types';
import { sendRuntimeMessage } from '../messaging/messages';

export function useExtensionState() {
  const [state, setState] = useState<AppState>();
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();

  const refresh = useCallback(async () => {
    const response = await sendRuntimeMessage({ type: 'GET_STATE' });
    if (response.ok && 'state' in response) setState(response.state);
  }, []);

  useEffect(() => {
    Promise.all([
      refresh(),
      sendRuntimeMessage({ type: 'LIST_CALENDARS' }).then((response) => {
        if (response.ok && 'calendars' in response) setCalendars(response.calendars);
      }),
    ]).finally(() => setLoading(false));
  }, [refresh]);

  const connect = useCallback(async () => {
    setBusy('connect');
    setMessage(undefined);
    try {
      const response = await sendRuntimeMessage({ type: 'CONNECT_GOOGLE' });
      if (!response.ok) throw new Error(response.error);
      if (!('calendars' in response) || response.calendars.length === 0) {
        throw new Error('No owned Google calendars were found.');
      }
      setCalendars(response.calendars);
      const selected =
        response.calendars.find((calendar) => calendar.primary) ?? response.calendars[0];
      const saved = await sendRuntimeMessage({
        type: 'SAVE_SETTINGS',
        patch: { calendarId: selected?.id },
      });
      if (!saved.ok || !('state' in saved)) throw new Error('Could not save the calendar.');
      setState(saved.state);
      setMessage({ tone: 'success', text: `Connected to ${selected?.summary}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not connect.' });
    } finally {
      setBusy(undefined);
    }
  }, []);

  const createDedicatedCalendar = useCallback(async () => {
    setBusy('create-calendar');
    setMessage(undefined);
    try {
      const response = await sendRuntimeMessage({
        type: 'CREATE_DEDICATED_CALENDAR',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!response.ok) throw new Error(response.error);
      if (!('state' in response) || !('calendars' in response) || !('created' in response)) {
        throw new Error('Google Calendar returned an unexpected response.');
      }
      setState(response.state);
      setCalendars(response.calendars);
      setMessage({
        tone: 'success',
        text: response.created
          ? 'Created and selected the Class Schedule calendar.'
          : 'Selected your existing Class Schedule calendar.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not create the calendar.',
      });
    } finally {
      setBusy(undefined);
    }
  }, []);

  const saveSettings = useCallback(async (patch: Partial<AppState['settings']>) => {
    const response = await sendRuntimeMessage({ type: 'SAVE_SETTINGS', patch });
    if (!response.ok || !('state' in response)) throw new Error('Could not save settings.');
    setState(response.state);
  }, []);

  const setCourseEnabled = useCallback(async (courseId: string, enabled: boolean) => {
    const response = await sendRuntimeMessage({ type: 'SET_COURSE_ENABLED', courseId, enabled });
    if (!response.ok || !('state' in response)) throw new Error('Could not update the course.');
    setState(response.state);
  }, []);

  const setCourseColor = useCallback(async (courseId: string, colorId?: string) => {
    const response = await sendRuntimeMessage({ type: 'SET_COURSE_COLOR', courseId, colorId });
    if (!response.ok || !('state' in response)) throw new Error('Could not update the course color.');
    setState(response.state);
  }, []);

  return {
    state,
    calendars,
    loading,
    busy,
    message,
    setBusy,
    setMessage,
    setCalendars,
    setState,
    refresh,
    connect,
    createDedicatedCalendar,
    saveSettings,
    setCourseEnabled,
    setCourseColor,
  };
}
