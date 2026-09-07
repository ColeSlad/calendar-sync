// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseCoursePage, parseDashboard } from '../lib/gradescope/parser';
import type { Course } from '../lib/domain/types';

describe('Gradescope parser', () => {
  it('discovers courses and their term', () => {
    document.body.innerHTML = `
      <h2 class="courseList--term">Fall 2026</h2>
      <div class="courseList--coursesForTerm">
        <a class="courseBox" href="/courses/123">
          <span class="courseBox--shortname">CS 101</span>
          <span class="courseBox--name">Introduction to Computing</span>
        </a>
      </div>`;

    expect(parseDashboard(document, 'https://www.gradescope.com/account')).toEqual([
      expect.objectContaining({
        id: '123',
        shortName: 'CS 101',
        fullName: 'Introduction to Computing',
        term: 'Fall 2026',
      }),
    ]);
  });

  it('extracts stable assignment data from a course table', async () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Assignment</th><th>Due Date</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td><a href="/courses/123/assignments/456">Problem Set 1</a></td>
            <td><time datetime="2026-09-12T23:59:00-04:00">Sep 12 at 11:59 PM</time></td>
            <td>Submitted</td>
          </tr>
        </tbody>
      </table>`;
    const course: Course = {
      id: '123',
      shortName: 'CS 101',
      fullName: 'Introduction to Computing',
      term: 'Fall 2026',
      url: 'https://www.gradescope.com/courses/123',
      enabled: true,
    };

    const result = await parseCoursePage(
      document,
      course,
      '2026-09-06T12:00:00.000Z',
    );

    expect(result.complete).toBe(true);
    expect(result.deadlines).toEqual([
      expect.objectContaining({
        sourceId: '123:456',
        title: 'Problem Set 1',
        dueAt: '2026-09-13T03:59:00.000Z',
        status: 'submitted',
      }),
    ]);
  });

  it('selects the main deadline when release and late dates share a cell', async () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Assignment</th><th>Due Date</th><th>Status</th></tr></thead>
        <tbody><tr>
          <td><a href="/courses/123/assignments/789">Project</a></td>
          <td>
            <time aria-label="Released at" datetime="2026-09-01T09:00:00-04:00"></time>
            <time aria-label="Due at" datetime="2026-10-01T23:59:00-04:00"></time>
            <time aria-label="Late Due Date" datetime="2026-10-03T23:59:00-04:00"></time>
          </td>
          <td>No Submission</td>
        </tr></tbody>
      </table>`;
    const course: Course = {
      id: '123', shortName: 'CS 101', fullName: 'CS 101', term: 'Fall 2026',
      url: 'https://www.gradescope.com/courses/123', enabled: true,
    };
    const result = await parseCoursePage(document, course);
    expect(result.deadlines[0]?.dueAt).toBe('2026-10-02T03:59:00.000Z');
    expect(result.deadlines[0]?.lateDueAt).toBe('2026-10-04T03:59:00.000Z');
  });

  it('does not report an unknown layout as an empty successful scan', async () => {
    document.body.innerHTML = '<main>Welcome to this course</main>';
    const course = {
      id: '123',
      shortName: 'CS 101',
      fullName: 'CS 101',
      term: 'Fall 2026',
      url: 'https://www.gradescope.com/courses/123',
      enabled: true,
    };

    const result = await parseCoursePage(document, course);
    expect(result.complete).toBe(false);
    expect(result.warnings).toContain('No recognizable assignment table was found.');
  });
});
