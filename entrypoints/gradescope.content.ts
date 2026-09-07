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

async function waitForGradescopeContent(): Promise<void> {
  if (document.querySelector('table, .courseBox')) return;
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('table, .courseBox')) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 5_000);
  });
}

export default defineContentScript({
  matches: ['https://www.gradescope.com/*'],
  runAt: 'document_idle',
  async main() {
    try {
      await waitForGradescopeContent();
      if (location.pathname === '/account' || location.pathname === '/') {
        const courses = parseDashboard(document, location.href);
        if (courses.length > 0) {
          await sendRuntimeMessage({ type: 'DISCOVERED_COURSES', courses });
          void sendRuntimeMessage({
            type: 'START_GRADESCOPE_SYNC',
            trigger: 'page-visit',
          });
        }
        return;
      }

      const detectedCourse = visibleCourse(document);
      if (!detectedCourse) return;
      const stateResponse = await sendRuntimeMessage({ type: 'GET_STATE' });
      const course =
        stateResponse.ok && 'state' in stateResponse
          ? stateResponse.state.courses[detectedCourse.id] ?? detectedCourse
          : detectedCourse;
      if (!course) return;
      const result = await parseCoursePage(document, course);
      await sendRuntimeMessage({ type: 'COURSE_PAGE_SCAN', course, result });
    } catch (error) {
      console.warn('Calendar Sync could not read this Gradescope page:', error);
    }
  },
});
