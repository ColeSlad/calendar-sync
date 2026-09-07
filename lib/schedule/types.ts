import type { DateRange, Weekday } from '../domain/types';

export interface ScheduleCaptureBlock {
  kind: 'table' | 'region' | 'text';
  heading?: string;
  headers?: string[];
  rows?: string[][];
  lines?: string[];
}

export interface SchedulePageCapture {
  id: string;
  capturedAt: string;
  url: string;
  title: string;
  language: string;
  timezone: string;
  blocks: ScheduleCaptureBlock[];
}

export interface ScheduleMeetingDraft {
  id: string;
  enabled: boolean;
  courseName: string;
  courseCode?: string;
  section?: string;
  component?: string;
  instructor?: string;
  days: Weekday[];
  startTime: string;
  endTime: string;
  location?: string;
  occurrence: number;
  confidence: number;
  warnings: string[];
}

export interface ScheduleExtraction {
  method: 'rules' | 'ai' | 'rules-and-ai';
  sourceUrl: string;
  sourceTitle: string;
  timezone: string;
  termName: string;
  termStart: string;
  termEnd: string;
  exclusions: DateRange[];
  meetings: ScheduleMeetingDraft[];
  warnings: string[];
}

export type AiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

