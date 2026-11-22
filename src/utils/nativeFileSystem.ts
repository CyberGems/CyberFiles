import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { NETWORK_PATH, RECYCLE_BIN_PATH, SYSTEM_HOME_PATH, type DriveInfo, type FileItem, type NetworkResource } from '../types';
import { detectFileType, getFileExtension } from './fileSystem';
import { formatLocalDateTime } from './dateTime';

export const MAX_PDF_PREVIEW_BYTES = 100 * 1024 * 1024;

export function isTauriDesktop() {
  return '__TAURI_INTERNALS__' in window;
}

export async function readNativeClipboardText(): Promise<string> {
  if (!isTauriDesktop()) return '';
  return invoke<string>('read_clipboard_text');
}

interface NativeFolderEntry {
  name: string;
  path: string;
  isFolder: boolean;
  isHidden: boolean;
  size: number;
  modifiedMs: number | null;
  createdMs: number | null;
}

export interface NativeFileIconRequest {
  id: string;
  path: string;
}

export interface NativeFileIconGroup {
  itemIds: string[];
  dataUrl: string;
}

interface LoadedNativeFolder {
  rootPath: string;
  rootName: string;
  entries: NativeFolderEntry[];
  counts: NativeDirectoryCounts;
  hasMore: boolean;
  nextOffset: number;
  /** Raw `Mode=` from the folder's desktop.ini [ViewState] section, when Explorer saved one. */
  viewStateMode?: string | null;
}

interface LoadedNativeFlatFolder {
  entries: NativeFolderEntry[];
  counts: NativeDirectoryCounts;
  skippedCount: number;
  truncated: boolean;
}

export interface NativeDirectoryCounts {
  fileCount: number;
  folderCount: number;
  visibleFileCount: number;
  visibleFolderCount: number;
  hiddenCount: number;
}

export interface NativeFolderChildCounts {
  fileCount: number;
  folderCount: number;
  extensionCounts: Record<string, number>;
}

interface NativeDrive {
  id: string;
  letter: string;
  label: string;
  totalBytes: number;
  usedBytes: number;
  kind: DriveInfo['type'];
  rootPath?: string;
  deviceSubtype?: DriveInfo['deviceSubtype'];
  deviceTypeLabel?: string;
}

export interface NativeLocation {
  id: 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos';
  path: string;
}

export type WindowsSpecialFolderId =
  | 'programFilesX86'
  | 'programFiles'
  | 'appData'
  | 'programData'
  | 'system32'
  | 'windows'
  | 'editHosts';

export interface WindowsSpecialFolder {
  id: WindowsSpecialFolderId;
  path: string;
  isFile: boolean;
}

export type WindowsTerminalOption = 'cmd' | 'cmd-admin' | 'powershell' | 'powershell-admin';

export interface RecycleBinStatus {
  available: boolean;
  itemCount: number;
  totalBytes: number;
}

export interface RecycleBinDeleteResult {
  recycledPaths: string[];
  /* Windows reports where each item landed as it moves it, so undo never has to search the bin. */
  recycled: Array<{ path: string; id: string }>;
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

export interface NativeArchivePreviewEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  compressedSize: number;
  unsafePath: boolean;
  link: boolean;
  extractable: boolean;
}

export interface NativeArchivePreview {
  entries: NativeArchivePreviewEntry[];
  totalEntries: number;
  totalBytes: number;
  truncated: boolean;
}
export interface NativeOperationResult {
  completedPaths: string[];
  failures: Array<{ path: string; error: string }>;
}

export interface NativeTransferProgress {
  jobId: string;
  phase: 'scanning' | 'copying' | 'compressing';
  currentItem: string;
  bytesCopied: number;
  totalBytes: number;
  currentFileBytes: number;
  currentFileTotal: number;
  itemsCompleted: number;
  totalItems: number;
}

export interface NativeTransferFinished {
  jobId: string;
  result: NativeOperationResult;
}

