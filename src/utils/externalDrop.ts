import { FileDropOperation } from '../types';
import {
  getParentPath,
  getPathDriveLetter,
  getPortableDeviceRoot,
  isPortableDeviceRoot,
  isPortablePath,
  isPortableStorageRoot,
  isSameOrDescendantPath,
  isUncPath,
  isUncServerRoot,
  normalizeWindowsPath,
  PORTABLE_PATH_PREFIX,
} from './fileSystem';

const PORTABLE_STAGING_CACHE_PATTERN = /[\\/]cyberfiles[\\/]portable-cache[\\/]/i;

export function isPortableStagingCachePath(path?: string | null): boolean {
  return Boolean(path && PORTABLE_STAGING_CACHE_PATTERN.test(normalizeWindowsPath(path)));
}

export type ExternalDropRejectionReason =
  | 'no-paths'
  | 'invalid-destination'
  | 'portable-root'
  | 'self-or-descendant'
  | 'same-folder';

export interface ExternalDropValidation {
  allowed: boolean;
  reason?: ExternalDropRejectionReason;
}

/**
 * Returns true when `path` is a real writable folder/drive/storage container
 * where dropped items can be placed (local drives, UNC shares, or unlocked MTP storages).
 */
export function isValidDropDestinationPath(path?: string | null): boolean {
  if (!path) return false;
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith('::')) return false;
  const normalized = normalizeWindowsPath(trimmed);
  if (!normalized || normalized.startsWith('::') || normalized === '\\\\') return false;
  if (isPortablePath(normalized) || /^mtp:[\\/]*$/i.test(normalized)) {
    return normalized !== PORTABLE_PATH_PREFIX && !isPortableDeviceRoot(normalized);
  }
  if (isUncPath(normalized)) {
    return !isUncServerRoot(normalized);
  }
  return /^[a-zA-Z]:\\/.test(normalized);
}

/**
 * Cleans raw OS `HDROP` / Tauri paths (stripping Win32 verbatim prefixes),
 * drops virtual/invalid tokens, deduplicates, and prunes nested descendants
 * whose ancestor folder is also in the dropped set.
 */
export function normalizeExternalDroppedPaths(rawPaths: string[]): string[] {
  const normalizedList: string[] = [];
  const seenKeys = new Set<string>();

  for (const raw of rawPaths) {
    let cleaned = raw.trim();
    if (!cleaned) continue;
    if (/^\\\\\?\\UNC\\/i.test(cleaned)) {
      cleaned = `\\\\${cleaned.slice(8)}`;
    } else if (/^\\\\\?\\/.test(cleaned)) {
      cleaned = cleaned.slice(4);
    }
    const normalized = normalizeWindowsPath(cleaned);
    if (
      !normalized
      || normalized.startsWith('::')
      || normalized === '\\\\'
      || isUncServerRoot(normalized)
    ) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    normalizedList.push(normalized);
  }

  return normalizedList.filter((candidate, index) =>
    !normalizedList.some(
      (other, otherIndex) => otherIndex !== index && isSameOrDescendantPath(candidate, other),
    ),
  );
}

/**
 * Identifies the logical volume/share/device used by Windows Explorer
 * to choose move (same volume) vs copy (cross-volume) by default.
 */
export function getVolumeTransferKey(path: string): string | null {
  const normalized = normalizeWindowsPath(path);
  if (isPortablePath(normalized)) {
    const root = getPortableDeviceRoot(normalized);
    return root ? `portable:${root.slice(PORTABLE_PATH_PREFIX.length).toLowerCase()}` : null;
  }
  if (isUncPath(normalized)) {
    const parts = normalized.slice(2).split('\\').filter(Boolean);
    return parts.length >= 2 ? `unc:\\\\${parts[0].toLowerCase()}\\${parts[1].toLowerCase()}` : null;
  }
  const letter = getPathDriveLetter(normalized);
  return letter ? `drive:${letter.toLowerCase()}` : null;
}

/**
 * Resolves Explorer-compatible drop semantics:
 * - Ctrl held (without Shift): copy
 * - Shift held (without Ctrl): move
 * - Default: copy when dropping onto a portable device or across volumes/shares;
 *   move when every source item lives on the same drive/share as the destination.
 */
export function resolveExternalDropOperation(
  sourcePaths: string[],
  destinationPath: string,
  modifiers: { ctrlKey: boolean; shiftKey: boolean },
): FileDropOperation {
  if (sourcePaths.some(source => isPortableStagingCachePath(source))) return 'copy';
  if (modifiers.ctrlKey && !modifiers.shiftKey) return 'copy';
  if (modifiers.shiftKey && !modifiers.ctrlKey) return 'move';
  if (isPortablePath(destinationPath)) return 'copy';
  const destinationVolume = getVolumeTransferKey(destinationPath);
  if (
    sourcePaths.length > 0
    && destinationVolume
    && sourcePaths.every(source => getVolumeTransferKey(source) === destinationVolume)
  ) {
    return 'move';
  }
  return 'copy';
}

export function filterOutboundDraggablePaths(
  items: ReadonlyArray<{ path: string; isFolder?: boolean }>,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    let cleaned = item.path.trim().replace(/\//g, '\\');
    if (!cleaned) continue;
    if (/^\\\\\?\\UNC\\/i.test(cleaned)) {
      cleaned = `\\\\${cleaned.slice(8)}`;
    } else if (/^\\\\\?\\/.test(cleaned)) {
      cleaned = cleaned.slice(4);
    }
    const normalized = normalizeWindowsPath(cleaned);
    if (
      !normalized
      || normalized.startsWith('::')
      || normalized === '\\\\'
      || isUncServerRoot(normalized)
      || isPortableDeviceRoot(normalized)
      || isPortableStorageRoot(normalized)
      || normalized === PORTABLE_PATH_PREFIX
      || /^[a-zA-Z]:\\$/.test(normalized)
    ) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(normalized);
  }
  return candidates.filter((candidate, index) =>
    !candidates.some(
      (other, otherIndex) => otherIndex !== index && isSameOrDescendantPath(candidate, other),
    ),
  );
}

export function canDropExternalPathsOnDestination(
  sourcePaths: string[],
  destinationPath: string | null | undefined,
  operation: FileDropOperation,
): ExternalDropValidation {
  if (sourcePaths.length === 0) {
    return { allowed: false, reason: 'no-paths' };
  }
  if (!destinationPath || !destinationPath.trim()) {
    return { allowed: false, reason: 'invalid-destination' };
  }
  if (isPortableDeviceRoot(destinationPath)) {
    return { allowed: false, reason: 'portable-root' };
  }
  if (!isValidDropDestinationPath(destinationPath)) {
    return { allowed: false, reason: 'invalid-destination' };
  }
  if (sourcePaths.some(source => isSameOrDescendantPath(destinationPath, source))) {
    return { allowed: false, reason: 'self-or-descendant' };
  }
  if (operation === 'move') {
    const destinationKey = normalizeWindowsPath(destinationPath).toLowerCase();
    const allAlreadyInDestination = sourcePaths.every(source => {
      const parent = normalizeWindowsPath(getParentPath(source)).toLowerCase();
      return parent === destinationKey;
    });
    if (allAlreadyInDestination) {
      return { allowed: false, reason: 'same-folder' };
    }
  }
  return { allowed: true };
}

export function getExternalDragLeafName(path: string): string {
  const normalized = normalizeWindowsPath(path);
  const parts = normalized.split('\\').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}
