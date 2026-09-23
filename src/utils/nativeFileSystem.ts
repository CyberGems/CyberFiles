import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { DriveInfo, FileItem } from '../types';
import { detectFileType, getFileExtension } from './fileSystem';

export function isTauriDesktop() {
  return '__TAURI_INTERNALS__' in window;
}

interface NativeFolderEntry {
  name: string;
  path: string;
  isFolder: boolean;
  size: number;
  modifiedMs: number | null;
}

interface LoadedNativeFolder {
  rootPath: string;
  rootName: string;
  entries: NativeFolderEntry[];
  hasMore: boolean;
  nextOffset: number;
}

interface NativeDrive {
  id: string;
  letter: string;
  label: string;
  totalBytes: number;
  usedBytes: number;
  kind: DriveInfo['type'];
}

export interface NativeLocation {
  id: 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos';
  path: string;
}

const formatModifiedDate = (timestamp: number | null) => timestamp
  ? new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16)
  : '';

function mapNativeEntries(entries: NativeFolderEntry[]): FileItem[] {
  return entries.map(entry => ({
    id: `native-${encodeURIComponent(entry.path.toLowerCase())}`,
    name: entry.name,
    path: entry.path,
    isFolder: entry.isFolder,
    type: detectFileType(entry.name, entry.isFolder),
    size: entry.size,
    modifiedDate: formatModifiedDate(entry.modifiedMs),
    extension: entry.isFolder ? '' : getFileExtension(entry.name),
  }));
}

export async function chooseNativeFolder(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const selected = await open({ directory: true, multiple: false, title: 'Open a folder in CyberFiles' });
  return typeof selected === 'string' ? selected : null;
}

export async function listNativeDirectory(path: string, offset = 0): Promise<{ rootPath: string; rootName: string; entries: FileItem[]; hasMore: boolean; nextOffset: number }> {
  const result = await invoke<LoadedNativeFolder>('list_directory', { path, offset });
  return {
    rootPath: result.rootPath,
    rootName: result.rootName,
    entries: mapNativeEntries(result.entries),
    hasMore: result.hasMore,
    nextOffset: result.nextOffset,
  };
}

export async function loadNativeFolder(path: string): Promise<{ rootPath: string; rootName: string; files: FileItem[]; hasMore: boolean; nextOffset: number }> {
  const result = await listNativeDirectory(path);
  const root: FileItem = {
    id: `native-root-${encodeURIComponent(result.rootPath.toLowerCase())}`,
    name: result.rootName,
    path: result.rootPath,
    isFolder: true,
    type: 'folder',
    size: 0,
    modifiedDate: '',
    extension: '',
  };
  return { rootPath: result.rootPath, rootName: result.rootName, files: [root, ...result.entries], hasMore: result.hasMore, nextOffset: result.nextOffset };
}

export async function listNativeDrives(): Promise<DriveInfo[]> {
  if (!isTauriDesktop()) return [];
  const drives = await invoke<NativeDrive[]>('list_drives');
  return drives.map(({ kind, ...drive }) => ({ ...drive, type: kind }));
}

export async function listNativeSystemLocations(): Promise<NativeLocation[]> {
  if (!isTauriDesktop()) return [];
  return invoke<NativeLocation[]>('list_system_locations');
}

const thumbnailCache = new Map<string, string>();

export async function loadNativeImageThumbnail(path: string): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const cacheKey = path.toLowerCase();
  const cached = thumbnailCache.get(cacheKey);
  if (cached) return cached;
  try {
    const thumbnail = await invoke<string | null>('image_thumbnail', { path });
    if (!thumbnail) return null;
    if (thumbnailCache.size >= 128) {
      const oldestKey = thumbnailCache.keys().next().value;
      if (oldestKey) thumbnailCache.delete(oldestKey);
    }
    thumbnailCache.set(cacheKey, thumbnail);
    return thumbnail;
  } catch {
    return null;
  }
}

export async function setNativeTrayLanguage(language: 'es' | 'en') {
  if (!isTauriDesktop()) return;
  await invoke('set_tray_language', { language });
}
