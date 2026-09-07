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
    saveSettings,
    setCourseEnabled,
  };
}