export interface NativeFileClipboard {
  paths: string[];
  isCut: boolean;
  sequenceNumber: number;
}

export interface NativeCreatedImage {
  path: string;
  name: string;
  size: number;
  modifiedMs: number | null;
  createdMs: number | null;
}

function mapNativeEntries(entries: NativeFolderEntry[]): FileItem[] {
  return entries.map(entry => ({
    id: `native-${encodeURIComponent(entry.path.toLowerCase())}`,
    name: entry.name,
    path: entry.path,
    isFolder: entry.isFolder,
    attributes: entry.isHidden ? 'H' : '',
    type: detectFileType(entry.name, entry.isFolder),
    size: entry.size,
    modifiedDate: formatLocalDateTime(entry.modifiedMs),
    createdDate: formatLocalDateTime(entry.createdMs),
    modifiedAtMs: entry.modifiedMs ?? undefined,
    createdAtMs: entry.createdMs ?? undefined,
    extension: entry.isFolder ? '' : getFileExtension(entry.name),
  }));
}

export async function loadNativeTextPreview(path: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Native file previews are unavailable.');
  return invoke<string>('read_text_preview', { path });
}

export async function loadNativeArchivePreview(path: string, password?: string): Promise<NativeArchivePreview> {
  if (!isTauriDesktop()) throw new Error('Archive previews are only available in the desktop app.');
  return invoke<NativeArchivePreview>('read_archive_preview', { path, password: password ?? null });
}
export async function loadNativePdfPreviewUrl(path: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Native PDF previews are unavailable.');
  const authorizedPath = await invoke<string>('prepare_pdf_preview', { path });
  return convertFileSrc(authorizedPath);
}

/// Authorizes an audio/video file for in-place playback through the asset protocol: the file
/// streams from disk, nothing is copied or buffered whole.
export async function loadNativeMediaPreviewUrl(path: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Native media playback is unavailable.');
  const authorizedPath = await invoke<string>('prepare_media_preview', { path });
  return convertFileSrc(authorizedPath);
}

export async function chooseNativeFolder(title = 'Open a folder in CyberFiles'): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

