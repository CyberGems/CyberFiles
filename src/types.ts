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
  // If loaded via File System Access API
  handle?: FileSystemHandle;
}

export type SortField = 'name' | 'size' | 'type' | 'modifiedDate' | 'extension';
export type SortOrder = 'asc' | 'desc';
export type QuickAccessSortMode = 'manual' | 'name';

export type ViewLayout = 'dual-vertical' | 'dual-horizontal' | 'single';
export type ViewMode = 'details' | 'compact' | 'icons';

export const SYSTEM_HOME_PATH = '::cyberfiles-this-pc::';
export const RECYCLE_BIN_PATH = '::cyberfiles-recycle-bin::';

export interface TabState {
  id: string;
  title: string;
  currentPath: string;
  history: string[];
  historyIndex: number;
  filterQuery: string;
  selectedIds: string[];
  focusedId: string | null;
  sortField: SortField;
  sortOrder: SortOrder;
  viewMode: ViewMode;
  folderStyle?: {
    sortField: SortField;
    sortOrder: SortOrder;
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
}

export interface SearchMatch {
  file: FileItem;
  matchType: 'name' | 'path' | 'content' | 'extension';
  contentSnippet?: string;
  matchedLineNumber?: number;
}
