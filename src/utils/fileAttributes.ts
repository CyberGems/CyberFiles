import type { NativeFileMetadataSnapshot } from './nativeFileSystem';

export interface AttributeSummary {
  kind: 'unknown' | 'on' | 'off' | 'mixed';
  onCount: number;
  total: number;
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateInputValue(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

export function toLocalTimeInputValue(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`;
}

export function parseLocalDateTimeInputs(dateStr: string, timeStr: string): number | null {
  const dateTrimmed = dateStr.trim();
  const timeTrimmed = timeStr.trim();
  if (!dateTrimmed || !timeTrimmed) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateTrimmed);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeTrimmed);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? '0');

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }
  return date.getTime();
}

export function parsePositiveIntegerOffset(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

export function summarizeAttribute(
  snapshots: Array<Pick<NativeFileMetadataSnapshot, 'readOnly' | 'hidden' | 'system'>>,
  key: 'readOnly' | 'hidden' | 'system',
): AttributeSummary {
  const total = snapshots.length;
  if (total === 0) return { kind: 'unknown', onCount: 0, total: 0 };
  let onCount = 0;
  for (const snap of snapshots) {
    if (snap[key]) onCount += 1;
  }
  if (onCount === 0) return { kind: 'off', onCount, total };
  if (onCount === total) return { kind: 'on', onCount, total };
  return { kind: 'mixed', onCount, total };
}
