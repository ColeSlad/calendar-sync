import type { SchedulePageCapture } from './types';

/**
 * This function is intentionally self-contained because Chrome serializes it
 * before injecting it into the active tab with chrome.scripting.executeScript.
 */
export function captureSchedulePage(): SchedulePageCapture {
  const MAX_CHARACTERS = 28_000;
  const MAX_BLOCKS = 80;
  let characters = 0;

  const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  const visible = (element: Element): boolean => {
    if ((element as HTMLElement).hidden || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const addText = (value: string): string => {
    const remaining = MAX_CHARACTERS - characters;
    if (remaining <= 0) return '';
    const result = value.slice(0, remaining);
    characters += result.length;
    return result;
  };
  const uniqueLines = (value: string): string[] => {
    const seen = new Set<string>();
    return value
      .split(/\n+/)
      .map(clean)
      .filter((line) => line.length > 1 && !seen.has(line) && seen.add(line))
      .slice(0, 160);
  };

  const blocks: SchedulePageCapture['blocks'] = [];
  for (const table of document.querySelectorAll('table')) {
    if (!visible(table) || blocks.length >= MAX_BLOCKS || characters >= MAX_CHARACTERS) continue;
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) =>
      clean(cell.textContent),
    );
    const rows = Array.from(table.querySelectorAll('tbody tr, tr'))
      .filter((row) => !row.closest('thead') && visible(row))
      .map((row) =>
        Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
          clean(cell.textContent),
        ),
      )
      .filter((row) => row.some(Boolean))
      .slice(0, 120);
    if (rows.length === 0) continue;
    const heading = clean(
      table.getAttribute('aria-label') ||
        table.querySelector('caption')?.textContent ||
        table.previousElementSibling?.textContent,
    );
    let serialized = JSON.stringify({ heading, headers, rows });
    const remaining = MAX_CHARACTERS - characters;
    while (rows.length > 1 && serialized.length > remaining) {
      rows.pop();
      serialized = JSON.stringify({ heading, headers, rows });
    }
    if (serialized.length > remaining || !addText(serialized)) break;
    blocks.push({ kind: 'table', heading, headers, rows });
  }

  const selector = [
    '[class*="schedule" i]',
    '[id*="schedule" i]',
    '[class*="course" i]',
    '[class*="meeting" i]',
    '[class*="section" i]',
  ].join(',');
  const capturedRegions = new Set<string>();
  for (const region of document.querySelectorAll(selector)) {
    if (!visible(region) || region.closest('table') || blocks.length >= MAX_BLOCKS) continue;
    const lines = uniqueLines((region as HTMLElement).innerText || region.textContent || '');
    const joined = lines.join('\n');
    if (lines.length < 2 || joined.length < 12 || capturedRegions.has(joined)) continue;
    if (!/(?:\d{1,2}:\d{2}|\b(?:mon|tue|wed|thu|fri|mwf|tuth|tr)\b)/i.test(joined)) {
      continue;
    }
    capturedRegions.add(joined);
    const limited = addText(joined);
    if (!limited) break;
    blocks.push({ kind: 'region', lines: uniqueLines(limited) });
  }

  if (blocks.length === 0 && characters < MAX_CHARACTERS) {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('script, style, noscript, svg, nav, footer').forEach((node) => node.remove());
    const lines = uniqueLines(body.innerText || body.textContent || '');
    const limited = addText(lines.join('\n'));
    if (limited) blocks.push({ kind: 'text', lines: uniqueLines(limited) });
  }

  return {
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    language: document.documentElement.lang || navigator.language || 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    blocks,
  };
}
