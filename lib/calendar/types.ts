export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole: 'none' | 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  backgroundColor?: string;
}

export interface GoogleCalendarInput {
  summary: string;
  description?: string;
  timeZone?: string;
}

export interface GoogleCalendarResource {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
}

export interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  transparency?: 'opaque' | 'transparent';
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  recurrence?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'popup' | 'email'; minutes: number }>;
  };
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface GoogleEventList {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

export interface GoogleCalendarList {
  items?: GoogleCalendar[];
  nextPageToken?: string;
}
