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
  createdMs: number | null;
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

export interface RecycleBinStatus {
  available: boolean;
  itemCount: number;
  totalBytes: number;
}

export interface RecycleBinDeleteResult {
  recycledPaths: string[];
  failures: Array<{ path: string; error: string }>;
}

interface NativeRecycleBinEntry {
  id: string;
  name: string;
  originalPath: string | null;
  isFolder: boolean;
  size: number;
  deletedAtMs: number | null;
}

interface LoadedRecycleBin {
  entries: NativeRecycleBinEntry[];
  hasMore: boolean;
  nextOffset: number;
}

export interface RecycleBinRestoreResult {
  restoredIds: string[];
  failures: Array<{ path: string; error: string }>;
}

export interface NativeOperationResult {
  completedPaths: string[];
  failures: Array<{ path: string; error: string }>;
}

export interface NativeFileClipboard {
  paths: string[];
  isCut: boolean;
  sequenceNumber: number;
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
    createdDate: formatModifiedDate(entry.createdMs),
    modifiedAtMs: entry.modifiedMs ?? undefined,
    createdAtMs: entry.createdMs ?? undefined,
    extension: entry.isFolder ? '' : getFileExtension(entry.name),
  }));
}

export async function loadNativeTextPreview(path: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Native file previews are unavailable.');
  return invoke<string>('read_text_preview', { path });
}

export async function chooseNativeFolder(title = 'Open a folder in CyberFiles'): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const selected = await open({ directory: true, multiple: false, title });
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

export async function createNativeDirectory(parentPath: string, name: string): Promise<{ path: string; name: string }> {
  return invoke<{ path: string; name: string }>('create_directory', { parentPath, name });
}

export async function renameNativeItem(path: string, newName: string): Promise<string> {
  return invoke<string>('rename_item', { path, newName });
}

export async function copyNativeItemsToDirectory(paths: string[], targetPath: string): Promise<NativeOperationResult> {
  return invoke<NativeOperationResult>('copy_items_to_directory', { paths, targetPath });
}

export async function moveNativeItemsToDirectory(paths: string[], targetPath: string): Promise<NativeOperationResult> {
  return invoke<NativeOperationResult>('move_items_to_directory', { paths, targetPath });
}

export async function setNativeFileClipboard(paths: string[], isCut: boolean): Promise<number> {
  return invoke<number>('set_file_clipboard', { paths, isCut });
}

export async function getNativeFileClipboard(): Promise<NativeFileClipboard> {
  return invoke<NativeFileClipboard>('get_file_clipboard');
}

export async function clearNativeFileClipboard(sequenceNumber: number): Promise<boolean> {
  return invoke<boolean>('clear_file_clipboard', { sequenceNumber });
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

export async function getNativeRecycleBinStatus(): Promise<RecycleBinStatus> {
  return invoke<RecycleBinStatus>('get_recycle_bin_status');
}

export async function listNativeRecycleBin(offset = 0): Promise<{ entries: FileItem[]; hasMore: boolean; nextOffset: number }> {
  const result = await invoke<LoadedRecycleBin>('list_recycle_bin', { offset });
  return {
    entries: result.entries.map(entry => ({
      id: `recycle-bin-${encodeURIComponent(entry.id.toLowerCase())}`,
      name: entry.name,
      path: entry.originalPath ?? '',
      originalPath: entry.originalPath ?? undefined,
      recycleBinId: entry.id,
      isFolder: entry.isFolder,
      type: detectFileType(entry.name, entry.isFolder),
      size: entry.size,
      modifiedDate: formatModifiedDate(entry.deletedAtMs),
      extension: entry.isFolder ? '' : getFileExtension(entry.name),
    })),
    hasMore: result.hasMore,
    nextOffset: result.nextOffset,
  };
}

export async function restoreNativeRecycleBinItems(items: Array<{ id: string }>): Promise<RecycleBinRestoreResult> {
  return invoke<RecycleBinRestoreResult>('restore_recycle_bin_items', { items });
}

export async function moveNativeItemsToRecycleBin(paths: string[]): Promise<RecycleBinDeleteResult> {
  return invoke<RecycleBinDeleteResult>('move_to_recycle_bin', { paths });
}

export async function emptyNativeRecycleBin(): Promise<void> {
  await invoke('empty_recycle_bin');
}

export async function openNativeRecycleBinInExplorer(): Promise<void> {
  await invoke('open_recycle_bin_in_explorer');
}

export async function openNativeImageWithDefaultApp(path: string): Promise<void> {
  await invoke('open_image_with_default_app', { path });
}

export async function showNativeFileProperties(path: string): Promise<void> {
  await invoke('open_windows_file_properties', { path });
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
