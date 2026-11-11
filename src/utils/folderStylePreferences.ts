import type { GroupByField, IconZoomLevel, SortField, SortOrder, ViewMode } from '../types';
import { isMediaPreviewPath, normalizeWindowsPath } from './fileSystem';

export interface FolderStylePreference {
  viewMode: ViewMode;
  sortField: SortField;
  sortOrder: SortOrder;
  groupBy: GroupByField;
  /* Preview cell size for the icons (grid) view. Absent means the medium default. */
  iconZoom?: IconZoomLevel;
}

export type SavedFolderStyles = Record<string, FolderStylePreference & { displayPath?: string }>;

const STORAGE_KEY = 'cyberfiles_saved_folder_styles_v1';
const SORT_FIELDS: SortField[] = ['name', 'size', 'type', 'createdDate', 'modifiedDate', 'extension'];
const GROUP_FIELDS: GroupByField[] = ['none', 'name', 'modifiedDate', 'type', 'size'];

export function folderStylePathKey(path: string): string {
  return normalizeWindowsPath(path).replace(/[\\/]+$/, '').toLowerCase();
}

export function savedFolderStyleForPath(path: string, savedStyles: SavedFolderStyles): FolderStylePreference | undefined {
  const saved = savedStyles[folderStylePathKey(path)];
  if (!saved) return undefined;
  return {
    viewMode: saved.viewMode,
    sortField: saved.sortField,
    sortOrder: saved.sortOrder,
    groupBy: saved.groupBy,
    ...(saved.iconZoom ? { iconZoom: saved.iconZoom } : {}),
  };
}

export function resolveFolderStyle(path: string, inherited: FolderStylePreference, savedStyles: SavedFolderStyles): FolderStylePreference {
  return savedFolderStyleForPath(path, savedStyles) ?? {
    ...inherited,
    viewMode: isMediaPreviewPath(path) ? 'icons' : inherited.viewMode,
  };
}

export function folderStyleToCarry(
  path: string,
  current: FolderStylePreference,
  styleOnEntry: FolderStylePreference | undefined,
  locked: boolean,
  savedStyles: SavedFolderStyles,
  defaultStyle: FolderStylePreference,
): FolderStylePreference {
  if (!locked) return defaultStyle;
  return savedStyles[folderStylePathKey(path)] ? styleOnEntry ?? defaultStyle : current;
}

function isFolderStylePreference(value: unknown): value is FolderStylePreference {
  if (!value || typeof value !== 'object') return false;
  const style = value as Partial<FolderStylePreference>;
  const iconZoomIsValid = style.iconZoom === undefined
    || style.iconZoom === 'small'
    || style.iconZoom === 'medium'
    || style.iconZoom === 'large'
    || style.iconZoom === 'xlarge';
  return (style.viewMode === 'details' || style.viewMode === 'compact' || style.viewMode === 'icons' || style.viewMode === 'tiles')
    && SORT_FIELDS.includes(style.sortField as SortField)
    && (style.sortOrder === 'asc' || style.sortOrder === 'desc')
    && GROUP_FIELDS.includes(style.groupBy as GroupByField)
    && iconZoomIsValid;
}

export function readSavedFolderStyles(): SavedFolderStyles {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const styles: SavedFolderStyles = {};
    for (const [path, style] of Object.entries(raw)) {
      if (path && path.length <= 32767 && !path.startsWith('::') && isFolderStylePreference(style)) {
        const savedStyle = style as FolderStylePreference & { displayPath?: unknown };
        const displayPath = typeof savedStyle.displayPath === 'string' && folderStylePathKey(savedStyle.displayPath) === folderStylePathKey(path)
          ? normalizeWindowsPath(savedStyle.displayPath)
          : undefined;
        styles[folderStylePathKey(path)] = {
          viewMode: style.viewMode,
          sortField: style.sortField,
          sortOrder: style.sortOrder,
          groupBy: style.groupBy,
          ...(style.iconZoom ? { iconZoom: style.iconZoom } : {}),
          ...(displayPath ? { displayPath } : {}),
        };
      }
    }
    return styles;
  } catch {
    return {};
  }
}

export function writeSavedFolderStyles(styles: SavedFolderStyles): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
}
