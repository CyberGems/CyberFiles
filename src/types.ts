export type FileType = 
  | 'folder'
  | 'image'
  | 'code'
  | 'text'
  | 'audio'
  | 'video'
  | 'archive'
  | 'document'
  | 'executable'
  | 'binary'
  | 'unknown';

export interface FileItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  type: FileType;
  size: number; // in bytes
  modifiedDate: string;
  createdDate?: string;
  modifiedAtMs?: number;
  createdAtMs?: number;
  extension: string;
  attributes?: string; // e.g. "R--A"
  isProtected?: boolean;
  contentPreview?: string;
  dimensions?: string;
  tags?: string[];
  colorLabel?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
  recycleBinId?: string;
  originalPath?: string;
  lastAccessed?: string; // ISO 8601 string or timestamp when last opened, moved, or renamed
  lastOpenedAtMs?: number; // When the file was opened or previewed; set on ::recent listings
  // If loaded via File System Access API
  handle?: FileSystemHandle;
}

export interface RecentItemStyle {
  enabled: boolean;
  textColor: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
}

export interface HiddenItemStyle {
  enabled: boolean;
  textColor: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
}

export type TabCloseButtonMode = 'hover' | 'always' | 'active';
export type TabWidthMode = 'automatic' | 'fixed';

export interface TabSizePreferences {
  horizontalMode: TabWidthMode;
  horizontalEqualWidth: boolean;
  horizontalFixedWidth: number;
  horizontalMinWidth: number;
  horizontalMaxWidth: number;
  horizontalShrinkToFit: boolean;
  dragHoverActivationEnabled: boolean;
  dragHoverActivationDelay: number;
  verticalMode: TabWidthMode;
  verticalWidth: number;
}

export interface DraggedFileItem {
  id: string;
  path: string;
  isFolder: boolean;
}

export type FileDropOperation = 'copy' | 'move';

export type NewTabActionMode = 'current-folder' | 'duplicate' | 'default-folder' | 'home-folder' | 'empty-tab' | 'location';
export type NewTabTrigger = 'button' | 'double-click';

export interface NewTabActionPreference {
  mode: NewTabActionMode;
  path: string;
}

export type SortField = 'name' | 'size' | 'type' | 'createdDate' | 'modifiedDate' | 'extension' | 'lastOpened';
export type GroupByField = 'none' | 'name' | 'modifiedDate' | 'type' | 'size';
export type SortOrder = 'asc' | 'desc';
export type QuickAccessSortMode = 'manual' | 'name' | 'name-desc';
export type ArchiveExtractionMode = 'here' | 'folder';

export type ViewLayout = 'dual-vertical' | 'dual-horizontal' | 'single';
export type ViewMode = 'details' | 'compact' | 'icons' | 'tiles';
export type IconZoomLevel = 'small' | 'medium' | 'large' | 'xlarge';

/* Geometry of the icons (grid) view per zoom level: minimum cell width for the column math,
   the virtualized row stride (cell height plus the 12px gap), and the tailwind cell/preview
   classes the cards render with. The medium row reproduces the original fixed-size grid. */
export const ICON_ZOOM_PRESETS: Record<IconZoomLevel, { minWidth: number; rowStride: number; cellHeight: string; thumbHeight: string }> = {
  small: { minWidth: 112, rowStride: 124, cellHeight: 'h-28', thumbHeight: 'h-12' },
  medium: { minWidth: 140, rowStride: 156, cellHeight: 'h-36', thumbHeight: 'h-20' },
  large: { minWidth: 184, rowStride: 204, cellHeight: 'h-48', thumbHeight: 'h-32' },
  xlarge: { minWidth: 240, rowStride: 268, cellHeight: 'h-64', thumbHeight: 'h-48' },
};

/* Geometry of the tiles view per zoom level: the horizontal cards scale their preview square
   and row height with the same four levels the grid uses. folderScale and fileScale are the
   vector glyph multipliers for cards that have no preview to show. */
