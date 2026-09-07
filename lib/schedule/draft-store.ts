import type { SchedulePageCapture } from './types';

const CAPTURE_KEY = 'calendarSyncScheduleCaptureV1';

export async function saveScheduleCapture(capture: SchedulePageCapture): Promise<void> {
  await chrome.storage.session.set({ [CAPTURE_KEY]: capture });
}

export async function loadScheduleCapture(): Promise<SchedulePageCapture | undefined> {
  const result = await chrome.storage.session.get(CAPTURE_KEY);
  return result[CAPTURE_KEY] as SchedulePageCapture | undefined;
}

export async function clearScheduleCapture(): Promise<void> {
  await chrome.storage.session.remove(CAPTURE_KEY);
}

