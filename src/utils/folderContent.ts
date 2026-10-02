import type { FileItem, FileType } from '../types';
import { detectFileType, getFileExtension } from './fileSystem';
import { countNativeFolderChildren, isTauriDesktop, type NativeFolderChildCounts } from './nativeFileSystem';

export type FolderContentKind = Exclude<FileType, 'folder'> | 'empty' | 'folders' | 'mixed' | 'archiveFormat';

export interface FolderContentSummary extends NativeFolderChildCounts {
  kind: FolderContentKind;
  scannedAt: number;
  format?: string;
}

const CACHE_LIFETIME_MS = 30_000;
const MAX_CACHE_ENTRIES = 128;
const ARCHIVE_FORMATS = new Set(['rar', 'zip', '7z', 'tar', 'gz']);
const cache = new Map<string | FileSystemHandle, { promise: Promise<FolderContentSummary>; checkedAt: number }>();

function summarize(counts: NativeFolderChildCounts): FolderContentSummary {
  const snapshot = { ...counts, scannedAt: Date.now() };
  if (counts.fileCount === 0) {
    return { ...snapshot, kind: counts.folderCount === 0 ? 'empty' : 'folders' };
  }
  if (counts.folderCount > 0) return { ...snapshot, kind: 'mixed' };

  let onlyType: FileType | null = null;
  const extensions = Object.entries(counts.extensionCounts).filter(([, count]) => count > 0);
  for (const [extension] of extensions) {
    const detected = detectFileType(extension ? `file.${extension}` : 'file', false);
    const type = detected === 'folder' ? 'unknown' : detected;
    if (onlyType !== null && onlyType !== type) return { ...snapshot, kind: 'mixed' };
    onlyType = type;
  }
  if (onlyType === 'archive' && extensions.length === 1 && ARCHIVE_FORMATS.has(extensions[0][0])) {
    return { ...snapshot, kind: 'archiveFormat', format: extensions[0][0].toUpperCase() };
  }
  return { ...snapshot, kind: onlyType ?? 'unknown' };
}

async function readFolderContents(item: Pick<FileItem, 'path' | 'handle'>): Promise<FolderContentSummary> {
  if (isTauriDesktop()) return summarize(await countNativeFolderChildren(item.path));
  const handle = item.handle as FileSystemDirectoryHandle | undefined;
  if (!handle || handle.kind !== 'directory') throw new Error('Folder handle unavailable.');
  const counts: NativeFolderChildCounts = { fileCount: 0, folderCount: 0, extensionCounts: {} };
  for await (const child of handle.values()) {
    if (child.kind === 'directory') {
      counts.folderCount += 1;
    } else {
      counts.fileCount += 1;
      const extension = getFileExtension(child.name);
      counts.extensionCounts[extension] = (counts.extensionCounts[extension] ?? 0) + 1;
    }
  }
  return summarize(counts);
}

export function loadFolderContentSummary(item: Pick<FileItem, 'path' | 'handle'>): Promise<FolderContentSummary> {
  const key = isTauriDesktop() ? item.path.toLowerCase() : item.handle ?? item.path;
  const cached = cache.get(key);
  if (cached && (cached.checkedAt === 0 || Date.now() - cached.checkedAt < CACHE_LIFETIME_MS)) return cached.promise;

  const promise = readFolderContents(item);
  cache.set(key, { promise, checkedAt: 0 });
  void promise.then(
    () => {
      if (cache.get(key)?.promise === promise) cache.set(key, { promise, checkedAt: Date.now() });
    },
    () => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
    },
  );
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return promise;
}

export function formatFolderContentLabel(summary: FolderContentSummary, labels: Record<FolderContentKind, string>): string {
  const label = labels[summary.kind];
  return summary.kind === 'archiveFormat' ? label.replace('{format}', summary.format ?? '') : label;
}