export const TILE_ZOOM_PRESETS: Record<IconZoomLevel, { minWidth: number; rowStride: number; cellHeight: string; previewWidth: string; previewHeight: string; folderScale: number; fileScale: number }> = {
  small: { minWidth: 200, rowStride: 92, cellHeight: 'h-20', previewWidth: 'w-16', previewHeight: 'h-12', folderScale: 2, fileScale: 1.5 },
  medium: { minWidth: 248, rowStride: 124, cellHeight: 'h-28', previewWidth: 'w-24', previewHeight: 'h-20', folderScale: 3.5, fileScale: 2 },
  large: { minWidth: 300, rowStride: 156, cellHeight: 'h-36', previewWidth: 'w-36', previewHeight: 'h-28', folderScale: 5, fileScale: 3 },
  xlarge: { minWidth: 356, rowStride: 188, cellHeight: 'h-44', previewWidth: 'w-48', previewHeight: 'h-36', folderScale: 6.5, fileScale: 3.5 },
};

export const SYSTEM_HOME_PATH = '::cyberfiles-this-pc::';
export const RECYCLE_BIN_PATH = '::cyberfiles-recycle-bin::';
export const RECENT_PATH = '::cyberfiles-recent::';
export const NETWORK_PATH = '::cyberfiles-network::';

/* Special locations that paint one dedicated layout instead of the file lister.
   View modes, zoom and the compact sizing rules have nothing to act on there,
   so every surface hides them. Keep this the single source of truth: another
   virtual location that grows a fixed layout only has to be added here. */
export const isDedicatedLayoutPath = (path?: string | null): boolean => path === SYSTEM_HOME_PATH;

export interface NetworkResource {
  id: string;
  name: string;
  path: string;
  kind: 'host' | 'share' | 'mapped-drive' | 'shortcut';
  comment?: string;
  driveLetter?: string;
}

export interface TabState {
  id: string;
  title: string;
  customTitle?: string;
  tabColor?: string;
  lockClose?: boolean;
  currentPath: string;
  history: string[];
  historyIndex: number;
  filterQuery: string;
  flatView?: boolean;
  selectedIds: string[];
  focusedId: string | null;
  sortField: SortField;
  sortOrder: SortOrder;
  groupBy?: GroupByField;
  viewMode: ViewMode;
  folderStyle?: {
    sortField: SortField;
    sortOrder: SortOrder;
    groupBy?: GroupByField;
    viewMode: ViewMode;
    iconZoom?: IconZoomLevel;
  };
  folderStyleOnEntry?: {
    sortField: SortField;
    sortOrder: SortOrder;
    groupBy: GroupByField;
    viewMode: ViewMode;
  };
}

export interface DriveInfo {
  id: string;
  letter: string;
  label: string;
  totalBytes: number;
  usedBytes: number;
  type: 'fixed' | 'removable' | 'network' | 'optical' | 'unknown';
}

export interface QuickAccessItem {
  id: string;
  name: string;
  path: string;
  icon: string;
  count?: number;
  isCustom?: boolean;
}

export interface BatchRenameRule {
  mode: 'replace' | 'prefix_suffix' | 'numbering' | 'case';
  findText: string;
  replaceText: string;
  useRegex: boolean;
  prefix: string;
  suffix: string;
  startNumber: number;
  numberStep: number;
  paddingDigits: number;
  caseType: 'lowercase' | 'uppercase' | 'titlecase' | 'kebab' | 'camel';
  applyToExtension: boolean;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
  targetItem: FileItem | null;
  paneId: 'left' | 'right';
  /* True when the menu was opened with the keyboard (Shift+F10 / Menu key),
     which produces a contextmenu event with detail 0 and button 0. The menu
     then moves focus to its first row instead of waiting for an arrow key. */
  openedViaKeyboard?: boolean;
}

export interface SearchMatch {
  file: FileItem;
  matchType: 'name' | 'path' | 'content' | 'extension';
  contentSnippet?: string;
  matchedLineNumber?: number;
}
