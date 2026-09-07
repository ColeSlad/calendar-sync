// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { captureSchedulePage } from '../lib/schedule/capture';
import { extractScheduleWithRules, parseDays, parseTimeRange } from '../lib/schedule/parser';
import type { SchedulePageCapture } from '../lib/schedule/types';

describe('schedule parser', () => {
  it('captures a schedule rendered into the live DOM', () => {
    document.title = 'Rendered schedule';
    document.body.innerHTML = `
      <table aria-label="Fall schedule">
        <thead><tr><th>Course</th><th>Days</th><th>Time</th></tr></thead>
        <tbody><tr><td>CMSC131</td><td>MWF</td><td>10:00 AM - 10:50 AM</td></tr></tbody>
      </table>`;

    const result = captureSchedulePage();

    expect(result.title).toBe('Rendered schedule');
    expect(result.blocks[0]).toEqual(expect.objectContaining({
      kind: 'table',
      headers: ['Course', 'Days', 'Time'],
      rows: [['CMSC131', 'MWF', '10:00 AM - 10:50 AM']],
    }));
  });

  it('normalizes common day formats', () => {
    expect(parseDays('Mon, Wed & Fri')).toEqual(['MO', 'WE', 'FR']);
    expect(parseDays('TuTh')).toEqual(['TU', 'TH']);
    expect(parseDays('TR')).toEqual(['TU', 'TH']);
  });

  it('normalizes twelve-hour time ranges', () => {
    expect(parseTimeRange('9:00 AM - 9:50 AM')).toEqual({
      startTime: '09:00',
      endTime: '09:50',
    });
    expect(parseTimeRange('11:00-12:15 PM')).toEqual({
      startTime: '11:00',
      endTime: '12:15',
    });
  });

  it('extracts a generic school schedule table', () => {
    const capture: SchedulePageCapture = {
      id: 'capture-1',
      capturedAt: '2026-09-07T12:00:00.000Z',
      url: 'https://app.testudo.umd.edu/#/main/schedule',
      title: 'My Schedule',
      language: 'en',
      timezone: 'America/New_York',
      blocks: [{
        kind: 'table',
        headers: ['Course', 'Title', 'Section', 'Days', 'Time', 'Location', 'Instructor'],
        rows: [
          ['CMSC 131', 'Object-Oriented Programming I', '0101', 'MWF',
            '10:00 AM - 10:50 AM', 'IRB 0324', 'Ada Lovelace'],
        ],
      }],
    };

    const result = extractScheduleWithRules(capture);

    expect(result.meetings).toEqual([
      expect.objectContaining({
        courseCode: 'CMSC131',
        courseName: 'Object-Oriented Programming I',
        section: '0101',
        days: ['MO', 'WE', 'FR'],
        startTime: '10:00',
        endTime: '10:50',
        location: 'IRB 0324',
      }),
    ]);
  });

  it('separates Maryland lecture and discussion rows with their own locations', () => {
    const capture: SchedulePageCapture = {
      id: 'testudo-cards',
      capturedAt: '2026-09-07T12:00:00.000Z',
      url: 'https://app.testudo.umd.edu/#/main/schedule',
      title: 'Registered Courses',
      language: 'en',
      timezone: 'America/New_York',
      blocks: [{
        kind: 'region',
        lines: [
          'CMSC 330 (0103)',
          'This section is face-to-face',
          'Lec',
          'TTh 9:30am - 10:45am EST',
          'IRB 0324',
          'Dis',
          'F 11:00am - 11:50am EST',
          'CSI 1121',
          'Final',
          'TBA',
        ],
      }],
    };

    const result = extractScheduleWithRules(capture);

    expect(result.meetings).toEqual([
      expect.objectContaining({
        courseCode: 'CMSC330', section: '0103', component: 'Lecture',
        days: ['TU', 'TH'], startTime: '09:30', endTime: '10:45', location: 'IRB 0324',
      }),
      expect.objectContaining({
        courseCode: 'CMSC330', section: '0103', component: 'Discussion',
        days: ['FR'], startTime: '11:00', endTime: '11:50', location: 'CSI 1121',
      }),
    ]);
  });

  it('associates an inline online location with its lecture row', () => {
    const capture: SchedulePageCapture = {
      id: 'testudo-inline',
      capturedAt: '2026-09-07T12:00:00.000Z',
      url: 'https://app.testudo.umd.edu/#/main/schedule',
      title: 'Registered Courses',
      language: 'en',
      timezone: 'America/New_York',
      blocks: [{
        kind: 'region',
        lines: ['HIST 215 (0101) This section is online Lec TTh 12:30pm - 1:45pm EST ONLINE Final TBA'],
      }],
    };

    expect(extractScheduleWithRules(capture).meetings).toEqual([
      expect.objectContaining({
        courseCode: 'HIST215', component: 'Lecture', location: 'Online',
        days: ['TU', 'TH'], startTime: '12:30', endTime: '13:45',
      }),
    ]);
  });

  it('returns a useful warning for an app shell with no rendered schedule', () => {
    const capture: SchedulePageCapture = {
      id: 'capture-2',
      capturedAt: '2026-09-07T12:00:00.000Z',
      url: 'https://app.testudo.umd.edu/',
      title: 'Testudo',
      language: 'en',
      timezone: 'America/New_York',
      blocks: [{ kind: 'text', lines: ['Testudo'] }],
    };

    expect(extractScheduleWithRules(capture).warnings[0]).toMatch(/No complete course/);
  });
});
