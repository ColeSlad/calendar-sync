import { parseCoursePage, parseDashboard } from '../../lib/gradescope/parser';
import type { RuntimeRequest, RuntimeResponse } from '../../lib/messaging/messages';

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse: (response: RuntimeResponse) => void) => {
    if (!('target' in request) || request.target !== 'offscreen') return false;

    const handle = async (): Promise<RuntimeResponse> => {
      const document = new DOMParser().parseFromString(request.html, 'text/html');
      if (request.type === 'PARSE_DASHBOARD_HTML') {
        return { ok: true, courses: parseDashboard(document, request.baseUrl) };
      }
      if (request.type === 'PARSE_COURSE_HTML') {
        return {
          ok: true,
          result: await parseCoursePage(document, request.course, request.observedAt),
        };
      }
      return { ok: false, error: 'Unknown offscreen parser request.' };
    };

    handle().then(sendResponse).catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Offscreen parser failed.',
      });
    });
    return true;
  },
);

