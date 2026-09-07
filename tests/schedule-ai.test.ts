import { describe, expect, it, vi } from 'vitest';
import { extractSchedule } from '../lib/schedule/ai-extractor';
import type { SchedulePageCapture } from '../lib/schedule/types';

const capture: SchedulePageCapture = {
  id: 'capture-ai',
  capturedAt: '2026-09-07T12:00:00.000Z',
  url: 'https://school.example.edu/schedule',
  title: 'Schedule',
  language: 'en',
  timezone: 'America/New_York',
  blocks: [{ kind: 'region', lines: ['My enrolled classes', 'Computer Science at nine'] }],
};

describe('on-device schedule extraction', () => {
  it('uses schema-constrained model output for an ambiguous page', async () => {
    const destroy = vi.fn();
    const factory: LanguageModelFactory = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(JSON.stringify({
          termName: 'Fall 2026',
          termStart: '',
          termEnd: '',
          warnings: [],
          meetings: [{
            courseName: 'Introduction to Computing', courseCode: 'CMSC131', section: '0101',
            component: 'Lecture', instructor: '', days: ['MO', 'WE', 'FR'],
            startTime: '09:00', endTime: '09:50', location: 'IRB 0324',
            confidence: 0.96, warnings: [],
          }],
        })),
        destroy,
      }),
    };

    const result = await extractSchedule(capture, { factory });

    expect(result.method).toBe('ai');
    expect(result.meetings[0]).toEqual(expect.objectContaining({
      courseCode: 'CMSC131',
      days: ['MO', 'WE', 'FR'],
      startTime: '09:00',
      confirmed: true,
    }));
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('falls back cleanly when the model is unavailable', async () => {
    const factory: LanguageModelFactory = {
      availability: vi.fn().mockResolvedValue('unavailable'),
      create: vi.fn(),
    };

    const result = await extractSchedule(capture, { factory });

    expect(result.meetings).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/On-device AI is unavailable/);
  });
});