export async function chooseNativeFile(title = 'Choose a shortcut target'): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const selected = await open({ directory: false, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

/**
 * Resolves `%VAR%` environment tokens in a user-provided path (e.g.
 * `%APPDATA%\CyberSnap\logs`) so navigation state stores the real location.
 */
export async function expandNativeEnvironmentPath(path: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Native path expansion is unavailable.');
  return invoke<string>('expand_environment_path', { path });
}

export async function listNativeDirectory(path: string): Promise<{ rootPath: string; rootName: string; entries: FileItem[]; counts: NativeDirectoryCounts; hasMore: boolean; nextOffset: number; viewStateMode?: string | null }> {
  const result = await invoke<LoadedNativeFolder>('list_directory', { path });
  return {
    rootPath: result.rootPath,
    rootName: result.rootName,
    entries: mapNativeEntries(result.entries),
    counts: result.counts,
    hasMore: result.hasMore,
    nextOffset: result.nextOffset,
    viewStateMode: result.viewStateMode ?? null,
  };
}

export async function listNativeFlatDirectory(path: string): Promise<{ entries: FileItem[]; counts: NativeDirectoryCounts; skippedCount: number; truncated: boolean }> {
  const result = await invoke<LoadedNativeFlatFolder>('list_flat_directory', { path });
  return { entries: mapNativeEntries(result.entries), counts: result.counts, skippedCount: result.skippedCount, truncated: result.truncated };
}

export async function countNativeHiddenItems(path: string): Promise<number> {
  if (!isTauriDesktop()) throw new Error('Native hidden-item counts are unavailable.');
  return invoke<number>('count_hidden_items', { path });
}

export async function countNativeFolderChildren(path: string): Promise<NativeFolderChildCounts> {
  if (!isTauriDesktop()) throw new Error('Native folder counts are unavailable.');
  return invoke<NativeFolderChildCounts>('count_folder_children', { path });
}

export type NativeFileIconSize = 'small' | 'large' | 'jumbo';

export async function getNativeFileIcons(items: NativeFileIconRequest[], size: NativeFileIconSize): Promise<NativeFileIconGroup[]> {
  if (!isTauriDesktop() || items.length === 0) return [];
  return invoke<NativeFileIconGroup[]>('get_file_icons', { items, size });
}

/// Shell thumbnails (Explorer-style previews) for items the Shell has a provider for:
/// videos, documents, folders with images inside, and image formats the bundled decoder
/// cannot read. Returns only the items that produced a thumbnail.
export async function getNativeFileThumbnails(items: NativeFileIconRequest[], size: number): Promise<NativeFileIconGroup[]> {
  if (!isTauriDesktop() || items.length === 0) return [];
  return invoke<NativeFileIconGroup[]>('get_thumbnails', { items, size });
}
export async function openFolderInWindowsExplorer(path: string): Promise<void> {
  if (!isTauriDesktop()) throw new Error('Windows File Explorer is available only in the desktop app.');
  await invoke('open_folder_in_windows_explorer', { path });
}

export async function openWindowsTerminalHere(path: string, terminal: WindowsTerminalOption): Promise<void> {
  if (!isTauriDesktop()) throw new Error('Windows terminals are available only in the desktop app.');
  await invoke('open_terminal_here', { path, terminal });
}

export async function getWindowsSpecialFolders(): Promise<WindowsSpecialFolder[]> {
  if (!isTauriDesktop()) return [];
  return invoke<WindowsSpecialFolder[]>('list_windows_special_folders');
}

export async function editWindowsHostsFile(): Promise<void> {
  if (!isTauriDesktop()) throw new Error('The Windows hosts file can be edited only in the desktop app.');
  await invoke('edit_hosts_file');
}

export async function calculateNativeFolderSize(path: string): Promise<number> {
  if (!isTauriDesktop()) throw new Error('Folder size calculation is only available in the desktop app.');
  return invoke<number>('calculate_folder_size', { path });
}

export async function startNativeFolderSizeCalculation(path: string, jobId: string): Promise<void> {
  if (!isTauriDesktop()) throw new Error('Folder size calculation is only available in the desktop app.');
  await invoke('start_folder_size_calculation', { path, jobId });
}

export async function pauseNativeFolderSizeCalculation(jobId: string): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke('pause_folder_size_calculation', { jobId });
}

export async function resumeNativeFolderSizeCalculation(jobId: string): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke('resume_folder_size_calculation', { jobId });
}

export async function cancelNativeFolderSizeCalculation(jobId: string): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke('cancel_folder_size_calculation', { jobId });
}

export interface NativeFolderSizeCalculation {
  size: number;
  entriesScanned: number;
  complete: boolean;
}

export async function calculateNativeFolderSizeBounded(path: string, maxEntries: number): Promise<NativeFolderSizeCalculation> {
  if (!isTauriDesktop()) throw new Error('Folder size calculation is only available in the desktop app.');
  return invoke<NativeFolderSizeCalculation>('calculate_folder_size_bounded', { path, maxEntries });
}

export async function createNativeDirectory(parentPath: string, name: string): Promise<{ path: string; name: string }> {
  return invoke<{ path: string; name: string }>('create_directory', { parentPath, name });
}

export async function createNativeTextFile(parentPath: string, name: string): Promise<{ path: string; name: string }> {
  return invoke<{ path: string; name: string }>('create_text_file', { parentPath, name });
}

export async function createNativeShortcut(parentPath: string, name: string, targetPath: string): Promise<{ path: string; name: string }> {
  return invoke<{ path: string; name: string }>('create_shortcut', { parentPath, name, targetPath });
}

