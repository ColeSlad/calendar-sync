import { describe, expect, it } from 'vitest';
import { prepareScheduleItems } from '../lib/schedule/prepare';
import type { ScheduleExtraction } from '../lib/schedule/types';

function extraction(): ScheduleExtraction {
  return {
    method: 'rules',
    sourceUrl: 'https://app.testudo.umd.edu/#/main/schedule',
    sourceTitle: 'Schedule',
    timezone: 'America/New_York',
    termName: 'Fall 2026',
    termStart: '2026-08-31',
    termEnd: '2026-12-14',
    exclusions: [],
    warnings: [],
    meetings: [{
      id: 'draft-1', enabled: true, confirmed: true,
      courseName: 'Algorithms', courseCode: 'CMSC351', section: '0101', component: 'Lecture',
      days: ['MO', 'WE'], startTime: '09:00', endTime: '09:50', occurrence: 0,
      confidence: 1, warnings: [],
    }],
  };
}

describe('schedule preparation', () => {
  it('keeps identity stable when a meeting time changes', async () => {
    const original = await prepareScheduleItems(extraction());
    const changed = extraction();
    changed.meetings[0]!.startTime = '10:00';
    changed.meetings[0]!.endTime = '10:50';
    const updated = await prepareScheduleItems(changed);
    expect(updated[0]?.sourceId).toBe(original[0]?.sourceId);
    expect(updated[0]?.sourceHash).not.toBe(original[0]?.sourceHash);
  });

  it('requires an explicit acknowledgement for uncertain extraction', async () => {
    const value = extraction();
    value.meetings[0]!.confirmed = false;
    value.meetings[0]!.confidence = 0.6;
    await expect(prepareScheduleItems(value)).rejects.toThrow(/Confirm the uncertain details/);
  });

  it('rejects missing term dates and invalid meeting times', async () => {
    const value = extraction();
    value.termEnd = '';
    value.meetings[0]!.endTime = '08:00';
    await expect(prepareScheduleItems(value)).rejects.toThrow(/term end date.*valid start and end time/i);
  });
});
