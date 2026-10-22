import type { FileItem, FileType } from '../types';
import { detectFileType, getFileExtension } from './fileSystem';

/* What "recent" means here: files the user actually opened or previewed inside CyberFiles.
   The old recent tab only stamped files from folders that were already loaded, which made it a
   placeholder; this registry is a real, persisted access log. */

export interface RecentEntry {
  path: string;
  name: string;
  size: number;
  modifiedAtMs?: number;
  modifiedDate: string;
  type: FileType;
  extension: string;
  openedAtMs: number;
}

const STORAGE_KEY = 'cyberfiles_recent_files_v1';
const MAX_ENTRIES = 500;

const VALID_FILE_TYPES: ReadonlySet<string> = new Set(['folder', 'image', 'code', 'text', 'audio', 'video', 'archive', 'document', 'executable', 'binary', 'unknown']);

function safeFileType(name: string, candidate: unknown): FileType {
  return typeof candidate === 'string' && VALID_FILE_TYPES.has(candidate) ? (candidate as FileType) : detectFileType(name, false);
}

function sanitizeEntries(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  const byPath = new Map<string, RecentEntry>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<RecentEntry>;
    if (typeof entry.path !== 'string' || typeof entry.name !== 'string' || typeof entry.openedAtMs !== 'number') continue;
    if (!Number.isFinite(entry.openedAtMs)) continue;
    const previous = byPath.get(entry.path.toLowerCase());
    // One row per file: the latest opening wins.
    if (previous && previous.openedAtMs >= entry.openedAtMs) continue;
    byPath.set(entry.path.toLowerCase(), {
      path: entry.path,
      name: entry.name,
      size: typeof entry.size === 'number' ? entry.size : 0,
      modifiedAtMs: typeof entry.modifiedAtMs === 'number' ? entry.modifiedAtMs : undefined,
      modifiedDate: typeof entry.modifiedDate === 'string' ? entry.modifiedDate : '',
      type: safeFileType(entry.name, entry.type),
      extension: typeof entry.extension === 'string' ? entry.extension : getFileExtension(entry.name),
      openedAtMs: entry.openedAtMs,
    });
  }
  return [...byPath.values()]
    .sort((left, right) => right.openedAtMs - left.openedAtMs)
    .slice(0, MAX_ENTRIES);
}

function loadEntries(): RecentEntry[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return sanitizeEntries(saved);
  } catch {
    return [];
  }
}

function saveEntries(entries: RecentEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // A full or blocked storage keeps the session list in memory only.
  }
}

export function entryFromFile(item: FileItem, openedAtMs = Date.now()): RecentEntry {
  return {
    path: item.path,
    name: item.name,
    size: item.size,
    modifiedAtMs: item.modifiedAtMs,
    modifiedDate: item.modifiedDate,
    type: item.type,
    extension: item.extension,
    openedAtMs,
  };
}

export function recordRecentEntry(entries: RecentEntry[], item: FileItem, openedAtMs = Date.now()): RecentEntry[] {
  const key = item.path.toLowerCase();
  const next = entries.filter(entry => entry.path.toLowerCase() !== key);
  next.unshift(entryFromFile(item, openedAtMs));
  return sanitizeEntries(next);
}

export function removeRecentEntry(entries: RecentEntry[], path: string): RecentEntry[] {
  const key = path.toLowerCase();
  return entries.filter(entry => entry.path.toLowerCase() !== key);
}

export function renameRecentEntries(entries: RecentEntry[], oldPath: string, newPath: string, newName?: string): RecentEntry[] {
  const key = oldPath.toLowerCase();
  return entries.map(entry => {
    const entryKey = entry.path.toLowerCase();
    if (entryKey === key) {
      return { ...entry, path: newPath, name: newName ?? newPath.split(/[\\/]/).filter(Boolean).pop() ?? entry.name };
    }
    if (entryKey.startsWith(`${key}\\`)) {
      return { ...entry, path: `${newPath}${entry.path.slice(oldPath.length)}` };
    }
    return entry;
  });
}

export function pruneRecentEntries(entries: RecentEntry[], isAlive: (path: string) => boolean): RecentEntry[] {
  return entries.filter(entry => isAlive(entry.path));
}

export function toRecentFileItem(entry: RecentEntry): FileItem {
  return {
    // Path-based id: stable across re-sorts and re-renders, so selection survives both.
    id: `recent:${entry.path.toLowerCase()}`,
    name: entry.name,
    path: entry.path,
    isFolder: false,
    type: entry.type,
    size: entry.size,
    modifiedDate: entry.modifiedDate,
    modifiedAtMs: entry.modifiedAtMs,
    extension: entry.extension,
    lastOpenedAtMs: entry.openedAtMs,
  };
}

export const recentFileActions = { loadEntries, saveEntries };