export async function renameNativeItem(path: string, newName: string): Promise<string> {
  return invoke<string>('rename_item', { path, newName });
}

export async function startNativeTransferOperation(paths: string[], targetPath: string, jobId: string, moveItems: boolean, preserveNames = false): Promise<void> {
  if (moveItems) return invoke<void>('start_move_operation', { paths, targetPath, jobId, preserveNames });
  return invoke<void>('start_copy_operation', { paths, targetPath, jobId, preserveNames });
}

export async function startNativeArchiveExtractionOperation(archivePath: string, targetPath: string, jobId: string, extractionMode: 'here' | 'folder', password?: string): Promise<void> {
  return invoke<void>('start_archive_extraction', { archivePath, targetPath, jobId, extractionMode, password: password ?? null });
}
export async function startNativeZipCompressionOperation(paths: string[], targetPath: string, archiveName: string, jobId: string): Promise<void> {
  return invoke<void>('start_zip_compression', { paths, targetPath, archiveName, jobId });
}

export async function pauseNativeTransferOperation(jobId: string): Promise<void> {
  return invoke<void>('pause_transfer_operation', { jobId });
}

export async function resumeNativeTransferOperation(jobId: string): Promise<void> {
  return invoke<void>('resume_transfer_operation', { jobId });
}

export async function cancelNativeTransferOperation(jobId: string): Promise<void> {
  return invoke<void>('cancel_transfer_operation', { jobId });
}

export async function setNativeFileClipboard(paths: string[], isCut: boolean): Promise<number> {
  return invoke<number>('set_file_clipboard', { paths, isCut });
}

export async function getNativeFileClipboard(): Promise<NativeFileClipboard> {
  return invoke<NativeFileClipboard>('get_file_clipboard');
}

export async function pasteNativeClipboardImage(targetPath: string, baseName: string): Promise<NativeCreatedImage | null> {
  return invoke<NativeCreatedImage | null>('paste_clipboard_image', { targetPath, baseName });
}

export async function clearNativeFileClipboard(sequenceNumber: number): Promise<boolean> {
  return invoke<boolean>('clear_file_clipboard', { sequenceNumber });
}

