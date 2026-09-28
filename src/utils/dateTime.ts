export function formatLocalDateTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type DateFormatMode = 'application' | 'system' | 'universal';

export function formatDateTimeForDisplay(
  timestamp: number | null | undefined,
  fallbackValue: string | undefined,
  mode: DateFormatMode,
  language: 'es' | 'en',
): string {
  const resolvedTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? timestamp
    : fallbackValue ? Date.parse(fallbackValue) : Number.NaN;
  if (!Number.isFinite(resolvedTimestamp)) return fallbackValue || '';

  if (mode === 'universal') return formatLocalDateTime(resolvedTimestamp);

  const date = new Date(resolvedTimestamp);
  if (mode === 'system') {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  const offset = resolvedTimestamp - Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  if (Math.abs(offset) < dayInMs) {
    const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
    const absoluteSeconds = Math.abs(offset) / 1000;
    if (absoluteSeconds < 60) return relative.format(Math.round(offset / 1000), 'second');
    const absoluteMinutes = absoluteSeconds / 60;
    if (absoluteMinutes < 60) return relative.format(Math.round(offset / 60_000), 'minute');
    return relative.format(Math.round(offset / 3_600_000), 'hour');
  }

  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
