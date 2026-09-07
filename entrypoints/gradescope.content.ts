import type { Course } from '../lib/domain/types';
import { parseCoursePage, parseDashboard } from '../lib/gradescope/parser';
import { sendRuntimeMessage } from '../lib/messaging/messages';

function visibleCourse(document: Document): Course | undefined {
  const id = location.pathname.match(/\/courses\/(\d+)/)?.[1];
  if (!id) return undefined;
  const heading =
    document.querySelector('.courseHeader--title')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    `Course ${id}`;
  return {
    id,
    shortName: heading,
    fullName: heading,
    term: 'Current term',
    url: `${location.origin}/courses/${id}`,
    enabled: true,
  };
}

export default defineContentScript({
  matches: ['https://www.gradescope.com/*'],
  runAt: 'document_idle',
  async main() {
    try {
      if (location.pathname === '/account' || location.pathname === '/') {
        const courses = parseDashboard(document, location.href);
        if (courses.length > 0) {
          await sendRuntimeMessage({ type: 'DISCOVERED_COURSES', courses });
        }
        return;
      }

      const course = visibleCourse(document);
      if (!course) return;
      const result = await parseCoursePage(document, course);
      await sendRuntimeMessage({ type: 'COURSE_PAGE_SCAN', course, result });
    } catch (error) {
      console.warn('Calendar Sync could not read this Gradescope page:', error);
    }
  },
});