export async function loadNativeFolder(path: string): Promise<{ rootPath: string; rootName: string; files: FileItem[]; counts: NativeDirectoryCounts; hasMore: boolean; nextOffset: number }> {
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
  return { rootPath: result.rootPath, rootName: result.rootName, files: [root, ...result.entries], counts: result.counts, hasMore: result.hasMore, nextOffset: result.nextOffset };
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
      modifiedDate: formatLocalDateTime(entry.deletedAtMs),
      modifiedAtMs: entry.deletedAtMs ?? undefined,
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

export async function permanentlyDeleteNativeItems(paths: string[]): Promise<NativeOperationResult> {
  return invoke<NativeOperationResult>('permanently_delete_items', { paths });
}

export async function emptyNativeRecycleBin(): Promise<void> {
  await invoke('empty_recycle_bin');
}

export async function openNativeRecycleBinInExplorer(): Promise<void> {
  await invoke('open_recycle_bin_in_explorer');
}

/* CyberFiles' virtual locations have Shell namespace equivalents, so their rows can
   hand Explorer's own context menu too. Recents stays out: CyberFiles tracks files it
   opened itself, not the Windows Recent shell folder. */
const VIRTUAL_SHELL_PARSING_NAMES: Record<string, string> = {
  [SYSTEM_HOME_PATH]: '::{20D04FE0-3AEA-1069-A2D8-08002B30309D}',
  [NETWORK_PATH]: '::{F02C1A0D-BD21-4E75-9E85-5BCB4F52F3BE}',
  [RECYCLE_BIN_PATH]: '::{645FF040-5081-101B-9F08-00AA002F954E}',
};

/** Shows the real Windows Shell context menu (Explorer's own, including third-party
    extensions) for the paths at the given physical screen coordinates. Virtual
    locations are translated to their Shell namespace parsing names first. */
export async function showNativeShellContextMenu(paths: string[], x: number, y: number): Promise<void> {
  const shellPaths = paths.map(path => VIRTUAL_SHELL_PARSING_NAMES[path] ?? path);
  await invoke('show_shell_context_menu', { paths: shellPaths, x: Math.round(x), y: Math.round(y) });
}

/** Asks Windows to eject the portable device behind a `mtp:\` root path. */
export async function ejectNativePortableDevice(rootPath: string): Promise<void> {
  await invoke('eject_portable_device', { rootPath });
}

export async function openNativeFileWithDefaultApp(path: string): Promise<void> {
  await invoke('open_file_with_default_app', { path });
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

export async function listNativeNetworkResources(): Promise<NetworkResource[]> {
  if (!isTauriDesktop()) return [];
  return invoke<NetworkResource[]>('list_network_resources');
}

export async function authenticateNativeNetworkResource(
  path: string,
  username: string,
  password: string,
  rememberCredentials: boolean,
): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke('authenticate_network_resource', {
    path,
    username,
    password,
    rememberCredentials,
  });
}

export function parseNetworkAuthRequiredError(error: unknown): { required: boolean; code?: number } {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(/NETWORK_AUTH_REQUIRED:(\d+):/);
  if (!match) return { required: false };
  const code = Number.parseInt(match[1], 10);
  return { required: true, code: Number.isFinite(code) ? code : undefined };
}

export function parseNetworkAuthFailedError(error: unknown): { code?: number; raw: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const match = raw.match(/NETWORK_AUTH_FAILED:(\d+):/);
  if (!match) return { raw };
  const code = Number.parseInt(match[1], 10);
  return { code: Number.isFinite(code) ? code : undefined, raw };
}

export async function mapNativeNetworkDrive(options: {
  remotePath: string;
  driveLetter: string;
  reconnectAtSignIn: boolean;
  username?: string;
  password?: string;
  rememberCredentials?: boolean;
}): Promise<string> {
  if (!isTauriDesktop()) return `${options.driveLetter.replace(/[:\\]+$/, '')}:\\`;
  return invoke<string>('map_network_drive', {
    remotePath: options.remotePath,
    driveLetter: options.driveLetter,
    reconnectAtSignIn: options.reconnectAtSignIn,
    username: options.username?.trim() || null,
    password: options.password ?? null,
    rememberCredentials: options.rememberCredentials === true,
  });
}

export async function disconnectNativeNetworkDrive(driveLetter: string, force = false): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke('disconnect_network_drive', {
    driveLetter,
    force,
  });
}

export function parseNetworkMapFailedError(error: unknown): { code?: number; raw: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const match = raw.match(/NETWORK_MAP_FAILED:(\d+):/);
  if (!match) return { raw };
  const code = Number.parseInt(match[1], 10);
  return { code: Number.isFinite(code) ? code : undefined, raw };
}

export interface NetworkHostProbeStatus {
  path: string;
  online: boolean;
  latencyMs?: number;
}

export async function probeNativeNetworkHosts(hosts: string[]): Promise<NetworkHostProbeStatus[]> {
  if (!isTauriDesktop() || hosts.length === 0) return [];
  return invoke<NetworkHostProbeStatus[]>('probe_network_hosts', { hosts });
}

export interface OutboundFileDragResult {
  outcome: 'dropped' | 'cancelled';
  effect: 'copy' | 'move' | 'link' | 'none';
  sourcePaths: string[];
}

export async function startNativeOutboundFileDrag(paths: string[]): Promise<OutboundFileDragResult> {
  if (!isTauriDesktop() || paths.length === 0) {
    return { outcome: 'cancelled', effect: 'none', sourcePaths: [] };
  }
  return invoke<OutboundFileDragResult>('start_outbound_file_drag', { paths });
}
