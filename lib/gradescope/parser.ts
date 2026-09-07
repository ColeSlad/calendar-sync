import type { Course, DeadlineItem } from '../domain/types';
import { sourceHash } from '../core/hash';

export interface CourseParseResult {
  complete: boolean;
  deadlines: DeadlineItem[];
  warnings: string[];
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function absoluteUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).href;
}

export function parseDashboard(document: Document, baseUrl: string): Course[] {
  const seen = new Set<string>();
  const courses: Course[] = [];
  const links = document.querySelectorAll<HTMLAnchorElement>(
    'a.courseBox[href*="/courses/"], a[href*="/courses/"]',
  );
  const firstTermCourses = document.querySelector('.courseList--coursesForTerm');

  for (const link of links) {
    const match = link.getAttribute('href')?.match(/\/courses\/(\d+)/);
    if (!match?.[1] || seen.has(match[1])) continue;

    const shortName =
      text(link.querySelector('.courseBox--shortname')) ||
      text(link.querySelector('[data-testid="course-short-name"]')) ||
      text(link).split(' ').slice(0, 4).join(' ');
    const fullName =
      text(link.querySelector('.courseBox--name')) ||
      text(link.querySelector('[data-testid="course-name"]')) ||
      shortName;
    const termContainer = link.closest('.courseList--coursesForTerm');
    const term =
      text(termContainer?.previousElementSibling) ||
      text(link.closest('[data-term]')?.querySelector('[data-term-name]')) ||
      'Current term';

    seen.add(match[1]);
    courses.push({
      id: match[1],
      shortName: shortName || `Course ${match[1]}`,
      fullName: fullName || shortName || `Course ${match[1]}`,
      term,
      url: absoluteUrl(link.getAttribute('href')!, baseUrl),
      enabled: !termContainer || termContainer === firstTermCourses,
    });
  }

  return courses;
}

function headerIndex(headers: string[], pattern: RegExp, exclude?: RegExp): number {
  return headers.findIndex(
    (header) => pattern.test(header) && (!exclude || !exclude.test(header)),
  );
}

function dateFromCell(
  cell: Element | undefined,
  kind: 'due' | 'late' = 'due',
): string | undefined {
  if (!cell) return undefined;
  const times = Array.from(cell.querySelectorAll('time[datetime]'));
  const labeled = times.find((time) => {
    const label = time.getAttribute('aria-label') ?? '';
    return kind === 'late'
      ? /late due date/i.test(label)
      : /due at/i.test(label) && !/late/i.test(label);
  });
  const machineValue =
    labeled?.getAttribute('datetime') ||
    (times.length === 1 ? times[0]?.getAttribute('datetime') : undefined) ||
    cell.querySelector('[data-datetime]')?.getAttribute('data-datetime') ||
    cell.querySelector('[data-time]')?.getAttribute('data-time');
  let raw = machineValue || text(cell);
  if (!machineValue) {
    const pattern = /([A-Z][a-z]{2}\s+\d{1,2}\s+at\s+\d{1,2}:\d{2}\s*[AP]M)/g;
    const matches = raw.match(pattern) ?? [];
    const candidate = kind === 'late' ? matches.at(-1) : matches[0];
    if (candidate) raw = `${candidate.replace(' at ', `, ${new Date().getFullYear()} `)}`;
  }
  if (!raw || /no due date|—|not available/i.test(raw)) return undefined;
  const millis = Date.parse(raw);
  return Number.isNaN(millis) ? undefined : new Date(millis).toISOString();
}

function statusFromRow(row: Element): DeadlineItem['status'] {
  const rowText = text(row);
  if (/graded|score\s*:|\b\d+(?:\.\d+)?\s*\/\s*\d/i.test(rowText)) return 'graded';
  if (/submitted|submission received/i.test(rowText)) return 'submitted';
  return 'pending';
}

export async function parseCoursePage(
  document: Document,
  course: Course,
  observedAt = new Date().toISOString(),
): Promise<CourseParseResult> {
  const warnings: string[] = [];
  const deadlines: DeadlineItem[] = [];
  const tables = Array.from(document.querySelectorAll('table')).filter((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) =>
      text(cell).toLowerCase(),
    );
    const hasTitleColumn = headerIndex(headers, /assignment|name/) >= 0;
    const hasDueColumn = headerIndex(headers, /due/, /late/) >= 0;
    const hasAssignmentLinks = Boolean(
      table.querySelector('tbody a[href*="/assignments/"]'),
    );

    return hasDueColumn && (hasTitleColumn || hasAssignmentLinks);
  });

  if (tables.length === 0) {
    const explicitlyEmpty = /no assignments/i.test(text(document.body));
    return {
      complete: explicitlyEmpty,
      deadlines,
      warnings: explicitlyEmpty ? [] : ['No recognizable assignment table was found.'],
    };
  }

  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) =>
      text(cell).toLowerCase(),
    );
    const titleIndex = headerIndex(headers, /assignment|name/);
    const dueIndex = headerIndex(headers, /due/, /late/);
    const lateDueIndex = headerIndex(headers, /late.*due|due.*late/);

    if (dueIndex < 0) {
      warnings.push('An assignment table did not contain a due-date column.');
      continue;
    }

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const assignmentLink = row.querySelector<HTMLAnchorElement>(
        'a[href*="/assignments/"]',
      );
      const id =
        assignmentLink?.getAttribute('href')?.match(/\/assignments\/(\d+)/)?.[1] ||
        row.querySelector('[data-assignment-id]')?.getAttribute('data-assignment-id');
      if (!id) continue;

      const title =
        text(assignmentLink) || text(cells[titleIndex >= 0 ? titleIndex : 0]);
      const dueAt = dateFromCell(cells[dueIndex]);
      if (!title || !dueAt) {
        warnings.push(`Skipped assignment ${id} because its title or deadline was invalid.`);
        continue;
      }

      const url = absoluteUrl(
        assignmentLink?.getAttribute('href') ??
          `/courses/${course.id}/assignments/${id}`,
        course.url,
      );
      const status = statusFromRow(row);
      const lateDueAt =
        lateDueIndex >= 0
          ? dateFromCell(cells[lateDueIndex], 'late')
          : dateFromCell(cells[dueIndex], 'late');
      const canonical = {
        courseId: course.id,
        assignmentId: id,
        title,
        dueAt,
        lateDueAt,
        status,
        url,
      };

      deadlines.push({
        kind: 'deadline',
        connectorId: 'gradescope',
        sourceId: `${course.id}:${id}`,
        courseId: course.id,
        courseName: course.shortName,
        title,
        dueAt,
        lateDueAt,
        status,
        url,
        observedAt,
        sourceHash: await sourceHash(canonical),
      });
    }
  }

  return {
    complete: warnings.length === 0,
    deadlines,
    warnings,
  };
}
