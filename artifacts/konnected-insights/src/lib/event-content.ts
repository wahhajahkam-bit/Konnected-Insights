import type { EditorialItem } from '@/lib/api';

export type EventFormat = 'in-person' | 'online' | 'hybrid';

export type EventData = {
  startAt?: string;
  endAt?: string;
  timezone?: string;
  location?: string;
  format?: EventFormat;
  desc?: string;
  sourceUrl?: string;
  registrationUrl?: string;
  images?: string[];
  completionMode?: 'manual';
  imageProvenance?: 'ai-generated-representative-artwork';
  year?: string;
  date?: string;
  stats?: Array<{ label: string; value: string }>;
};

export type PublicEvent = Omit<EditorialItem, 'data'> & { data: EventData };

export const getEventState = (
  data: EventData,
  now = Date.now(),
): 'upcoming' | 'ongoing' | 'ended' | 'unconfirmed' => {
  if (!data.startAt) return data.date || data.year ? 'ended' : 'unconfirmed';
  const start = new Date(data.startAt).getTime();
  if (!Number.isFinite(start)) return 'unconfirmed';
  const end = data.endAt
    ? new Date(data.endAt).getTime()
    : data.completionMode === 'manual'
      ? Number.POSITIVE_INFINITY
      : start;
  if (Number.isFinite(end) && now > end) return 'ended';
  if (now >= start) return 'ongoing';
  return 'upcoming';
};

export const formatEventDateTime = (data: EventData) => {
  if (!data.startAt) return data.date || 'Date to be confirmed';
  const timeZone = data.timezone || 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return formatter.format(new Date(data.startAt));
  } catch {
    return 'Date to be confirmed';
  }
};

export const formatEventFormat = (format?: EventFormat) => {
  if (!format) return 'Format to be confirmed';
  if (format === 'in-person') return 'In person';
  return format[0].toUpperCase() + format.slice(1);
};