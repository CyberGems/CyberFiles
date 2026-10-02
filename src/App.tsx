import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { 
  FileItem, 
  TabState, 
  ViewLayout, 
  ViewMode, 
  SortField,
  SortOrder,
  RECYCLE_BIN_PATH,
  SYSTEM_HOME_PATH,
  ContextMenuPosition, 
  DriveInfo, 
  QuickAccessItem,
  QuickAccessSortMode,
  HiddenItemStyle,
  NavigationTransitionStyle,
  RecentItemStyle,
  GroupByField,
  ArchiveExtractionMode,
} from './types';
import {
  getChildItems, 
  getParentPath, 
  sortFiles, 
  detectFileType, 
  getFileExtension,
  formatFileSize,
  getRootItems,
  getItemsInTree,
  getUniqueName,
  isSameOrDescendantPath,
  isTextPreviewableFile,
  isMediaPreviewPath,
  isWindowsDriveRoot,
  isValidFileName,
  joinWindowsPath,
  rewritePathPrefix,
  normalizeWindowsPath,
} from './utils/fileSystem';
import { HeaderBar } from './components/HeaderBar';
import type { CommandPaletteCommand } from './components/CommandPalette';
import { WindowTitleBar } from './components/WindowTitleBar';
import { Sidebar } from './components/Sidebar';
import { PaneSplitter } from './components/PaneSplitter';
import { PreviewPane } from './components/PreviewPane';
import { BottomStatusBar } from './components/BottomStatusBar';
import { ContextMenu } from './components/ContextMenu';
import { TabContextMenu, type TabMenuAction } from './components/TabContextMenu';
import { TabStripContextMenu, type TabStripMenuAction } from './components/TabStripContextMenu';
import { CreateItemModal, type NewItemKind } from './components/CreateItemModal';
import { CreateZipModal } from './components/CreateZipModal';
import { TextInputContextMenu } from './components/TextInputContextMenu';
import { TooltipPreferenceContext } from './components/Tooltip';
import { WorkspaceManagerModal } from './components/WorkspaceManagerModal';
import { UnsavedWorkspaceChangesModal, type WorkspaceChangesSaveNames } from './components/UnsavedWorkspaceChangesModal';
import { FileOperationModal, type TransferOperationView, type TransferKind } from './components/FileOperationModal';
import type { UndoHistoryItem } from './components/UndoHistoryMenu';


import { useLanguage } from './locales/LanguageContext';
import { readPaneColumnPreferences, writePaneColumnPreferences } from './utils/fileColumnPreferences';
import {
  createProfileId,
  DEFAULT_LAYOUT_PROFILE_ID,
  DEFAULT_LAYOUT_SNAPSHOT,
  DEFAULT_SESSION_PROFILE_ID,
  defaultSessionSnapshot,
  normalizeLayoutSnapshot,
  normalizeSessionSnapshot,
  readWorkspaceProfileStore,
  WORKSPACE_PROFILES_STORAGE_KEY,
  writeWorkspaceProfileStore,
  type LayoutProfile,
  type LayoutSnapshot,
  type PaneColumnsSnapshot,
  type StartupBehavior,
  type TabStripPosition,
  type TabSessionProfile,
  type TabSessionSnapshot,
  type WorkspacePaneId,
  type WorkspaceProfile,
  type WorkspaceProfileStore,
} from './utils/workspaceProfiles';
import { chooseNativeFile, chooseNativeFolder, clearNativeFileClipboard, cancelNativeTransferOperation, createNativeDirectory, createNativeTextFile, createNativeShortcut, editWindowsHostsFile, emptyNativeRecycleBin, getNativeFileClipboard, getWindowsSpecialFolders, openFolderInWindowsExplorer, openWindowsTerminalHere, pasteNativeClipboardImage, getNativeRecycleBinStatus, isTauriDesktop, listNativeDirectory, listNativeFlatDirectory, listNativeDrives, listNativeRecycleBin, listNativeSystemLocations, loadNativeFolder, loadNativeTextPreview, moveNativeItemsToRecycleBin, permanentlyDeleteNativeItems, openNativeFileWithDefaultApp, renameNativeItem, restoreNativeRecycleBinItems, setNativeFileClipboard, setNativeTrayLanguage, showNativeFileProperties, startNativeTransferOperation, startNativeArchiveExtractionOperation, startNativeZipCompressionOperation, pauseNativeTransferOperation, resumeNativeTransferOperation, type NativeDirectoryCounts, type NativeTransferProgress, type NativeTransferFinished, type NativeLocation, type RecycleBinStatus, type WindowsSpecialFolder, type WindowsTerminalOption } from './utils/nativeFileSystem';
import { formatLocalDateTime, type DateFormatMode } from './utils/dateTime';

const AboutModal = lazy(() => import('./components/AboutModal').then(module => ({ default: module.AboutModal })));
const FindFilesModal = lazy(() => import('./components/FindFilesModal').then(module => ({ default: module.FindFilesModal })));
const BatchRenameModal = lazy(() => import('./components/BatchRenameModal').then(module => ({ default: module.BatchRenameModal })));
const KeyboardShortcutsModal = lazy(() => import('./components/KeyboardShortcutsModal').then(module => ({ default: module.KeyboardShortcutsModal })));
const CommandPalette = lazy(() => import('./components/CommandPalette').then(module => ({ default: module.CommandPalette })));
const ConfirmActionModal = lazy(() => import('./components/ConfirmActionModal').then(module => ({ default: module.ConfirmActionModal })));
const CloseWindowModal = lazy(() => import('./components/CloseWindowModal').then(module => ({ default: module.CloseWindowModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));
const OnboardingWelcome = lazy(() => import('./components/OnboardingWelcome').then(module => ({ default: module.OnboardingWelcome })));
const FilePane = lazy(() => import('./components/FilePane').then(module => ({ default: module.FilePane })));
const ONBOARDING_STORAGE_KEY = 'cyberfiles_onboarding_complete';
const CLOSE_BEHAVIOR_STORAGE_KEY = 'cyberfiles_close_behavior';
const PANEL_VIEW_PREFERENCES_KEY = 'cyberfiles_panel_view_preferences_v1';
const EMPTY_AREA_DOUBLE_CLICK_KEY = 'cyberfiles_empty_area_double_click_navigate_up';
const MOUSE_GESTURES_ENABLED_KEY = 'cyberfiles_mouse_gestures_enabled_v1';
const FOLDER_STYLE_LOCKED_KEY = 'cyberfiles_folder_style_locked';
const SIDEBAR_LOCATIONS_NEW_TAB_KEY = 'cyberfiles_sidebar_locations_open_in_new_tab_v1';
const NEW_TABS_NEXT_TO_CURRENT_KEY = 'cyberfiles_new_tabs_next_to_current_v1';
const SHOW_NEW_TAB_BUTTON_KEY = 'cyberfiles_show_new_tab_button_v1';
const DOUBLE_CLICK_TAB_BAR_KEY = 'cyberfiles_double_click_tab_bar_v2';
const RECENT_ITEMS_BOLD_KEY = 'cyberfiles_bold_recent_items_v1';
const RECENT_ITEMS_STYLE_KEY = 'cyberfiles_recent_items_style_v1';
const HIDDEN_ITEMS_STYLE_KEY = 'cyberfiles_hidden_items_style_v1';
const IMAGE_TOOLTIP_THUMBNAILS_KEY = 'cyberfiles_image_tooltip_thumbnails_v1';
const NOTIFICATION_BANNERS_KEY = 'cyberfiles_notification_banners_v1';
const TOOLTIPS_ENABLED_KEY = 'cyberfiles_tooltips_enabled_v1';
const NAVIGATION_TRANSITIONS_ENABLED_KEY = 'cyberfiles_navigation_transitions_enabled_v1';
const NAVIGATION_TRANSITION_STYLE_KEY = 'cyberfiles_navigation_transition_style_v1';
const RELATIVE_GRAPHS_ENABLED_KEY = 'cyberfiles_relative_graphs_enabled_v1';
const DATE_FORMAT_KEY = 'cyberfiles_date_format_v1';
const DATE_FORMAT_SYSTEM_DEFAULT_MIGRATION_KEY = 'cyberfiles_date_format_system_default_migrated_v1';
const SHOW_HIDDEN_FILES_KEY = 'cyberfiles_show_hidden_files_v1';
const SHOW_FILE_EXTENSIONS_KEY = 'cyberfiles_show_file_extensions_v1';
const LAST_TERMINAL_OPTION_KEY = 'cyberfiles_last_terminal_option_v1';
const STARTUP_BEHAVIOR_KEY = 'cyberfiles_startup_behavior_v1';
const STARTUP_SESSION_KEY = 'cyberfiles_startup_session_v1';
const SINGLE_CLICK_OPEN_KEY = 'cyberfiles_single_click_open_v1';
const CUSTOM_QUICK_ACCESS_KEY = 'cyberfiles_custom_quick_access_v1';
const QUICK_ACCESS_ORDER_KEY = 'cyberfiles_quick_access_order_v1';
const QUICK_ACCESS_SORT_MODE_KEY = 'cyberfiles_quick_access_sort_mode_v1';
const RECENT_FOLDER_PATHS_KEY = 'cyberfiles_recent_folder_paths_v1';
const AUTO_FOLDER_SIZE_ENABLED_KEY = 'cyberfiles_auto_folder_size_enabled_v1';
const MAX_CUSTOM_QUICK_ACCESS_ITEMS = 100;
const MAX_TEXT_PREVIEW_BYTES = 200_000;
const TOAST_DURATION_MS = 3200;
const DEFAULT_GLOBAL_SHORTCUT = 'Alt+Shift+F';
const DEFAULT_FOLDER_STYLE = { viewMode: 'details' as ViewMode, sortField: 'name' as SortField, sortOrder: 'asc' as SortOrder, groupBy: 'none' as GroupByField };
const DEFAULT_RECENT_ITEM_STYLE: RecentItemStyle = {
  enabled: true,
  textColor: 'auto',
  backgroundEnabled: false,
  backgroundColor: '#92400e',
  bold: true,
  italic: false,
};
const DEFAULT_HIDDEN_ITEM_STYLE: HiddenItemStyle = {
  enabled: true,
  textColor: 'auto',
  backgroundEnabled: false,
  backgroundColor: '#881337',
  bold: false,
  italic: true,
};

interface PanelViewPreferences {
  layout: ViewLayout;
  tabStripPosition: TabStripPosition;
  previewOpen: boolean;
  activePane: 'left' | 'right';
  leftViewMode: ViewMode;
  rightViewMode: ViewMode;
  leftSortField: SortField;
  leftSortOrder: SortOrder;
  rightSortField: SortField;
  rightSortOrder: SortOrder;
  verticalSplitPercent: number;
  horizontalSplitPercent: number;
  previewSplitPercent: number;
  sidebarSplitPercent: number;
}

interface GlobalShortcutSettingsState {
  enabled: boolean;
  shortcut: string;
  registered: boolean;
}

interface InstancePreferencesState {
  allowMultipleInstances: boolean;
  supported: boolean;
}

type PendingWorkspaceAction =
  | { type: 'quit'; remember: boolean }
  | { type: 'layout'; id: string }
  | { type: 'session'; id: string }
  | { type: 'workspace'; id: string };

type UndoDescriptor =
  | { type: 'rename'; pairs: Array<{ before: string; after: string }> }
  | { type: 'remove'; paths: string[] }
  | { type: 'restore'; items: Array<{ id: string; originalPath: string }> }
  | { type: 'move'; pairs: Array<{ from: string; to: string }> }
  | { type: 'remove-virtual'; paths: string[] };

interface UndoRecord extends UndoHistoryItem {
  undo: UndoDescriptor | null;
}

const DEFAULT_PANEL_VIEW_PREFERENCES: PanelViewPreferences = {
  layout: 'dual-vertical',
  tabStripPosition: 'top',
  previewOpen: true,
  activePane: 'left',
  leftViewMode: 'details',
  rightViewMode: 'details',
  leftSortField: 'name',
  leftSortOrder: 'asc',
  rightSortField: 'name',
  rightSortOrder: 'asc',
  verticalSplitPercent: 50,
  horizontalSplitPercent: 50,
  previewSplitPercent: 72,
  sidebarSplitPercent: 22,
};

function initialWorkspaceProfileStore(): WorkspaceProfileStore {
  const store = readWorkspaceProfileStore();
  try {
    if (window.localStorage.getItem(WORKSPACE_PROFILES_STORAGE_KEY) !== null) return store;
    const legacy = readPanelViewPreferences();
    let needsWrite = false;
    const snapshot: LayoutSnapshot = {
      layout: legacy.layout,
      tabStripPosition: legacy.tabStripPosition,
      previewOpen: legacy.previewOpen,
      verticalSplitPercent: legacy.verticalSplitPercent,
      horizontalSplitPercent: legacy.horizontalSplitPercent,
      previewSplitPercent: legacy.previewSplitPercent,
      sidebarSplitPercent: legacy.sidebarSplitPercent,
      columns: { left: readPaneColumnPreferences('left'), right: readPaneColumnPreferences('right') },
    };
    if (JSON.stringify(snapshot) !== JSON.stringify(DEFAULT_LAYOUT_SNAPSHOT)) {
      const migrated: LayoutProfile = {
        id: createProfileId('layout'),
        name: 'Diseño anterior',
        snapshot,
        updatedAt: Date.now(),
      };
      store.layouts = [...store.layouts, migrated];
      store.lastLayoutId = migrated.id;
      needsWrite = true;
    }
    const priorSession = defaultSessionSnapshot(SYSTEM_HOME_PATH, SYSTEM_HOME_PATH);
    priorSession.activePane = legacy.activePane;
    if (readFolderStyleLockPreference()) {
      const leftTab = priorSession.leftTabs[0];
      leftTab.viewMode = legacy.leftViewMode;
      leftTab.sortField = legacy.leftSortField;
      leftTab.sortOrder = legacy.leftSortOrder;
      leftTab.folderStyle = { viewMode: legacy.leftViewMode, sortField: legacy.leftSortField, sortOrder: legacy.leftSortOrder };
      const rightTab = priorSession.rightTabs[0];
      rightTab.viewMode = legacy.rightViewMode;
      rightTab.sortField = legacy.rightSortField;
      rightTab.sortOrder = legacy.rightSortOrder;
      rightTab.folderStyle = { viewMode: legacy.rightViewMode, sortField: legacy.rightSortField, sortOrder: legacy.rightSortOrder };
    }
    const defaultSession = defaultSessionSnapshot(SYSTEM_HOME_PATH, SYSTEM_HOME_PATH);
    if (JSON.stringify(priorSession) !== JSON.stringify(defaultSession)) {
      const migrated: TabSessionProfile = {
        id: createProfileId('session'),
        name: 'Sesión anterior',
        snapshot: priorSession,
        updatedAt: Date.now(),
      };
      store.sessions = [...store.sessions, migrated];
      store.lastSessionId = migrated.id;
      needsWrite = true;
    }
    if (needsWrite) writeWorkspaceProfileStore(store);
    return store;
  } catch {
    return store;
  }
}

function isViewMode(value: unknown): value is ViewMode {
  return value === 'details' || value === 'compact' || value === 'icons';
}

function isSortField(value: unknown): value is SortField {
  return value === 'name' || value === 'size' || value === 'type' || value === 'createdDate' || value === 'modifiedDate' || value === 'extension';
}

function readPaneSplitPercent(value: unknown, defaultValue = 50, minPercent = 20, maxPercent = 80) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue;
  return Math.max(minPercent, Math.min(maxPercent, value));
}

function readPanelViewPreferences(): PanelViewPreferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PANEL_VIEW_PREFERENCES_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_PANEL_VIEW_PREFERENCES;
    return {
      layout: saved.layout === 'dual-horizontal' || saved.layout === 'single' ? saved.layout : 'dual-vertical',
      tabStripPosition: saved.tabStripPosition === 'bottom' || saved.tabStripPosition === 'left' || saved.tabStripPosition === 'right' ? saved.tabStripPosition : 'top',
      previewOpen: typeof saved.previewOpen === 'boolean' ? saved.previewOpen : true,
      activePane: saved.activePane === 'right' ? 'right' : 'left',
      leftViewMode: isViewMode(saved.leftViewMode) ? saved.leftViewMode : 'details',
      rightViewMode: isViewMode(saved.rightViewMode) ? saved.rightViewMode : 'details',
      leftSortField: isSortField(saved.leftSortField) ? saved.leftSortField : 'name',
      leftSortOrder: saved.leftSortOrder === 'desc' ? 'desc' : 'asc',
      rightSortField: isSortField(saved.rightSortField) ? saved.rightSortField : 'name',
      rightSortOrder: saved.rightSortOrder === 'desc' ? 'desc' : 'asc',
      verticalSplitPercent: readPaneSplitPercent(saved.verticalSplitPercent),
      horizontalSplitPercent: readPaneSplitPercent(saved.horizontalSplitPercent),
      previewSplitPercent: readPaneSplitPercent(saved.previewSplitPercent, 72),
      sidebarSplitPercent: readPaneSplitPercent(saved.sidebarSplitPercent, 22, 20, 42),
    };
  } catch {
    return DEFAULT_PANEL_VIEW_PREFERENCES;
  }
}

function readEmptyAreaDoubleClickPreference(): boolean {
  try {
    return window.localStorage.getItem(EMPTY_AREA_DOUBLE_CLICK_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readFolderStyleLockPreference(): boolean {
  try {
    return window.localStorage.getItem(FOLDER_STYLE_LOCKED_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readBooleanPreference(key: string, defaultValue: boolean): boolean {
  try {
    const saved = window.localStorage.getItem(key);
    return saved === null ? defaultValue : saved === 'true';
  } catch {
    return defaultValue;
  }
}

function readDateFormatPreference(): DateFormatMode {
  try {
    const storage = window.localStorage;
    const saved = storage.getItem(DATE_FORMAT_KEY);
    if (storage.getItem(DATE_FORMAT_SYSTEM_DEFAULT_MIGRATION_KEY) !== 'true') {
      if (saved === 'universal') storage.setItem(DATE_FORMAT_KEY, 'system');
      storage.setItem(DATE_FORMAT_SYSTEM_DEFAULT_MIGRATION_KEY, 'true');
      return saved === 'application' ? 'application' : 'system';
    }
    return saved === 'application' || saved === 'system' || saved === 'universal' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function readNavigationTransitionStyle(): NavigationTransitionStyle {
  try {
    const saved = window.localStorage.getItem(NAVIGATION_TRANSITION_STYLE_KEY);
    return saved === 'dynamic' || saved === 'fade' ? saved : 'subtle';
  } catch {
    return 'subtle';
  }
}

function readLastTerminalOption(): WindowsTerminalOption {
  try {
    const saved = window.localStorage.getItem(LAST_TERMINAL_OPTION_KEY);
    return saved === 'cmd-admin' || saved === 'powershell' || saved === 'powershell-admin' ? saved : 'cmd';
  } catch {
    return 'cmd';
  }
}

function readStartupBehavior(): StartupBehavior {
  try {
    const saved = window.localStorage.getItem(STARTUP_BEHAVIOR_KEY);
    return saved === 'home' || saved === 'session' ? saved : 'continue';
  } catch {
    return 'continue';
  }
}

function readStartupSessionId(): string {
  try {
    const saved = window.localStorage.getItem(STARTUP_SESSION_KEY);
    return saved && saved.length <= 180 ? saved : DEFAULT_SESSION_PROFILE_ID;
  } catch {
    return DEFAULT_SESSION_PROFILE_ID;
  }
}

function readRecentItemStyle(): RecentItemStyle {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENT_ITEMS_STYLE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') {
      return { ...DEFAULT_RECENT_ITEM_STYLE, enabled: readBooleanPreference(RECENT_ITEMS_BOLD_KEY, true) };
    }
    const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : readBooleanPreference(RECENT_ITEMS_BOLD_KEY, true),
      textColor: saved.textColor === 'auto' || !isColor(saved.textColor) || saved.textColor.toLowerCase() === '#fef3c7'
        ? 'auto'
        : saved.textColor,
      backgroundEnabled: typeof saved.backgroundEnabled === 'boolean' ? saved.backgroundEnabled : DEFAULT_RECENT_ITEM_STYLE.backgroundEnabled,
      backgroundColor: isColor(saved.backgroundColor) ? saved.backgroundColor : DEFAULT_RECENT_ITEM_STYLE.backgroundColor,
      bold: typeof saved.bold === 'boolean' ? saved.bold : DEFAULT_RECENT_ITEM_STYLE.bold,
      italic: typeof saved.italic === 'boolean' ? saved.italic : DEFAULT_RECENT_ITEM_STYLE.italic,
    };
  } catch {
    return { ...DEFAULT_RECENT_ITEM_STYLE, enabled: readBooleanPreference(RECENT_ITEMS_BOLD_KEY, true) };
  }
}

function readHiddenItemStyle(): HiddenItemStyle {
  try {
    const saved = JSON.parse(window.localStorage.getItem(HIDDEN_ITEMS_STYLE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_HIDDEN_ITEM_STYLE };
    const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_HIDDEN_ITEM_STYLE.enabled,
      textColor: saved.textColor === 'auto' || !isColor(saved.textColor) ? 'auto' : saved.textColor,
      backgroundEnabled: typeof saved.backgroundEnabled === 'boolean' ? saved.backgroundEnabled : DEFAULT_HIDDEN_ITEM_STYLE.backgroundEnabled,
      backgroundColor: isColor(saved.backgroundColor) ? saved.backgroundColor : DEFAULT_HIDDEN_ITEM_STYLE.backgroundColor,
      bold: typeof saved.bold === 'boolean' ? saved.bold : DEFAULT_HIDDEN_ITEM_STYLE.bold,
      italic: typeof saved.italic === 'boolean' ? saved.italic : DEFAULT_HIDDEN_ITEM_STYLE.italic,
    };
  } catch {
    return { ...DEFAULT_HIDDEN_ITEM_STYLE };
  }
}

function useKeepModalMountedAfterFirstOpen(isOpen: boolean) {
  const [hasOpened, setHasOpened] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);
  return hasOpened;
}

function readCustomQuickAccess(): QuickAccessItem[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(CUSTOM_QUICK_ACCESS_KEY) || 'null');
    if (!Array.isArray(saved)) return [];

    const items: QuickAccessItem[] = [];
    const seenPaths = new Set<string>();
    const seenIds = new Set<string>();
    for (const value of saved.slice(0, MAX_CUSTOM_QUICK_ACCESS_ITEMS)) {
      if (!value || typeof value !== 'object') continue;
      const candidate = value as Partial<QuickAccessItem>;
      const path = typeof candidate.path === 'string' ? normalizeWindowsPath(candidate.path.trim()) : '';
      const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 80) : '';
      if (!path || path.length > 32767 || !name) continue;
      const pathKey = getPathKey(path);
      if (seenPaths.has(pathKey)) continue;
      const baseId = typeof candidate.id === 'string' && candidate.id
        ? candidate.id.slice(0, 180)
        : `custom-quick-access-${encodeURIComponent(pathKey)}`;
      let id = baseId;
      let suffix = 1;
      while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
      seenPaths.add(pathKey);
      seenIds.add(id);
      items.push({ id, name, path, icon: 'folder', isCustom: true });
    }
    return items;
  } catch {
    return [];
  }
}

function readQuickAccessSortMode(): QuickAccessSortMode {
  try {
    const mode = window.localStorage.getItem(QUICK_ACCESS_SORT_MODE_KEY);
    return mode === 'name' || mode === 'name-desc' ? mode : 'manual';
  } catch {
    return 'manual';
  }
}

function readQuickAccessOrder(): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(QUICK_ACCESS_ORDER_KEY) || 'null');
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.filter((value): value is string => typeof value === 'string' && value.length <= 180))].slice(0, 300);
  } catch {
    return [];
  }
}
type FolderStyle = { viewMode: ViewMode; sortField: SortField; sortOrder: SortOrder; groupBy: GroupByField };

function styleForPath(path: string, style: FolderStyle) {
  return { ...style, viewMode: isMediaPreviewPath(path) ? 'icons' as ViewMode : style.viewMode };
}

function readRecentFolderPaths(): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(RECENT_FOLDER_PATHS_KEY) || 'null');
    if (!Array.isArray(saved)) return [];
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const value of saved) {
      if (typeof value !== 'string') continue;
      const path = normalizeWindowsPath(value.trim());
      if (!path || path.length > 32767 || path === SYSTEM_HOME_PATH || path === RECYCLE_BIN_PATH || path.startsWith('::')) continue;
      const key = getPathKey(path);
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(path);
      if (paths.length === 10) break;
    }
    return paths;
  } catch {
    return [];
  }
}

function getTabFolderStyle(tab: TabState): FolderStyle {
  return {
    viewMode: tab.folderStyle?.viewMode ?? tab.viewMode,
    sortField: tab.folderStyle?.sortField ?? tab.sortField,
    sortOrder: tab.folderStyle?.sortOrder ?? tab.sortOrder,
    groupBy: tab.folderStyle?.groupBy ?? tab.groupBy ?? 'none',
  };
}

function setTabViewMode(tab: TabState, viewMode: ViewMode): TabState {
  return { ...tab, viewMode, folderStyle: { ...getTabFolderStyle(tab), viewMode } };
}

function toggleTabSort(tab: TabState, sortField: SortField): TabState {
  const sortOrder = tab.sortField === sortField && tab.sortOrder === 'asc' ? 'desc' : 'asc';
  return { ...tab, sortField, sortOrder, folderStyle: { ...getTabFolderStyle(tab), sortField, sortOrder } };
}

interface NativeDirectoryState {
  nextOffset: number;
  hasMore: boolean;
  loading: boolean;
  counts?: NativeDirectoryCounts;
}

interface FlatDirectoryState extends NativeDirectoryState {
  entries?: FileItem[];
  skippedCount?: number;
  error?: string;
}

function knownDirectoryCounts(tab: TabState, directory: NativeDirectoryState | undefined, showHiddenFiles: boolean) {
  if (tab.filterQuery.trim() || !directory?.counts) return null;
  const counts = directory.counts;
  const fileCount = showHiddenFiles ? counts.fileCount : counts.visibleFileCount;
  const folderCount = showHiddenFiles ? counts.folderCount : counts.visibleFolderCount;
  return { fileCount, folderCount, totalCount: fileCount + folderCount };
}

const MAX_TAB_HISTORY_ENTRIES = 200;

const getPathKey = (path: string) => normalizeWindowsPath(path).replace(/[\\/]+$/, '').toLowerCase();
const createOperationId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

async function findRecentRecycleBinItems(paths: string[], startedAtMs: number, previousIds: Set<string> | null): Promise<FileItem[]> {
  if (!previousIds) return [];
  const wanted = new Set(paths.map(getPathKey));
  const newestByPath = new Map<string, FileItem>();
  // Recycle Bin paging re-enumerates earlier Shell entries, so keep this lookup bounded.
  const page = await listNativeRecycleBin(0);
  for (const item of page.entries) {
    const originalPath = item.originalPath ?? item.path;
    const key = getPathKey(originalPath);
    if (!item.recycleBinId || previousIds.has(item.recycleBinId) || !wanted.has(key) || (item.modifiedAtMs ?? 0) < startedAtMs - 2_000) continue;
    const previous = newestByPath.get(key);
    if (!previous || (item.modifiedAtMs ?? 0) > (previous.modifiedAtMs ?? 0)) newestByPath.set(key, item);
  }
  return [...newestByPath.values()];
}

const createEmptyTab = (
  id: string,
  viewMode: ViewMode = 'details',
  sortField: SortField = 'name',
  sortOrder: SortOrder = 'asc',
): TabState => ({
  id,
  title: '',
  currentPath: '',
  history: [],
  historyIndex: -1,
  filterQuery: '',
  flatView: false,
  selectedIds: [],
  focusedId: null,
  sortField,
  sortOrder,
  groupBy: 'none',
  viewMode,
  folderStyle: { sortField, sortOrder, groupBy: 'none', viewMode },
});

function restoreSessionTabs(snapshot: TabSessionSnapshot, pane: WorkspacePaneId, systemHomeTitle: string, recycleBinTitle: string): TabState[] {
  const savedTabs = pane === 'left' ? snapshot.leftTabs : snapshot.rightTabs;
  return savedTabs.map((saved, index) => ({
    ...saved,
    id: saved.id || `${pane}-restored-${index + 1}`,
    title: saved.currentPath === SYSTEM_HOME_PATH ? systemHomeTitle : saved.currentPath === RECYCLE_BIN_PATH ? recycleBinTitle : saved.title,
    filterQuery: '',
    flatView: saved.flatView === true,
    selectedIds: [],
    focusedId: null,
  }));
}

function createSessionSnapshot(
  leftTabs: TabState[],
  rightTabs: TabState[],
  activeLeftTabIndex: number,
  activeRightTabIndex: number,
  activePane: WorkspacePaneId,
): TabSessionSnapshot {
  const saveTabs = (tabs: TabState[]) => tabs.map(({ id, title, customTitle, tabColor, lockClose, currentPath, history, historyIndex, sortField, sortOrder, groupBy, viewMode, folderStyle, flatView }) => {
    const historyOffset = Math.max(0, history.length - 80);
    const savedHistory = history.slice(historyOffset);
    return {
      id,
      title: currentPath === SYSTEM_HOME_PATH || currentPath === RECYCLE_BIN_PATH ? currentPath : title,
      customTitle,
      tabColor,
      lockClose,
      currentPath,
      history: savedHistory,
      historyIndex: Math.max(-1, Math.min(historyIndex - historyOffset, savedHistory.length - 1)),
      sortField,
      sortOrder,
      groupBy,
      viewMode,
      folderStyle,
      flatView,
    };
  });
  return normalizeSessionSnapshot({
    leftTabs: saveTabs(leftTabs),
    rightTabs: saveTabs(rightTabs),
    activeLeftTabIndex,
    activeRightTabIndex,
    activePane,
  });
}

function suggestUnusedProfileName(base: string, names: string[]): string {
  const used = new Set(names.map(name => name.trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

export default function App() {
  const { t, language } = useLanguage();
  const startsAtSystemHome = isTauriDesktop();
  const [startupBehavior, setStartupBehavior] = useState<StartupBehavior>(readStartupBehavior);
  const [startupSessionId, setStartupSessionId] = useState(readStartupSessionId);
  const launchedWithStartupOverride = useRef(startupBehavior !== 'continue').current;
  const [initialWorkspaceStore] = useState(initialWorkspaceProfileStore);
  const initialWorkspace = initialWorkspaceStore.workspaces.find(profile => profile.id === initialWorkspaceStore.lastWorkspaceId);
  const initialActiveLayoutId = initialWorkspace?.layoutId ?? initialWorkspaceStore.lastLayoutId;
  const savedStartupSession = initialWorkspaceStore.sessions.find(profile => profile.id === startupSessionId);
  const initialActiveSessionId = startupBehavior === 'continue'
    ? initialWorkspace?.sessionId ?? initialWorkspaceStore.lastSessionId
    : startupBehavior === 'session' ? savedStartupSession?.id ?? DEFAULT_SESSION_PROFILE_ID : DEFAULT_SESSION_PROFILE_ID;
  const initialLayoutProfile = initialWorkspaceStore.layouts.find(profile => profile.id === initialActiveLayoutId);
  const initialSessionProfile = startupBehavior === 'continue'
    ? initialWorkspaceStore.sessions.find(profile => profile.id === initialActiveSessionId)
    : startupBehavior === 'session' ? savedStartupSession : undefined;
  const [activeLayoutId, setActiveLayoutId] = useState(initialActiveLayoutId);
  const [activeSessionId, setActiveSessionId] = useState(initialActiveSessionId);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(startupBehavior === 'continue' ? initialWorkspace?.id ?? null : null);
  const [workspaceStore, setWorkspaceStore] = useState(initialWorkspaceStore);
  const [initialPanelPreferences] = useState<PanelViewPreferences>(() => initialLayoutProfile
    ? { ...readPanelViewPreferences(), ...initialLayoutProfile.snapshot }
    : readPanelViewPreferences());
  const initialSessionSnapshot = initialSessionProfile?.snapshot ?? defaultSessionSnapshot(startsAtSystemHome ? SYSTEM_HOME_PATH : '', t.sidebar.thisPc);
  const [paneColumnPreferences, setPaneColumnPreferences] = useState<Record<WorkspacePaneId, PaneColumnsSnapshot>>(() => initialLayoutProfile?.snapshot.columns ?? {
    left: readPaneColumnPreferences('left'),
    right: readPaneColumnPreferences('right'),
  });
  const [columnPreferencesRevision, setColumnPreferencesRevision] = useState(0);
  const [sessionReloadToken, setSessionReloadToken] = useState(initialSessionProfile ? 1 : 0);
  const [folderStyleLocked, setFolderStyleLocked] = useState(readFolderStyleLockPreference);
  const [sidebarLocationsOpenInNewTab, setSidebarLocationsOpenInNewTab] = useState(() => readBooleanPreference(SIDEBAR_LOCATIONS_NEW_TAB_KEY, true));
  const [newTabsNextToCurrent, setNewTabsNextToCurrent] = useState(() => readBooleanPreference(NEW_TABS_NEXT_TO_CURRENT_KEY, true));
  const [showNewTabButton, setShowNewTabButton] = useState(() => readBooleanPreference(SHOW_NEW_TAB_BUTTON_KEY, true));
  const [doubleClickTabBar, setDoubleClickTabBar] = useState(() => readBooleanPreference(DOUBLE_CLICK_TAB_BAR_KEY, true));
  const [recentItemStyle, setRecentItemStyle] = useState<RecentItemStyle>(readRecentItemStyle);
  const [hiddenItemStyle, setHiddenItemStyle] = useState<HiddenItemStyle>(readHiddenItemStyle);
  const [imageTooltipThumbnailsEnabled, setImageTooltipThumbnailsEnabled] = useState(() => readBooleanPreference(IMAGE_TOOLTIP_THUMBNAILS_KEY, true));
  const [notificationBannersEnabled, setNotificationBannersEnabled] = useState(() => readBooleanPreference(NOTIFICATION_BANNERS_KEY, true));
  const [tooltipsEnabled, setTooltipsEnabled] = useState(() => readBooleanPreference(TOOLTIPS_ENABLED_KEY, true));
  const [navigationTransitionsEnabled, setNavigationTransitionsEnabled] = useState(() => readBooleanPreference(NAVIGATION_TRANSITIONS_ENABLED_KEY, true));
  const [navigationTransitionStyle, setNavigationTransitionStyle] = useState<NavigationTransitionStyle>(readNavigationTransitionStyle);
  const [relativeGraphsEnabled, setRelativeGraphsEnabled] = useState(() => readBooleanPreference(RELATIVE_GRAPHS_ENABLED_KEY, true));
  const [showHiddenFiles, setShowHiddenFiles] = useState(() => readBooleanPreference(SHOW_HIDDEN_FILES_KEY, true));
  const [showFileExtensions, setShowFileExtensions] = useState(() => readBooleanPreference(SHOW_FILE_EXTENSIONS_KEY, true));
  const [lastTerminalOption, setLastTerminalOption] = useState<WindowsTerminalOption>(readLastTerminalOption);
  const [windowsSpecialFolders, setWindowsSpecialFolders] = useState<WindowsSpecialFolder[]>([]);
  const [dateFormat, setDateFormat] = useState<DateFormatMode>(readDateFormatPreference);
  const [autoFolderSizeEnabled, setAutoFolderSizeEnabled] = useState(() => readBooleanPreference(AUTO_FOLDER_SIZE_ENABLED_KEY, true));
  const [singleClickOpen, setSingleClickOpen] = useState(() => readBooleanPreference(SINGLE_CLICK_OPEN_KEY, false));

  // Global file system state
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const childrenByParent = useMemo(() => {
    const index = new Map<string, FileItem[]>();
    for (const item of allFiles) {
      const parentKey = getPathKey(getParentPath(item.path));
      const children = index.get(parentKey);
      if (children) children.push(item);
      else index.set(parentKey, [item]);
    }
    return index;
  }, [allFiles]);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [systemLocations, setSystemLocations] = useState<NativeLocation[]>([]);
  const [systemHomeLoading, setSystemHomeLoading] = useState(startsAtSystemHome);
  const [quickAccess, setQuickAccess] = useState<QuickAccessItem[]>([]);
  const [recentFolderPaths, setRecentFolderPaths] = useState<string[]>(readRecentFolderPaths);
  const [customQuickAccess, setCustomQuickAccess] = useState<QuickAccessItem[]>(readCustomQuickAccess);
  const [quickAccessSortMode, setQuickAccessSortMode] = useState<QuickAccessSortMode>(readQuickAccessSortMode);
  const [quickAccessOrder, setQuickAccessOrder] = useState<string[]>(readQuickAccessOrder);
  const rememberRecentFolder = useCallback((value: string) => {
    const path = normalizeWindowsPath(value.trim());
    if (!path || path.length > 32767 || path === SYSTEM_HOME_PATH || path === RECYCLE_BIN_PATH || path.startsWith('::')) return;
    setRecentFolderPaths(previous => {
      return [path, ...previous.filter(existing => getPathKey(existing) !== getPathKey(path))].slice(0, 10);
    });
  }, []);
  const clearRecentFolderHistory = useCallback(() => {
    setRecentFolderPaths([]);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_FOLDER_PATHS_KEY, JSON.stringify(recentFolderPaths));
    } catch {
      // Recent folders remain available for the current session.
    }
  }, [recentFolderPaths]);
  const nativeRootPath = useRef(startsAtSystemHome ? SYSTEM_HOME_PATH : '');
  const systemHomeWorkspace = useRef(startsAtSystemHome);
  const browserRootPath = useRef('');
  const addingCustomQuickAccess = useRef(false);
  const [nativeDirectories, setNativeDirectories] = useState<Record<string, NativeDirectoryState>>({});
  const [flatDirectories, setFlatDirectories] = useState<Record<string, FlatDirectoryState>>({});
  const flatInFlight = useRef(new Set<string>());
  const flatVersions = useRef(new Map<string, number>());
  const staleFlatIds = useRef(new Map<string, Set<string>>());
  const flatDirectoriesRef = useRef(flatDirectories);
  flatDirectoriesRef.current = flatDirectories;
  const nativeLoadedDirectories = useRef(new Set<string>());
  const navigationViewTransitionSequence = useRef(0);
  const nativeInFlightDirectories = useRef(new Map<string, number>());
  const selectAllAfterLoad = useRef(new Set<string>());
  const flatSelectAllAfterLoad = useRef(new Set<string>());
  const showHiddenFilesRef = useRef(showHiddenFiles);
  showHiddenFilesRef.current = showHiddenFiles;
  const nativeWorkspaceGeneration = useRef(0);
  const nativeOpeningWorkspace = useRef(false);
  const focusRefreshTimer = useRef<number | null>(null);

  const systemHomeItems = useMemo<FileItem[]>(() => {
    const locationLabels: Record<NativeLocation['id'], string> = {
      desktop: t.sidebar.desktop,
      documents: t.sidebar.documents,
      downloads: t.sidebar.downloads,
      pictures: t.sidebar.pictures,
      music: t.sidebar.music,
      videos: t.sidebar.videos,
    };
    const items: FileItem[] = [
      ...drives.map(drive => ({
        id: `system-drive-${drive.id}`,
        name: drive.label && drive.label.toLowerCase() !== drive.letter.toLowerCase()
          ? `${drive.label} (${drive.letter})`
          : drive.letter,
        path: `${drive.letter}\\`,
        isFolder: true,
        type: 'folder' as const,
        size: 0,
        modifiedDate: '',
        extension: '',
      })),
      ...systemLocations.map(location => ({
        id: `system-location-${location.id}`,
        name: locationLabels[location.id],
        path: location.path,
        isFolder: true,
        type: 'folder' as const,
        size: 0,
        modifiedDate: '',
        extension: '',
      })),
    ];
    const seenPaths = new Set<string>();
    return items.filter(item => {
      const pathKey = getPathKey(item.path);
      if (seenPaths.has(pathKey)) return false;
      seenPaths.add(pathKey);
      return true;
    });
  }, [drives, systemLocations, t.sidebar.desktop, t.sidebar.documents, t.sidebar.downloads, t.sidebar.music, t.sidebar.pictures, t.sidebar.videos]);

  // Layout & Global View Modes
  const [layout, setLayout] = useState<ViewLayout>(initialPanelPreferences.layout);
  const [tabStripPosition, setTabStripPosition] = useState<TabStripPosition>(initialPanelPreferences.tabStripPosition);
  const [verticalSplitPercent, setVerticalSplitPercent] = useState(initialPanelPreferences.verticalSplitPercent);
  const [horizontalSplitPercent, setHorizontalSplitPercent] = useState(initialPanelPreferences.horizontalSplitPercent);
  const [previewSplitPercent, setPreviewSplitPercent] = useState(initialPanelPreferences.previewSplitPercent);
  const [sidebarSplitPercent, setSidebarSplitPercent] = useState(initialPanelPreferences.sidebarSplitPercent);
  const [previewOpen, setPreviewOpen] = useState<boolean>(initialPanelPreferences.previewOpen);
  const [activePane, setActivePane] = useState<WorkspacePaneId>(initialSessionSnapshot?.activePane ?? initialPanelPreferences.activePane);
  const [emptyAreaDoubleClickNavigatesUp, setEmptyAreaDoubleClickNavigatesUp] = useState(readEmptyAreaDoubleClickPreference);
  const [mouseGesturesEnabled, setMouseGesturesEnabled] = useState(() => readBooleanPreference(MOUSE_GESTURES_ENABLED_KEY, true));

  // Notifications / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastSequence, setToastSequence] = useState(0);
  const toastSequenceRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    if (!notificationBannersEnabled) return;
    const sequence = ++toastSequenceRef.current;
    setToastMessage(msg);
    setToastSequence(sequence);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      if (toastSequenceRef.current === sequence) setToastMessage(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, [notificationBannersEnabled]);

  useEffect(() => {
    if (notificationBannersEnabled) return;
    setToastMessage(null);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
  }, [notificationBannersEnabled]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const [recycleBinStatus, setRecycleBinStatus] = useState<RecycleBinStatus | null>(null);
  const [recycleBinItems, setRecycleBinItems] = useState<FileItem[]>([]);
  const [recycleBinPage, setRecycleBinPage] = useState({ hasMore: false, nextOffset: 0, loading: false });
  const recycleBinListingInFlight = useRef(false);
  const recycleBinLoaded = useRef(false);
  const refreshRecycleBinStatus = useCallback(async () => {
    if (!isTauriDesktop()) return;
    try {
      setRecycleBinStatus(await getNativeRecycleBinStatus());
    } catch {
      setRecycleBinStatus({ available: false, itemCount: 0, totalBytes: 0 });
    }
  }, []);

  const refreshRecycleBinContents = useCallback(async () => {
    if (!isTauriDesktop() || recycleBinListingInFlight.current) return;
    recycleBinListingInFlight.current = true;
    setRecycleBinPage(previous => ({ ...previous, loading: true }));
    try {
      const page = await listNativeRecycleBin(0);
      setRecycleBinItems(page.entries);
      setRecycleBinPage({ hasMore: page.hasMore, nextOffset: page.nextOffset, loading: false });
      recycleBinLoaded.current = true;
    } catch {
      setRecycleBinPage(previous => ({ ...previous, loading: false }));
      recycleBinLoaded.current = false;
      showToast(t.core.recycleBinLoadFailed);
    } finally {
      recycleBinListingInFlight.current = false;
    }
  }, [showToast, t.core.recycleBinLoadFailed]);

  const loadMoreRecycleBin = useCallback(async () => {
    if (!recycleBinPage.hasMore || recycleBinListingInFlight.current) return;
    recycleBinListingInFlight.current = true;
    setRecycleBinPage(previous => ({ ...previous, loading: true }));
    try {
      const page = await listNativeRecycleBin(recycleBinPage.nextOffset);
      setRecycleBinItems(previous => {
        const existingIds = new Set(previous.map(item => item.id));
        return [...previous, ...page.entries.filter(item => !existingIds.has(item.id))];
      });
      setRecycleBinPage({ hasMore: page.hasMore, nextOffset: page.nextOffset, loading: false });
    } catch {
      setRecycleBinPage(previous => ({ ...previous, loading: false }));
      showToast(t.core.recycleBinLoadFailed);
    } finally {
      recycleBinListingInFlight.current = false;
    }
  }, [recycleBinPage.hasMore, recycleBinPage.nextOffset, showToast, t.core.recycleBinLoadFailed]);

  useEffect(() => {
    if (!isTauriDesktop()) return;
    void refreshRecycleBinStatus();
    const refreshInterval = window.setInterval(() => void refreshRecycleBinStatus(), 15_000);
    window.addEventListener('focus', refreshRecycleBinStatus);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshRecycleBinStatus);
    };
  }, [refreshRecycleBinStatus]);

  const refreshSystemHome = useCallback(async () => {
    if (!isTauriDesktop()) {
      setSystemHomeLoading(false);
      return;
    }
    setSystemHomeLoading(true);
    try {
      const [nextDrives, nextLocations] = await Promise.all([
        listNativeDrives(),
        listNativeSystemLocations(),
      ]);
      setDrives(nextDrives);
      setSystemLocations(nextLocations);
    } catch {
      setDrives([]);
      setSystemLocations([]);
      showToast(language === 'es' ? 'No se pudieron consultar las ubicaciones del sistema.' : 'System locations could not be loaded.');
    } finally {
      setSystemHomeLoading(false);
    }
  }, [language, showToast]);

  const completeOnboarding = useCallback(() => {
    setIsOnboardingOpen(false);
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // The welcome flow still works when browser storage is unavailable.
    }
  }, []);

  // Left Pane State & Tabs
  const [leftTabs, setLeftTabs] = useState<TabState[]>([
    ...restoreSessionTabs(initialSessionSnapshot, 'left', t.sidebar.thisPc, t.sidebar.recycleBinTitle),
  ]);
  const [activeLeftTabIndex, setActiveLeftTabIndex] = useState(initialSessionSnapshot?.activeLeftTabIndex ?? 0);

  // Right Pane State & Tabs
  const [rightTabs, setRightTabs] = useState<TabState[]>([
    ...restoreSessionTabs(initialSessionSnapshot, 'right', t.sidebar.thisPc, t.sidebar.recycleBinTitle),
  ]);
  const [activeRightTabIndex, setActiveRightTabIndex] = useState(initialSessionSnapshot?.activeRightTabIndex ?? 0);

  const resetTabsToDefaultFolderStyle = useCallback((tabs: TabState[]) => tabs.map(tab => {
    const defaultStyle = styleForPath(tab.currentPath, DEFAULT_FOLDER_STYLE);
    return {
      ...tab,
      ...defaultStyle,
      folderStyle: { ...DEFAULT_FOLDER_STYLE },
    };
  }), []);

  const handleFolderStyleLockChange = useCallback((enabled: boolean) => {
    if (!enabled) {
      setLeftTabs(resetTabsToDefaultFolderStyle);
      setRightTabs(resetTabsToDefaultFolderStyle);
    }
    setFolderStyleLocked(enabled);
  }, [resetTabsToDefaultFolderStyle]);

  const toggleFolderStyleLock = useCallback(() => {
    handleFolderStyleLockChange(!folderStyleLocked);
  }, [folderStyleLocked, handleFolderStyleLockChange]);

  useEffect(() => {
    if (folderStyleLocked) return;
    setLeftTabs(resetTabsToDefaultFolderStyle);
    setRightTabs(resetTabsToDefaultFolderStyle);
  }, [folderStyleLocked, resetTabsToDefaultFolderStyle]);

  useEffect(() => {
    const recycleBinOpen = [...leftTabs, ...rightTabs].some(tab => tab.currentPath === RECYCLE_BIN_PATH);
    if (recycleBinOpen && !recycleBinLoaded.current) void refreshRecycleBinContents();
  }, [leftTabs, rightTabs, refreshRecycleBinContents]);

  // Modals state
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [pendingCreateItem, setPendingCreateItem] = useState<{ kind: NewItemKind; pane: 'left' | 'right'; parentPath: string; suggestedName?: string } | null>(null);
  const [pendingZipCreation, setPendingZipCreation] = useState<{ sourcePaths: string[]; targetPath: string; pane: 'left' | 'right'; defaultName: string } | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [focusTabSettingsRequest, setFocusTabSettingsRequest] = useState(0);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const [isCloseActionBusy, setIsCloseActionBusy] = useState(false);
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [isUnsavedWorkspaceChangesOpen, setIsUnsavedWorkspaceChangesOpen] = useState(false);
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<PendingWorkspaceAction | null>(null);
  const [globalShortcutSettings, setGlobalShortcutSettings] = useState<GlobalShortcutSettingsState>({
    enabled: true,
    shortcut: DEFAULT_GLOBAL_SHORTCUT,
    registered: false,
  });
  const [globalShortcutLoaded, setGlobalShortcutLoaded] = useState(false);
  const [globalShortcutSupported, setGlobalShortcutSupported] = useState(false);
  const [globalShortcutError, setGlobalShortcutError] = useState<string | null>(null);
  const [instancePreferences, setInstancePreferences] = useState<InstancePreferencesState>({
    allowMultipleInstances: false,
    supported: false,
  });
  const [instancePreferencesLoaded, setInstancePreferencesLoaded] = useState(false);
  const [instancePreferencesSupported, setInstancePreferencesSupported] = useState(false);
  const [instancePreferencesError, setInstancePreferencesError] = useState<string | null>(null);
  const closeActionInProgress = useRef(false);
  const requestQuitWithUnsavedChangesRef = useRef<(remember: boolean) => void>(() => {});
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [pendingDeleteItems, setPendingDeleteItems] = useState<FileItem[]>([]);
  const [isFileOperationBusy, setIsFileOperationBusy] = useState(false);
  const [transferOperations, setTransferOperations] = useState<TransferOperationView[]>([]);
  const transferOperationsRef = useRef<TransferOperationView[]>([]);
  const [undoHistory, setUndoHistory] = useState<UndoRecord[]>([]);
  const undoHistoryRef = useRef<UndoRecord[]>([]);
  const undoPendingIdsRef = useRef(new Set<string>());
  const [undoBusy, setUndoBusy] = useState(false);
  const archivePasswordsRef = useRef(new Map<string, string>());
  const activeTransferIdRef = useRef<string | null>(null);
  const [transferEventsReady, setTransferEventsReady] = useState(!isTauriDesktop());
  const [renameRequest, setRenameRequest] = useState<{ requestId: number; itemId: string; paneId: 'left' | 'right' } | null>(null);
  const renameRequestSequence = useRef(0);
  const [isEmptyRecycleBinConfirmOpen, setIsEmptyRecycleBinConfirmOpen] = useState(false);
  const shouldMountBatchRenameModal = useKeepModalMountedAfterFirstOpen(isBatchRenameOpen);
  const shouldMountShortcutsModal = useKeepModalMountedAfterFirstOpen(isShortcutsOpen);
  const shouldMountSearchModal = useKeepModalMountedAfterFirstOpen(isSearchOpen);
  const shouldMountSettingsModal = useKeepModalMountedAfterFirstOpen(isSettingsOpen);
  const shouldMountAboutModal = useKeepModalMountedAfterFirstOpen(isAboutOpen);
  const shouldMountCloseWindowModal = useKeepModalMountedAfterFirstOpen(isCloseDialogOpen);
  const shouldMountOnboardingModal = useKeepModalMountedAfterFirstOpen(isOnboardingOpen);
  const shouldMountConfirmActionModal = useKeepModalMountedAfterFirstOpen(
    pendingDeleteItems.length > 0 || isEmptyRecycleBinConfirmOpen,
  );
  const [isRecycleBinBusy, setIsRecycleBinBusy] = useState(false);
  const recycleBinRestoreInFlight = useRef(false);

  const pushUndoAction = useCallback((action: Omit<UndoRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => {
    const record: UndoRecord = {
      ...action,
      id: action.id ?? createOperationId('undo'),
      timestamp: action.timestamp ?? Date.now(),
    };
    const next = [record, ...undoHistoryRef.current].slice(0, 10);
    undoHistoryRef.current = next;
    setUndoHistory(next);
  }, []);

  const updateUndoAction = useCallback((id: string, update: (action: UndoRecord) => UndoRecord | null) => {
    const current = undoHistoryRef.current;
    const index = current.findIndex(action => action.id === id);
    if (index < 0) return;
    const updated = update(current[index]);
    const next = updated
      ? current.map(action => action.id === id ? updated : action)
      : current.filter(action => action.id !== id);
    undoHistoryRef.current = next;
    setUndoHistory(next);
  }, []);

  const removeUndoAction = useCallback((id: string) => {
    updateUndoAction(id, () => null);
  }, [updateUndoAction]);

  useEffect(() => {
    void refreshSystemHome();
  }, [refreshSystemHome]);

  useEffect(() => {
    const suppressNativeContextMenu = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener('contextmenu', suppressNativeContextMenu, true);
    return () => document.removeEventListener('contextmenu', suppressNativeContextMenu, true);
  }, []);

  useEffect(() => {
    if (isTauriDesktop()) void setNativeTrayLanguage(language).catch(() => {});
  }, [language]);

  useEffect(() => {
    if (!isTauriDesktop()) {
      setGlobalShortcutLoaded(true);
      return;
    }
    setGlobalShortcutSupported(true);
    void invoke<GlobalShortcutSettingsState>('get_global_shortcut_settings')
      .then(settings => setGlobalShortcutSettings(settings))
      .catch(() => setGlobalShortcutError(t.settings.shortcutUnavailable))
      .finally(() => setGlobalShortcutLoaded(true));
  }, [t.settings.shortcutUnavailable]);

  const changeGlobalShortcutSettings = useCallback(async (settings: Pick<GlobalShortcutSettingsState, 'enabled' | 'shortcut'>) => {
    if (!isTauriDesktop()) {
      setGlobalShortcutError(t.settings.shortcutDesktopOnly);
      return;
    }
    setGlobalShortcutError(null);
    try {
      const saved = await invoke<GlobalShortcutSettingsState>('set_global_shortcut_settings', settings);
      setGlobalShortcutSettings(saved);
    } catch {
      setGlobalShortcutError(t.settings.shortcutRegisterError);
      throw new Error(t.settings.shortcutRegisterError);
    }
  }, [t.settings.shortcutDesktopOnly, t.settings.shortcutRegisterError]);

  useEffect(() => {
    if (!isTauriDesktop()) {
      setInstancePreferencesLoaded(true);
      return;
    }
    void invoke<InstancePreferencesState>('get_instance_preferences')
      .then(saved => {
        setInstancePreferences(saved);
        setInstancePreferencesSupported(saved.supported);
      })
      .catch(() => setInstancePreferencesError(t.settings.instancePreferencesUnavailable))
      .finally(() => setInstancePreferencesLoaded(true));
  }, [t.settings.instancePreferencesUnavailable]);

  const changeInstancePreferences = useCallback(async (allowMultipleInstances: boolean) => {
    if (!isTauriDesktop()) {
      setInstancePreferencesError(t.settings.instancePreferencesDesktopOnly);
      return;
    }
    setInstancePreferencesError(null);
    try {
      const saved = await invoke<InstancePreferencesState>('set_instance_preferences', {
        allowMultipleInstances,
      });
      setInstancePreferences(saved);
      setInstancePreferencesSupported(saved.supported);
    } catch {
      setInstancePreferencesError(t.settings.instancePreferencesSaveError);
      throw new Error(t.settings.instancePreferencesSaveError);
    }
  }, [t.settings.instancePreferencesDesktopOnly, t.settings.instancePreferencesSaveError]);

  const runCloseAction = useCallback(async (choice: 'hide' | 'quit', remember = rememberCloseChoice) => {
    if (choice === 'quit' && transferOperationsRef.current.some(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status))) {
      showToast(language === 'es' ? 'Espera a que terminen las transferencias antes de salir.' : 'Wait for transfers to finish before quitting.');
      return;
    }
    if (closeActionInProgress.current) return;
    closeActionInProgress.current = true;
    setIsCloseActionBusy(true);

    let savedChoice = false;
    if (remember) {
      try {
        window.localStorage.setItem(CLOSE_BEHAVIOR_STORAGE_KEY, choice);
        savedChoice = true;
      } catch {
        // Continue with the requested close action if browser storage is unavailable.
      }
    }

    try {
      await invoke(choice === 'hide' ? 'hide_main_window' : 'quit_app');
      closeActionInProgress.current = false;
      setIsCloseActionBusy(false);
      setIsCloseDialogOpen(false);
    } catch {
      closeActionInProgress.current = false;
      setIsCloseActionBusy(false);
      if (savedChoice) {
        try {
          window.localStorage.removeItem(CLOSE_BEHAVIOR_STORAGE_KEY);
        } catch {
          // The current session can still fall back to the dialog.
        }
      }
      setRememberCloseChoice(false);
      setIsCloseDialogOpen(true);
      showToast(t.closeWindow.closeFailed);
    }
  }, [language, rememberCloseChoice, showToast, t.closeWindow.closeFailed]);

  const cancelCloseDialog = useCallback(() => {
    if (closeActionInProgress.current) return;
    setRememberCloseChoice(false);
    setIsCloseDialogOpen(false);
  }, []);

  const handleExitFromCloseDialog = useCallback(() => {
    requestQuitWithUnsavedChangesRef.current(rememberCloseChoice);
  }, [rememberCloseChoice]);

  const handleHideToTrayFromCloseDialog = useCallback(() => {
    void runCloseAction('hide');
  }, [runCloseAction]);

  useEffect(() => {
    if (!isTauriDesktop()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      if (closeActionInProgress.current) return;

      let rememberedChoice: string | null = null;
      try {
        rememberedChoice = window.localStorage.getItem(CLOSE_BEHAVIOR_STORAGE_KEY);
      } catch {
        // If storage is unavailable, ask the user on every close.
      }

      if (rememberedChoice === 'hide') {
        void runCloseAction('hide', true);
      } else if (rememberedChoice === 'quit') {
        requestQuitWithUnsavedChangesRef.current(true);
      } else {
        setIsCloseActionBusy(false);
        setRememberCloseChoice(false);
        setIsCloseDialogOpen(true);
      }
    }).then(stopListening => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => {
      // The app remains usable if the native close listener cannot be registered.
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [runCloseAction]);

  // Context Menu state
  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);
  const [tabMenuTarget, setTabMenuTarget] = useState<{ pane: WorkspacePaneId; tabId: string; x: number; y: number } | null>(null);
  const [tabStripMenuTarget, setTabStripMenuTarget] = useState<{ pane: WorkspacePaneId; x: number; y: number } | null>(null);
  const [closedTabs, setClosedTabs] = useState<Array<{ pane: WorkspacePaneId; tab: TabState; index: number }>>([]);

  // Helper references to active pane and inactive pane
  const activeTabs = activePane === 'left' ? leftTabs : rightTabs;
  const setActiveTabs = activePane === 'left' ? setLeftTabs : setRightTabs;
  const activeTabIndex = activePane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
  const currentTab = activeTabs[activeTabIndex] || activeTabs[0];
  const hiddenItemsCount = currentTab.currentPath === SYSTEM_HOME_PATH || currentTab.currentPath === RECYCLE_BIN_PATH || !isTauriDesktop()
    ? null
    : (currentTab.flatView ? flatDirectories[getPathKey(currentTab.currentPath)] : nativeDirectories[getPathKey(currentTab.currentPath)])?.counts?.hiddenCount ?? null;
  const systemQuickAccess = useMemo<QuickAccessItem[]>(() => {
    const labels: Record<NativeLocation['id'], string> = {
      desktop: t.sidebar.desktop,
      documents: t.sidebar.documents,
      downloads: t.sidebar.downloads,
      pictures: t.sidebar.pictures,
      music: t.sidebar.music,
      videos: t.sidebar.videos,
    };
    return systemLocations.map(location => ({
      id: `system-quick-${location.id}`,
      name: labels[location.id],
      path: location.path,
      icon: location.id,
    }));
  }, [systemLocations, t.sidebar.desktop, t.sidebar.documents, t.sidebar.downloads, t.sidebar.music, t.sidebar.pictures, t.sidebar.videos]);
  const hasSystemWorkspaceAccess = systemHomeWorkspace.current || currentTab.history.includes(SYSTEM_HOME_PATH);
  const isNativeDesktop = isTauriDesktop();
  const baseSidebarQuickAccess = useMemo(() => [
    ...(isNativeDesktop ? [{ id: 'system-quick-home', name: t.sidebar.thisPc, path: SYSTEM_HOME_PATH, icon: 'monitor' }] : []),
    ...(hasSystemWorkspaceAccess ? systemQuickAccess : quickAccess),
  ], [hasSystemWorkspaceAccess, isNativeDesktop, quickAccess, systemQuickAccess, t.sidebar.thisPc]);
  const sidebarQuickAccess = useMemo(() => {
    const baseQuickAccessPaths = new Set(baseSidebarQuickAccess.map(item => getPathKey(item.path)));
    const combined = [
      ...baseSidebarQuickAccess,
      ...customQuickAccess.filter(item => !baseQuickAccessPaths.has(getPathKey(item.path))),
    ];
    const pinned = combined.filter(item => getPathKey(item.path) === getPathKey(SYSTEM_HOME_PATH));
    const sortable = combined.filter(item => getPathKey(item.path) !== getPathKey(SYSTEM_HOME_PATH));
    if (quickAccessSortMode === 'name' || quickAccessSortMode === 'name-desc') {
      const direction = quickAccessSortMode === 'name' ? 1 : -1;
      sortable.sort((a, b) =>
        direction * (a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id)),
      );
      return [...pinned, ...sortable];
    }

    const orderById = new Map(quickAccessOrder.map((id, index) => [id, index]));
    const manuallySorted = sortable
      .map((item, index) => ({ item, index, order: orderById.get(item.id) }))
      .sort((a, b) => {
        if (a.order === undefined && b.order === undefined) return a.index - b.index;
        if (a.order === undefined) return 1;
        if (b.order === undefined) return -1;
        return a.order - b.order || a.index - b.index;
      })
      .map(entry => entry.item);
    return [...pinned, ...manuallySorted];
  }, [baseSidebarQuickAccess, customQuickAccess, quickAccessOrder, quickAccessSortMode]);
  const leftViewMode = leftTabs[activeLeftTabIndex]?.viewMode ?? initialPanelPreferences.leftViewMode;
  const rightViewMode = rightTabs[activeRightTabIndex]?.viewMode ?? initialPanelPreferences.rightViewMode;
  const leftSort = leftTabs[activeLeftTabIndex] ?? leftTabs[0];
  const rightSort = rightTabs[activeRightTabIndex] ?? rightTabs[0];
  const currentLayoutSnapshot = useMemo<LayoutSnapshot>(() => ({
    layout,
    tabStripPosition,
    previewOpen,
    verticalSplitPercent,
    horizontalSplitPercent,
    previewSplitPercent,
    sidebarSplitPercent,
    columns: paneColumnPreferences,
  }), [layout, tabStripPosition, previewOpen, verticalSplitPercent, horizontalSplitPercent, previewSplitPercent, sidebarSplitPercent, paneColumnPreferences]);
  const currentSessionSnapshot = useMemo(() => createSessionSnapshot(leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, activePane), [leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, activePane]);
  const activeLayoutProfile = workspaceStore.layouts.find(profile => profile.id === activeLayoutId);
  const activeSessionProfile = workspaceStore.sessions.find(profile => profile.id === activeSessionId);
  const baselineLayoutSnapshot = activeLayoutProfile?.snapshot ?? DEFAULT_LAYOUT_SNAPSHOT;
  const baselineSessionSnapshot = activeSessionProfile?.snapshot ?? defaultSessionSnapshot(startsAtSystemHome ? SYSTEM_HOME_PATH : '', t.sidebar.thisPc);
  const layoutDirty = JSON.stringify(currentLayoutSnapshot) !== JSON.stringify(baselineLayoutSnapshot);
  const sessionDirty = JSON.stringify(currentSessionSnapshot) !== JSON.stringify(baselineSessionSnapshot);
  const persistWorkspaceStore = useCallback((next: WorkspaceProfileStore) => {
    setWorkspaceStore(next);
    try {
      writeWorkspaceProfileStore(next);
    } catch {
      showToast(language === 'es' ? 'No se pudieron guardar los perfiles en este dispositivo.' : 'Could not save profiles on this device.');
    }
  }, [language, showToast]);

  const onColumnPreferencesChange = useCallback((pane: WorkspacePaneId, preferences: PaneColumnsSnapshot) => {
    setPaneColumnPreferences(previous => {
      if (JSON.stringify(previous[pane]) === JSON.stringify(preferences)) return previous;
      return { ...previous, [pane]: preferences };
    });
  }, []);

  const applyLayoutSnapshot = useCallback((rawSnapshot: LayoutSnapshot) => {
    const snapshot = normalizeLayoutSnapshot(rawSnapshot);
    setLayout(snapshot.layout);
    setTabStripPosition(snapshot.tabStripPosition);
    setPreviewOpen(snapshot.previewOpen);
    setVerticalSplitPercent(snapshot.verticalSplitPercent);
    setHorizontalSplitPercent(snapshot.horizontalSplitPercent);
    setPreviewSplitPercent(snapshot.previewSplitPercent);
    setSidebarSplitPercent(snapshot.sidebarSplitPercent);
    setPaneColumnPreferences(snapshot.columns);
    writePaneColumnPreferences('left', snapshot.columns.left);
    writePaneColumnPreferences('right', snapshot.columns.right);
    try {
      const current = JSON.parse(window.localStorage.getItem(PANEL_VIEW_PREFERENCES_KEY) || '{}');
      window.localStorage.setItem(PANEL_VIEW_PREFERENCES_KEY, JSON.stringify({ ...current, ...snapshot }));
    } catch {
      // Keep the applied layout in memory when local storage is unavailable.
    }
    setColumnPreferencesRevision(revision => revision + 1);
  }, []);

  const applySessionSnapshot = useCallback((snapshot: TabSessionSnapshot) => {
    const normalized = normalizeSessionSnapshot(snapshot);
    setLeftTabs(restoreSessionTabs(normalized, 'left', t.sidebar.thisPc, t.sidebar.recycleBinTitle));
    setRightTabs(restoreSessionTabs(normalized, 'right', t.sidebar.thisPc, t.sidebar.recycleBinTitle));
    setActiveLeftTabIndex(normalized.activeLeftTabIndex);
    setActiveRightTabIndex(normalized.activeRightTabIndex);
    setActivePane(normalized.activePane);
    setSessionReloadToken(token => token + 1);
  }, [t.sidebar.thisPc, t.sidebar.recycleBinTitle]);

  const persistProfileStoreForActive = useCallback((next: WorkspaceProfileStore, nextLayoutId: string, nextSessionId: string, nextWorkspaceId: string | null) => {
    persistWorkspaceStore({
      ...next,
      lastLayoutId: nextLayoutId,
      lastSessionId: nextSessionId,
      lastWorkspaceId: nextWorkspaceId,
    });
  }, [persistWorkspaceStore]);

  const createLayoutProfile = useCallback((name: string) => {
    if (workspaceStore.layouts.some(profile => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    const profile: LayoutProfile = { id: createProfileId('layout'), name, snapshot: currentLayoutSnapshot, updatedAt: Date.now() };
    const next = { ...workspaceStore, layouts: [...workspaceStore.layouts, profile] };
    setActiveLayoutId(profile.id);
    setActiveWorkspaceId(null);
    persistProfileStoreForActive(next, profile.id, activeSessionId, null);
    return true;
  }, [workspaceStore, currentLayoutSnapshot, activeSessionId, persistProfileStoreForActive]);

  const updateLayoutProfile = useCallback((id: string) => {
    if (id !== activeLayoutId || id === DEFAULT_LAYOUT_PROFILE_ID) return;
    const next = {
      ...workspaceStore,
      layouts: workspaceStore.layouts.map(profile => profile.id === id ? { ...profile, snapshot: currentLayoutSnapshot, updatedAt: Date.now() } : profile),
    };
    persistProfileStoreForActive(next, id, activeSessionId, activeWorkspaceId);
  }, [workspaceStore, activeLayoutId, currentLayoutSnapshot, activeSessionId, activeWorkspaceId, persistProfileStoreForActive]);

  const renameLayoutProfile = useCallback((id: string, name: string) => {
    if (workspaceStore.layouts.some(profile => profile.id !== id && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    persistWorkspaceStore({ ...workspaceStore, layouts: workspaceStore.layouts.map(profile => profile.id === id ? { ...profile, name, updatedAt: Date.now() } : profile) });
    return true;
  }, [workspaceStore, persistWorkspaceStore]);

  const deleteLayoutProfile = useCallback((id: string) => {
    const currentWorkspace = workspaceStore.workspaces.find(profile => profile.id === activeWorkspaceId);
    const next = {
      ...workspaceStore,
      layouts: workspaceStore.layouts.filter(profile => profile.id !== id),
      workspaces: workspaceStore.workspaces.filter(profile => profile.layoutId !== id),
    };
    if (activeLayoutId === id) {
      applyLayoutSnapshot(DEFAULT_LAYOUT_SNAPSHOT);
      setActiveLayoutId(DEFAULT_LAYOUT_PROFILE_ID);
    }
    const nextWorkspaceId = currentWorkspace?.layoutId === id || !next.workspaces.some(profile => profile.id === activeWorkspaceId) ? null : activeWorkspaceId;
    if (nextWorkspaceId !== activeWorkspaceId) setActiveWorkspaceId(null);
    persistProfileStoreForActive(next, activeLayoutId === id ? DEFAULT_LAYOUT_PROFILE_ID : activeLayoutId, activeSessionId, nextWorkspaceId);
  }, [workspaceStore, activeLayoutId, activeSessionId, activeWorkspaceId, applyLayoutSnapshot, persistProfileStoreForActive]);

  const createSessionProfile = useCallback((name: string) => {
    if (workspaceStore.sessions.some(profile => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    const profile: TabSessionProfile = { id: createProfileId('session'), name, snapshot: currentSessionSnapshot, updatedAt: Date.now() };
    const next = { ...workspaceStore, sessions: [...workspaceStore.sessions, profile] };
    setActiveSessionId(profile.id);
    setActiveWorkspaceId(null);
    persistProfileStoreForActive(next, activeLayoutId, profile.id, null);
    return true;
  }, [workspaceStore, currentSessionSnapshot, activeLayoutId, persistProfileStoreForActive]);

  const updateSessionProfile = useCallback((id: string) => {
    if (id !== activeSessionId || id === DEFAULT_SESSION_PROFILE_ID) return;
    const next = {
      ...workspaceStore,
      sessions: workspaceStore.sessions.map(profile => profile.id === id ? { ...profile, snapshot: currentSessionSnapshot, updatedAt: Date.now() } : profile),
    };
    persistProfileStoreForActive(next, activeLayoutId, id, activeWorkspaceId);
  }, [workspaceStore, activeSessionId, currentSessionSnapshot, activeLayoutId, activeWorkspaceId, persistProfileStoreForActive]);

  const renameSessionProfile = useCallback((id: string, name: string) => {
    if (workspaceStore.sessions.some(profile => profile.id !== id && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    persistWorkspaceStore({ ...workspaceStore, sessions: workspaceStore.sessions.map(profile => profile.id === id ? { ...profile, name, updatedAt: Date.now() } : profile) });
    return true;
  }, [workspaceStore, persistWorkspaceStore]);

  const deleteSessionProfile = useCallback((id: string) => {
    const currentWorkspace = workspaceStore.workspaces.find(profile => profile.id === activeWorkspaceId);
    const next = {
      ...workspaceStore,
      sessions: workspaceStore.sessions.filter(profile => profile.id !== id),
      workspaces: workspaceStore.workspaces.filter(profile => profile.sessionId !== id),
    };
    if (activeSessionId === id) {
      applySessionSnapshot(defaultSessionSnapshot(startsAtSystemHome ? SYSTEM_HOME_PATH : '', t.sidebar.thisPc));
      setActiveSessionId(DEFAULT_SESSION_PROFILE_ID);
    }
    const nextWorkspaceId = currentWorkspace?.sessionId === id || !next.workspaces.some(profile => profile.id === activeWorkspaceId) ? null : activeWorkspaceId;
    if (nextWorkspaceId !== activeWorkspaceId) setActiveWorkspaceId(null);
    persistProfileStoreForActive(next, activeLayoutId, activeSessionId === id ? DEFAULT_SESSION_PROFILE_ID : activeSessionId, nextWorkspaceId);
  }, [workspaceStore, activeSessionId, activeLayoutId, activeWorkspaceId, applySessionSnapshot, startsAtSystemHome, t.sidebar.thisPc, persistProfileStoreForActive]);

  const createWorkspaceProfile = useCallback((name: string) => {
    if (layoutDirty || sessionDirty) return false;
    if (workspaceStore.workspaces.some(profile => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    const profile: WorkspaceProfile = {
      id: createProfileId('workspace'),
      name,
      layoutId: activeLayoutId,
      sessionId: activeSessionId,
      updatedAt: Date.now(),
    };
    const next = { ...workspaceStore, workspaces: [...workspaceStore.workspaces, profile] };
    setActiveWorkspaceId(profile.id);
    persistProfileStoreForActive(next, activeLayoutId, activeSessionId, profile.id);
    return true;
  }, [workspaceStore, layoutDirty, sessionDirty, activeLayoutId, activeSessionId, persistProfileStoreForActive]);

  const renameWorkspaceProfile = useCallback((id: string, name: string) => {
    if (workspaceStore.workspaces.some(profile => profile.id !== id && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    persistWorkspaceStore({ ...workspaceStore, workspaces: workspaceStore.workspaces.map(profile => profile.id === id ? { ...profile, name, updatedAt: Date.now() } : profile) });
    return true;
  }, [workspaceStore, persistWorkspaceStore]);

  const deleteWorkspaceProfile = useCallback((id: string) => {
    const next = { ...workspaceStore, workspaces: workspaceStore.workspaces.filter(profile => profile.id !== id) };
    persistProfileStoreForActive(next, activeLayoutId, activeSessionId, activeWorkspaceId === id ? null : activeWorkspaceId);
  }, [workspaceStore, activeLayoutId, activeSessionId, activeWorkspaceId, persistProfileStoreForActive]);

  const executeWorkspaceAction = useCallback((action: PendingWorkspaceAction, sourceStore: WorkspaceProfileStore = workspaceStore) => {
    if (action.type === 'quit') {
      setIsUnsavedWorkspaceChangesOpen(false);
      setPendingWorkspaceAction(null);
      setIsCloseDialogOpen(false);
      void runCloseAction('quit', action.remember);
      return;
    }

    if (action.type === 'layout') {
      const profile = sourceStore.layouts.find(candidate => candidate.id === action.id);
      applyLayoutSnapshot(profile?.snapshot ?? DEFAULT_LAYOUT_SNAPSHOT);
      setActiveLayoutId(profile?.id ?? DEFAULT_LAYOUT_PROFILE_ID);
      setActiveWorkspaceId(null);
    } else if (action.type === 'session') {
      const profile = sourceStore.sessions.find(candidate => candidate.id === action.id);
      const snapshot = profile?.snapshot ?? defaultSessionSnapshot(startsAtSystemHome ? SYSTEM_HOME_PATH : '', t.sidebar.thisPc);
      applySessionSnapshot(snapshot);
      setActiveSessionId(profile?.id ?? DEFAULT_SESSION_PROFILE_ID);
      setActiveWorkspaceId(null);
    } else {
      const workspace = sourceStore.workspaces.find(candidate => candidate.id === action.id);
      if (!workspace) return;
      const layoutProfile = sourceStore.layouts.find(profile => profile.id === workspace.layoutId);
      const sessionProfile = sourceStore.sessions.find(profile => profile.id === workspace.sessionId);
      applyLayoutSnapshot(layoutProfile?.snapshot ?? DEFAULT_LAYOUT_SNAPSHOT);
      applySessionSnapshot(sessionProfile?.snapshot ?? defaultSessionSnapshot(startsAtSystemHome ? SYSTEM_HOME_PATH : '', t.sidebar.thisPc));
      setActiveLayoutId(layoutProfile?.id ?? DEFAULT_LAYOUT_PROFILE_ID);
      setActiveSessionId(sessionProfile?.id ?? DEFAULT_SESSION_PROFILE_ID);
      setActiveWorkspaceId(workspace.id);
    }
    setPendingWorkspaceAction(null);
    setIsUnsavedWorkspaceChangesOpen(false);
  }, [workspaceStore, applyLayoutSnapshot, applySessionSnapshot, startsAtSystemHome, t.sidebar.thisPc, runCloseAction]);

  const requestWorkspaceAction = useCallback((action: PendingWorkspaceAction) => {
    const checkLayout = action.type === 'quit' || action.type === 'workspace' || action.type === 'layout';
    const checkSession = action.type === 'quit' || action.type === 'workspace' || action.type === 'session';
    if ((checkLayout && layoutDirty) || (checkSession && sessionDirty)) {
      setPendingWorkspaceAction(action);
      setIsUnsavedWorkspaceChangesOpen(true);
      if (action.type === 'quit') setIsCloseDialogOpen(false);
      return;
    }
    executeWorkspaceAction(action);
  }, [layoutDirty, sessionDirty, executeWorkspaceAction]);

  const savePendingWorkspaceChanges = useCallback((names: WorkspaceChangesSaveNames) => {
    const action = pendingWorkspaceAction;
    if (!action) return;
    const saveLayout = action.type === 'quit' || action.type === 'workspace' || action.type === 'layout';
    const saveSession = action.type === 'quit' || action.type === 'workspace' || action.type === 'session';
    let nextStore = workspaceStore;
    let nextLayoutId = activeLayoutId;
    let nextSessionId = activeSessionId;

    if (saveLayout && layoutDirty) {
      if (activeLayoutId === DEFAULT_LAYOUT_PROFILE_ID) {
        const name = names.layoutName.trim();
        if (!name || nextStore.layouts.some(profile => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          showToast(name ? t.workspaceProfiles.duplicateName : t.workspaceProfiles.invalidName);
          return;
        }
        const profile: LayoutProfile = { id: createProfileId('layout'), name, snapshot: currentLayoutSnapshot, updatedAt: Date.now() };
        nextStore = { ...nextStore, layouts: [...nextStore.layouts, profile] };
        nextLayoutId = profile.id;
      } else {
        nextStore = { ...nextStore, layouts: nextStore.layouts.map(profile => profile.id === activeLayoutId ? { ...profile, snapshot: currentLayoutSnapshot, updatedAt: Date.now() } : profile) };
      }
    }

    if (saveSession && sessionDirty) {
      if (activeSessionId === DEFAULT_SESSION_PROFILE_ID) {
        const name = names.sessionName.trim();
        if (!name || nextStore.sessions.some(profile => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          showToast(name ? t.workspaceProfiles.duplicateName : t.workspaceProfiles.invalidName);
          return;
        }
        const profile: TabSessionProfile = { id: createProfileId('session'), name, snapshot: currentSessionSnapshot, updatedAt: Date.now() };
        nextStore = { ...nextStore, sessions: [...nextStore.sessions, profile] };
        nextSessionId = profile.id;
      } else {
        nextStore = { ...nextStore, sessions: nextStore.sessions.map(profile => profile.id === activeSessionId ? { ...profile, snapshot: currentSessionSnapshot, updatedAt: Date.now() } : profile) };
      }
    }

    const activeWorkspace = nextStore.workspaces.find(profile => profile.id === activeWorkspaceId);
    if (activeWorkspace) {
      const updatedWorkspace = {
        ...activeWorkspace,
        layoutId: activeWorkspace.layoutId === activeLayoutId && saveLayout && layoutDirty ? nextLayoutId : activeWorkspace.layoutId,
        sessionId: activeWorkspace.sessionId === activeSessionId && saveSession && sessionDirty ? nextSessionId : activeWorkspace.sessionId,
        updatedAt: Date.now(),
      };
      if (updatedWorkspace.layoutId !== activeWorkspace.layoutId || updatedWorkspace.sessionId !== activeWorkspace.sessionId) {
        nextStore = { ...nextStore, workspaces: nextStore.workspaces.map(profile => profile.id === activeWorkspaceId ? updatedWorkspace : profile) };
      }
    }

    persistProfileStoreForActive(nextStore, nextLayoutId, nextSessionId, activeWorkspaceId);
    executeWorkspaceAction(action, nextStore);
  }, [pendingWorkspaceAction, workspaceStore, activeLayoutId, activeSessionId, layoutDirty, sessionDirty, currentLayoutSnapshot, currentSessionSnapshot, showToast, t.workspaceProfiles.duplicateName, t.workspaceProfiles.invalidName, activeWorkspaceId, persistProfileStoreForActive, executeWorkspaceAction]);

  const discardPendingWorkspaceChanges = useCallback(() => {
    const action = pendingWorkspaceAction;
    if (!action) return;
    const discardLayout = action.type === 'quit' || action.type === 'workspace' || action.type === 'layout';
    const discardSession = action.type === 'quit' || action.type === 'workspace' || action.type === 'session';
    if (discardLayout) applyLayoutSnapshot(activeLayoutProfile?.snapshot ?? DEFAULT_LAYOUT_SNAPSHOT);
    if (discardSession) applySessionSnapshot(activeSessionProfile?.snapshot ?? defaultSessionSnapshot(startsAtSystemHome ? SYSTEM_HOME_PATH : '', t.sidebar.thisPc));
    executeWorkspaceAction(action);
  }, [pendingWorkspaceAction, activeLayoutProfile, activeSessionProfile, applyLayoutSnapshot, applySessionSnapshot, startsAtSystemHome, t.sidebar.thisPc, executeWorkspaceAction]);

  requestQuitWithUnsavedChangesRef.current = remember => requestWorkspaceAction({ type: 'quit', remember });

  const pendingLayoutChanged = Boolean(pendingWorkspaceAction && (pendingWorkspaceAction.type === 'quit' || pendingWorkspaceAction.type === 'workspace' || pendingWorkspaceAction.type === 'layout') && layoutDirty);
  const pendingSessionChanged = Boolean(pendingWorkspaceAction && (pendingWorkspaceAction.type === 'quit' || pendingWorkspaceAction.type === 'workspace' || pendingWorkspaceAction.type === 'session') && sessionDirty);

  useEffect(() => {
    try {
      window.localStorage.setItem(STARTUP_BEHAVIOR_KEY, startupBehavior);
    } catch {
      // Keep the selected startup behavior for this session when storage is unavailable.
    }
  }, [startupBehavior]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STARTUP_SESSION_KEY, startupSessionId);
    } catch {
      // Keep the selected startup session for this session when storage is unavailable.
    }
  }, [startupSessionId]);

  useEffect(() => {
    if (startupSessionId !== DEFAULT_SESSION_PROFILE_ID && !workspaceStore.sessions.some(profile => profile.id === startupSessionId)) {
      setStartupSessionId(DEFAULT_SESSION_PROFILE_ID);
    }
  }, [startupSessionId, workspaceStore.sessions]);

  useEffect(() => {
    if (launchedWithStartupOverride) return;
    if (workspaceStore.lastLayoutId === activeLayoutId
      && workspaceStore.lastSessionId === activeSessionId
      && workspaceStore.lastWorkspaceId === activeWorkspaceId) return;
    persistWorkspaceStore({
      ...workspaceStore,
      lastLayoutId: activeLayoutId,
      lastSessionId: activeSessionId,
      lastWorkspaceId: activeWorkspaceId,
    });
  }, [activeLayoutId, activeSessionId, activeWorkspaceId, launchedWithStartupOverride, persistWorkspaceStore, workspaceStore]);

  useEffect(() => {
    const updateSystemHomeTitle = (tabs: TabState[]) => {
      if (!tabs.some(tab => tab.currentPath === SYSTEM_HOME_PATH && tab.title !== t.sidebar.thisPc)) return tabs;
      return tabs.map(tab => tab.currentPath === SYSTEM_HOME_PATH ? { ...tab, title: t.sidebar.thisPc } : tab);
    };
    setLeftTabs(updateSystemHomeTitle);
    setRightTabs(updateSystemHomeTitle);
  }, [t.sidebar.thisPc]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_VIEW_PREFERENCES_KEY, JSON.stringify({
        layout,
        tabStripPosition,
        previewOpen,
        activePane,
        leftViewMode,
        rightViewMode,
        leftSortField: leftSort.sortField,
        leftSortOrder: leftSort.sortOrder,
        rightSortField: rightSort.sortField,
        rightSortOrder: rightSort.sortOrder,
        verticalSplitPercent,
        horizontalSplitPercent,
        previewSplitPercent,
        sidebarSplitPercent,
      } satisfies PanelViewPreferences));
    } catch {
      // Preference persistence is optional if browser storage is unavailable.
    }
  }, [layout, tabStripPosition, previewOpen, activePane, leftViewMode, rightViewMode, leftSort.sortField, leftSort.sortOrder, rightSort.sortField, rightSort.sortOrder, verticalSplitPercent, horizontalSplitPercent, previewSplitPercent, sidebarSplitPercent]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FOLDER_STYLE_LOCKED_KEY, String(folderStyleLocked));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [folderStyleLocked]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_LOCATIONS_NEW_TAB_KEY, String(sidebarLocationsOpenInNewTab));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [sidebarLocationsOpenInNewTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NEW_TABS_NEXT_TO_CURRENT_KEY, String(newTabsNextToCurrent));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [newTabsNextToCurrent]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_NEW_TAB_BUTTON_KEY, String(showNewTabButton));
      window.localStorage.setItem(DOUBLE_CLICK_TAB_BAR_KEY, String(doubleClickTabBar));
    } catch {
      // Keep tab bar preferences in memory when storage is unavailable.
    }
  }, [showNewTabButton, doubleClickTabBar]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_ITEMS_STYLE_KEY, JSON.stringify(recentItemStyle));
      window.localStorage.setItem(RECENT_ITEMS_BOLD_KEY, String(recentItemStyle.enabled));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [recentItemStyle]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_ITEMS_STYLE_KEY, JSON.stringify(hiddenItemStyle));
    } catch {
      // Keep the selected hidden item style for the current session when storage is unavailable.
    }
  }, [hiddenItemStyle]);

  useEffect(() => {
    try {
      window.localStorage.setItem(IMAGE_TOOLTIP_THUMBNAILS_KEY, String(imageTooltipThumbnailsEnabled));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [imageTooltipThumbnailsEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTIFICATION_BANNERS_KEY, String(notificationBannersEnabled));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [notificationBannersEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOOLTIPS_ENABLED_KEY, String(tooltipsEnabled));
    } catch {
      // Keep the selected behavior for the current session when storage is unavailable.
    }
  }, [tooltipsEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NAVIGATION_TRANSITIONS_ENABLED_KEY, String(navigationTransitionsEnabled));
      window.localStorage.setItem(NAVIGATION_TRANSITION_STYLE_KEY, navigationTransitionStyle);
    } catch {
      // Keep navigation transition preferences for the current session when storage is unavailable.
    }
  }, [navigationTransitionStyle, navigationTransitionsEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_FOLDER_SIZE_ENABLED_KEY, String(autoFolderSizeEnabled));
    } catch {
      // Keep the selected folder size behavior for the current session when storage is unavailable.
    }
  }, [autoFolderSizeEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RELATIVE_GRAPHS_ENABLED_KEY, String(relativeGraphsEnabled));
    } catch {
      // Keep the selected graph preference for this session when browser storage is unavailable.
    }
  }, [relativeGraphsEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_HIDDEN_FILES_KEY, String(showHiddenFiles));
    } catch {
      // Keep the selected file visibility for this session when browser storage is unavailable.
    }
  }, [showHiddenFiles]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_FILE_EXTENSIONS_KEY, String(showFileExtensions));
    } catch {
      // Keep the selected extension visibility for this session when browser storage is unavailable.
    }
  }, [showFileExtensions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_TERMINAL_OPTION_KEY, lastTerminalOption);
    } catch {
      // Keep the selected terminal option for this session when browser storage is unavailable.
    }
  }, [lastTerminalOption]);

  useEffect(() => {
    if (!isTauriDesktop()) return;
    let cancelled = false;
    void getWindowsSpecialFolders().then(folders => {
      if (!cancelled) setWindowsSpecialFolders(folders);
    }).catch(() => {
      // Keep the other toolbar actions available if Windows paths cannot be enumerated.
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DATE_FORMAT_KEY, dateFormat);
    } catch {
      // Keep the selected date format for this session when browser storage is unavailable.
    }
  }, [dateFormat]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SINGLE_CLICK_OPEN_KEY, String(singleClickOpen));
    } catch {
      // Keep the selected behavior for the current session if browser storage is unavailable.
    }
  }, [singleClickOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUICK_ACCESS_ORDER_KEY, JSON.stringify(quickAccessOrder));
    } catch {
      // Keep the current order for this session if storage is unavailable.
    }
  }, [quickAccessOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUICK_ACCESS_SORT_MODE_KEY, quickAccessSortMode);
    } catch {
      // Keep the current sort mode for this session if storage is unavailable.
    }
  }, [quickAccessSortMode]);
  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_QUICK_ACCESS_KEY, JSON.stringify(customQuickAccess));
    } catch {
      // Keep custom locations available for the current session if storage is unavailable.
    }
  }, [customQuickAccess]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EMPTY_AREA_DOUBLE_CLICK_KEY, String(emptyAreaDoubleClickNavigatesUp));
    } catch {
      // Keep the in-memory preference when browser storage is unavailable.
    }
  }, [emptyAreaDoubleClickNavigatesUp]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MOUSE_GESTURES_ENABLED_KEY, String(mouseGesturesEnabled));
    } catch {
      // Keep the current preference for this session if storage is unavailable.
    }
  }, [mouseGesturesEnabled]);

  const inactiveTabs = activePane === 'left' ? rightTabs : leftTabs;
  const setInactiveTabs = activePane === 'left' ? setRightTabs : setLeftTabs;
  const inactiveTabIndex = activePane === 'left' ? activeRightTabIndex : activeLeftTabIndex;
  const inactiveTab = inactiveTabs[inactiveTabIndex] || inactiveTabs[0];

  // Helper to update active tab state
  const updateActiveTab = useCallback((updater: (prevTab: TabState) => TabState) => {
    setActiveTabs(prev => {
      const next = [...prev];
      if (next[activeTabIndex]) {
        next[activeTabIndex] = updater(next[activeTabIndex]);
      }
      return next;
    });
  }, [setActiveTabs, activeTabIndex]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    updateActiveTab(tab => setTabViewMode(tab, mode));
  }, [updateActiveTab]);

  // Helper to update specific pane's active tab
  const updatePaneTab = useCallback((pane: 'left' | 'right', updater: (prevTab: TabState) => TabState) => {
    if (pane === 'left') {
      setLeftTabs(prev => {
        const next = [...prev];
        if (next[activeLeftTabIndex]) next[activeLeftTabIndex] = updater(next[activeLeftTabIndex]);
        return next;
      });
    } else {
      setRightTabs(prev => {
        const next = [...prev];
        if (next[activeRightTabIndex]) next[activeRightTabIndex] = updater(next[activeRightTabIndex]);
        return next;
      });
    }
  }, [activeLeftTabIndex, activeRightTabIndex]);

  const listBrowserDirectory = useCallback(async (path: string, explicitHandle?: any) => {
    const pathKey = getPathKey(path);
    const directoryHandle = explicitHandle ?? allFiles.find(item => getPathKey(item.path) === pathKey && item.isFolder)?.handle;
    if (!directoryHandle || directoryHandle.kind !== 'directory') {
      throw new Error('The browser folder handle is not available.');
    }

    const mapEntry = async (entry: any): Promise<FileItem> => {
      const isFolder = entry.kind === 'directory';
      const itemPath = joinWindowsPath(path, entry.name);
      let size = 0;
      let modifiedDate = '';
      let modifiedAtMs: number | undefined;
      if (!isFolder) {
        try {
          const file = await entry.getFile();
          size = file.size;
          modifiedAtMs = file.lastModified || undefined;
          modifiedDate = file.lastModified
            ? formatLocalDateTime(file.lastModified)
            : '';
        } catch {
          // The entry can disappear or lose access while a page is being read.
        }
      }
      return {
        id: `browser-${encodeURIComponent(itemPath.toLowerCase())}`,
        name: entry.name,
        path: itemPath,
        isFolder,
        type: detectFileType(entry.name, isFolder),
        size,
        modifiedDate,
        modifiedAtMs,
        extension: isFolder ? '' : getFileExtension(entry.name),
        handle: entry as FileSystemHandle,
      };
    };
    const entries: FileItem[] = [];
    const iterator: AsyncIterator<any> = directoryHandle.values();
    let batchHandles: any[] = [];
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      batchHandles.push(next.value);
      if (batchHandles.length === 64) {
        entries.push(...await Promise.all(batchHandles.map(mapEntry)));
        batchHandles = [];
      }
    }
    if (batchHandles.length > 0) entries.push(...await Promise.all(batchHandles.map(mapEntry)));
    return { entries, hasMore: false };
  }, [allFiles]);

  const invalidateFlatDirectories = useCallback((paths: string[]) => {
    const affected = Object.keys(flatDirectoriesRef.current).filter(rootKey =>
      paths.some(path => isSameOrDescendantPath(path, rootKey))
    );
    if (affected.length === 0) return;
    for (const key of affected) {
      flatVersions.current.set(key, (flatVersions.current.get(key) ?? 0) + 1);
      const stale = staleFlatIds.current.get(key) ?? new Set<string>();
      for (const item of flatDirectoriesRef.current[key]?.entries ?? []) stale.add(item.id);
      staleFlatIds.current.set(key, stale);
    }
    setFlatDirectories(previous => {
      const next = { ...previous };
      for (const key of affected) delete next[key];
      return next;
    });
  }, []);

  const loadFlatDirectory = useCallback(async (path: string) => {
    if (!isTauriDesktop()) return;
    const key = getPathKey(path);
    if (flatInFlight.current.has(key)) return;
    flatInFlight.current.add(key);
    const version = flatVersions.current.get(key) ?? 0;
    const previousIds = new Set([
      ...(flatDirectoriesRef.current[key]?.entries?.map(item => item.id) ?? []),
      ...(staleFlatIds.current.get(key) ?? []),
    ]);
    const generation = nativeWorkspaceGeneration.current;
    setFlatDirectories(previous => ({
      ...previous,
      [key]: { nextOffset: 0, hasMore: false, loading: true },
    }));
    try {
      const listing = await listNativeFlatDirectory(path);
      if (generation !== nativeWorkspaceGeneration.current || version !== (flatVersions.current.get(key) ?? 0)) return;
      const newIds = new Set(listing.entries.map(item => item.id));
      staleFlatIds.current.delete(key);
      setAllFiles(previous => {
        const byId = new Map(previous.map(item => [item.id, item]));
        const retained = previous.filter(item => !newIds.has(item.id) && !previousIds.has(item.id));
        const updated = listing.entries.map(item => ({ ...byId.get(item.id), ...item }));
        return [...retained, ...updated];
      });
      setFlatDirectories(previous => ({
        ...previous,
        [key]: { entries: listing.entries, counts: listing.counts, skippedCount: listing.skippedCount, nextOffset: listing.entries.length, hasMore: false, loading: false },
      }));
      const pending = [...flatSelectAllAfterLoad.current].filter(value => value.endsWith(`\u0000${key}`));
      const pendingSet = new Set(pending);
      for (const value of pending) flatSelectAllAfterLoad.current.delete(value);
      const reconcileSelection = (tabs: TabState[]) => tabs.map(tab => {
        if (!tab.flatView || getPathKey(tab.currentPath) !== key) return tab;
        if (pendingSet.has(`${tab.id}\u0000${key}`)) {
          const query = tab.filterQuery.trim().toLowerCase();
          const normalizedQuery = query.startsWith('*.') ? query.slice(2) : query.replace(/^\./, '');
          const selectedIds = listing.entries
            .filter(item => showHiddenFilesRef.current || !item.attributes?.includes('H'))
            .filter(item => !query || item.name.toLowerCase().includes(query)
              || item.path.toLowerCase().includes(query)
              || item.extension.toLowerCase().includes(normalizedQuery)
              || item.type.toLowerCase().includes(query))
            .map(item => item.id);
          return { ...tab, selectedIds, focusedId: selectedIds[0] ?? null };
        }
        const selectedIds = tab.selectedIds.filter(id => newIds.has(id));
        if (selectedIds.length === tab.selectedIds.length) return tab;
        const focusedId = tab.focusedId && selectedIds.includes(tab.focusedId) ? tab.focusedId : selectedIds[0] ?? null;
        return { ...tab, selectedIds, focusedId };
      });
      setLeftTabs(reconcileSelection);
      setRightTabs(reconcileSelection);
    } catch (error) {
      console.error('Flat directory scan failed:', path, error);
      for (const value of flatSelectAllAfterLoad.current) {
        if (value.endsWith(`\u0000${key}`)) flatSelectAllAfterLoad.current.delete(value);
      }
      if (generation === nativeWorkspaceGeneration.current && version === (flatVersions.current.get(key) ?? 0)) {
        setFlatDirectories(previous => ({
          ...previous,
          [key]: { nextOffset: 0, hasMore: false, loading: false, error: error instanceof Error ? error.message : String(error) },
        }));
      }
    } finally {
      flatInFlight.current.delete(key);
      if (generation !== nativeWorkspaceGeneration.current || version !== (flatVersions.current.get(key) ?? 0)) setFlatDirectories(previous => ({ ...previous }));
    }
  }, []);

  useEffect(() => {
    const visibleTabs = layout === 'single'
      ? [activePane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex]]
      : [leftTabs[activeLeftTabIndex], rightTabs[activeRightTabIndex]];
    for (const tab of visibleTabs) {
      if (!tab?.flatView || !tab.currentPath || tab.currentPath.startsWith('::')) continue;
      const state = flatDirectories[getPathKey(tab.currentPath)];
      if (!state || (!state.entries && !state.loading && !state.error)) void loadFlatDirectory(tab.currentPath);
    }
  }, [layout, activePane, leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, flatDirectories, loadFlatDirectory]);

  const filesById = useMemo(() => new Map([...allFiles, ...recycleBinItems].map(file => [file.id, file])), [allFiles, recycleBinItems]);

  // Get filtered & sorted files for a pane
  const getPaneDisplayFiles = useCallback((tabState: TabState) => {
    let items = tabState.currentPath === SYSTEM_HOME_PATH
      ? systemHomeItems
      : tabState.currentPath === RECYCLE_BIN_PATH
        ? recycleBinItems
        : tabState.flatView
          ? (flatDirectories[getPathKey(tabState.currentPath)]?.entries ?? []).map(item => filesById.get(item.id) ?? item)
          : childrenByParent.get(getPathKey(tabState.currentPath)) ?? [];

    if (!showHiddenFiles) {
      items = items.filter(item => !item.attributes?.includes('H') && (isTauriDesktop() || !item.name.startsWith('.')));
    }

    // Simple, predictable filtering. Advanced filters belong in the global search.
    if (tabState.filterQuery.trim()) {
      const q = tabState.filterQuery.toLowerCase();
      const normalizedQuery = q.startsWith('*.') ? q.slice(2) : q.replace(/^\./, '');
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (tabState.flatView && i.path.toLowerCase().includes(q)) ||
        i.extension.toLowerCase().includes(normalizedQuery) ||
        i.type.toLowerCase().includes(q)
      );
    }

    if (tabState.currentPath === SYSTEM_HOME_PATH) {
      const commonFolders = items.filter(item => item.id.startsWith('system-location-'));
      const availableDrives = items
        .filter(item => item.id.startsWith('system-drive-'))
        .sort((a, b) => {
          const letterA = a.path.match(/^([A-Z]):\\/i)?.[1]?.toUpperCase() ?? '';
          const letterB = b.path.match(/^([A-Z]):\\/i)?.[1]?.toUpperCase() ?? '';
          if (letterA === 'C') return letterB === 'C' ? 0 : -1;
          if (letterB === 'C') return 1;
          return letterA.localeCompare(letterB);
        });
      return [
        ...sortFiles(commonFolders, tabState.sortField, tabState.sortOrder),
        ...availableDrives,
      ];
    }
    return sortFiles(items, tabState.sortField, tabState.sortOrder);
  }, [childrenByParent, filesById, flatDirectories, recycleBinItems, showHiddenFiles, systemHomeItems]);

  const leftDisplayTab = leftTabs[activeLeftTabIndex];
  const rightDisplayTab = rightTabs[activeRightTabIndex];
  const leftDisplayFiles = useMemo(() => getPaneDisplayFiles(leftDisplayTab), [
    getPaneDisplayFiles, leftDisplayTab.currentPath, leftDisplayTab.filterQuery, leftDisplayTab.sortField, leftDisplayTab.sortOrder, leftDisplayTab.flatView,
  ]);
  const rightDisplayFiles = useMemo(() => getPaneDisplayFiles(rightDisplayTab), [
    getPaneDisplayFiles, rightDisplayTab.currentPath, rightDisplayTab.filterQuery, rightDisplayTab.sortField, rightDisplayTab.sortOrder, rightDisplayTab.flatView,
  ]);
  // Current item for the Preview Pane
  const activeDisplayFiles = activePane === 'left' ? leftDisplayFiles : rightDisplayFiles;
  const selectedItemsForDelete = currentTab.selectedIds.flatMap(id => {
    const item = filesById.get(id);
    return item ? [item] : [];
  });
  const activeFolderItem = React.useMemo(() => {
    if (!currentTab.currentPath || currentTab.currentPath === SYSTEM_HOME_PATH || currentTab.currentPath === RECYCLE_BIN_PATH) return null;
    const currentPathKey = getPathKey(currentTab.currentPath);
    return allFiles.find(item => item.isFolder && getPathKey(item.path) === currentPathKey) ?? null;
  }, [allFiles, currentTab.currentPath]);
  const previewItem = React.useMemo(() => {
    if (currentTab.selectedIds.length > 0) {
      const found = filesById.get(currentTab.selectedIds[0]);
      if (found) return found;
    }
    return activeFolderItem;
  }, [activeFolderItem, currentTab.selectedIds, filesById]);

  useEffect(() => {
    if (!previewItem || previewItem.isFolder || previewItem.contentPreview !== undefined || !isTextPreviewableFile(previewItem)) {
      return;
    }

    let cancelled = false;
    const loadTextPreview = async () => {
      try {
        const fileHandle = previewItem.handle as (FileSystemFileHandle | undefined);
        if (fileHandle && 'getFile' in fileHandle) {
          const file = await fileHandle.getFile();
          if (file.size > MAX_TEXT_PREVIEW_BYTES) return;
          const content = await file.text();
          if (!cancelled) {
            setAllFiles(previous => previous.map(item =>
              item.id === previewItem.id
                ? { ...item, size: file.size, modifiedAtMs: file.lastModified || item.modifiedAtMs, contentPreview: content }
                : item
            ));
          }
          return;
        }

        if (isTauriDesktop()) {
          const content = await loadNativeTextPreview(previewItem.path);
          if (!cancelled) {
            setAllFiles(previous => previous.map(item =>
              item.id === previewItem.id ? { ...item, contentPreview: content } : item
            ));
          }
        }
      } catch {
        // The item can disappear or lose access after it was listed.
      }
    };

    void loadTextPreview();
    return () => { cancelled = true; };
  }, [previewItem?.id, previewItem?.path, previewItem?.handle, previewItem?.extension, previewItem?.type, previewItem?.isFolder, previewItem?.contentPreview]);

  // Navigation handlers
  const handleNavigate = useCallback(async (newPath: string, targetPane: 'left' | 'right' = activePane, forceRefresh = false, openInNewTab = false, historyIndexOverride?: number) => {
    const targetPath = newPath === SYSTEM_HOME_PATH || newPath === RECYCLE_BIN_PATH ? newPath : normalizeWindowsPath(newPath);
    const pathKey = getPathKey(targetPath);
    if (nativeOpeningWorkspace.current) return;
    if (forceRefresh && targetPath !== SYSTEM_HOME_PATH && targetPath !== RECYCLE_BIN_PATH) invalidateFlatDirectories([targetPath]);
    const isDesktop = isTauriDesktop();
    if (targetPath === SYSTEM_HOME_PATH && isDesktop) {
      systemHomeWorkspace.current = true;
      nativeRootPath.current = SYSTEM_HOME_PATH;
      browserRootPath.current = '';
    }
    const targetTabs = targetPane === 'left' ? leftTabs : rightTabs;
    const targetTabIndex = targetPane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
    const targetTab = targetTabs[targetTabIndex];
    const systemWorkspace = systemHomeWorkspace.current || targetTab?.history.includes(SYSTEM_HOME_PATH) === true;
    const workspaceRoot = isDesktop ? nativeRootPath.current : browserRootPath.current;
    if (targetPath !== RECYCLE_BIN_PATH && workspaceRoot && !systemWorkspace && !isSameOrDescendantPath(targetPath, workspaceRoot)) {
      showToast(language === 'es' ? 'Abre una unidad o carpeta para cambiar el espacio de trabajo.' : 'Open a drive or folder to change the workspace.');
      return;
    }

    const folderName = targetPath === SYSTEM_HOME_PATH
      ? t.sidebar.thisPc
      : targetPath === RECYCLE_BIN_PATH
        ? t.sidebar.recycleBinTitle
        : targetPath.split(/\\|\//).filter(Boolean).pop() || targetPath;
    if (openInNewTab) {
      const sourceTab = targetTab ?? createEmptyTab(`tab-source-${Date.now()}`);
      const rememberedStyle = folderStyleLocked ? getTabFolderStyle(sourceTab) : DEFAULT_FOLDER_STYLE;
      const newHistory = getPathKey(sourceTab.currentPath) === pathKey
        ? sourceTab.history.slice()
        : [...sourceTab.history.slice(0, sourceTab.historyIndex + 1), targetPath].slice(-MAX_TAB_HISTORY_ENTRIES);
      const newTab: TabState = {
        ...sourceTab,
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        customTitle: undefined,
        tabColor: undefined,
        lockClose: false,
        currentPath: targetPath,
        title: folderName,
        history: newHistory.length > 0 ? newHistory : [targetPath],
        historyIndex: newHistory.length > 0 ? newHistory.length - 1 : 0,
        ...styleForPath(targetPath, rememberedStyle),
        folderStyle: rememberedStyle,
        filterQuery: '',
        selectedIds: [],
        focusedId: null,
      };
      const insertIndex = newTabsNextToCurrent ? targetTabIndex + 1 : targetTabs.length;
      if (targetPane === 'left') {
        setLeftTabs(previous => {
          const next = [...previous];
          next.splice(Math.min(insertIndex, next.length), 0, newTab);
          return next;
        });
        setActiveLeftTabIndex(insertIndex);
      } else {
        setRightTabs(previous => {
          const next = [...previous];
          next.splice(Math.min(insertIndex, next.length), 0, newTab);
          return next;
        });
        setActiveRightTabIndex(insertIndex);
      }
    } else {
      const updateCurrentTab = () => updatePaneTab(targetPane, tab => {
        if (getPathKey(tab.currentPath) === pathKey && historyIndexOverride === undefined) {
          return forceRefresh ? tab : { ...tab, selectedIds: [], focusedId: null };
        }
        const newHistory = historyIndexOverride === undefined
          ? [...tab.history.slice(0, tab.historyIndex + 1), targetPath].slice(-MAX_TAB_HISTORY_ENTRIES)
          : tab.history;
        const rememberedStyle = folderStyleLocked ? getTabFolderStyle(tab) : DEFAULT_FOLDER_STYLE;
        return {
          ...tab,
          currentPath: targetPath,
          title: folderName,
          history: newHistory,
          historyIndex: historyIndexOverride ?? newHistory.length - 1,
          ...styleForPath(targetPath, rememberedStyle),
          folderStyle: rememberedStyle,
          filterQuery: '',
          selectedIds: [],
          focusedId: null,
        };
      });
      const useViewTransition = navigationTransitionsEnabled
        && !forceRefresh
        && targetTab
        && getPathKey(targetTab.currentPath) !== pathKey
        && nativeLoadedDirectories.current.has(pathKey)
        && typeof document.startViewTransition === 'function'
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (useViewTransition) {
        const root = document.documentElement;
        const token = String(++navigationViewTransitionSequence.current);
        let motion: 'into' | 'up' | 'back' | 'forward' | 'other' = 'other';
        if (historyIndexOverride !== undefined && historyIndexOverride < targetTab.historyIndex) motion = 'back';
        else if (historyIndexOverride !== undefined && historyIndexOverride > targetTab.historyIndex) motion = 'forward';
        else if (isSameOrDescendantPath(targetPath, targetTab.currentPath)) motion = 'into';
        else if (isSameOrDescendantPath(targetTab.currentPath, targetPath)) motion = 'up';
        root.dataset.cyberfilesNavigationPane = targetPane;
        root.dataset.cyberfilesNavigationStyle = navigationTransitionStyle;
        root.dataset.cyberfilesNavigationMotion = motion;
        root.dataset.cyberfilesNavigationToken = token;
        const transition = document.startViewTransition(() => flushSync(updateCurrentTab));
        const clearTransition = () => {
          if (root.dataset.cyberfilesNavigationToken !== token) return;
          delete root.dataset.cyberfilesNavigationPane;
          delete root.dataset.cyberfilesNavigationStyle;
          delete root.dataset.cyberfilesNavigationMotion;
          delete root.dataset.cyberfilesNavigationToken;
        };
        void transition.finished.then(clearTransition, clearTransition);
      } else {
        updateCurrentTab();
      }
    }

    if (targetPath === SYSTEM_HOME_PATH) {
      if (forceRefresh) void refreshSystemHome();
      return;
    }
    if (targetPath === RECYCLE_BIN_PATH) {
      void refreshRecycleBinContents();
      return;
    }
    if (!workspaceRoot || (!systemWorkspace && !isSameOrDescendantPath(targetPath, workspaceRoot))) return;
    if (!forceRefresh && nativeLoadedDirectories.current.has(pathKey)) {
      rememberRecentFolder(targetPath);
      return;
    }
    if (nativeInFlightDirectories.current.has(pathKey)) return;

    const generation = nativeWorkspaceGeneration.current;
    nativeInFlightDirectories.current.set(pathKey, generation);
    setNativeDirectories(previous => ({ ...previous, [pathKey]: { ...(previous[pathKey] || { nextOffset: 0, hasMore: false }), counts: forceRefresh ? undefined : previous[pathKey]?.counts, loading: true } }));
    try {
      const listing = isDesktop
        ? await listNativeDirectory(targetPath)
        : await listBrowserDirectory(targetPath);
      if (generation !== nativeWorkspaceGeneration.current) return;
      const newEntryPaths = new Set(listing.entries.map(item => getPathKey(item.path)));
      setAllFiles(previous => {
        const previousDirectChildren = previous.filter(item => getPathKey(getParentPath(item.path)) === pathKey);
        const preservedLaterPages = listing.hasMore
          ? previousDirectChildren.filter(item => !newEntryPaths.has(getPathKey(item.path)))
          : [];
        const vanishedRoots = listing.hasMore ? [] : previousDirectChildren
          .filter(item => !newEntryPaths.has(getPathKey(item.path)))
          .map(item => item.path);
        const retained = previous.filter(item =>
          getPathKey(getParentPath(item.path)) !== pathKey &&
          !vanishedRoots.some(root => isSameOrDescendantPath(item.path, root))
        );
        return [...retained, ...preservedLaterPages, ...listing.entries];
      });
      if (forceRefresh) {
        const cachedIds = listing.hasMore
          ? allFiles.filter(item => getPathKey(getParentPath(item.path)) === pathKey).map(item => item.id)
          : [];
        const refreshedIds = new Set([...listing.entries.map(item => item.id), ...cachedIds]);
        updatePaneTab(targetPane, tab => {
          if (getPathKey(tab.currentPath) !== pathKey) return tab;
          const selectedIds = tab.selectedIds.filter(id => refreshedIds.has(id));
          const focusedId = tab.focusedId && selectedIds.includes(tab.focusedId)
            ? tab.focusedId
            : selectedIds[0] || null;
          return { ...tab, selectedIds, focusedId };
        });
      }
      nativeLoadedDirectories.current.add(pathKey);
      rememberRecentFolder(targetPath);
      setNativeDirectories(previous => ({
        ...previous,
        [pathKey]: {
          nextOffset: 'nextOffset' in listing && typeof listing.nextOffset === 'number'
            ? listing.nextOffset
            : listing.entries.length,
          hasMore: listing.hasMore,
          loading: false,
          counts: isDesktop ? (listing as Awaited<ReturnType<typeof listNativeDirectory>>).counts : undefined,
        },
      }));

      const pendingSelectionKey = `${targetPane}:${pathKey}`;
      if (selectAllAfterLoad.current.delete(pendingSelectionKey)) {
        updatePaneTab(targetPane, tab => {
          if (getPathKey(tab.currentPath) !== pathKey) return tab;
          const query = tab.filterQuery.trim() ? tab.filterQuery.toLowerCase() : '';
          const normalizedQuery = query.startsWith('*.') ? query.slice(2) : query.replace(/^\./, '');
          const selectedIds = listing.entries
            .filter(item => showHiddenFiles || (!item.attributes?.includes('H') && (isDesktop || !item.name.startsWith('.'))))
            .filter(item => !query || item.name.toLowerCase().includes(query)
              || item.extension.toLowerCase().includes(normalizedQuery)
              || item.type.toLowerCase().includes(query))
            .map(item => item.id);
          return { ...tab, selectedIds, focusedId: selectedIds[0] ?? null };
        });
      }
    } catch {
      selectAllAfterLoad.current.delete(`${targetPane}:${pathKey}`);
      if (generation === nativeWorkspaceGeneration.current) {
        setNativeDirectories(previous => ({
          ...previous,
          [pathKey]: { ...(previous[pathKey] || { nextOffset: 0, hasMore: false }), loading: false },
        }));
        showToast(language === 'es' ? 'No se pudo leer esta carpeta.' : 'This folder could not be read.');
      }
    } finally {
      if (nativeInFlightDirectories.current.get(pathKey) === generation) nativeInFlightDirectories.current.delete(pathKey);
    }
  }, [activePane, activeLeftTabIndex, activeRightTabIndex, allFiles, leftTabs, rightTabs, updatePaneTab, language, listBrowserDirectory, refreshSystemHome, refreshRecycleBinContents, showToast, t.sidebar.thisPc, t.sidebar.recycleBinTitle, folderStyleLocked, newTabsNextToCurrent, rememberRecentFolder, navigationTransitionsEnabled, navigationTransitionStyle, showHiddenFiles, invalidateFlatDirectories]);

  const lastSessionReloadHandled = useRef(0);
  useEffect(() => {
    const explicitReload = sessionReloadToken !== lastSessionReloadHandled.current;
    if (explicitReload) lastSessionReloadHandled.current = sessionReloadToken;
    const restoreActiveFolder = (pane: WorkspacePaneId, tab: TabState | undefined) => {
      if (!tab?.currentPath) return;
      if (tab.currentPath === SYSTEM_HOME_PATH) {
        if (explicitReload) void refreshSystemHome();
        return;
      }
      if (tab.currentPath === RECYCLE_BIN_PATH) {
        if (explicitReload) void refreshRecycleBinContents();
        return;
      }
      const pathKey = getPathKey(tab.currentPath);
      if (nativeLoadedDirectories.current.has(pathKey) || nativeInFlightDirectories.current.has(pathKey)) return;
      void handleNavigate(tab.currentPath, pane, true);
    };
    restoreActiveFolder('left', leftTabs[activeLeftTabIndex]);
    restoreActiveFolder('right', rightTabs[activeRightTabIndex]);
  }, [sessionReloadToken, activeLeftTabIndex, activeRightTabIndex, leftTabs, rightTabs, handleNavigate, refreshSystemHome, refreshRecycleBinContents]);

  const refreshChangedDirectories = useCallback(async (paths: string[]) => {
    invalidateFlatDirectories(paths);
    const affectedKeys = new Set(paths.filter(Boolean).map(getPathKey));
    for (const key of affectedKeys) nativeLoadedDirectories.current.delete(key);
    const visible = [
      { pane: 'left' as const, path: leftTabs[activeLeftTabIndex]?.currentPath },
      { pane: 'right' as const, path: rightTabs[activeRightTabIndex]?.currentPath },
    ];
    const refreshes = new Map<string, 'left' | 'right'>();
    for (const entry of visible) {
      if (entry.path && affectedKeys.has(getPathKey(entry.path)) && entry.path !== SYSTEM_HOME_PATH && entry.path !== RECYCLE_BIN_PATH) {
        refreshes.set(entry.pane + ':' + getPathKey(entry.path), entry.pane);
      }
    }
    await Promise.all(Array.from(refreshes, ([key, pane]) => {
      const path = visible.find(entry => entry.pane + ':' + getPathKey(entry.path || '') === key)?.path;
      return path ? handleNavigate(path, pane, true) : Promise.resolve();
    }));
  }, [activeLeftTabIndex, activeRightTabIndex, handleNavigate, invalidateFlatDirectories, leftTabs, rightTabs]);

  const focusRefreshSnapshot = useRef({
    layout,
    activePane,
    leftTabs,
    rightTabs,
    activeLeftTabIndex,
    activeRightTabIndex,
  });
  focusRefreshSnapshot.current = {
    layout,
    activePane,
    leftTabs,
    rightTabs,
    activeLeftTabIndex,
    activeRightTabIndex,
  };
  const refreshSystemHomeRef = useRef(refreshSystemHome);
  refreshSystemHomeRef.current = refreshSystemHome;

  const handleNavigateRef = useRef(handleNavigate);
  handleNavigateRef.current = handleNavigate;


  useEffect(() => {
    if (!isTauriDesktop()) return;

    const refreshVisibleDirectories = () => {
      if (focusRefreshTimer.current !== null) window.clearTimeout(focusRefreshTimer.current);
      focusRefreshTimer.current = window.setTimeout(() => {
        focusRefreshTimer.current = null;
        const snapshot = focusRefreshSnapshot.current;
        const visiblePanes: Array<'left' | 'right'> = snapshot.layout === 'single'
          ? [snapshot.activePane]
          : ['left', 'right'];
        const refreshedPaths = new Set<string>();
        let refreshedSystemHome = false;

        for (const pane of visiblePanes) {
          const tab = pane === 'left'
            ? snapshot.leftTabs[snapshot.activeLeftTabIndex]
            : snapshot.rightTabs[snapshot.activeRightTabIndex];
          if (!tab?.currentPath) continue;
          const pathKey = getPathKey(tab.currentPath);
          if (refreshedPaths.has(pathKey)) continue;
          refreshedPaths.add(pathKey);

          if (tab.currentPath === SYSTEM_HOME_PATH) {
            if (!refreshedSystemHome) {
              refreshedSystemHome = true;
              void refreshSystemHomeRef.current();
            }
            continue;
          }
          void handleNavigateRef.current(tab.currentPath, pane, true);
        }
      }, 250);
    };

    window.addEventListener('focus', refreshVisibleDirectories);
    return () => {
      window.removeEventListener('focus', refreshVisibleDirectories);
      if (focusRefreshTimer.current !== null) {
        window.clearTimeout(focusRefreshTimer.current);
        focusRefreshTimer.current = null;
      }
    };
  }, []);

  const openWorkspaceRoot = useCallback((rootPath: string, rootName: string) => {
    const resetTabs = (tabs: TabState[]) => tabs.map(tab => {
      const rememberedStyle = folderStyleLocked ? getTabFolderStyle(tab) : DEFAULT_FOLDER_STYLE;
      return {
        ...tab,
        title: rootName,
        currentPath: rootPath,
        history: [rootPath],
        historyIndex: 0,
        ...styleForPath(rootPath, rememberedStyle),
        folderStyle: rememberedStyle,
        filterQuery: '',
        selectedIds: [],
        focusedId: null,
      };
    });
    setLeftTabs(resetTabs);
    setRightTabs(resetTabs);
  }, [folderStyleLocked]);

  const activateSystemHome = useCallback(() => {
    completeOnboarding();
    if (!isTauriDesktop()) return;

    systemHomeWorkspace.current = true;
    nativeRootPath.current = SYSTEM_HOME_PATH;
    browserRootPath.current = '';
    nativeWorkspaceGeneration.current += 1;
    nativeOpeningWorkspace.current = false;
    nativeLoadedDirectories.current.clear();
    nativeInFlightDirectories.current.clear();
    selectAllAfterLoad.current.clear();
    setNativeDirectories({});
    setAllFiles([]);
    setQuickAccess([]);
    openWorkspaceRoot(SYSTEM_HOME_PATH, t.sidebar.thisPc);
    void refreshSystemHome();
  }, [completeOnboarding, openWorkspaceRoot, refreshSystemHome, t.sidebar.thisPc]);

  const handleNavigateBack = useCallback((targetPane: 'left' | 'right' = activePane) => {
    const tabs = targetPane === 'left' ? leftTabs : rightTabs;
    const activeIndex = targetPane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
    const tab = tabs[activeIndex];
    if (!tab || tab.historyIndex <= 0) return;
    const nextIndex = tab.historyIndex - 1;
    void handleNavigate(tab.history[nextIndex], targetPane, true, false, nextIndex);
  }, [activePane, activeLeftTabIndex, activeRightTabIndex, leftTabs, rightTabs, handleNavigate]);

  const handleNavigateForward = useCallback((targetPane: 'left' | 'right' = activePane) => {
    const tabs = targetPane === 'left' ? leftTabs : rightTabs;
    const activeIndex = targetPane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
    const tab = tabs[activeIndex];
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;
    const nextIndex = tab.historyIndex + 1;
    void handleNavigate(tab.history[nextIndex], targetPane, true, false, nextIndex);
  }, [activePane, activeLeftTabIndex, activeRightTabIndex, leftTabs, rightTabs, handleNavigate]);

  const handleNavigateUp = useCallback((targetPane: 'left' | 'right' = activePane) => {
    const activeTabObj = targetPane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    if (activeTabObj.currentPath === RECYCLE_BIN_PATH) {
      if (activeTabObj.historyIndex > 0) handleNavigateBack(targetPane);
      else if (systemHomeWorkspace.current) handleNavigate(SYSTEM_HOME_PATH, targetPane);
      return;
    }
    const currentPath = activeTabObj.currentPath === SYSTEM_HOME_PATH
      ? SYSTEM_HOME_PATH
      : normalizeWindowsPath(activeTabObj.currentPath);
    if (currentPath === SYSTEM_HOME_PATH) return;
    if (isWindowsDriveRoot(currentPath)) {
      if (systemHomeWorkspace.current || activeTabObj.history.includes(SYSTEM_HOME_PATH)) {
        handleNavigate(SYSTEM_HOME_PATH, targetPane);
      }
      return;
    }
    const parent = getParentPath(currentPath);
    if (parent && parent !== currentPath) {
      handleNavigate(parent, targetPane);
    }
  }, [leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, handleNavigate, handleNavigateBack]);

  // Helper to update lastAccessed timestamp for files across the filesystem
  const touchFileAccessed = useCallback((ids: string | string[], customDate?: string) => {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) return;
    const now = customDate || new Date().toISOString();
    setAllFiles(prev =>
      prev.map(f => {
        if (targetIds.includes(f.id)) {
          return { ...f, lastAccessed: now };
        }
        return f;
      })
    );
  }, []);

  const handleClearRecentFiles = useCallback(() => {
    setAllFiles(prev => prev.map(f => ({ ...f, lastAccessed: undefined })));
    showToast('Historial de archivos recientes limpiado');
  }, []);

  // Quick jump & preview from Recent Files tab in Sidebar
  const handleSelectRecentFile = useCallback((file: FileItem) => {
    const parentPath = getParentPath(file.path);
    handleNavigate(parentPath, activePane);
    setTimeout(() => {
      updateActiveTab(t => ({
        ...t,
        selectedIds: [file.id],
        focusedId: file.id,
      }));
      setPreviewOpen(true);
    }, 50);
    touchFileAccessed(file.id);
    showToast(`Accediendo a "${file.name}"`);
  }, [activePane, handleNavigate, updateActiveTab, touchFileAccessed]);

  // Instant Search navigation and selection
  const handleNavigateToFile = useCallback((file: FileItem) => {
    const parentPath = getParentPath(file.path);
    handleNavigate(parentPath, activePane);
    setTimeout(() => {
      updateActiveTab(t => ({
        ...t,
        selectedIds: [file.id],
        focusedId: file.id,
      }));
    }, 50);
    touchFileAccessed(file.id);
    showToast(`Navegando a "${file.name}"`);
  }, [activePane, handleNavigate, updateActiveTab, touchFileAccessed]);

  const handlePreviewFileFromSearch = useCallback((file: FileItem) => {
    const parentPath = getParentPath(file.path);
    handleNavigate(parentPath, activePane);
    setTimeout(() => {
      updateActiveTab(t => ({
        ...t,
        selectedIds: [file.id],
        focusedId: file.id,
      }));
      setPreviewOpen(true);
    }, 50);
    touchFileAccessed(file.id);
    showToast(`Previsualizando "${file.name}"`);
  }, [activePane, handleNavigate, updateActiveTab, touchFileAccessed]);

  // Tab management
  const handleAddTab = (pane: 'left' | 'right', sourceIndex?: number) => {
    const sourceTabs = pane === 'left' ? leftTabs : rightTabs;
    const activeIndex = sourceIndex ?? (pane === 'left' ? activeLeftTabIndex : activeRightTabIndex);
    const currentActive = sourceTabs[activeIndex];
    const baseStyle = folderStyleLocked ? getTabFolderStyle(currentActive) : DEFAULT_FOLDER_STYLE;
    const newPath = isTauriDesktop() ? SYSTEM_HOME_PATH : currentActive.currentPath;
    const newTab: TabState = {
      ...currentActive,
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      customTitle: undefined,
      tabColor: undefined,
      lockClose: false,
      title: isTauriDesktop() ? t.sidebar.thisPc : `${currentActive.title} (2)`,
      currentPath: newPath,
      history: isTauriDesktop() ? [SYSTEM_HOME_PATH] : currentActive.history,
      historyIndex: isTauriDesktop() ? 0 : currentActive.historyIndex,
      ...styleForPath(newPath, baseStyle),
      folderStyle: baseStyle,
      filterQuery: '',
      selectedIds: [],
      focusedId: null,
    };
    const insertIndex = newTabsNextToCurrent ? activeIndex + 1 : sourceTabs.length;
    if (pane === 'left') {
      setLeftTabs(prev => {
        const next = [...prev];
        next.splice(Math.min(insertIndex, next.length), 0, newTab);
        return next;
      });
      setActiveLeftTabIndex(insertIndex);
    } else {
      setRightTabs(prev => {
        const next = [...prev];
        next.splice(Math.min(insertIndex, next.length), 0, newTab);
        return next;
      });
      setActiveRightTabIndex(insertIndex);
    }
  };

  const closeTabIndices = (pane: WorkspacePaneId, indices: number[]) => {
    const sourceTabs = pane === 'left' ? leftTabs : rightTabs;
    const requested = new Set(indices);
    const closable = sourceTabs.flatMap((tab, index) => requested.has(index) && !tab.lockClose ? [index] : []);
    if (closable.length === 0 || sourceTabs.length <= 1) return;
    if (closable.length === sourceTabs.length) closable.pop();
    const closing = new Set(closable);
    const removed = sourceTabs.flatMap((tab, index) => closing.has(index) ? [{ pane, tab, index }] : []);
    const newTabs = sourceTabs.filter((_, index) => !closing.has(index));
    const oldActiveIndex = pane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
    const oldActiveId = sourceTabs[oldActiveIndex]?.id;
    const retainedActiveIndex = newTabs.findIndex(tab => tab.id === oldActiveId);
    const nextActiveIndex = retainedActiveIndex >= 0 ? retainedActiveIndex : Math.min(oldActiveIndex, newTabs.length - 1);
    setClosedTabs(previous => [...previous, ...removed].slice(-20));
    if (pane === 'left') {
      setLeftTabs(newTabs);
      setActiveLeftTabIndex(nextActiveIndex);
    } else {
      setRightTabs(newTabs);
      setActiveRightTabIndex(nextActiveIndex);
    }
  };

  const handleCloseTab = (pane: WorkspacePaneId, indexToClose: number) => closeTabIndices(pane, [indexToClose]);

  const canOpenTabParent = (tab: TabState) => {
    if (!tab.currentPath || tab.currentPath === SYSTEM_HOME_PATH || tab.currentPath === RECYCLE_BIN_PATH) return false;
    const parent = getParentPath(tab.currentPath);
    if (!parent || getPathKey(parent) === getPathKey(tab.currentPath)) return false;
    const workspaceRoot = isTauriDesktop() ? nativeRootPath.current : browserRootPath.current;
    return !workspaceRoot || systemHomeWorkspace.current || isSameOrDescendantPath(parent, workspaceRoot);
  };

  const reopenClosedTab = () => {
    const closed = closedTabs.at(-1);
    if (closed) {
      const targetTabs = closed.pane === 'left' ? leftTabs : rightTabs;
      const setTargetTabs = closed.pane === 'left' ? setLeftTabs : setRightTabs;
      const setTargetIndex = closed.pane === 'left' ? setActiveLeftTabIndex : setActiveRightTabIndex;
      const insertIndex = Math.min(closed.index, targetTabs.length);
      setTargetTabs(previous => {
        const next = [...previous];
        next.splice(Math.min(insertIndex, next.length), 0, { ...closed.tab, id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` });
        return next;
      });
      setTargetIndex(insertIndex);
      setActivePane(closed.pane);
      setClosedTabs(previous => previous.slice(0, -1));
    }
  };

  const handleTabMenuAction = (action: TabMenuAction, value?: string) => {
    if (!tabMenuTarget) return;
    const { pane, tabId } = tabMenuTarget;
    const sourceTabs = pane === 'left' ? leftTabs : rightTabs;
    const index = sourceTabs.findIndex(tab => tab.id === tabId);
    if (index < 0) return;
    const tab = sourceTabs[index];
    const setSourceTabs = pane === 'left' ? setLeftTabs : setRightTabs;
    const insertCopy = (targetPane: WorkspacePaneId, copiedTab: TabState, afterIndex: number, forceRight = false) => {
      const targetTabs = targetPane === 'left' ? leftTabs : rightTabs;
      const setTargetTabs = targetPane === 'left' ? setLeftTabs : setRightTabs;
      const setTargetIndex = targetPane === 'left' ? setActiveLeftTabIndex : setActiveRightTabIndex;
      const insertIndex = forceRight || newTabsNextToCurrent ? afterIndex + 1 : targetTabs.length;
      setTargetTabs(previous => {
        const next = [...previous];
        next.splice(Math.min(insertIndex, next.length), 0, copiedTab);
        return next;
      });
      setTargetIndex(insertIndex);
      setActivePane(targetPane);
    };
    if (action === 'new') {
      handleAddTab(pane, index);
      setActivePane(pane);
    } else if (action === 'duplicate' || action === 'duplicateRight' || action === 'duplicateOpposite') {
      const targetPane = action === 'duplicateOpposite' ? (pane === 'left' ? 'right' : 'left') : pane;
      const targetIndex = action === 'duplicateOpposite' ? (targetPane === 'left' ? activeLeftTabIndex : activeRightTabIndex) : index;
      insertCopy(targetPane, {
        ...tab,
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        lockClose: false,
        history: [...tab.history],
        selectedIds: [],
        focusedId: null,
      }, targetIndex, action === 'duplicateRight');
      if (action === 'duplicateOpposite' && layout === 'single') setLayout('dual-vertical');
    } else if (action === 'parent') {
      const parent = getParentPath(tab.currentPath);
      if (canOpenTabParent(tab)) {
        const rememberedStyle = folderStyleLocked ? getTabFolderStyle(tab) : DEFAULT_FOLDER_STYLE;
        insertCopy(pane, {
          ...tab,
          id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: parent.split(/\\|\//).filter(Boolean).pop() || parent,
          customTitle: undefined,
          tabColor: undefined,
          lockClose: false,
          currentPath: parent,
          history: [parent],
          historyIndex: 0,
          ...styleForPath(parent, rememberedStyle),
          folderStyle: rememberedStyle,
          filterQuery: '',
          selectedIds: [],
          focusedId: null,
        }, index);
      }
    } else if (action === 'reopen') {
      reopenClosedTab();
    } else if (action === 'rename') {
      setSourceTabs(previous => previous.map(item => item.id === tabId ? { ...item, customTitle: value?.trim() || undefined } : item));
    } else if (action === 'color') {
      setSourceTabs(previous => previous.map(item => item.id === tabId ? { ...item, tabColor: value || undefined } : item));
    } else if (action === 'lock') {
      setSourceTabs(previous => previous.map(item => item.id === tabId ? { ...item, lockClose: !item.lockClose } : item));
    } else if (action === 'close') {
      handleCloseTab(pane, index);
    } else if (action === 'closeLeft') {
      closeTabIndices(pane, sourceTabs.flatMap((_, candidate) => candidate < index ? [candidate] : []));
    } else if (action === 'closeRight') {
      closeTabIndices(pane, sourceTabs.flatMap((_, candidate) => candidate > index ? [candidate] : []));
    } else if (action === 'closeOthers') {
      closeTabIndices(pane, sourceTabs.flatMap((_, candidate) => candidate !== index ? [candidate] : []));
    } else if (action === 'top' || action === 'bottom' || action === 'left' || action === 'right') {
      setTabStripPosition(action);
    } else if (action === 'settings') {
      setFocusTabSettingsRequest(previous => previous + 1);
      setIsSettingsOpen(true);
    }
    setTabMenuTarget(null);
  };

  const handleTabStripMenuAction = (action: TabStripMenuAction) => {
    if (!tabStripMenuTarget) return;
    if (action === 'new') {
      handleAddTab(tabStripMenuTarget.pane);
      setActivePane(tabStripMenuTarget.pane);
    } else if (action === 'reopen') {
      reopenClosedTab();
    } else if (action === 'toggleNewButton') {
      setShowNewTabButton(value => !value);
    } else if (action === 'toggleDoubleClick') {
      setDoubleClickTabBar(value => !value);
    } else if (action === 'top' || action === 'bottom' || action === 'left' || action === 'right') {
      setTabStripPosition(action);
    } else if (action === 'settings') {
      setFocusTabSettingsRequest(previous => previous + 1);
      setIsSettingsOpen(true);
    }
    setTabStripMenuTarget(null);
  };

  // Selection handler
  const handleSelectItems = (pane: 'left' | 'right', ids: string[], isAdditive = false, isRange = false, replaceExactly = false, focusedId?: string) => {
    setActivePane(pane);
    updatePaneTab(pane, tab => {
      let newSelection = [...tab.selectedIds];

      if (replaceExactly) {
        newSelection = [...new Set(ids)];
      } else if (isRange && tab.selectedIds.length > 0) {
        const displayList = pane === 'left' ? leftDisplayFiles : rightDisplayFiles;
        const lastSelectedId = tab.selectedIds[tab.selectedIds.length - 1];
        const lastIdx = displayList.findIndex(f => f.id === lastSelectedId);
        const currentIdx = displayList.findIndex(f => f.id === ids[0]);

        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          newSelection = displayList.slice(start, end + 1).map(f => f.id);
        }
      } else if (isAdditive) {
        ids.forEach(id => {
          if (newSelection.includes(id)) {
            newSelection = newSelection.filter(x => x !== id);
          } else {
            newSelection.push(id);
          }
        });
      } else {
        const clickedId = ids[0];
        if (clickedId && tab.selectedIds.includes(clickedId)) {
          newSelection = tab.selectedIds.length === 1 ? [] : [clickedId];
        } else {
          newSelection = ids;
        }
      }

      return {
        ...tab,
        selectedIds: newSelection,
        focusedId: focusedId && newSelection.includes(focusedId) ? focusedId : ids[0] && newSelection.includes(ids[0]) ? ids[0] : newSelection[0] || null,
      };
    });
  };

  const handleSelectAllVisible = () => {
    const pathKey = getPathKey(currentTab.currentPath);
    if (currentTab.flatView && !currentTab.currentPath.startsWith('::') && !flatDirectories[pathKey]?.entries) flatSelectAllAfterLoad.current.add(`${currentTab.id}\u0000${pathKey}`);
    else if (!currentTab.flatView && nativeDirectories[pathKey]?.loading) selectAllAfterLoad.current.add(`${activePane}:${pathKey}`);
    const visibleIds = activeDisplayFiles.map(file => file.id);
    updateActiveTab(tab => ({ ...tab, selectedIds: visibleIds, focusedId: visibleIds[0] || null }));
  };

  const handleSelectCurrentFolderItemsByType = (isFolder: boolean) => {
    const matchingIds = activeDisplayFiles.filter(file => file.isFolder === isFolder).map(file => file.id);
    updateActiveTab(tab => ({ ...tab, selectedIds: matchingIds, focusedId: matchingIds[0] || null }));
  };

  const handleUnselectAll = () => {
    updateActiveTab(tab => ({ ...tab, selectedIds: [], focusedId: null }));
  };

  const handleInvertVisibleSelection = () => {
    const visibleIds = new Set(activeDisplayFiles.map(file => file.id));
    updateActiveTab(tab => {
      const selected = new Set(tab.selectedIds);
      const preservedIds = tab.selectedIds.filter(id => !visibleIds.has(id));
      const invertedVisibleIds = activeDisplayFiles.filter(file => !selected.has(file.id)).map(file => file.id);
      return {
        ...tab,
        selectedIds: [...preservedIds, ...invertedVisibleIds],
        focusedId: invertedVisibleIds[0] || preservedIds[0] || null,
      };
    });
  };

  // Double click on file/folder
  const handleItemDoubleClick = (item: FileItem, pane: 'left' | 'right') => {
    if (item.recycleBinId) {
      void handleRestoreRecycleBinItems([item]);
      return;
    }
    if (item.isFolder) {
      handleNavigate(item.path, pane);
    } else {
      touchFileAccessed(item.id);
      setPreviewOpen(true);
      if (isTauriDesktop()) {
        void openNativeFileWithDefaultApp(item.path).catch(() => showToast(t.core.fileOpenFailed));
        return;
      }
      showToast(`Visualizando "${item.name}"`);
    }
  };

  const updateTransferOperation = useCallback((jobId: string, update: (operation: TransferOperationView) => TransferOperationView) => {
    const current = transferOperationsRef.current;
    const index = current.findIndex(operation => operation.jobId === jobId);
    if (index < 0) return;
    const next = current.slice();
    next[index] = update(current[index]);
    transferOperationsRef.current = next;
    setTransferOperations(next);
  }, []);

  const clearTransferHistory = useCallback(() => {
    const next = transferOperationsRef.current.filter(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status));
    transferOperationsRef.current = next;
    setTransferOperations(next);
  }, []);

  const transferCompletionActionsRef = useRef({ refreshChangedDirectories, updatePaneTab, showToast, t, leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, pushUndoAction, updateUndoAction, removeUndoAction });
  transferCompletionActionsRef.current = { refreshChangedDirectories, updatePaneTab, showToast, t, leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, pushUndoAction, updateUndoAction, removeUndoAction };

  useEffect(() => {
    if (!isTauriDesktop()) {
      setTransferEventsReady(true);
      return;
    }
    let cancelled = false;
    let unlistenProgress: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;
    const setupListeners = async () => {
      const [stopProgress, stopFinished] = await Promise.all([
        listen<NativeTransferProgress>('transfer-operation-progress', event => {
          updateTransferOperation(event.payload.jobId, operation => ({ ...operation, ...event.payload }));
        }),
        listen<NativeTransferFinished>('transfer-operation-finished', event => {
          const operation = transferOperationsRef.current.find(item => item.jobId === event.payload.jobId);
          if (!operation) return;
          void (async () => {
            const result = event.payload.result;
            const passwordFailure = result.failures[0]?.error;
            if (operation.kind === 'extract' && (passwordFailure === 'ARCHIVE_PASSWORD_REQUIRED' || passwordFailure === 'ARCHIVE_INVALID_PASSWORD')) {
              archivePasswordsRef.current.delete(operation.jobId);
              const actions = transferCompletionActionsRef.current;
              updateTransferOperation(operation.jobId, current => ({
                ...current,
                status: 'awaiting-password',
                error: passwordFailure === 'ARCHIVE_INVALID_PASSWORD' ? actions.t.core.archivePasswordIncorrect : undefined,
              }));
              if (activeTransferIdRef.current === operation.jobId) activeTransferIdRef.current = null;
              return;
            }
            archivePasswordsRef.current.delete(operation.jobId);
            const actions = transferCompletionActionsRef.current;
            const changedDirectories = [operation.targetPath];
            if (operation.kind === 'move') changedDirectories.push(...operation.sourcePaths.map(getParentPath));
            try {
              await actions.refreshChangedDirectories(changedDirectories);
            } catch (error) {
              actions.showToast(actions.t.core.operationFailedWithReason.replace('{reason}', String(error)));
            }
            if (result.completedPaths.length > 0 && operation.selectionPane && operation.kind !== 'extract') {
              const paneTabs = operation.selectionPane === 'left' ? actions.leftTabs : actions.rightTabs;
              const activeIndex = operation.selectionPane === 'left' ? actions.activeLeftTabIndex : actions.activeRightTabIndex;
              if (getPathKey(paneTabs[activeIndex]?.currentPath || '') === getPathKey(operation.targetPath)) {
                const pastedIds = result.completedPaths.map(path => 'native-' + encodeURIComponent(path.toLowerCase()));
                actions.updatePaneTab(operation.selectionPane, tab => ({ ...tab, selectedIds: pastedIds, focusedId: pastedIds[0] }));
              }
            } else if (operation.kind === 'move' && operation.sourcePane && !operation.clipboardSequence) {
              const paneTabs = operation.sourcePane === 'left' ? actions.leftTabs : actions.rightTabs;
              const activeIndex = operation.sourcePane === 'left' ? actions.activeLeftTabIndex : actions.activeRightTabIndex;
              const sourceParent = operation.sourcePaths[0] ? getParentPath(operation.sourcePaths[0]) : '';
              if (getPathKey(paneTabs[activeIndex]?.currentPath || '') === getPathKey(sourceParent)) {
                actions.updatePaneTab(operation.sourcePane, tab => ({ ...tab, selectedIds: [], focusedId: null }));
              }
            }
            if (operation.clipboardSequence && result.completedPaths.length > 0 && result.failures.length === 0) {
              try {
                await clearNativeFileClipboard(operation.clipboardSequence);
              } catch (error) {
                actions.showToast(actions.t.core.operationFailedWithReason.replace('{reason}', String(error)));
              }
            }
            const archiveFailureMessages: Record<string, string> = {
              ARCHIVE_UNSAFE_ENTRY: actions.t.core.archiveUnsafeExtraction,
              ARCHIVE_ADDITIONAL_VOLUMES: actions.t.core.archiveRequiresVolumes,
              ARCHIVE_SIZE_LIMIT: actions.t.core.archiveSizeLimit,
              ARCHIVE_TOO_MANY_ENTRIES: actions.t.core.archiveTooManyEntries,
              ARCHIVE_OUTPUT_NAME: operation.kind === 'compress' ? actions.t.core.archiveZipOutputName : actions.t.core.archiveOutputName,
              ARCHIVE_SOURCE_SYMLINK: actions.t.core.archiveSourceSymlink,
              ARCHIVE_UNSUPPORTED_SOURCE: actions.t.core.archiveUnsupportedSource,
              ARCHIVE_SOURCE_CHANGED: actions.t.core.archiveSourceChanged,
              ARCHIVE_OUTPUT_INSIDE_SOURCE: actions.t.core.archiveOutputInsideSource,
              ARCHIVE_INVALID_SOURCE: actions.t.core.archiveInvalidSource,
              ARCHIVE_NO_SOURCES: actions.t.core.archiveNoSources,
              ARCHIVE_SOURCE_TOO_MANY_ENTRIES: actions.t.core.archiveZipTooManyEntries,
              UNDO_DESTINATION_CONFLICT: actions.t.toolbar.undoMoveConflict,
            };
            const failureReason = result.failures[0]
              ? archiveFailureMessages[result.failures[0].error] ?? result.failures[0].error
              : undefined;
            const wasCancelled = result.failures.some(failure => failure.error.toLowerCase().includes('cancelled'));
            const status = wasCancelled ? 'cancelled' : result.failures.length > 0 ? 'failed' : 'completed';
            if (operation.undoActionId) {
              undoPendingIdsRef.current.delete(operation.undoActionId);
              setUndoBusy(undoPendingIdsRef.current.size > 0);
              if (status === 'completed' && result.completedPaths.length === operation.sourcePaths.length) {
                actions.removeUndoAction(operation.undoActionId);
              } else {
                if (result.completedPaths.length > 0) {
                  const completedTargetKeys = new Set(result.completedPaths.map(getPathKey));
                  actions.updateUndoAction(operation.undoActionId, current => {
                    if (current.undo?.type !== 'move') return current;
                    const remainingPairs = current.undo.pairs.filter(pair => !completedTargetKeys.has(getPathKey(pair.to)));
                    if (remainingPairs.length === 0) return null;
                    return { ...current, count: remainingPairs.length, undo: { type: 'move', pairs: remainingPairs } };
                  });
                }
              }
            } else if (result.completedPaths.length > 0) {
              const leafName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
              if (operation.kind === 'copy') {
                actions.pushUndoAction({
                  kind: 'copy',
                  name: leafName(result.completedPaths[0]),
                  count: result.completedPaths.length,
                  canUndo: true,
                  undo: { type: 'remove', paths: result.completedPaths },
                });
              } else if (operation.kind === 'move') {
                const allSucceeded = result.failures.length === 0 && result.completedPaths.length === operation.sourcePaths.length;
                const sourceParents = new Set(operation.sourcePaths.map(path => getPathKey(getParentPath(path))));
                const sameParent = sourceParents.size === 1;
                const isNoOp = allSucceeded && result.completedPaths.every((path, index) => getPathKey(path) === getPathKey(operation.sourcePaths[index]));
                if (!isNoOp) {
                  const reversible = allSucceeded && sameParent;
                  actions.pushUndoAction({
                    kind: 'move',
                    name: leafName(operation.sourcePaths[0] ?? ''),
                    count: result.completedPaths.length,
                    canUndo: reversible,
                    blockedReason: reversible ? undefined : actions.t.toolbar.undoMoveUnavailable,
                    undo: reversible ? {
                      type: 'move',
                      pairs: result.completedPaths.map((from, index) => ({ from, to: operation.sourcePaths[index] })),
                    } : null,
                  });
                }
              } else if (operation.kind === 'extract') {
                actions.pushUndoAction({
                  kind: 'extract',
                  name: leafName(operation.sourcePaths[0] ?? ''),
                  count: 1,
                  canUndo: true,
                  undo: { type: 'remove', paths: result.completedPaths },
                });
              } else {
                actions.pushUndoAction({
                  kind: 'compress',
                  name: leafName(result.completedPaths[0]),
                  count: 1,
                  canUndo: true,
                  undo: { type: 'remove', paths: result.completedPaths },
                });
              }
            }
            if (operation.undoActionId && status === 'completed') {
              actions.showToast(actions.t.toolbar.undoCompleted);
            } else if (operation.undoActionId && result.failures.length === 0) {
              actions.showToast(actions.t.toolbar.undoFailed);
            } else if (result.failures.length > 0) {
              actions.showToast(actions.t.core.operationPartial
                .replace('{completed}', String(result.completedPaths.length))
                .replace('{failed}', String(result.failures.length))
                .replace('{reason}', failureReason ?? ''));
            } else if (result.completedPaths.length > 0) {
              if (operation.kind === 'extract') {
                const archiveName = operation.sourcePaths[0]?.split(/[\\/]/).pop() ?? '';
                actions.showToast(actions.t.core.archiveExtracted.replace('{archive}', archiveName).replace('{target}', result.completedPaths[0] ?? operation.targetPath));
              } else if (operation.kind === 'compress') {
                actions.showToast(actions.t.core.archiveCompressed.replace('{path}', result.completedPaths[0]));
              } else if (operation.kind === 'copy') {
                actions.showToast(actions.t.core.copied.replace('{count}', String(result.completedPaths.length)).replace('{target}', operation.targetPath));
              } else if (operation.clipboardSequence) {
                actions.showToast(actions.t.core.pasted.replace('{count}', String(result.completedPaths.length)));
              } else {
                actions.showToast(actions.t.core.moved.replace('{count}', String(result.completedPaths.length)).replace('{target}', operation.targetPath));
              }
            }
            updateTransferOperation(operation.jobId, current => ({ ...current, status, error: failureReason, resultPath: operation.kind === 'compress' ? result.completedPaths[0] : current.resultPath }));
            if (activeTransferIdRef.current === operation.jobId) activeTransferIdRef.current = null;
          })();
        }),
      ]);
      if (cancelled) {
        stopProgress();
        stopFinished();
      } else {
        unlistenProgress = stopProgress;
        unlistenFinished = stopFinished;
        setTransferEventsReady(true);
      }
    };
    void setupListeners().catch(error => {
      const actions = transferCompletionActionsRef.current;
      actions.showToast(actions.t.core.operationFailedWithReason.replace('{reason}', String(error)));
    });
    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenFinished?.();
    };
  }, [updateTransferOperation]);
  useEffect(() => {
    if (!isTauriDesktop()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen('tray-quit-requested', () => {
      void (async () => {
        try {
          const hasPendingTransfers = transferOperationsRef.current.some(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status));
          if (hasPendingTransfers) {
            const window = getCurrentWindow();
            await window.show();
            await window.setFocus();
            showToast(language === 'es'
              ? 'Hay transferencias pendientes. Minimiza CyberFiles para dejarlas terminar.'
              : 'Transfers are still pending. Minimize CyberFiles to let them finish.');
            return;
          }
          await invoke('quit_app');
        } catch (error) {
          showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
        }
      })();
    }).then(stop => {
      if (cancelled) stop();
      else unlisten = stop;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [language, showToast, t.core.operationFailedWithReason]);

  const queueNativeTransfer = useCallback((kind: TransferKind, paths: string[], targetPath: string, options: { sourcePane?: 'left' | 'right'; selectionPane?: 'left' | 'right'; clipboardSequence?: number; extractionMode?: ArchiveExtractionMode; archiveName?: string; undoActionId?: string; preserveNames?: boolean } = {}) => {
    if (paths.length === 0) return;
    const operation: TransferOperationView = {
      jobId: createOperationId(kind),
      kind,
      phase: 'scanning',
      currentItem: '',
      bytesCopied: 0,
      totalBytes: 0,
      currentFileBytes: 0,
      currentFileTotal: 0,
      itemsCompleted: 0,
      totalItems: 0,
      sourcePaths: paths,
      targetPath,
      status: 'queued',
      startedAt: null,
      sourcePane: options.sourcePane,
      selectionPane: options.selectionPane,
      clipboardSequence: options.clipboardSequence,
      extractionMode: options.extractionMode,
      archiveName: options.archiveName,
      undoActionId: options.undoActionId,
      preserveNames: options.preserveNames,
    };
    const next = [...transferOperationsRef.current, operation];
    transferOperationsRef.current = next;
    setTransferOperations(next);
  }, []);

  useEffect(() => {
    if (!isTauriDesktop() || !transferEventsReady || activeTransferIdRef.current) return;
    const nextOperation = transferOperationsRef.current.find(operation => operation.status === 'queued');
    if (!nextOperation) return;
    activeTransferIdRef.current = nextOperation.jobId;
    updateTransferOperation(nextOperation.jobId, operation => ({ ...operation, status: 'running', startedAt: Date.now() }));
    void (nextOperation.kind === 'extract'
      ? startNativeArchiveExtractionOperation(nextOperation.sourcePaths[0] ?? '', nextOperation.targetPath, nextOperation.jobId, nextOperation.extractionMode ?? 'folder', archivePasswordsRef.current.get(nextOperation.jobId))
      : nextOperation.kind === 'compress'
        ? startNativeZipCompressionOperation(nextOperation.sourcePaths, nextOperation.targetPath, nextOperation.archiveName ?? 'Archive.zip', nextOperation.jobId)
        : startNativeTransferOperation(nextOperation.sourcePaths, nextOperation.targetPath, nextOperation.jobId, nextOperation.kind === 'move', nextOperation.preserveNames ?? false))
      .catch(error => {
        const reason = String(error);
        archivePasswordsRef.current.delete(nextOperation.jobId);
        updateTransferOperation(nextOperation.jobId, operation => ({ ...operation, status: 'failed', error: reason }));
        if (activeTransferIdRef.current === nextOperation.jobId) activeTransferIdRef.current = null;
        if (nextOperation.undoActionId) {
          undoPendingIdsRef.current.delete(nextOperation.undoActionId);
          setUndoBusy(undoPendingIdsRef.current.size > 0);
          showToast(t.toolbar.undoFailed);
        } else {
          showToast(t.core.operationFailedWithReason.replace('{reason}', reason));
        }
      });
  }, [showToast, t.core.operationFailedWithReason, t.toolbar.undoFailed, transferEventsReady, transferOperations, updateTransferOperation]);

  const toggleTransferPause = useCallback(async (jobId: string) => {
    const operation = transferOperationsRef.current.find(item => item.jobId === jobId);
    if (!operation || !['running', 'paused'].includes(operation.status)) return;
    const wasPaused = operation.status === 'paused';
    updateTransferOperation(jobId, current => ({ ...current, status: wasPaused ? 'running' : 'paused' }));
    try {
      await (wasPaused ? resumeNativeTransferOperation(jobId) : pauseNativeTransferOperation(jobId));
    } catch (error) {
      updateTransferOperation(jobId, current => ({ ...current, status: wasPaused ? 'paused' : 'running' }));
      showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
    }
  }, [showToast, t.core.operationFailedWithReason, updateTransferOperation]);

  const cancelTransfer = useCallback(async (jobId: string) => {
    const operation = transferOperationsRef.current.find(item => item.jobId === jobId);
    if (!operation || ['cancelling', 'cancelled', 'completed', 'failed'].includes(operation.status)) return;
    if (operation.status === 'queued' || operation.status === 'awaiting-password') {
      archivePasswordsRef.current.delete(jobId);
      updateTransferOperation(jobId, current => ({ ...current, status: 'cancelled', error: undefined }));
      if (operation.undoActionId) {
        undoPendingIdsRef.current.delete(operation.undoActionId);
        setUndoBusy(undoPendingIdsRef.current.size > 0);
      }
      return;
    }
    updateTransferOperation(jobId, current => ({ ...current, status: 'cancelling' }));
    try {
      await cancelNativeTransferOperation(jobId);
    } catch (error) {
      updateTransferOperation(jobId, current => ({ ...current, status: operation.status }));
      showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
    }
  }, [showToast, t.core.operationFailedWithReason, updateTransferOperation]);

  const submitArchivePassword = useCallback((jobId: string, password: string) => {
    if (!password) return;
    archivePasswordsRef.current.set(jobId, password);
    updateTransferOperation(jobId, operation => ({ ...operation, status: 'queued', error: undefined }));
  }, [updateTransferOperation]);

  const handleUndoAction = useCallback(async (id: string) => {
    const action = undoHistoryRef.current.find(entry => entry.id === id);
    const hasActiveTransfer = transferOperationsRef.current.some(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status));
    if (!action || !action.canUndo || !action.undo || undoPendingIdsRef.current.has(id) || isFileOperationBusy || hasActiveTransfer) return;
    undoPendingIdsRef.current.add(id);
    setUndoBusy(true);
    let queued = false;
    try {
      const descriptor = action.undo;
      if (descriptor.type === 'move') {
        const targetPath = getParentPath(descriptor.pairs[0]?.to ?? '');
        if (!isTauriDesktop() || !targetPath || descriptor.pairs.some(pair => getPathKey(getParentPath(pair.to)) !== getPathKey(targetPath))) {
          throw new Error(t.toolbar.undoMoveUnavailable);
        }
        queueNativeTransfer('move', descriptor.pairs.map(pair => pair.from), targetPath, {
          undoActionId: id,
          preserveNames: true,
        });
        queued = true;
        return;
      }

      if (descriptor.type === 'rename') {
        const remaining: typeof descriptor.pairs = [];
        let completed = 0;
        if (isTauriDesktop()) {
          for (const pair of [...descriptor.pairs].reverse()) {
            try {
              const originalName = pair.before.split(/[\\/]/).filter(Boolean).pop();
              if (!originalName) throw new Error(t.toolbar.undoFailed);
              await renameNativeItem(pair.after, originalName);
              completed += 1;
            } catch {
              remaining.unshift(pair);
            }
          }
          const changedParents = descriptor.pairs.flatMap(pair => [getParentPath(pair.before), getParentPath(pair.after)]);
          if (completed > 0) await refreshChangedDirectories(changedParents);
        } else {
          const pairs = [...descriptor.pairs].reverse();
          setAllFiles(previous => previous.map(item => {
            let next = item;
            for (const pair of pairs) {
              if (!isSameOrDescendantPath(next.path, pair.after)) continue;
              const isRoot = getPathKey(next.path) === getPathKey(pair.after);
              next = {
                ...next,
                name: isRoot ? pair.before.split(/[\\/]/).filter(Boolean).pop() ?? next.name : next.name,
                path: rewritePathPrefix(next.path, pair.after, pair.before),
                extension: isRoot && !next.isFolder ? getFileExtension(pair.before) : next.extension,
                type: isRoot ? detectFileType(pair.before, next.isFolder) : next.type,
              };
            }
            return next;
          }));
          completed = descriptor.pairs.length;
        }
        if (remaining.length > 0) {
          updateUndoAction(id, current => ({ ...current, count: remaining.length, undo: { type: 'rename', pairs: remaining } }));
          showToast(t.toolbar.undoPartial.replace('{completed}', String(completed)).replace('{failed}', String(remaining.length)));
        } else {
          removeUndoAction(id);
          showToast(t.toolbar.undoCompleted);
        }
        return;
      }

      if (descriptor.type === 'restore') {
        if (!isTauriDesktop()) throw new Error(t.toolbar.undoFailed);
        const result = await restoreNativeRecycleBinItems(descriptor.items.map(item => ({ id: item.id })));
        const restoredIds = new Set(result.restoredIds);
        const remaining = descriptor.items.filter(item => !restoredIds.has(item.id));
        if (restoredIds.size > 0) {
          await refreshChangedDirectories(descriptor.items.filter(item => restoredIds.has(item.id)).map(item => getParentPath(item.originalPath)));
          void refreshRecycleBinStatus();
          void refreshRecycleBinContents();
        }
        if (remaining.length > 0) {
          updateUndoAction(id, current => ({ ...current, count: remaining.length, undo: { type: 'restore', items: remaining } }));
          showToast(t.toolbar.undoPartial.replace('{completed}', String(restoredIds.size)).replace('{failed}', String(remaining.length)));
        } else {
          removeUndoAction(id);
          showToast(t.toolbar.undoCompleted);
        }
        return;
      }

      if (descriptor.type === 'remove-virtual') {
        const removedKeys = new Set(descriptor.paths.map(getPathKey));
        setAllFiles(previous => previous.filter(item => !removedKeys.has(getPathKey(item.path))));
        removeUndoAction(id);
        showToast(t.toolbar.undoCompleted);
        return;
      }

      if (descriptor.type === 'remove') {
        if (!isTauriDesktop()) throw new Error(t.toolbar.undoFailed);
        const result = await moveNativeItemsToRecycleBin(descriptor.paths);
        const completedKeys = new Set(result.recycledPaths.map(getPathKey));
        const remaining = descriptor.paths.filter(path => !completedKeys.has(getPathKey(path)));
        if (completedKeys.size > 0) {
          await refreshChangedDirectories(result.recycledPaths.map(getParentPath));
          void refreshRecycleBinStatus();
          void refreshRecycleBinContents();
        }
        if (remaining.length > 0) {
          updateUndoAction(id, current => ({ ...current, count: remaining.length, undo: { type: 'remove', paths: remaining } }));
          showToast(t.toolbar.undoPartial.replace('{completed}', String(completedKeys.size)).replace('{failed}', String(remaining.length)));
        } else {
          removeUndoAction(id);
          showToast(t.toolbar.undoCompleted);
        }
      }
    } catch {
      showToast(t.toolbar.undoFailed);
    } finally {
      if (!queued) {
        undoPendingIdsRef.current.delete(id);
        setUndoBusy(undoPendingIdsRef.current.size > 0);
      }
    }
  }, [isFileOperationBusy, queueNativeTransfer, refreshChangedDirectories, refreshRecycleBinContents, refreshRecycleBinStatus, removeUndoAction, setAllFiles, showToast, t.toolbar.undoCompleted, t.toolbar.undoFailed, t.toolbar.undoMoveUnavailable, t.toolbar.undoPartial, updateUndoAction]);

  const startCopyWithProgress = useCallback((paths: string[], targetPath: string, selectionPane?: 'left' | 'right') => {
    queueNativeTransfer('copy', paths, targetPath, { selectionPane });
  }, [queueNativeTransfer]);
  const moveItemsToPath = useCallback(async (selectedIds: string[], targetPath: string, sourcePane: 'left' | 'right' = activePane) => {
    if (targetPath === SYSTEM_HOME_PATH || targetPath === RECYCLE_BIN_PATH) {
      showToast(t.pane.chooseRealDestinationFolder);
      return;
    }
    const roots = getRootItems(allFiles, selectedIds);
    if (roots.length === 0) return;

    if (roots.some(root => root.isFolder && isSameOrDescendantPath(targetPath, root.path))) {
      showToast(t.core.cannotMoveIntoSelf);
      return;
    }

    if (isTauriDesktop()) {
      queueNativeTransfer('move', roots.map(root => root.path), targetPath, { sourcePane });
      return;
    }
    const movingIds = new Set(roots.map(root => root.id));
    const siblingNames = new Set(
      getChildItems(allFiles, targetPath)
        .filter(item => !movingIds.has(item.id))
        .map(item => item.name)
    );
    const destinations = roots.map(root => {
      const parentPath = getParentPath(root.path);
      const name = normalizeWindowsPath(parentPath).toLowerCase() === normalizeWindowsPath(targetPath).toLowerCase()
        ? root.name
        : getUniqueName(root.name, siblingNames);
      siblingNames.add(name);
      return { root, destination: joinWindowsPath(targetPath, name) };
    });
    const now = new Date().toISOString();

    setAllFiles(prev => prev.map(item => {
      const destination = destinations.find(({ root }) => isSameOrDescendantPath(item.path, root.path));
      if (!destination) return item;
      return {
        ...item,
        path: rewritePathPrefix(item.path, destination.root.path, destination.destination),
        modifiedDate: now.replace('T', ' ').slice(0, 16),
        lastAccessed: now,
      };
    }));

    const changedDestinations = destinations.filter(({ root, destination }) => root.path !== destination);
    if (changedDestinations.length > 0) {
      pushUndoAction({
        kind: 'move',
        name: changedDestinations.length === 1 ? changedDestinations[0].root.name : '',
        count: changedDestinations.length,
        canUndo: true,
        undo: {
          type: 'rename',
          pairs: changedDestinations.map(({ root, destination }) => ({ before: root.path, after: destination })),
        },
      });
    }

    updatePaneTab(sourcePane, tab => ({ ...tab, selectedIds: [], focusedId: null }));
    showToast(t.core.moved.replace('{count}', String(roots.length)).replace('{target}', targetPath));
  }, [activePane, allFiles, pushUndoAction, queueNativeTransfer, t.core.cannotMoveIntoSelf, t.core.moved, t.pane.chooseRealDestinationFolder, showToast, updatePaneTab]);

  const handleCopySelectedFromPane = useCallback((sourcePane: 'left' | 'right') => {
    const sourceTab = sourcePane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    const destinationTab = sourcePane === 'left' ? rightTabs[activeRightTabIndex] : leftTabs[activeLeftTabIndex];
    const roots = getRootItems(allFiles, sourceTab.selectedIds);
    if (roots.length === 0) return;
    const targetPath = destinationTab.currentPath;
    if (targetPath === SYSTEM_HOME_PATH || targetPath === RECYCLE_BIN_PATH) {
      showToast(t.pane.chooseRealDestinationFolder);
      return;
    }
    if (roots.some(root => root.isFolder && isSameOrDescendantPath(targetPath, root.path))) {
      showToast(t.core.cannotCopyIntoSelf);
      return;
    }

    if (isTauriDesktop()) {
      startCopyWithProgress(roots.map(root => root.path), targetPath, sourcePane);
      return;
    }

    const names = new Set(getChildItems(allFiles, targetPath).map(item => item.name));
    const now = new Date().toISOString();
    const newCopies = roots.flatMap(root => {
      const copyName = getUniqueName(root.name, names);
      names.add(copyName);
      const destination = joinWindowsPath(targetPath, copyName);
      return getItemsInTree(allFiles, root.path).map(item => ({
        ...item,
        id: createOperationId('copy'),
        path: rewritePathPrefix(item.path, root.path, destination),
        modifiedDate: now.replace('T', ' ').slice(0, 16),
        lastAccessed: now,
        handle: undefined,
      }));
    });

    setAllFiles(prev => [...prev, ...newCopies]);
    showToast(t.core.copied.replace('{count}', String(roots.length)).replace('{target}', destinationTab.title));
  }, [activeLeftTabIndex, activeRightTabIndex, allFiles, leftTabs, rightTabs, showToast, startCopyWithProgress, t.core.cannotCopyIntoSelf, t.core.copied, t.pane.chooseRealDestinationFolder]);

  const handleCopySelected = useCallback(() => {
    handleCopySelectedFromPane(activePane);
  }, [activePane, handleCopySelectedFromPane]);

  const handleMoveSelectedFromPane = useCallback((sourcePane: 'left' | 'right') => {
    const sourceTab = sourcePane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    const destinationTab = sourcePane === 'left' ? rightTabs[activeRightTabIndex] : leftTabs[activeLeftTabIndex];
    return moveItemsToPath(sourceTab.selectedIds, destinationTab.currentPath, sourcePane);
  }, [activeLeftTabIndex, activeRightTabIndex, leftTabs, moveItemsToPath, rightTabs]);

  const handleMoveSelected = useCallback(() => {
    void handleMoveSelectedFromPane(activePane);
  }, [activePane, handleMoveSelectedFromPane]);

  const handleFileClipboard = useCallback(async (item: FileItem | undefined, isCut: boolean, pane: 'left' | 'right' = activePane) => {
    if (!isTauriDesktop()) {
      showToast(t.core.desktopFileOperationsOnly);
      return;
    }
    const paneTab = pane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    const selectedIds = item
      ? paneTab.selectedIds.includes(item.id) ? paneTab.selectedIds : [item.id]
      : paneTab.selectedIds;
    const roots = getRootItems(allFiles, selectedIds).filter(file => !file.recycleBinId && !file.path.startsWith('::'));
    if (roots.length === 0) {
      showToast(t.core.noSelection);
      return;
    }
    try {
      await setNativeFileClipboard(roots.map(file => file.path), isCut);
      showToast(isCut ? t.core.filesCutToClipboard : t.core.filesCopiedToClipboard);
    } catch (error) {
      showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
    }
  }, [activeLeftTabIndex, activePane, activeRightTabIndex, allFiles, leftTabs, rightTabs, showToast, t.core.desktopFileOperationsOnly, t.core.filesCopiedToClipboard, t.core.filesCutToClipboard, t.core.noSelection, t.core.operationFailedWithReason]);

  const handlePasteFiles = useCallback(async (pane: 'left' | 'right' = activePane, destinationOverride?: string) => {
    if (!isTauriDesktop()) {
      showToast(t.core.desktopFileOperationsOnly);
      return;
    }
    if (isFileOperationBusy) return;
    const paneTab = pane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    const targetPath = destinationOverride || paneTab.currentPath;
    if (!targetPath || targetPath === SYSTEM_HOME_PATH || targetPath === RECYCLE_BIN_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    try {
      const clipboard = await getNativeFileClipboard();
      if (clipboard.paths.length > 0) {
        if (clipboard.isCut) {
          queueNativeTransfer('move', clipboard.paths, targetPath, { selectionPane: pane, clipboardSequence: clipboard.sequenceNumber });
        } else {
          queueNativeTransfer('copy', clipboard.paths, targetPath, { selectionPane: pane });
        }
        return;
      }
      setIsFileOperationBusy(true);
      try {
        const pastedImage = await pasteNativeClipboardImage(targetPath, t.core.clipboardImageFileBaseName);
        if (!pastedImage) {
          showToast(t.core.fileClipboardEmpty);
          return;
        }
        pushUndoAction({
          kind: 'create',
          name: pastedImage.name,
          count: 1,
          canUndo: true,
          undo: { type: 'remove', paths: [pastedImage.path] },
        });
        await refreshChangedDirectories([targetPath]);
        const createdAtMs = pastedImage.createdMs ?? pastedImage.modifiedMs ?? Date.now();
        const modifiedAtMs = pastedImage.modifiedMs ?? createdAtMs;
        const imageId = `native-${encodeURIComponent(pastedImage.path.toLowerCase())}`;
        const imageItem: FileItem = {
          id: imageId,
          name: pastedImage.name,
          path: pastedImage.path,
          isFolder: false,
          type: 'image',
          size: pastedImage.size,
          modifiedDate: formatLocalDateTime(modifiedAtMs),
          createdDate: formatLocalDateTime(createdAtMs),
          modifiedAtMs,
          createdAtMs,
          extension: 'png',
        };
        setAllFiles(previous => [
          ...previous.filter(item => getPathKey(item.path) !== getPathKey(pastedImage.path)),
          imageItem,
        ]);
        updatePaneTab(pane, tab => ({ ...tab, selectedIds: [imageId], focusedId: imageId }));
        showToast(t.core.pastedImage.replace('{name}', pastedImage.name));
      } finally {
        setIsFileOperationBusy(false);
      }
    } catch (error) {
      showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
    }
  }, [activeLeftTabIndex, activePane, activeRightTabIndex, isFileOperationBusy, leftTabs, pushUndoAction, queueNativeTransfer, refreshChangedDirectories, rightTabs, showToast, t.core.clipboardImageFileBaseName, t.core.desktopFileOperationsOnly, t.core.fileClipboardEmpty, t.core.operationFailedWithReason, t.core.pastedImage, t.pane.chooseRealFolderFirst, updatePaneTab]);
  const handleDropFiles = useCallback((droppedIds: string[], targetFolderPath?: string, sourcePane?: 'left' | 'right') => {
    moveItemsToPath(droppedIds, targetFolderPath || currentTab.currentPath, sourcePane);
  }, [currentTab.currentPath, moveItemsToPath]);

  const handleInlineRename = useCallback(async (itemId: string, newName: string, pane: 'left' | 'right' = activePane) => {
    const item = allFiles.find(file => file.id === itemId);
    if (!item || !isValidFileName(newName)) {
      showToast(t.core.invalidName);
      return;
    }

    const siblingConflict = getChildItems(allFiles, getParentPath(item.path)).some(
      sibling => sibling.id !== item.id && sibling.name.toLowerCase() === newName.toLowerCase()
    );
    if (siblingConflict) {
      showToast(t.core.conflict);
      return;
    }

    if (isTauriDesktop()) {
      if (isFileOperationBusy) return;
      setIsFileOperationBusy(true);
      try {
        const renamedPath = await renameNativeItem(item.path, newName);
        if (renamedPath !== item.path) {
          pushUndoAction({
            kind: 'rename',
            name: newName,
            count: 1,
            canUndo: true,
            undo: { type: 'rename', pairs: [{ before: item.path, after: renamedPath }] },
          });
        }
        await refreshChangedDirectories([getParentPath(item.path)]);
        const renamedId = `native-${encodeURIComponent(renamedPath.toLowerCase())}`;
        const renamedEntry: FileItem = {
          ...item,
          id: renamedId,
          name: newName,
          path: renamedPath,
          extension: item.isFolder ? '' : getFileExtension(newName),
          type: detectFileType(newName, item.isFolder),
        };
        setAllFiles(previous => [
          ...previous.filter(candidate => !isSameOrDescendantPath(candidate.path, item.path)),
          renamedEntry,
        ]);
        updatePaneTab(pane, tab => ({ ...tab, selectedIds: [renamedId], focusedId: renamedId }));
        showToast(t.core.renamed.replace('{name}', newName));
      } catch (error) {
        showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
      } finally {
        setIsFileOperationBusy(false);
      }
      return;
    }

    const destination = joinWindowsPath(getParentPath(item.path), newName);
    const now = new Date().toISOString();
    setAllFiles(prev => prev.map(candidate => {
      if (!isSameOrDescendantPath(candidate.path, item.path)) return candidate;
      const isRoot = candidate.id === item.id;
      return {
        ...candidate,
        name: isRoot ? newName : candidate.name,
        path: rewritePathPrefix(candidate.path, item.path, destination),
        extension: isRoot && !item.isFolder ? getFileExtension(newName) : candidate.extension,
        type: isRoot ? detectFileType(newName, item.isFolder) : candidate.type,
        lastAccessed: now,
      };
    }));
    if (destination !== item.path) {
      pushUndoAction({
        kind: 'rename',
        name: newName,
        count: 1,
        canUndo: true,
        undo: { type: 'rename', pairs: [{ before: item.path, after: destination }] },
      });
    }
    showToast(t.core.renamed.replace('{name}', newName));
  }, [activePane, allFiles, isFileOperationBusy, pushUndoAction, refreshChangedDirectories, showToast, t.core.conflict, t.core.invalidName, t.core.operationFailedWithReason, t.core.renamed, updatePaneTab]);

  const beginInlineRename = useCallback((item: FileItem, paneId: 'left' | 'right') => {
    if (item.recycleBinId) {
      showToast(t.core.recycleBinRestoreFirst);
      return;
    }

    renameRequestSequence.current += 1;
    setRenameRequest({ requestId: renameRequestSequence.current, itemId: item.id, paneId });
  }, [showToast, t.core.recycleBinRestoreFirst]);

  const handleRenameRequestHandled = useCallback((requestId: number) => {
    setRenameRequest(current => current?.requestId === requestId ? null : current);
  }, []);

  const handleRenameSelected = useCallback(() => {
    const item = selectedItemsForDelete[0];
    if (!item) {
      showToast(t.core.noSelection);
      return;
    }
    beginInlineRename(item, activePane);
  }, [activePane, beginInlineRename, selectedItemsForDelete, showToast, t.core.noSelection]);

  const handleCopySelectedPaths = useCallback(async (items: FileItem[]) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(items.map(item => item.path).join('\n'));
      showToast(items.length === 1 ? t.sidebar.copyPathSuccess : t.sidebar.copyPathsSuccess);
    } catch {
      showToast(items.length === 1 ? t.sidebar.copyPathFailure : t.sidebar.copyPathsFailure);
    }
  }, [showToast, t.sidebar.copyPathFailure, t.sidebar.copyPathSuccess, t.sidebar.copyPathsFailure, t.sidebar.copyPathsSuccess]);

  const handleCopyFolderPath = useCallback(async (path: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(path);
      showToast(t.sidebar.copyPathSuccess);
    } catch {
      showToast(t.sidebar.copyPathFailure);
    }
  }, [showToast, t.sidebar.copyPathFailure, t.sidebar.copyPathSuccess]);

  const handleOpenWindowsProperties = useCallback(async (item: FileItem | null) => {
    if (!item || !isTauriDesktop()) return;
    try {
      await showNativeFileProperties(item.path);
    } catch {
      showToast(t.preview.windowsPropertiesFailed);
    }
  }, [showToast, t.preview.windowsPropertiesFailed]);

  const handleApplyBatchRename = useCallback(async (renames: { id: string; original: string; renamed: string }[]) => {
    const lookup = new Map(renames.map(rename => [rename.id, rename.renamed]));
    const roots = getRootItems(allFiles, renames.map(rename => rename.id));
    const destinations = new Map<string, string>();
    const occupied = new Set<string>();

    for (const root of roots) {
      const newName = lookup.get(root.id);
      if (!newName || newName === root.name) continue;
      if (!isValidFileName(newName)) {
        showToast(t.core.invalidName);
        return;
      }
      const destination = joinWindowsPath(getParentPath(root.path), newName).toLowerCase();
      if (occupied.has(destination) || allFiles.some(item => item.id !== root.id && item.path.toLowerCase() === destination)) {
        showToast(t.core.conflict);
        return;
      }
      occupied.add(destination);
      destinations.set(root.id, joinWindowsPath(getParentPath(root.path), newName));
    }

    if (isTauriDesktop()) {
      if (isFileOperationBusy) return;
      const changedRoots = roots.filter(root => destinations.has(root.id));
      if (changedRoots.length === 0) return;
      setIsFileOperationBusy(true);
      const renamedPaths: string[] = [];
      const undoPairs: Array<{ before: string; after: string }> = [];
      const renamedEntries: FileItem[] = [];
      const failures: string[] = [];
      try {
        for (const root of changedRoots) {
          try {
            const newName = lookup.get(root.id)!;
            const path = await renameNativeItem(root.path, newName);
            const id = `native-${encodeURIComponent(path.toLowerCase())}`;
            renamedPaths.push(path);
            if (path !== root.path) undoPairs.push({ before: root.path, after: path });
            renamedEntries.push({
              ...root,
              id,
              name: newName,
              path,
              extension: root.isFolder ? '' : getFileExtension(newName),
              type: detectFileType(newName, root.isFolder),
            });
          } catch (error) {
            failures.push(String(error));
          }
        }
        if (undoPairs.length > 0) {
          pushUndoAction({
            kind: 'rename',
            name: undoPairs.length === 1 ? undoPairs[0].after.split(/[\\/]/).filter(Boolean).pop() ?? '' : '',
            count: undoPairs.length,
            canUndo: true,
            undo: { type: 'rename', pairs: undoPairs },
          });
        }
        await refreshChangedDirectories(changedRoots.map(root => getParentPath(root.path)));
        setAllFiles(previous => [
          ...previous.filter(candidate => !changedRoots.some(root => isSameOrDescendantPath(candidate.path, root.path))),
          ...renamedEntries,
        ]);
        const renamedIds = renamedPaths.map(path => `native-${encodeURIComponent(path.toLowerCase())}`);
        if (renamedIds.length > 0) updateActiveTab(tab => ({ ...tab, selectedIds: renamedIds, focusedId: renamedIds[0] }));
        if (failures.length > 0) {
          showToast(t.core.operationPartial
            .replace('{completed}', String(renamedPaths.length))
            .replace('{failed}', String(failures.length))
            .replace('{reason}', failures[0]));
        } else {
          showToast(`${renamedPaths.length} ${language === 'es' ? 'elementos renombrados.' : 'items renamed.'}`);
        }
      } finally {
        setIsFileOperationBusy(false);
      }
      return;
    }

    const now = new Date().toISOString();
    const undoPairs = roots
      .filter(root => destinations.has(root.id))
      .map(root => ({ before: root.path, after: destinations.get(root.id)! }));
    setAllFiles(prev => prev.map(candidate => {
      const root = roots.find(item => isSameOrDescendantPath(candidate.path, item.path));
      if (!root || !destinations.has(root.id)) return candidate;
      const newName = lookup.get(root.id)!;
      const isRoot = candidate.id === root.id;
      return {
        ...candidate,
        name: isRoot ? newName : candidate.name,
        path: rewritePathPrefix(candidate.path, root.path, destinations.get(root.id)!),
        extension: isRoot && !root.isFolder ? getFileExtension(newName) : candidate.extension,
        type: isRoot ? detectFileType(newName, root.isFolder) : candidate.type,
        lastAccessed: now,
      };
    }));
    if (undoPairs.length > 0) {
      pushUndoAction({
        kind: 'rename',
        name: undoPairs.length === 1 ? undoPairs[0].after.split(/[\\/]/).filter(Boolean).pop() ?? '' : '',
        count: undoPairs.length,
        canUndo: true,
        undo: { type: 'rename', pairs: undoPairs },
      });
    }
    showToast(`${renames.length} ${language === 'es' ? 'elementos renombrados.' : 'items renamed.'}`);
  }, [allFiles, isFileOperationBusy, language, pushUndoAction, refreshChangedDirectories, showToast, t.core.conflict, t.core.invalidName, t.core.operationPartial, updateActiveTab]);

  const openCreateItem = useCallback((kind: NewItemKind, pane: 'left' | 'right' = activePane, suggestedName?: string) => {
    const paneTab = pane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    if (isFileOperationBusy) return;
    const activePath = paneTab.currentPath;
    if (!activePath) {
      showToast(t.pane.noFolderOpen);
      return;
    }
    if (activePath === SYSTEM_HOME_PATH || activePath === RECYCLE_BIN_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    if (kind !== 'folder' && !isTauriDesktop()) {
      showToast(t.core.desktopFileOperationsOnly);
      return;
    }
    setPendingCreateItem({ kind, pane, parentPath: activePath, suggestedName });
  }, [activeLeftTabIndex, activePane, activeRightTabIndex, isFileOperationBusy, leftTabs, rightTabs, showToast, t.core.desktopFileOperationsOnly, t.pane.chooseRealFolderFirst, t.pane.noFolderOpen]);


  const openZipCreation = useCallback((items: FileItem[], targetPath: string, pane: 'left' | 'right') => {
    if (!isTauriDesktop()) {
      showToast(t.core.desktopFileOperationsOnly);
      return;
    }
    if (!targetPath || targetPath === SYSTEM_HOME_PATH || targetPath === RECYCLE_BIN_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    if (items.some(item => item.recycleBinId)) {
      showToast(t.core.recycleBinRestoreFirst);
      return;
    }
    const roots = getRootItems(items, items.map(item => item.id));
    if (roots.length === 0) {
      showToast(t.core.noSelection);
      return;
    }
    const singleStem = roots[0].isFolder ? roots[0].name : roots[0].name.replace(/\.[^.]+$/, '') || roots[0].name;
    const defaultName = roots.length === 1 ? singleStem + '.zip' : t.contextMenu.zipDefaultName;
    setPendingZipCreation({
      sourcePaths: roots.map(item => item.path),
      targetPath,
      pane,
      defaultName,
    });
  }, [showToast, t.contextMenu.zipDefaultName, t.core.desktopFileOperationsOnly, t.core.noSelection, t.core.recycleBinRestoreFirst, t.pane.chooseRealFolderFirst]);

  const handleCreateZip = useCallback((archiveName: string, targetPath: string) => {
    const request = pendingZipCreation;
    if (!request) return;
    if (!targetPath || targetPath === SYSTEM_HOME_PATH || targetPath === RECYCLE_BIN_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    let name = archiveName.trim();
    if (!isValidFileName(name)) {
      showToast(t.core.invalidName);
      return;
    }
    if (!name.toLowerCase().endsWith('.zip')) name += '.zip';
    if (!isValidFileName(name)) {
      showToast(t.core.invalidName);
      return;
    }
    queueNativeTransfer('compress', request.sourcePaths, targetPath, {
      selectionPane: request.pane,
      archiveName: name,
    });
    setPendingZipCreation(null);
  }, [pendingZipCreation, queueNativeTransfer, showToast, t.core.invalidName, t.pane.chooseRealFolderFirst]);

  const handleNewFolder = useCallback((suggestedName?: string, pane: 'left' | 'right' = activePane) => {
    openCreateItem('folder', pane, suggestedName);
  }, [activePane, openCreateItem]);

  const handleCreateItem = useCallback(async ({ name, targetPath }: { name: string; targetPath: string }) => {
    const request = pendingCreateItem;
    if (!request || isFileOperationBusy) return;
    let itemName = name.trim();
    if (!isValidFileName(itemName)) {
      showToast(t.core.invalidName);
      return;
    }
    if (request.kind === 'text-file' && !/\.[^\.]+$/.test(itemName)) itemName += '.txt';
    if (request.kind === 'shortcut' && !itemName.toLowerCase().endsWith('.lnk')) itemName += '.lnk';
    if (!isValidFileName(itemName)) {
      showToast(t.core.invalidName);
      return;
    }
    if (request.kind === 'shortcut' && !targetPath.trim()) {
      showToast(t.core.shortcutTargetRequired);
      return;
    }
    const existingNames = getChildItems(allFiles, request.parentPath).map(item => item.name);
    const uniqueName = getUniqueName(itemName, existingNames);
    if (!isTauriDesktop() && request.kind !== 'folder') {
      showToast(t.core.desktopFileOperationsOnly);
      return;
    }

    setIsFileOperationBusy(true);
    try {
      let created: { path: string; name: string };
      let refreshedEntry: FileItem | undefined;
      if (isTauriDesktop()) {
        created = request.kind === 'folder'
          ? await createNativeDirectory(request.parentPath, uniqueName)
          : request.kind === 'text-file'
            ? await createNativeTextFile(request.parentPath, uniqueName)
            : await createNativeShortcut(request.parentPath, uniqueName, targetPath.trim());
        pushUndoAction({
          kind: 'create',
          name: created.name,
          count: 1,
          canUndo: true,
          undo: { type: 'remove', paths: [created.path] },
        });
        await refreshChangedDirectories([request.parentPath]);
        const refreshedListing = await listNativeDirectory(request.parentPath);
        refreshedEntry = refreshedListing.entries.find(item => getPathKey(item.path) === getPathKey(created.path));
      } else {
        const now = new Date().toISOString();
        const nowMs = Date.now();
        const virtualEntry: FileItem = {
          id: createOperationId('folder'),
          name: uniqueName,
          path: joinWindowsPath(request.parentPath, uniqueName),
          isFolder: true,
          type: 'folder',
          size: 0,
          modifiedDate: now.replace('T', ' ').slice(0, 16),
          createdDate: now.replace('T', ' ').slice(0, 16),
          modifiedAtMs: nowMs,
          createdAtMs: nowMs,
          lastAccessed: now,
          extension: '',
        };
        setAllFiles(previous => [...previous, virtualEntry]);
        updatePaneTab(request.pane, tab => ({ ...tab, selectedIds: [virtualEntry.id], focusedId: virtualEntry.id }));
        pushUndoAction({
          kind: 'create',
          name: uniqueName,
          count: 1,
          canUndo: true,
          undo: { type: 'remove-virtual', paths: [virtualEntry.path] },
        });
        setPendingCreateItem(null);
        showToast(t.core.createdFolder.replace('{name}', uniqueName));
        return;
      }

      const createdId = `native-${encodeURIComponent(created.path.toLowerCase())}`;
      const createdAtMs = Date.now();
      const extension = request.kind === 'folder' ? '' : getFileExtension(created.name);
      const createdEntry: FileItem = refreshedEntry ?? {
        id: createdId,
        name: created.name,
        path: created.path,
        isFolder: request.kind === 'folder',
        type: request.kind === 'folder' ? 'folder' : detectFileType(created.name, false),
        size: 0,
        modifiedDate: formatLocalDateTime(createdAtMs),
        createdDate: formatLocalDateTime(createdAtMs),
        modifiedAtMs: createdAtMs,
        createdAtMs,
        extension,
      };
      setAllFiles(previous => [
        ...previous.filter(item => getPathKey(item.path) !== getPathKey(created.path)),
        createdEntry,
      ]);
      updatePaneTab(request.pane, tab => ({ ...tab, selectedIds: [createdId], focusedId: createdId }));
      setPendingCreateItem(null);
      const successMessage = request.kind === 'folder'
        ? t.core.createdFolder
        : request.kind === 'text-file'
          ? t.core.createdFile
          : t.core.createdShortcut;
      showToast(successMessage.replace('{name}', created.name));
    } catch (error) {
      showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
    } finally {
      setIsFileOperationBusy(false);
    }
  }, [allFiles, isFileOperationBusy, pendingCreateItem, pushUndoAction, refreshChangedDirectories, showToast, t.core.createdFile, t.core.createdFolder, t.core.createdShortcut, t.core.desktopFileOperationsOnly, t.core.invalidName, t.core.operationFailedWithReason, t.core.shortcutTargetRequired, updatePaneTab]);

  const handleDeleteSelected = useCallback((itemsToDelete?: FileItem[]) => {
    if (!isTauriDesktop()) {
      showToast(t.core.desktopFileOperationsOnly);
      return;
    }
    const selectedItems = itemsToDelete ?? selectedItemsForDelete;
    if (selectedItems.some(item => item.recycleBinId)) {
      showToast(t.core.recycleBinRestoreFirst);
      return;
    }
    const idsToDelete = selectedItems.map(item => item.id);
    const roots = getRootItems(allFiles, idsToDelete);
    if (roots.length > 0) {
      setPendingDeleteItems(roots);
      return;
    }

    showToast(t.core.noSelection);
  }, [allFiles, selectedItemsForDelete, showToast, t.core.desktopFileOperationsOnly, t.core.noSelection, t.core.recycleBinRestoreFirst]);

  const handleConfirmDelete = useCallback(async (permanentlyDelete = false) => {
    if (isFileOperationBusy || pendingDeleteItems.length === 0) return;
    setIsFileOperationBusy(true);
    try {
      const paths = pendingDeleteItems.map(item => item.path);
      let previousRecycleBinIds: Set<string> | null = null;
      if (!permanentlyDelete) {
        try {
          const page = await listNativeRecycleBin(0);
          previousRecycleBinIds = new Set(page.entries.flatMap(item => item.recycleBinId ? [item.recycleBinId] : []));
        } catch {
          previousRecycleBinIds = null;
        }
      }
      const operationStartedAt = Date.now();
      const { removedPaths, failures } = permanentlyDelete
        ? await permanentlyDeleteNativeItems(paths).then(result => ({
          removedPaths: result.completedPaths,
          failures: result.failures,
        }))
        : await moveNativeItemsToRecycleBin(paths).then(result => ({
          removedPaths: result.recycledPaths,
          failures: result.failures,
        }));
      const removedIds = new Set(
        allFiles
          .filter(item => removedPaths.some(rootPath => isSameOrDescendantPath(item.path, rootPath)))
          .map(item => item.id)
      );
      if (removedPaths.length > 0) {
        invalidateFlatDirectories(removedPaths.map(getParentPath));
        setAllFiles(previous => previous.filter(item => !removedPaths.some(rootPath => isSameOrDescendantPath(item.path, rootPath))));
        const clearRemovedSelections = (tabs: TabState[]) => tabs.map(tab => ({
          ...tab,
          selectedIds: tab.selectedIds.filter(id => !removedIds.has(id)),
          focusedId: tab.focusedId && removedIds.has(tab.focusedId) ? null : tab.focusedId,
        }));
        setLeftTabs(clearRemovedSelections);
        setRightTabs(clearRemovedSelections);
      }

      if (removedPaths.length > 0) {
        if (permanentlyDelete) {
          pushUndoAction({
            kind: 'permanent-delete',
            name: removedPaths[0].split(/[\\/]/).filter(Boolean).pop() ?? '',
            count: removedPaths.length,
            canUndo: false,
            blockedReason: t.toolbar.undoUnavailable,
            undo: null,
          });
        } else {
          let recycledItems: FileItem[] = [];
          try {
            recycledItems = await findRecentRecycleBinItems(removedPaths, operationStartedAt, previousRecycleBinIds);
          } catch {
            recycledItems = [];
          }
          const allIdsFound = recycledItems.length === removedPaths.length;
          pushUndoAction({
            kind: 'recycle',
            name: '',
            count: removedPaths.length,
            canUndo: allIdsFound,
            blockedReason: allIdsFound ? undefined : t.toolbar.undoRecycleUnavailable,
            undo: allIdsFound ? {
              type: 'restore',
              items: recycledItems.map(item => ({ id: item.recycleBinId!, originalPath: item.originalPath ?? item.path })),
            } : null,
          });
        }
      }

      if (failures.length > 0) {
        showToast(permanentlyDelete
          ? t.core.permanentDeletePartial
            .replace('{deleted}', String(removedPaths.length))
            .replace('{failed}', String(failures.length))
          : t.core.deletePartial
            .replace('{moved}', String(removedPaths.length))
            .replace('{failed}', String(failures.length)));
      } else {
        showToast(permanentlyDelete
          ? t.core.permanentlyDeletedCount.replace('{count}', String(removedPaths.length))
          : t.core.deletedCount.replace('{count}', String(removedPaths.length)));
      }
      setPendingDeleteItems([]);
      if (!permanentlyDelete) {
        void refreshRecycleBinStatus();
        void refreshRecycleBinContents();
      }
    } catch {
      showToast(permanentlyDelete ? t.core.permanentDeleteFailed : t.core.deleteFailed);
    } finally {
      setIsFileOperationBusy(false);
    }
  }, [allFiles, invalidateFlatDirectories, isFileOperationBusy, pendingDeleteItems, pushUndoAction, refreshRecycleBinContents, refreshRecycleBinStatus, showToast, t.core.deleteFailed, t.core.deletePartial, t.core.deletedCount, t.core.permanentDeleteFailed, t.core.permanentDeletePartial, t.core.permanentlyDeletedCount, t.toolbar.undoRecycleUnavailable, t.toolbar.undoUnavailable]);
  const handleRequestEmptyRecycleBin = useCallback(() => {
    if (!recycleBinStatus?.available || recycleBinStatus.itemCount === 0) return;
    setIsEmptyRecycleBinConfirmOpen(true);
  }, [recycleBinStatus]);

  const handleConfirmEmptyRecycleBin = useCallback(async () => {
    if (isRecycleBinBusy) return;
    setIsRecycleBinBusy(true);
    try {
      const emptiedCount = recycleBinStatus?.itemCount ?? 0;
      await emptyNativeRecycleBin();
      if (emptiedCount > 0) {
        pushUndoAction({
          kind: 'permanent-delete',
          name: '',
          count: emptiedCount,
          canUndo: false,
          blockedReason: t.toolbar.undoUnavailable,
          undo: null,
        });
      }
      setIsEmptyRecycleBinConfirmOpen(false);
      showToast(t.core.recycleBinEmptied);
      void refreshRecycleBinStatus();
      void refreshRecycleBinContents();
    } catch {
      showToast(t.core.recycleBinEmptyFailed);
      void refreshRecycleBinStatus();
      void refreshRecycleBinContents();
    } finally {
      setIsRecycleBinBusy(false);
    }
  }, [isRecycleBinBusy, pushUndoAction, recycleBinStatus?.itemCount, refreshRecycleBinContents, refreshRecycleBinStatus, showToast, t.core.recycleBinEmptied, t.core.recycleBinEmptyFailed, t.toolbar.undoUnavailable]);

  const handleRestoreRecycleBinItems = useCallback(async (items: FileItem[]) => {
    if (recycleBinRestoreInFlight.current || recycleBinListingInFlight.current) return;
    const requests = items.flatMap(item => item.recycleBinId && item.originalPath
      ? [{ id: item.recycleBinId }]
      : []);
    const unavailableCount = items.length - requests.length;
    if (requests.length === 0) {
      showToast(t.core.recycleBinRestoreFailed);
      return;
    }

    recycleBinRestoreInFlight.current = true;
    try {
      const result = await restoreNativeRecycleBinItems(requests);
      const restoredIds = new Set(result.restoredIds);
      const restoredItems = items.filter(item => item.recycleBinId && restoredIds.has(item.recycleBinId));
      if (restoredItems.length > 0) {
        pushUndoAction({
          kind: 'restore',
          name: restoredItems.length === 1 ? restoredItems[0].name : '',
          count: restoredItems.length,
          canUndo: true,
          undo: { type: 'remove', paths: restoredItems.map(item => item.originalPath ?? item.path) },
        });
      }
      const restoredFrontendIds = new Set(items
        .filter(item => item.recycleBinId && restoredIds.has(item.recycleBinId))
        .map(item => item.id));
      const restoredOriginalFolderKeys = new Set(items
        .filter(item => item.recycleBinId && restoredIds.has(item.recycleBinId) && item.originalPath)
        .map(item => getPathKey(getParentPath(item.originalPath!))));
      if (restoredFrontendIds.size > 0) {
        const clearRestoredSelections = (tabs: TabState[]) => tabs.map(tab => ({
          ...tab,
          selectedIds: tab.selectedIds.filter(id => !restoredFrontendIds.has(id)),
          focusedId: tab.focusedId && restoredFrontendIds.has(tab.focusedId) ? null : tab.focusedId,
        }));
        setLeftTabs(clearRestoredSelections);
        setRightTabs(clearRestoredSelections);
      }

      const visiblePanes: Array<'left' | 'right'> = layout === 'single' ? [activePane] : ['left', 'right'];
      for (const pane of visiblePanes) {
        const tabs = pane === 'left' ? leftTabs : rightTabs;
        const activeIndex = pane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
        const tab = tabs[activeIndex];
        if (tab && restoredOriginalFolderKeys.has(getPathKey(tab.currentPath))) {
          void handleNavigate(tab.currentPath, pane, true);
        }
      }

      void refreshRecycleBinStatus();
      void refreshRecycleBinContents();
      const failedCount = result.failures.length + unavailableCount;
      if (result.restoredIds.length === 0) {
        const reason = result.failures[0]?.error;
        showToast(reason
          ? t.core.recycleBinRestoreFailedWithReason.replace('{reason}', reason)
          : t.core.recycleBinRestoreFailed);
      } else if (failedCount > 0) {
        showToast(t.core.recycleBinRestorePartial
          .replace('{restored}', String(result.restoredIds.length))
          .replace('{failed}', String(failedCount)));
      } else {
        showToast(t.core.recycleBinRestored.replace('{count}', String(result.restoredIds.length)));
      }
    } catch {
      void refreshRecycleBinStatus();
      void refreshRecycleBinContents();
      showToast(t.core.recycleBinRestoreFailed);
    } finally {
      recycleBinRestoreInFlight.current = false;
    }
  }, [activeLeftTabIndex, activePane, activeRightTabIndex, handleNavigate, layout, leftTabs, pushUndoAction, refreshRecycleBinContents, refreshRecycleBinStatus, rightTabs, showToast, t.core.recycleBinRestoreFailed, t.core.recycleBinRestorePartial, t.core.recycleBinRestored]);

  const handleOpenRecycleBin = useCallback(async () => {
    await handleNavigate(RECYCLE_BIN_PATH, activePane);
  }, [activePane, handleNavigate]);

  // Opens a user-selected folder through the native Windows picker.
  const handleOpenRealFolder = async () => {
    if (!isTauriDesktop()) return;

    try {
      const selectedPath = await chooseNativeFolder(t.sidebar.openFolderDialogTitle);
      if (!selectedPath) return;

      nativeOpeningWorkspace.current = true;
      const generation = ++nativeWorkspaceGeneration.current;
      const loaded = await loadNativeFolder(selectedPath);
      if (generation !== nativeWorkspaceGeneration.current) return;
      const rootKey = getPathKey(loaded.rootPath);
      browserRootPath.current = '';
      nativeLoadedDirectories.current.clear();
      nativeLoadedDirectories.current.add(rootKey);
      nativeInFlightDirectories.current.clear();
      selectAllAfterLoad.current.clear();
      nativeRootPath.current = loaded.rootPath;
      systemHomeWorkspace.current = false;
      rememberRecentFolder(loaded.rootPath);
      setFlatDirectories({});
      staleFlatIds.current.clear();
      setNativeDirectories({
        [rootKey]: { nextOffset: loaded.nextOffset, hasMore: loaded.hasMore, loading: false, counts: loaded.counts },
      });
      setAllFiles(loaded.files);
      setQuickAccess([{
        id: `qa-${encodeURIComponent(loaded.rootPath.toLowerCase())}`,
        name: loaded.rootName,
        path: loaded.rootPath,
        icon: 'folder',
        count: loaded.files.length - 1,
      }]);
      nativeOpeningWorkspace.current = false;
      openWorkspaceRoot(loaded.rootPath, loaded.rootName);
      completeOnboarding();
      const count = loaded.files.length - 1;
      showToast(`${language === 'es' ? 'Carpeta cargada' : 'Folder loaded'}: "${loaded.rootName}" (${count} ${language === 'es' ? 'elementos' : 'items'}).`);
    } catch (error: any) {
      nativeOpeningWorkspace.current = false;
      if (error.name !== 'AbortError') {
        showToast(language === 'es' ? 'No se pudo acceder a la carpeta seleccionada.' : 'The selected folder could not be opened.');
      }
    }
  };

  const handleOpenDrive = useCallback((path: string, openInNewTab = sidebarLocationsOpenInNewTab) => {
    if (isTauriDesktop()) {
      // Opening a drive from the sidebar is an explicit request to leave a
      // previously selected-folder scope, but it should still be normal tab
      // navigation so Back/Forward retain their per-tab history.
      systemHomeWorkspace.current = true;
      nativeRootPath.current = SYSTEM_HOME_PATH;
      browserRootPath.current = '';
    }
    void handleNavigate(path, activePane, false, openInNewTab);
  }, [activePane, handleNavigate, sidebarLocationsOpenInNewTab]);

  const addCustomQuickAccessPath = useCallback((path: string, name: string) => {
    if (customQuickAccess.length >= MAX_CUSTOM_QUICK_ACCESS_ITEMS) {
      showToast(t.sidebar.quickAccessLimitReached);
      return;
    }

    const normalizedPath = normalizeWindowsPath(path);
    const pathKey = getPathKey(normalizedPath);
    if (sidebarQuickAccess.some(item => getPathKey(item.path) === pathKey)) {
      showToast(t.sidebar.quickAccessAlreadyExists);
      return;
    }

    const id = 'custom-quick-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    const item: QuickAccessItem = {
      id,
      name: name.trim().slice(0, 80) || normalizedPath,
      path: normalizedPath,
      icon: 'folder',
      isCustom: true,
    };
    setCustomQuickAccess(previous => [...previous, item]);
    showToast(t.sidebar.quickAccessAdded.replace('{name}', item.name));
  }, [customQuickAccess.length, showToast, sidebarQuickAccess, t.sidebar.quickAccessAdded, t.sidebar.quickAccessAlreadyExists, t.sidebar.quickAccessLimitReached]);

  const handleAddCustomQuickAccess = useCallback(async () => {
    if (addingCustomQuickAccess.current) return;
    if (customQuickAccess.length >= MAX_CUSTOM_QUICK_ACCESS_ITEMS) {
      showToast(t.sidebar.quickAccessLimitReached);
      return;
    }

    addingCustomQuickAccess.current = true;
    try {
      let path = '';
      let name = '';
      if (isTauriDesktop()) {
        const selectedPath = await chooseNativeFolder(t.sidebar.addQuickAccessDialogTitle);
        if (!selectedPath) return;
        path = selectedPath;
        name = path.split(/\\|\//).filter(Boolean).pop() || path;
      } else {
        if (!browserRootPath.current || currentTab.currentPath === SYSTEM_HOME_PATH || currentTab.currentPath === RECYCLE_BIN_PATH) {
          showToast(t.sidebar.quickAccessNeedFolder);
          return;
        }
        path = currentTab.currentPath;
        name = currentTab.title || path.split(/\\|\//).filter(Boolean).pop() || path;
      }
      addCustomQuickAccessPath(path, name);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      showToast(t.sidebar.quickAccessAddFailed);
    } finally {
      addingCustomQuickAccess.current = false;
    }
  }, [addCustomQuickAccessPath, currentTab.currentPath, currentTab.title, customQuickAccess.length, showToast, t.sidebar.addQuickAccessDialogTitle, t.sidebar.quickAccessAddFailed, t.sidebar.quickAccessLimitReached, t.sidebar.quickAccessNeedFolder]);

  const handleAddFolderToQuickAccess = useCallback((item: FileItem) => {
    if (item.isFolder) addCustomQuickAccessPath(item.path, item.name);
  }, [addCustomQuickAccessPath]);
  const handleOpenCustomQuickAccess = useCallback((item: QuickAccessItem, openInNewTab = sidebarLocationsOpenInNewTab) => {
    if (item.path === SYSTEM_HOME_PATH) {
      if (!isTauriDesktop()) return;
      systemHomeWorkspace.current = true;
      nativeRootPath.current = SYSTEM_HOME_PATH;
      browserRootPath.current = '';
      void handleNavigate(item.path, activePane, false, openInNewTab);
      return;
    }

    if (isTauriDesktop()) {
      if (!systemHomeWorkspace.current && nativeRootPath.current && !isSameOrDescendantPath(item.path, nativeRootPath.current)) {
        systemHomeWorkspace.current = true;
        nativeRootPath.current = SYSTEM_HOME_PATH;
        browserRootPath.current = '';
      }
      void handleNavigate(item.path, activePane, false, openInNewTab);
      return;
    }

    if (!browserRootPath.current || !isSameOrDescendantPath(item.path, browserRootPath.current)) {
      showToast(t.sidebar.quickAccessReopenRoot.replace('{name}', item.name));
      return;
    }
    void handleNavigate(item.path, activePane, false, openInNewTab);
  }, [activePane, handleNavigate, showToast, sidebarLocationsOpenInNewTab, t.sidebar.quickAccessReopenRoot]);

  const handleRenameCustomQuickAccess = useCallback((id: string, name: string) => {
    setCustomQuickAccess(previous => previous.map(item => item.id === id ? { ...item, name: name.trim().slice(0, 80) } : item));
  }, []);

  const handleRemoveCustomQuickAccess = useCallback((id: string) => {
    setCustomQuickAccess(previous => previous.filter(item => item.id !== id));
  }, []);

  const handleReorderQuickAccess = useCallback((draggedId: string, targetId: string) => {
    if (quickAccessSortMode !== 'manual' || draggedId === targetId) return;
    const reorderedIds = sidebarQuickAccess.filter(item => getPathKey(item.path) !== getPathKey(SYSTEM_HOME_PATH)).map(item => item.id);
    const fromIndex = reorderedIds.indexOf(draggedId);
    const toIndex = reorderedIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [dragged] = reorderedIds.splice(fromIndex, 1);
    reorderedIds.splice(toIndex, 0, dragged);
    const visibleIds = new Set(reorderedIds);
    setQuickAccessOrder(previous => [
      ...reorderedIds,
      ...previous.filter(id => !visibleIds.has(id)),
    ]);
  }, [quickAccessSortMode, sidebarQuickAccess]);

  const handleMoveQuickAccess = useCallback((itemId: string, direction: -1 | 1) => {
    if (quickAccessSortMode !== 'manual') return;
    const items = sidebarQuickAccess.filter(item => getPathKey(item.path) !== getPathKey(SYSTEM_HOME_PATH)).map(item => item.id);
    const index = items.indexOf(itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    handleReorderQuickAccess(itemId, items[targetIndex]);
  }, [handleReorderQuickAccess, quickAccessSortMode, sidebarQuickAccess]);
  // Keyboard Shortcuts listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
          return;
        }
        const activeElement = document.activeElement;
        const isEditingText = activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          (activeElement instanceof HTMLElement && activeElement.isContentEditable);
        if (isEditingText) return;
        if (
          isCloseDialogOpen || isSettingsOpen || isAboutOpen || isSearchOpen || isShortcutsOpen ||
          isBatchRenameOpen || isWorkspaceManagerOpen || isUnsavedWorkspaceChangesOpen ||
          isOnboardingOpen || isEmptyRecycleBinConfirmOpen || pendingDeleteItems.length > 0 ||
          pendingCreateItem || pendingZipCreation || renameRequest || contextMenuPos
        ) return;
        setIsCommandPaletteOpen(open => !open);
        return;
      }

      if (isCommandPaletteOpen) return;
      if (isCloseDialogOpen || isSettingsOpen || isAboutOpen || isSearchOpen || isShortcutsOpen || isBatchRenameOpen || pendingDeleteItems.length > 0 || isFileOperationBusy) return;

      // If typing inside an input/textarea, don't hijack keys
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Tab: Switch active pane
      if (e.key === 'Tab') {
        e.preventDefault();
        setActivePane(prev => (prev === 'left' ? 'right' : 'left'));
        return;
      }

      // Ctrl + A: Select all visible items in the active pane
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleSelectAllVisible();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        void handleFileClipboard(undefined, false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        void handleFileClipboard(undefined, true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        void handlePasteFiles(activePane);
        return;
      }

      // F5: Copy to opposite pane
      if (e.key === 'F5') {
        e.preventDefault();
        handleCopySelected();
        return;
      }

      // F6: Move to opposite pane
      if (e.key === 'F6') {
        e.preventDefault();
        handleMoveSelected();
        return;
      }

      // F2: Inline Rename
      if (e.key === 'F2') {
        e.preventDefault();
        handleRenameSelected();
        return;
      }

      // Ctrl + R: Batch Rename
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (currentTab.selectedIds.length > 0) {
          setIsBatchRenameOpen(true);
        } else {
          showToast(language === 'es' ? 'Selecciona uno o más archivos para renombrar.' : 'Select one or more items to rename.');
        }
        return;
      }

      // Ctrl + F: Instant Full-Text & File Search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // F3 or Space: Toggle Preview
      if (e.key === 'F3' || (e.key === ' ' && !e.repeat)) {
        e.preventDefault();
        setPreviewOpen(prev => !prev);
        return;
      }

      // F7: New folder
      if (e.key === 'F7') {
        e.preventDefault();
        handleNewFolder();
        return;
      }

      // F1: Shortcuts cheat sheet
      if (e.key === 'F1') {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      // Delete / Supr
      if (e.key === 'Delete') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Backspace: Navigate Up
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleNavigateUp();
        return;
      }

      // Ctrl + T: Add new tab
      if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        handleAddTab(activePane);
        return;
      }

      // Ctrl + W: Close current tab
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        handleCloseTab(activePane, activeTabIndex);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    activePane,
    currentTab,
    allFiles,
    language,
    handleCopySelected,
    handleMoveSelected,
    handleFileClipboard,
    handlePasteFiles,
    handleDeleteSelected,
    handleNewFolder,
    handleRenameSelected,
    handleNavigateUp,
    activeDisplayFiles,
    nativeDirectories,
    updateActiveTab,
    isCloseDialogOpen,
    isSettingsOpen,
    isAboutOpen,
    isSearchOpen,
    isShortcutsOpen,
    isCommandPaletteOpen,
    isBatchRenameOpen,
    isWorkspaceManagerOpen,
    isUnsavedWorkspaceChangesOpen,
    isOnboardingOpen,
    isEmptyRecycleBinConfirmOpen,
    pendingCreateItem,
    pendingZipCreation,
    renameRequest,
    contextMenuPos,
    pendingDeleteItems.length,
    isFileOperationBusy,
  ]);

  // Context Menu trigger
  const handleItemContextMenu = (e: React.MouseEvent, item: FileItem, pane: 'left' | 'right') => {
    e.preventDefault();
    setActivePane(pane);
    const targetTab = pane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
    if (!targetTab.selectedIds.includes(item.id)) {
      updatePaneTab(pane, t => ({ ...t, selectedIds: [item.id], focusedId: item.id }));
    }
    setContextMenuPos({
      x: e.clientX,
      y: e.clientY,
      targetItem: item,
      paneId: pane,
    });
  };

  const handleBackgroundContextMenu = (event: React.MouseEvent, pane: 'left' | 'right') => {
    event.preventDefault();
    setActivePane(pane);
    setContextMenuPos({ x: event.clientX, y: event.clientY, targetItem: null, paneId: pane });
  };

  const handleBackgroundDoubleClick = (_event: React.MouseEvent, pane: 'left' | 'right') => {
    setActivePane(pane);
    if (emptyAreaDoubleClickNavigatesUp) handleNavigateUp(pane);
  };

  const handleApplicationContextMenuCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const currentAtRecycleBin = currentTab.currentPath === RECYCLE_BIN_PATH;
  const selectedCount = currentAtRecycleBin ? 0 : currentTab.selectedIds.filter(id => filesById.has(id)).length;
  const selectedItemsForRename = currentTab.selectedIds.flatMap(id => {
    const item = filesById.get(id);
    return item ? [item] : [];
  });
  const leftDirectoryState = leftTabs[activeLeftTabIndex].flatView
    ? flatDirectories[getPathKey(leftTabs[activeLeftTabIndex].currentPath)]
    : nativeDirectories[getPathKey(leftTabs[activeLeftTabIndex].currentPath)];
  const rightDirectoryState = rightTabs[activeRightTabIndex].flatView
    ? flatDirectories[getPathKey(rightTabs[activeRightTabIndex].currentPath)]
    : nativeDirectories[getPathKey(rightTabs[activeRightTabIndex].currentPath)];
  const leftKnownCounts = knownDirectoryCounts(leftTabs[activeLeftTabIndex], leftDirectoryState, showHiddenFiles);
  const rightKnownCounts = knownDirectoryCounts(rightTabs[activeRightTabIndex], rightDirectoryState, showHiddenFiles);
  const activeKnownCounts = activePane === 'left' ? leftKnownCounts : rightKnownCounts;
  const currentDirectCounts = nativeDirectories[getPathKey(currentTab.currentPath)]?.counts;
  const currentDirectFolderCount = currentDirectCounts
    ? (showHiddenFiles ? currentDirectCounts.folderCount : currentDirectCounts.visibleFolderCount)
    : null;
  const flatViewLocationAvailable = isTauriDesktop() && !!currentTab.currentPath && !currentTab.currentPath.startsWith('::');
  const flatViewAvailable = flatViewLocationAvailable && (currentTab.flatView === true || (currentDirectFolderCount !== null && currentDirectFolderCount > 0));
  const flatViewTooltip = currentTab.flatView && flatViewLocationAvailable
    ? t.toolbar.flatViewDisableTooltip
    : !flatViewLocationAvailable
      ? t.toolbar.flatViewFolderOnly
      : currentDirectFolderCount === null
        ? t.toolbar.flatViewCheckingFolders
        : currentDirectFolderCount === 0
          ? t.toolbar.flatViewNoSubfolders
          : t.toolbar.flatViewTooltip;
  const leftAtSystemHome = leftTabs[activeLeftTabIndex].currentPath === SYSTEM_HOME_PATH;
  const rightAtSystemHome = rightTabs[activeRightTabIndex].currentPath === SYSTEM_HOME_PATH;
  const leftAtRecycleBin = leftTabs[activeLeftTabIndex].currentPath === RECYCLE_BIN_PATH;
  const rightAtRecycleBin = rightTabs[activeRightTabIndex].currentPath === RECYCLE_BIN_PATH;
  const leftTransferTab = leftTabs[activeLeftTabIndex];
  const rightTransferTab = rightTabs[activeRightTabIndex];
  const canTransferLeftToRight = layout !== 'single' && getRootItems(allFiles, leftTransferTab.selectedIds).length > 0 &&
    rightTransferTab.currentPath !== SYSTEM_HOME_PATH && rightTransferTab.currentPath !== RECYCLE_BIN_PATH;
  const canTransferRightToLeft = layout !== 'single' && getRootItems(allFiles, rightTransferTab.selectedIds).length > 0 &&
    leftTransferTab.currentPath !== SYSTEM_HOME_PATH && leftTransferTab.currentPath !== RECYCLE_BIN_PATH;
  const contextPane = contextMenuPos?.paneId ?? activePane;
  const contextPaneTab = contextPane === 'left'
    ? leftTabs[activeLeftTabIndex]
    : rightTabs[activeRightTabIndex];

  const isCommandLocation = (path: string) => Boolean(path) && path !== SYSTEM_HOME_PATH && path !== RECYCLE_BIN_PATH && !path.startsWith('::');
  const currentParentPath = isCommandLocation(currentTab.currentPath) ? getParentPath(currentTab.currentPath) : '';
  const activeWorkspaceRoot = isTauriDesktop() ? nativeRootPath.current : browserRootPath.current;
  const canNavigateUpFromCurrent = currentTab.currentPath === RECYCLE_BIN_PATH
    ? currentTab.historyIndex > 0 || systemHomeWorkspace.current
    : currentTab.currentPath !== SYSTEM_HOME_PATH && (
      (isWindowsDriveRoot(currentTab.currentPath) && (systemHomeWorkspace.current || currentTab.history.includes(SYSTEM_HOME_PATH))) ||
      (Boolean(currentParentPath) && currentParentPath !== currentTab.currentPath && (
        systemHomeWorkspace.current || !activeWorkspaceRoot || isSameOrDescendantPath(currentParentPath, activeWorkspaceRoot)
      ))
    );
  const currentFolderIsReal = isCommandLocation(currentTab.currentPath);
  const oppositeFolderIsReal = isCommandLocation(inactiveTab.currentPath);
  const selectionDisabledReason = isFileOperationBusy
    ? t.commandPalette.disabled.operationBusy
    : selectedCount === 0 ? t.commandPalette.disabled.selectionRequired : undefined;
  const copyMoveDisabledReason = selectionDisabledReason ?? (
    oppositeFolderIsReal ? undefined : t.commandPalette.disabled.destinationRequired
  );
  const currentFolderDisabledReason = isFileOperationBusy
    ? t.commandPalette.disabled.operationBusy
    : currentFolderIsReal ? undefined : t.commandPalette.disabled.realFolderRequired;

  const handleShowCurrentFolderInExplorer = () => {
    void openFolderInWindowsExplorer(currentTab.currentPath)
      .catch(error => showToast(t.core.operationFailedWithReason.replace('{reason}', String(error))));
  };
  const handleLaunchWindowsTerminal = (terminal: WindowsTerminalOption) => {
    setLastTerminalOption(terminal);
    void openWindowsTerminalHere(currentTab.currentPath, terminal)
      .catch(error => showToast(t.core.operationFailedWithReason.replace('{reason}', String(error))));
  };
  const handleOpenWindowsSpecialFolder = (folder: WindowsSpecialFolder) => {
    if (folder.id === 'editHosts') {
      void editWindowsHostsFile()
        .catch(error => showToast(t.core.operationFailedWithReason.replace('{reason}', String(error))));
      return;
    }
    systemHomeWorkspace.current = true;
    nativeRootPath.current = SYSTEM_HOME_PATH;
    browserRootPath.current = '';
    void handleNavigate(folder.path, activePane);
  };

  const paletteActions: CommandPaletteCommand[] = [
    { id: 'search-files', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.searchFiles, shortcut: 'Ctrl+F', keywords: 'find search files folders', onSelect: () => setIsSearchOpen(true) },
    { id: 'shortcuts', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.shortcuts, shortcut: 'F1', keywords: 'keyboard help keys', onSelect: () => setIsShortcutsOpen(true) },
    { id: 'settings', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.settings, keywords: 'preferences options', onSelect: () => setIsSettingsOpen(true) },
    { id: 'workspaces', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.workspaces, keywords: 'workspace profiles sessions layouts', onSelect: () => setIsWorkspaceManagerOpen(true) },
    { id: 'new-tab', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.newTab, shortcut: 'Ctrl+T', keywords: 'tab add create', onSelect: () => handleAddTab(activePane) },
    { id: 'close-tab', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.closeTab, shortcut: 'Ctrl+W', disabled: activeTabs.length <= 1 || Boolean(currentTab.lockClose), disabledReason: activeTabs.length <= 1 ? t.commandPalette.disabled.lastTab : currentTab.lockClose ? t.tabMenu.protected : undefined, keywords: 'tab remove', onSelect: () => handleCloseTab(activePane, activeTabIndex) },
    { id: 'navigate-up', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.goUp, shortcut: 'Backspace', disabled: !canNavigateUpFromCurrent, disabledReason: canNavigateUpFromCurrent ? undefined : t.commandPalette.disabled.noParentFolder, keywords: 'parent folder back up', onSelect: () => handleNavigateUp(activePane) },
    { id: 'switch-pane', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.switchPane, shortcut: 'Tab', keywords: 'left right panel', onSelect: () => setActivePane(pane => pane === 'left' ? 'right' : 'left') },
    { id: 'select-all', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.selectAll, shortcut: 'Ctrl+A', disabled: activeDisplayFiles.length === 0 && !nativeDirectories[getPathKey(currentTab.currentPath)]?.loading, disabledReason: activeDisplayFiles.length === 0 && !nativeDirectories[getPathKey(currentTab.currentPath)]?.loading ? t.commandPalette.disabled.noVisibleItems : undefined, keywords: 'select everything', onSelect: handleSelectAllVisible },
    { id: 'new-folder', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.newFolder, shortcut: 'F7', disabled: Boolean(currentFolderDisabledReason), disabledReason: currentFolderDisabledReason, keywords: 'create directory', onSelect: () => handleNewFolder() },
    { id: 'copy-opposite', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.copyToOther, shortcut: 'F5', disabled: Boolean(copyMoveDisabledReason), disabledReason: copyMoveDisabledReason, keywords: 'duplicate copy files', onSelect: handleCopySelected },
    { id: 'move-opposite', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.moveToOther, shortcut: 'F6', disabled: Boolean(copyMoveDisabledReason), disabledReason: copyMoveDisabledReason, keywords: 'move files transfer', onSelect: handleMoveSelected },
    { id: 'rename-selection', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.rename, shortcut: 'F2', disabled: Boolean(selectionDisabledReason), disabledReason: selectionDisabledReason, keywords: 'change name', onSelect: handleRenameSelected },
    { id: 'batch-rename', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.batchRename, shortcut: 'Ctrl+R', disabled: Boolean(selectionDisabledReason), disabledReason: selectionDisabledReason, keywords: 'multiple names', onSelect: () => setIsBatchRenameOpen(true) },
    { id: 'delete-selection', group: t.commandPalette.groups.actions, label: t.commandPalette.commands.delete, shortcut: 'Delete', disabled: Boolean(selectionDisabledReason) || !isTauriDesktop(), disabledReason: !isTauriDesktop() ? t.core.desktopFileOperationsOnly : selectionDisabledReason, keywords: 'remove recycle bin', onSelect: () => handleDeleteSelected(selectedItemsForDelete) },
    { id: 'show-preview', group: t.commandPalette.groups.actions, label: previewOpen ? t.commandPalette.commands.hidePreview : t.commandPalette.commands.showPreview, shortcut: 'F3 / Space', keywords: 'properties preview pane', onSelect: () => setPreviewOpen(value => !value) },
    { id: 'show-hidden', group: t.commandPalette.groups.actions, label: showHiddenFiles ? t.commandPalette.commands.hideHidden : t.commandPalette.commands.showHidden, keywords: 'hidden files folders', onSelect: () => setShowHiddenFiles(value => !value) },
    { id: 'show-extensions', group: t.commandPalette.groups.actions, label: showFileExtensions ? t.commandPalette.commands.hideExtensions : t.commandPalette.commands.showExtensions, keywords: 'file suffix type', onSelect: () => setShowFileExtensions(value => !value) },
    { id: 'relative-graphs', group: t.commandPalette.groups.actions, label: relativeGraphsEnabled ? t.commandPalette.commands.hideGraphs : t.commandPalette.commands.showGraphs, keywords: 'relative size date bars', onSelect: () => setRelativeGraphsEnabled(value => !value) },
  ];

  const paletteViewCommands: CommandPaletteCommand[] = [
    { id: 'view-details', group: t.commandPalette.groups.view, label: t.commandPalette.commands.viewDetails, keywords: 'list table', onSelect: () => handleViewModeChange('details') },
    { id: 'view-compact', group: t.commandPalette.groups.view, label: t.commandPalette.commands.viewCompact, keywords: 'dense rows', onSelect: () => handleViewModeChange('compact') },
    { id: 'view-icons', group: t.commandPalette.groups.view, label: t.commandPalette.commands.viewIcons, keywords: 'large icons grid', onSelect: () => handleViewModeChange('icons') },
    { id: 'layout-dual-vertical', group: t.commandPalette.groups.view, label: t.commandPalette.commands.layoutDualVertical, keywords: 'two panes columns', onSelect: () => setLayout('dual-vertical') },
    { id: 'layout-dual-horizontal', group: t.commandPalette.groups.view, label: t.commandPalette.commands.layoutDualHorizontal, keywords: 'two panes rows', onSelect: () => setLayout('dual-horizontal') },
    { id: 'layout-single', group: t.commandPalette.groups.view, label: t.commandPalette.commands.layoutSingle, keywords: 'one pane', onSelect: () => setLayout('single') },
  ];

  const quickAccessPaths = new Set(sidebarQuickAccess.map(item => getPathKey(item.path)));
  const paletteQuickAccess: CommandPaletteCommand[] = sidebarQuickAccess.map(item => ({
    id: `quick-access-${item.id}`,
    group: t.commandPalette.groups.quickAccess,
    label: item.path === SYSTEM_HOME_PATH ? t.commandPalette.commands.thisPc : item.name,
    description: item.path === SYSTEM_HOME_PATH ? undefined : item.path,
    keywords: item.path,
    onSelect: () => handleOpenCustomQuickAccess(item, false),
  }));
  const paletteDrives: CommandPaletteCommand[] = drives
    .filter(drive => !quickAccessPaths.has(getPathKey(`${drive.letter}\\`)))
    .map(drive => ({
      id: `drive-${drive.id}`,
      group: t.commandPalette.groups.drives,
      label: drive.label && drive.label.toLowerCase() !== drive.letter.toLowerCase() ? `${drive.label} (${drive.letter})` : drive.letter,
      description: `${drive.letter}\\`,
      keywords: `${drive.label} ${drive.letter} ${drive.type}`,
      onSelect: () => handleOpenDrive(`${drive.letter}\\`, false),
    }));
  const recentCommandPaths = new Set<string>(quickAccessPaths);
  for (const drive of drives) recentCommandPaths.add(getPathKey(`${drive.letter}\\`));
  const paletteRecentFolders: CommandPaletteCommand[] = recentFolderPaths
    .filter(path => {
      const pathKey = getPathKey(path);
      if (recentCommandPaths.has(pathKey) || pathKey === getPathKey(currentTab.currentPath)) return false;
      recentCommandPaths.add(pathKey);
      return true;
    })
    .map((path, index) => {
      const name = path.split(/\\|\//).filter(Boolean).pop() || path;
      return {
        id: `recent-folder-${index}`,
        group: t.commandPalette.groups.recent,
        label: name,
        description: path,
        keywords: path,
        onSelect: () => handleOpenCustomQuickAccess({ id: `recent-${index}`, name, path, icon: 'folder', isCustom: true }, false),
      };
    });

  const lastTerminalLabel: Record<WindowsTerminalOption, string> = {
    cmd: t.toolbar.commandPromptHere,
    'cmd-admin': t.toolbar.commandPromptAdminHere,
    powershell: t.toolbar.powerShellHere,
    'powershell-admin': t.toolbar.powerShellAdminHere,
  };
  const windowsSpecialFolderLabels: Record<WindowsSpecialFolder['id'], string> = {
    programFilesX86: t.toolbar.programFilesX86,
    programFiles: t.toolbar.programFiles,
    appData: t.toolbar.appData,
    programData: t.toolbar.programData,
    system32: t.toolbar.system32,
    windows: t.toolbar.windowsFolder,
    editHosts: t.toolbar.editHostsFile,
  };
  const paletteWindowsCommands: CommandPaletteCommand[] = isTauriDesktop() && currentFolderIsReal
    ? [
      { id: 'show-in-explorer', group: t.commandPalette.groups.windows, label: t.commandPalette.commands.showInExplorer, keywords: 'windows explorer open folder', onSelect: handleShowCurrentFolderInExplorer },
      { id: 'open-terminal', group: t.commandPalette.groups.windows, label: t.commandPalette.commands.openTerminal, description: lastTerminalLabel[lastTerminalOption], keywords: 'cmd command prompt powershell shell console', onSelect: () => handleLaunchWindowsTerminal(lastTerminalOption) },
      ...windowsSpecialFolders.map(folder => {
        const label = windowsSpecialFolderLabels[folder.id];
        return {
          id: `windows-folder-${folder.id}`,
          group: t.commandPalette.groups.windows,
          label,
          description: folder.path,
          keywords: `${label} ${folder.path} ${t.toolbar.advancedWindowsFolders}`,
          onSelect: () => handleOpenWindowsSpecialFolder(folder),
        };
      }),
    ]
    : [];

  const commandPaletteCommands: CommandPaletteCommand[] = [
    ...paletteActions,
    ...paletteViewCommands,
    ...(isTauriDesktop() ? [{
      id: 'recycle-bin',
      group: t.commandPalette.groups.navigation,
      label: t.commandPalette.commands.recycleBin,
      keywords: 'trash deleted restore',
      onSelect: () => { void handleNavigate(RECYCLE_BIN_PATH, activePane); },
    }] : []),
    ...paletteQuickAccess,
    ...paletteDrives,
    ...paletteRecentFolders,
    ...paletteWindowsCommands,
  ];

  const tabMenuTabs = tabMenuTarget?.pane === 'left' ? leftTabs : rightTabs;
  const tabMenuIndex = tabMenuTarget ? tabMenuTabs.findIndex(tab => tab.id === tabMenuTarget.tabId) : -1;
  const tabMenuTab = tabMenuIndex >= 0 ? tabMenuTabs[tabMenuIndex] : null;
  const tabMenuClosableLeft = tabMenuIndex >= 0 ? tabMenuTabs.slice(0, tabMenuIndex).filter(tab => !tab.lockClose).length : 0;
  const tabMenuClosableRight = tabMenuIndex >= 0 ? tabMenuTabs.slice(tabMenuIndex + 1).filter(tab => !tab.lockClose).length : 0;

  return (
    <TooltipPreferenceContext.Provider value={tooltipsEnabled}>
      <div
        className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans select-none overflow-hidden"
        onContextMenuCapture={handleApplicationContextMenuCapture}
      >
      <WindowTitleBar
        showWindowControls={isTauriDesktop()}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        onWindowControlError={() => showToast(t.core.windowControlFailed)}
      />

      {/* 2. Top Command Bar */}
      <HeaderBar
        layout={layout}
        onLayoutChange={setLayout}
        onOpenWorkspaceManager={() => setIsWorkspaceManagerOpen(true)}
        workspaceChangesPending={layoutDirty || sessionDirty}
        viewMode={currentTab.viewMode}
        onViewModeChange={handleViewModeChange}
        relativeGraphsEnabled={relativeGraphsEnabled}
        onToggleRelativeGraphs={() => setRelativeGraphsEnabled(enabled => !enabled)}
        showHiddenFiles={showHiddenFiles}
        onToggleShowHiddenFiles={() => setShowHiddenFiles(enabled => !enabled)}
        showFileExtensions={showFileExtensions}
        onToggleShowFileExtensions={() => setShowFileExtensions(enabled => !enabled)}
        currentFolderPath={currentTab.currentPath}
        windowsActionsAvailable={isTauriDesktop()}
        windowsSpecialFolders={windowsSpecialFolders}
        lastTerminalOption={lastTerminalOption}
        onLastTerminalOptionChange={setLastTerminalOption}
        onShowInWindowsExplorer={handleShowCurrentFolderInExplorer}
        onLaunchTerminal={handleLaunchWindowsTerminal}
        onOpenWindowsSpecialFolder={handleOpenWindowsSpecialFolder}
        propertiesPanelOpen={previewOpen}
        onTogglePropertiesPanel={() => setPreviewOpen(value => !value)}
        onNewFolder={handleNewFolder}
        onDeleteSelected={() => handleDeleteSelected(selectedItemsForDelete)}
        undoHistory={undoHistory}
        onUndoAction={handleUndoAction}
        undoBusy={undoBusy || isFileOperationBusy || transferOperations.some(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status))}
        selectedCount={selectedCount}
        flatView={currentTab.flatView === true && !!currentTab.currentPath && !currentTab.currentPath.startsWith('::')}
        flatViewAvailable={flatViewAvailable}
        flatViewTooltip={flatViewTooltip}
        flatViewLoading={Boolean(currentTab.flatView && !currentTab.currentPath.startsWith('::') && (!flatDirectories[getPathKey(currentTab.currentPath)] || flatDirectories[getPathKey(currentTab.currentPath)].loading))}
        onToggleFlatView={() => {
          if (!flatViewAvailable) return;
          const key = getPathKey(currentTab.currentPath);
          if (!currentTab.flatView && flatDirectories[key]?.error) invalidateFlatDirectories([currentTab.currentPath]);
          updateActiveTab(tab => ({ ...tab, flatView: !tab.flatView, selectedIds: [], focusedId: null }));
        }}
      />

      {/* 2. Main Workstation Area */}
      <div className="relative grid min-h-0 min-w-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: 'minmax(0, ' + sidebarSplitPercent + 'fr) 8px minmax(0, ' + (100 - sidebarSplitPercent) + 'fr)' }}>
        {/* Left Sidebar (Drives, Quick Access & Recent Files) */}
        <Sidebar
          drives={drives}
          quickAccess={sidebarQuickAccess}
          onAddQuickAccess={handleAddCustomQuickAccess}
          quickAccessSortMode={quickAccessSortMode}
          onQuickAccessSortModeChange={setQuickAccessSortMode}
          onReorderQuickAccess={handleReorderQuickAccess}
          onMoveQuickAccess={handleMoveQuickAccess}
          onOpenCustomQuickAccess={handleOpenCustomQuickAccess}
          onRenameQuickAccess={handleRenameCustomQuickAccess}
          onRemoveQuickAccess={handleRemoveCustomQuickAccess}
          allFiles={allFiles}
          currentFolderItem={activeFolderItem}
          currentPath={currentTab.currentPath}
          onNavigate={(path) => handleNavigate(path, activePane, false, sidebarLocationsOpenInNewTab)}
          onOpenDrive={handleOpenDrive}
          onSelectRecentFile={handleSelectRecentFile}
          onClearRecentFiles={handleClearRecentFiles}
          selectedItems={selectedItemsForDelete}
          onClearSelection={() => updateActiveTab(tab => ({ ...tab, selectedIds: [], focusedId: null }))}
          onSelectAll={handleSelectAllVisible}
          currentFolderItems={activeDisplayFiles}
          onSelectCurrentFolderFiles={() => handleSelectCurrentFolderItemsByType(false)}
          onSelectCurrentFolderFolders={() => handleSelectCurrentFolderItemsByType(true)}
          onUnselectAll={handleUnselectAll}
          onInvertSelection={handleInvertVisibleSelection}
          onTogglePropertiesPanel={() => setPreviewOpen(value => !value)}
          propertiesPanelOpen={previewOpen}
          onRenameSelected={handleRenameSelected}
          onDeleteSelected={() => handleDeleteSelected(selectedItemsForDelete)}
          onPreviewSelectedFile={handleSelectRecentFile}
          supportsArchiveExtraction={isTauriDesktop()}
          onExtractSelected={(item, mode) => queueNativeTransfer('extract', [item.path], getParentPath(item.path), { selectionPane: activePane, extractionMode: mode })}
          supportsArchiveCreation={isTauriDesktop()}
          onCreateZipSelected={() => openZipCreation(selectedItemsForDelete, currentTab.currentPath, activePane)}
          onCopySelectedPaths={handleCopySelectedPaths}
          onCopyFolderPath={handleCopyFolderPath}
          onCreateZipFolder={item => openZipCreation([item], getParentPath(item.path), activePane)}
          recycleBinSupported={isTauriDesktop()}
          recycleBinStatus={recycleBinStatus}
          isDualPane={layout !== 'single'}
          isHorizontalDual={layout === 'dual-horizontal'}
          hasLeftPaneSelection={canTransferLeftToRight && activePane === 'left'}
          hasRightPaneSelection={canTransferRightToLeft && activePane === 'right'}
          onCopyLeftToRight={() => handleCopySelectedFromPane('left')}
          onCopyRightToLeft={() => handleCopySelectedFromPane('right')}
          onMoveLeftToRight={() => { void handleMoveSelectedFromPane('left'); }}
          onMoveRightToLeft={() => { void handleMoveSelectedFromPane('right'); }}
          onOpenRecycleBin={() => { void handleOpenRecycleBin(); }}
          onRestoreRecycleBinItems={() => { void handleRestoreRecycleBinItems(selectedItemsForDelete); }}
          onRequestEmptyRecycleBin={handleRequestEmptyRecycleBin}
        />

        <PaneSplitter orientation="vertical" value={sidebarSplitPercent} onChange={setSidebarSplitPercent} minPercent={20} maxPercent={42} label={t.header.resizeSidebar} />

        {/* File Panes Canvas */}
        <div className="flex-1 grid min-h-0 min-w-0 overflow-hidden" style={{ gridTemplateColumns: previewOpen ? 'minmax(0, ' + previewSplitPercent + 'fr) 8px minmax(0, ' + (100 - previewSplitPercent) + 'fr)' : 'minmax(0, 1fr)' }}>
          <Suspense fallback={<div className="flex min-h-0 min-w-0 items-center justify-center text-xs text-neutral-500">{t.pane.loadingFolder}</div>}>
          {/* Dual Vertical Layout */}
          {layout === 'dual-vertical' && (
            <div className="flex-1 grid h-full min-h-0 min-w-0 overflow-hidden" style={{ gridTemplateColumns: 'minmax(0, ' + verticalSplitPercent + 'fr) 8px minmax(0, ' + (100 - verticalSplitPercent) + 'fr)' }}>
              {/* Left file pane */}
              <div className="min-w-0 min-h-0 h-full overflow-hidden">
                <FilePane
                  paneId="left"
                  tabStripPosition={tabStripPosition}
                  showNewTabButton={showNewTabButton}
                  doubleClickTabBar={doubleClickTabBar}
                  columnPreferences={paneColumnPreferences.left}
                  isActive={activePane === 'left'}
                  styleLocked={folderStyleLocked}
                  recentItemStyle={recentItemStyle}
                  hiddenItemStyle={hiddenItemStyle}
                  navigationTransitionsEnabled={navigationTransitionsEnabled}
                  navigationTransitionStyle={navigationTransitionStyle}
                  imageTooltipThumbnailsEnabled={imageTooltipThumbnailsEnabled}
                  showFileExtensions={showFileExtensions}
                  singleClickOpens={singleClickOpen}
                  emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
                  mouseGesturesEnabled={mouseGesturesEnabled}
                  onStyleLockToggle={toggleFolderStyleLock}
                  onActivate={() => setActivePane('left')}
                  tab={leftTabs[activeLeftTabIndex]}
                  tabs={leftTabs}
                  activeTabIndex={activeLeftTabIndex}
                  onSelectTab={(idx) => setActiveLeftTabIndex(idx)}
                  onAddTab={() => handleAddTab('left')}
                  onCloseTab={(idx) => handleCloseTab('left', idx)}
                  onTabStripContextMenu={(x, y) => { setContextMenuPos(null); setTabMenuTarget(null); setTabStripMenuTarget({ pane: 'left', x, y }); }}
                  onTabContextMenu={(idx, x, y) => { setContextMenuPos(null); setTabStripMenuTarget(null); setTabMenuTarget({ pane: 'left', tabId: leftTabs[idx].id, x, y }); }}
                  files={leftDisplayFiles}
                  recentFolderPaths={recentFolderPaths}
                  onClearRecentFolders={clearRecentFolderHistory}
                  autoFolderSizeEnabled={autoFolderSizeEnabled}
                  relativeGraphsEnabled={relativeGraphsEnabled}
                  dateFormat={dateFormat}
                  drives={drives}
                  hasMore={leftAtRecycleBin ? recycleBinPage.hasMore : leftDirectoryState?.hasMore}
                  totalItemCount={leftKnownCounts?.totalCount}
                  isLoadingDirectory={(leftDisplayTab.flatView && !leftAtSystemHome && !leftAtRecycleBin && !leftDirectoryState) || leftDirectoryState?.loading || (leftAtSystemHome && systemHomeLoading) || (leftAtRecycleBin && recycleBinPage.loading)}
                  flatViewStatus={leftDisplayTab.flatView ? flatDirectories[getPathKey(leftDisplayTab.currentPath)] : undefined}
                  onLoadMore={leftAtRecycleBin ? () => void loadMoreRecycleBin() : undefined}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'left')}
                  onRefresh={() => void handleNavigate(leftTabs[activeLeftTabIndex].currentPath, 'left', true)}
                  onNavigateBack={() => handleNavigateBack('left')}
                  onNavigateForward={() => handleNavigateForward('left')}
                  onNavigateUp={() => handleNavigateUp('left')}
                  onFilterChange={(q) => updatePaneTab('left', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range, replaceExactly, focusedId) => handleSelectItems('left', ids, additive, range, replaceExactly, focusedId)}
                  onSortChange={field => updatePaneTab('left', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'left')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'left')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundClick={(_event, pane) => handleSelectItems(pane, [])}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                  renameRequest={renameRequest}
                  onRenameRequestHandled={handleRenameRequestHandled}
                  columnPreferencesRevision={columnPreferencesRevision}
                  onColumnPreferencesChange={onColumnPreferencesChange}
                />
              </div>

              {/* Vertical Splitter Visual Bar */}
              <PaneSplitter orientation="vertical" value={verticalSplitPercent} onChange={setVerticalSplitPercent} label={t.header.resizePanels} />

              {/* Right file pane */}
              <div className="min-w-0 min-h-0 h-full overflow-hidden">
                <FilePane
                  paneId="right"
                  tabStripPosition={tabStripPosition}
                  showNewTabButton={showNewTabButton}
                  doubleClickTabBar={doubleClickTabBar}
                  columnPreferences={paneColumnPreferences.right}
                  isActive={activePane === 'right'}
                  styleLocked={folderStyleLocked}
                  recentItemStyle={recentItemStyle}
                  hiddenItemStyle={hiddenItemStyle}
                  navigationTransitionsEnabled={navigationTransitionsEnabled}
                  navigationTransitionStyle={navigationTransitionStyle}
                  imageTooltipThumbnailsEnabled={imageTooltipThumbnailsEnabled}
                  showFileExtensions={showFileExtensions}
                  singleClickOpens={singleClickOpen}
                  emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
                  mouseGesturesEnabled={mouseGesturesEnabled}
                  onStyleLockToggle={toggleFolderStyleLock}
                  onActivate={() => setActivePane('right')}
                  tab={rightTabs[activeRightTabIndex]}
                  tabs={rightTabs}
                  activeTabIndex={activeRightTabIndex}
                  onSelectTab={(idx) => setActiveRightTabIndex(idx)}
                  onAddTab={() => handleAddTab('right')}
                  onCloseTab={(idx) => handleCloseTab('right', idx)}
                  onTabStripContextMenu={(x, y) => { setContextMenuPos(null); setTabMenuTarget(null); setTabStripMenuTarget({ pane: 'right', x, y }); }}
                  onTabContextMenu={(idx, x, y) => { setContextMenuPos(null); setTabStripMenuTarget(null); setTabMenuTarget({ pane: 'right', tabId: rightTabs[idx].id, x, y }); }}
                  files={rightDisplayFiles}
                  recentFolderPaths={recentFolderPaths}
                  onClearRecentFolders={clearRecentFolderHistory}
                  autoFolderSizeEnabled={autoFolderSizeEnabled}
                  relativeGraphsEnabled={relativeGraphsEnabled}
                  dateFormat={dateFormat}
                  drives={drives}
                  hasMore={rightAtRecycleBin ? recycleBinPage.hasMore : rightDirectoryState?.hasMore}
                  totalItemCount={rightKnownCounts?.totalCount}
                  isLoadingDirectory={(rightDisplayTab.flatView && !rightAtSystemHome && !rightAtRecycleBin && !rightDirectoryState) || rightDirectoryState?.loading || (rightAtSystemHome && systemHomeLoading) || (rightAtRecycleBin && recycleBinPage.loading)}
                  flatViewStatus={rightDisplayTab.flatView ? flatDirectories[getPathKey(rightDisplayTab.currentPath)] : undefined}
                  onLoadMore={rightAtRecycleBin ? () => void loadMoreRecycleBin() : undefined}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'right')}
                  onRefresh={() => void handleNavigate(rightTabs[activeRightTabIndex].currentPath, 'right', true)}
                  onNavigateBack={() => handleNavigateBack('right')}
                  onNavigateForward={() => handleNavigateForward('right')}
                  onNavigateUp={() => handleNavigateUp('right')}
                  onFilterChange={(q) => updatePaneTab('right', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range, replaceExactly, focusedId) => handleSelectItems('right', ids, additive, range, replaceExactly, focusedId)}
                  onSortChange={field => updatePaneTab('right', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'right')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'right')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundClick={(_event, pane) => handleSelectItems(pane, [])}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                  renameRequest={renameRequest}
                  onRenameRequestHandled={handleRenameRequestHandled}
                  columnPreferencesRevision={columnPreferencesRevision}
                  onColumnPreferencesChange={onColumnPreferencesChange}
                />
              </div>
            </div>
          )}

          {/* Dual Horizontal Layout */}
          {layout === 'dual-horizontal' && (
            <div className="flex-1 grid h-full min-h-0 min-w-0 overflow-hidden" style={{ gridTemplateRows: 'minmax(0, ' + horizontalSplitPercent + 'fr) 8px minmax(0, ' + (100 - horizontalSplitPercent) + 'fr)' }}>
              <div className="min-h-0 h-full overflow-hidden">
                <FilePane
                  paneId="left"
                  tabStripPosition={tabStripPosition}
                  showNewTabButton={showNewTabButton}
                  doubleClickTabBar={doubleClickTabBar}
                  columnPreferences={paneColumnPreferences.left}
                  isActive={activePane === 'left'}
                  styleLocked={folderStyleLocked}
                  recentItemStyle={recentItemStyle}
                  hiddenItemStyle={hiddenItemStyle}
                  navigationTransitionsEnabled={navigationTransitionsEnabled}
                  navigationTransitionStyle={navigationTransitionStyle}
                  imageTooltipThumbnailsEnabled={imageTooltipThumbnailsEnabled}
                  showFileExtensions={showFileExtensions}
                  singleClickOpens={singleClickOpen}
                  emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
                  mouseGesturesEnabled={mouseGesturesEnabled}
                  onStyleLockToggle={toggleFolderStyleLock}
                  onActivate={() => setActivePane('left')}
                  tab={leftTabs[activeLeftTabIndex]}
                  tabs={leftTabs}
                  activeTabIndex={activeLeftTabIndex}
                  onSelectTab={(idx) => setActiveLeftTabIndex(idx)}
                  onAddTab={() => handleAddTab('left')}
                  onCloseTab={(idx) => handleCloseTab('left', idx)}
                  onTabStripContextMenu={(x, y) => { setContextMenuPos(null); setTabMenuTarget(null); setTabStripMenuTarget({ pane: 'left', x, y }); }}
                  onTabContextMenu={(idx, x, y) => { setContextMenuPos(null); setTabStripMenuTarget(null); setTabMenuTarget({ pane: 'left', tabId: leftTabs[idx].id, x, y }); }}
                  files={leftDisplayFiles}
                  recentFolderPaths={recentFolderPaths}
                  onClearRecentFolders={clearRecentFolderHistory}
                  autoFolderSizeEnabled={autoFolderSizeEnabled}
                  relativeGraphsEnabled={relativeGraphsEnabled}
                  dateFormat={dateFormat}
                  drives={drives}
                  hasMore={leftAtRecycleBin ? recycleBinPage.hasMore : leftDirectoryState?.hasMore}
                  totalItemCount={leftKnownCounts?.totalCount}
                  isLoadingDirectory={(leftDisplayTab.flatView && !leftAtSystemHome && !leftAtRecycleBin && !leftDirectoryState) || leftDirectoryState?.loading || (leftAtSystemHome && systemHomeLoading) || (leftAtRecycleBin && recycleBinPage.loading)}
                  flatViewStatus={leftDisplayTab.flatView ? flatDirectories[getPathKey(leftDisplayTab.currentPath)] : undefined}
                  onLoadMore={leftAtRecycleBin ? () => void loadMoreRecycleBin() : undefined}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'left')}
                  onRefresh={() => void handleNavigate(leftTabs[activeLeftTabIndex].currentPath, 'left', true)}
                  onNavigateBack={() => handleNavigateBack('left')}
                  onNavigateForward={() => handleNavigateForward('left')}
                  onNavigateUp={() => handleNavigateUp('left')}
                  onFilterChange={(q) => updatePaneTab('left', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range, replaceExactly, focusedId) => handleSelectItems('left', ids, additive, range, replaceExactly, focusedId)}
                  onSortChange={field => updatePaneTab('left', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'left')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'left')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundClick={(_event, pane) => handleSelectItems(pane, [])}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                  renameRequest={renameRequest}
                  onRenameRequestHandled={handleRenameRequestHandled}
                  columnPreferencesRevision={columnPreferencesRevision}
                  onColumnPreferencesChange={onColumnPreferencesChange}
                />
              </div>
              <PaneSplitter orientation="horizontal" value={horizontalSplitPercent} onChange={setHorizontalSplitPercent} label={t.header.resizePanels} />
              <div className="min-h-0 h-full overflow-hidden">
                <FilePane
                  paneId="right"
                  tabStripPosition={tabStripPosition}
                  showNewTabButton={showNewTabButton}
                  doubleClickTabBar={doubleClickTabBar}
                  columnPreferences={paneColumnPreferences.right}
                  isActive={activePane === 'right'}
                  styleLocked={folderStyleLocked}
                  recentItemStyle={recentItemStyle}
                  hiddenItemStyle={hiddenItemStyle}
                  navigationTransitionsEnabled={navigationTransitionsEnabled}
                  navigationTransitionStyle={navigationTransitionStyle}
                  imageTooltipThumbnailsEnabled={imageTooltipThumbnailsEnabled}
                  showFileExtensions={showFileExtensions}
                  singleClickOpens={singleClickOpen}
                  emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
                  mouseGesturesEnabled={mouseGesturesEnabled}
                  onStyleLockToggle={toggleFolderStyleLock}
                  onActivate={() => setActivePane('right')}
                  tab={rightTabs[activeRightTabIndex]}
                  tabs={rightTabs}
                  activeTabIndex={activeRightTabIndex}
                  onSelectTab={(idx) => setActiveRightTabIndex(idx)}
                  onAddTab={() => handleAddTab('right')}
                  onCloseTab={(idx) => handleCloseTab('right', idx)}
                  onTabStripContextMenu={(x, y) => { setContextMenuPos(null); setTabMenuTarget(null); setTabStripMenuTarget({ pane: 'right', x, y }); }}
                  onTabContextMenu={(idx, x, y) => { setContextMenuPos(null); setTabStripMenuTarget(null); setTabMenuTarget({ pane: 'right', tabId: rightTabs[idx].id, x, y }); }}
                  files={rightDisplayFiles}
                  recentFolderPaths={recentFolderPaths}
                  onClearRecentFolders={clearRecentFolderHistory}
                  autoFolderSizeEnabled={autoFolderSizeEnabled}
                  relativeGraphsEnabled={relativeGraphsEnabled}
                  dateFormat={dateFormat}
                  drives={drives}
                  hasMore={rightAtRecycleBin ? recycleBinPage.hasMore : rightDirectoryState?.hasMore}
                  totalItemCount={rightKnownCounts?.totalCount}
                  isLoadingDirectory={(rightDisplayTab.flatView && !rightAtSystemHome && !rightAtRecycleBin && !rightDirectoryState) || rightDirectoryState?.loading || (rightAtSystemHome && systemHomeLoading) || (rightAtRecycleBin && recycleBinPage.loading)}
                  flatViewStatus={rightDisplayTab.flatView ? flatDirectories[getPathKey(rightDisplayTab.currentPath)] : undefined}
                  onLoadMore={rightAtRecycleBin ? () => void loadMoreRecycleBin() : undefined}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'right')}
                  onRefresh={() => void handleNavigate(rightTabs[activeRightTabIndex].currentPath, 'right', true)}
                  onNavigateBack={() => handleNavigateBack('right')}
                  onNavigateForward={() => handleNavigateForward('right')}
                  onNavigateUp={() => handleNavigateUp('right')}
                  onFilterChange={(q) => updatePaneTab('right', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range, replaceExactly, focusedId) => handleSelectItems('right', ids, additive, range, replaceExactly, focusedId)}
                  onSortChange={field => updatePaneTab('right', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'right')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'right')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundClick={(_event, pane) => handleSelectItems(pane, [])}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                  renameRequest={renameRequest}
                  onRenameRequestHandled={handleRenameRequestHandled}
                  columnPreferencesRevision={columnPreferencesRevision}
                  onColumnPreferencesChange={onColumnPreferencesChange}
                />
              </div>
            </div>
          )}

          {/* Single Pane Layout */}
          {layout === 'single' && (
            <div className="flex-1 h-full overflow-hidden">
              <FilePane
                key={activePane}
                paneId={activePane}
                tabStripPosition={tabStripPosition}
                showNewTabButton={showNewTabButton}
                doubleClickTabBar={doubleClickTabBar}
                columnPreferences={paneColumnPreferences[activePane]}
                isActive={true}
                styleLocked={folderStyleLocked}
                  recentItemStyle={recentItemStyle}
                  hiddenItemStyle={hiddenItemStyle}
                  navigationTransitionsEnabled={navigationTransitionsEnabled}
                  navigationTransitionStyle={navigationTransitionStyle}
                  imageTooltipThumbnailsEnabled={imageTooltipThumbnailsEnabled}
                  showFileExtensions={showFileExtensions}
                  singleClickOpens={singleClickOpen}
                  emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
                  mouseGesturesEnabled={mouseGesturesEnabled}
                onStyleLockToggle={toggleFolderStyleLock}
                onActivate={() => {}}
                tab={currentTab}
                tabs={activeTabs}
                activeTabIndex={activeTabIndex}
                onSelectTab={(idx) => (activePane === 'left' ? setActiveLeftTabIndex(idx) : setActiveRightTabIndex(idx))}
                onAddTab={() => handleAddTab(activePane)}
                onCloseTab={(idx) => handleCloseTab(activePane, idx)}
                onTabStripContextMenu={(x, y) => { setContextMenuPos(null); setTabMenuTarget(null); setTabStripMenuTarget({ pane: activePane, x, y }); }}
                onTabContextMenu={(idx, x, y) => { setContextMenuPos(null); setTabStripMenuTarget(null); setTabMenuTarget({ pane: activePane, tabId: activeTabs[idx].id, x, y }); }}
                  files={activeDisplayFiles}
                  recentFolderPaths={recentFolderPaths}
                  onClearRecentFolders={clearRecentFolderHistory}
                  autoFolderSizeEnabled={autoFolderSizeEnabled}
                  relativeGraphsEnabled={relativeGraphsEnabled}
                  dateFormat={dateFormat}
                  drives={drives}
                  hasMore={currentAtRecycleBin ? recycleBinPage.hasMore : (activePane === 'left' ? leftDirectoryState : rightDirectoryState)?.hasMore}
                  totalItemCount={activeKnownCounts?.totalCount}
                  isLoadingDirectory={(currentTab.flatView && !currentTab.currentPath.startsWith('::') && !(activePane === 'left' ? leftDirectoryState : rightDirectoryState)) || (activePane === 'left' ? leftDirectoryState : rightDirectoryState)?.loading || (currentTab.currentPath === SYSTEM_HOME_PATH && systemHomeLoading) || (currentAtRecycleBin && recycleBinPage.loading)}
                  flatViewStatus={currentTab.flatView ? flatDirectories[getPathKey(currentTab.currentPath)] : undefined}
                  onLoadMore={currentAtRecycleBin ? () => void loadMoreRecycleBin() : undefined}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, activePane)}
                  onRefresh={() => void handleNavigate(currentTab.currentPath, activePane, true)}
                onNavigateBack={() => handleNavigateBack(activePane)}
                onNavigateForward={() => handleNavigateForward(activePane)}
                onNavigateUp={() => handleNavigateUp(activePane)}
                onFilterChange={(q) => updateActiveTab(t => ({ ...t, filterQuery: q }))}
                onSelectItems={(ids, additive, range, replaceExactly, focusedId) => handleSelectItems(activePane, ids, additive, range, replaceExactly, focusedId)}
                onSortChange={field => updateActiveTab(tab => toggleTabSort(tab, field))}
                onItemDoubleClick={(item) => handleItemDoubleClick(item, activePane)}
                onItemContextMenu={(e, item) => handleItemContextMenu(e, item, activePane)}
                onBackgroundContextMenu={handleBackgroundContextMenu}
                onBackgroundClick={(_event, pane) => handleSelectItems(pane, [])}
                onBackgroundDoubleClick={handleBackgroundDoubleClick}
                onDropFilesFromOtherPane={handleDropFiles}
                onInlineRename={handleInlineRename}
                renameRequest={renameRequest}
                onRenameRequestHandled={handleRenameRequestHandled}
                  columnPreferencesRevision={columnPreferencesRevision}
                  onColumnPreferencesChange={onColumnPreferencesChange}
              />
            </div>
          )}
          </Suspense>

          {previewOpen && <PaneSplitter orientation="vertical" value={previewSplitPercent} onChange={setPreviewSplitPercent} label={t.header.resizePreview} />}

          {/* 3. Docked Quick Preview Pane */}
          {previewOpen && (
            <PreviewPane
              item={previewItem}
              dateFormat={dateFormat}
              onClose={() => setPreviewOpen(false)}
              nativePropertiesSupported={isTauriDesktop()}
              onOpenWindowsProperties={() => void handleOpenWindowsProperties(previewItem)}
              onOpenWithDefaultApp={() => {
                if (!previewItem) return;
                void openNativeFileWithDefaultApp(previewItem.path).catch(() => showToast(t.core.fileOpenFailed));
              }}
            />
          )}
        </div>
      </div>

      {/* 3. Global Bottom Status Bar */}
      <BottomStatusBar
        layout={layout}
        activePane={activePane}
        currentTab={currentTab}
        activeFiles={activeDisplayFiles}
        isLoadingDirectory={Boolean(currentTab.flatView && !currentTab.currentPath.startsWith('::') && (!(activePane === 'left' ? leftDirectoryState : rightDirectoryState) || (activePane === 'left' ? leftDirectoryState : rightDirectoryState)?.loading || flatDirectories[getPathKey(currentTab.currentPath)]?.error))}
        hasMoreItems={currentAtRecycleBin ? recycleBinPage.hasMore : (activePane === 'left' ? leftDirectoryState : rightDirectoryState)?.hasMore ?? false}
        totalFileCount={activeKnownCounts?.fileCount}
        totalFolderCount={activeKnownCounts?.folderCount}
        hiddenItemsCount={hiddenItemsCount}
        showHiddenFiles={showHiddenFiles}
        drives={drives}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Floating Action Toast */}
      {toastMessage && (
        <div key={toastSequence} role="status" aria-live="polite" className="fixed bottom-10 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2 overflow-hidden rounded-lg border border-cyan-500/50 bg-neutral-900/95 px-4 py-2 pb-2.5 text-xs font-medium text-cyan-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400 animate-pulse" />
          <span className="max-w-[42rem] break-words">{toastMessage}</span>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-cyan-950/70">
            <div className="cyberfiles-toast-progress h-full w-full origin-left bg-gradient-to-r from-cyan-600 via-cyan-300 to-white shadow-[0_0_8px_rgba(34,211,238,0.8)]" style={{ animationDuration: `${TOAST_DURATION_MS}ms` }} />
          </div>
        </div>
      )}

      {/* Context Menu */}
      {tabStripMenuTarget && (
        <TabStripContextMenu
          key={`${tabStripMenuTarget.pane}:${tabStripMenuTarget.x}:${tabStripMenuTarget.y}`}
          x={tabStripMenuTarget.x}
          y={tabStripMenuTarget.y}
          canReopen={closedTabs.length > 0}
          position={tabStripPosition}
          showNewTabButton={showNewTabButton}
          doubleClickTabBar={doubleClickTabBar}
          onAction={handleTabStripMenuAction}
          onClose={() => setTabStripMenuTarget(null)}
        />
      )}
      {tabMenuTarget && tabMenuTab && (
        <TabContextMenu
          key={`${tabMenuTarget.pane}:${tabMenuTarget.tabId}:${tabMenuTarget.x}:${tabMenuTarget.y}`}
          x={tabMenuTarget.x}
          y={tabMenuTarget.y}
          tab={tabMenuTab}
          canOpenParent={canOpenTabParent(tabMenuTab)}
          canReopen={closedTabs.length > 0}
          closableLeft={tabMenuClosableLeft}
          closableRight={tabMenuClosableRight}
          closableOthers={tabMenuClosableLeft + tabMenuClosableRight}
          canClose={tabMenuTabs.length > 1 && !tabMenuTab.lockClose}
          position={tabStripPosition}
          onAction={handleTabMenuAction}
          onClose={() => setTabMenuTarget(null)}
        />
      )}
      <ContextMenu
        position={contextMenuPos}
        viewMode={contextPaneTab.viewMode}
        sortField={contextPaneTab.sortField}
        sortOrder={contextPaneTab.sortOrder}
        groupBy={contextPaneTab.groupBy ?? 'none'}
        supportsGrouping={contextPaneTab.currentPath !== SYSTEM_HOME_PATH && contextPaneTab.currentPath !== RECYCLE_BIN_PATH}
        onSortFieldChange={field => updatePaneTab(contextPane, tab => {
          const sortOrder = tab.sortField === field ? tab.sortOrder : 'asc';
          return { ...tab, sortField: field, sortOrder, folderStyle: { ...getTabFolderStyle(tab), sortField: field, sortOrder } };
        })}
        onSortOrderChange={order => updatePaneTab(contextPane, tab => ({ ...tab, sortOrder: order, folderStyle: { ...getTabFolderStyle(tab), sortOrder: order } }))}
        onGroupByChange={groupBy => updatePaneTab(contextPane, tab => ({ ...tab, groupBy, folderStyle: { ...getTabFolderStyle(tab), groupBy } }))}
        hasFolder={Boolean(contextPaneTab.currentPath)}
        canModifyFolder={Boolean(contextPaneTab.currentPath) && contextPaneTab.currentPath !== SYSTEM_HOME_PATH && contextPaneTab.currentPath !== RECYCLE_BIN_PATH}
        fileClipboardSupported={isTauriDesktop()}
        hasFilter={Boolean(contextPaneTab.filterQuery)}
        onClose={() => setContextMenuPos(null)}
        onOpenLocation={item => { void handleNavigate(item.path, contextPane); }}
        onAddToQuickAccess={handleAddFolderToQuickAccess}
        onRefresh={() => void handleNavigate(contextPaneTab.currentPath, contextPane, true)}
        onClearFilter={() => updatePaneTab(contextPane, tab => ({ ...tab, filterQuery: '' }))}
        onViewModeChange={mode => updatePaneTab(contextPane, tab => setTabViewMode(tab, mode))}
        onPreview={(item) => {
          touchFileAccessed(item.id);
          setPreviewOpen(true);
        }}
        supportsArchiveExtraction={isTauriDesktop()}
        onExtractArchive={(item, mode) => queueNativeTransfer('extract', [item.path], getParentPath(item.path), { selectionPane: contextPane, extractionMode: mode })}
        supportsArchiveCreation={isTauriDesktop()}
        onCompressToZip={item => openZipCreation([item], getParentPath(item.path), contextPane)}
        onCopyOpposite={() => handleCopySelected()}
        onMoveOpposite={() => handleMoveSelected()}
        onCopyToClipboard={item => { void handleFileClipboard(item, false, contextPane); }}
        onCutToClipboard={item => { void handleFileClipboard(item, true, contextPane); }}
        onPaste={() => { void handlePasteFiles(contextPane, contextPaneTab.currentPath); }}
        onCreateItem={kind => openCreateItem(kind, contextPane)}
        onRename={item => beginInlineRename(item, contextPane)}
        onBatchRename={() => setIsBatchRenameOpen(true)}
        onDelete={(item) => handleDeleteSelected([item])}
        onRestore={(item) => { void handleRestoreRecycleBinItems([item]); }}
      />
      {pendingCreateItem && (
        <CreateItemModal
          key={`${pendingCreateItem.kind}:${pendingCreateItem.parentPath}`}
          kind={pendingCreateItem.kind}
          defaultName={pendingCreateItem.suggestedName ?? (
            pendingCreateItem.kind === 'folder'
              ? t.contextMenu.defaultFolderName
              : pendingCreateItem.kind === 'text-file'
                ? t.contextMenu.defaultTextFileName
                : t.contextMenu.defaultShortcutName
          )}
          isBusy={isFileOperationBusy}
          onClose={() => setPendingCreateItem(null)}
          onSubmit={values => { void handleCreateItem(values); }}
          onChooseTarget={async kind => {
            try {
              return kind === 'file'
                ? await chooseNativeFile(t.contextMenu.chooseTargetFile)
                : await chooseNativeFolder(t.contextMenu.chooseTargetFolder);
            } catch (error) {
              showToast(t.core.operationFailedWithReason.replace('{reason}', String(error)));
              return null;
            }
          }}
        />
      )}
      {pendingZipCreation && <CreateZipModal key={pendingZipCreation.targetPath + ':' + pendingZipCreation.sourcePaths.join('|')} defaultName={pendingZipCreation.defaultName} itemCount={pendingZipCreation.sourcePaths.length} targetPath={pendingZipCreation.targetPath} onClose={() => setPendingZipCreation(null)} onChooseTarget={async () => { try { return await chooseNativeFolder(t.contextMenu.chooseTargetFolder); } catch (error) { showToast(t.core.operationFailedWithReason.replace('{reason}', String(error))); return null; } }} onSubmit={handleCreateZip} />}
      <FileOperationModal hidden={isOnboardingOpen || isWorkspaceManagerOpen || isUnsavedWorkspaceChangesOpen || isSettingsOpen || isAboutOpen || isCloseDialogOpen} operations={transferOperations} language={language} onTogglePause={jobId => { void toggleTransferPause(jobId); }} onCancel={jobId => { void cancelTransfer(jobId); }} onSubmitPassword={submitArchivePassword} onClearHistory={clearTransferHistory} />
      <TextInputContextMenu />

      <WorkspaceManagerModal
        isOpen={isWorkspaceManagerOpen}
        layouts={workspaceStore.layouts}
        sessions={workspaceStore.sessions}
        workspaces={workspaceStore.workspaces}
        activeLayoutId={activeLayoutId}
        activeSessionId={activeSessionId}
        activeWorkspaceId={activeWorkspaceId}
        layoutDirty={layoutDirty}
        sessionDirty={sessionDirty}
        canCreateWorkspace={!layoutDirty && !sessionDirty}
        onClose={() => setIsWorkspaceManagerOpen(false)}
        onCreateLayout={createLayoutProfile}
        onUpdateLayout={updateLayoutProfile}
        onApplyLayout={id => requestWorkspaceAction({ type: 'layout', id })}
        onRenameLayout={renameLayoutProfile}
        onDeleteLayout={deleteLayoutProfile}
        onCreateSession={createSessionProfile}
        onUpdateSession={updateSessionProfile}
        onApplySession={id => requestWorkspaceAction({ type: 'session', id })}
        onRenameSession={renameSessionProfile}
        onDeleteSession={deleteSessionProfile}
        onCreateWorkspace={createWorkspaceProfile}
        onApplyWorkspace={id => requestWorkspaceAction({ type: 'workspace', id })}
        onRenameWorkspace={renameWorkspaceProfile}
        onDeleteWorkspace={deleteWorkspaceProfile}
      />

      <UnsavedWorkspaceChangesModal
        isOpen={isUnsavedWorkspaceChangesOpen}
        layoutChanged={pendingLayoutChanged}
        sessionChanged={pendingSessionChanged}
        layoutNeedsName={pendingLayoutChanged && activeLayoutId === DEFAULT_LAYOUT_PROFILE_ID}
        sessionNeedsName={pendingSessionChanged && activeSessionId === DEFAULT_SESSION_PROFILE_ID}
        suggestedLayoutName={suggestUnusedProfileName(t.workspaceProfiles.suggestedLayoutName, workspaceStore.layouts.map(profile => profile.name))}
        suggestedSessionName={suggestUnusedProfileName(t.workspaceProfiles.suggestedSessionName, workspaceStore.sessions.map(profile => profile.name))}
        onSaveAndContinue={savePendingWorkspaceChanges}
        onDiscardAndContinue={discardPendingWorkspaceChanges}
        onCancel={() => {
          setIsUnsavedWorkspaceChangesOpen(false);
          setPendingWorkspaceAction(null);
        }}
      />

      {/* Batch Rename Modal */}
      {shouldMountBatchRenameModal && (
        <Suspense fallback={null}>
          <BatchRenameModal
            isOpen={isBatchRenameOpen}
            onClose={() => setIsBatchRenameOpen(false)}
            selectedItems={selectedItemsForRename.length > 0 ? selectedItemsForRename : activeDisplayFiles}
            onApplyRename={handleApplyBatchRename}
          />
        </Suspense>
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {shouldMountShortcutsModal && (
        <Suspense fallback={null}>
          <KeyboardShortcutsModal
            isOpen={isShortcutsOpen}
            onClose={() => setIsShortcutsOpen(false)}
          />
        </Suspense>
      )}

      {/* Global file and content search modal (Ctrl+F) */}
      {shouldMountSearchModal && (
        <Suspense fallback={null}>
          <FindFilesModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            allFiles={allFiles}
            currentPath={currentTab.currentPath}
            dateFormat={dateFormat}
            onNavigateToFile={handleNavigateToFile}
            onPreviewFile={handlePreviewFileFromSearch}
          />
        </Suspense>
      )}

      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            label={t.commandPalette.title}
            placeholder={t.commandPalette.placeholder}
            noResults={t.commandPalette.noResults}
            commands={commandPaletteCommands}
            onClose={() => setIsCommandPaletteOpen(false)}
          />
        </Suspense>
      )}

      {shouldMountConfirmActionModal && (
        <Suspense fallback={null}>
          {pendingDeleteItems.length > 0 && (
            <ConfirmActionModal
              items={pendingDeleteItems}
              onCancel={() => setPendingDeleteItems([])}
              onConfirm={handleConfirmDelete}
              isBusy={isFileOperationBusy}
              allowPermanentDelete
              confirmVariant="secondary"
            />
          )}
          {isEmptyRecycleBinConfirmOpen && (
            <ConfirmActionModal
              items={[]}
              title={t.core.emptyRecycleBinTitle}
              description={t.core.emptyRecycleBinMessage
                .replace('{count}', new Intl.NumberFormat(language === 'es' ? 'es' : 'en').format(recycleBinStatus?.itemCount ?? 0))
                .replace('{size}', formatFileSize(recycleBinStatus?.totalBytes ?? 0))}
              confirmLabel={t.core.emptyRecycleBinConfirm}
              busyLabel={t.core.emptyRecycleBinBusy}
              isBusy={isRecycleBinBusy}
              onCancel={() => setIsEmptyRecycleBinConfirmOpen(false)}
              onConfirm={handleConfirmEmptyRecycleBin}
            />
          )}
        </Suspense>
      )}

      {shouldMountCloseWindowModal && (
        <Suspense fallback={null}>
          <CloseWindowModal
            isOpen={isCloseDialogOpen}
            rememberChoice={rememberCloseChoice}
            isBusy={isCloseActionBusy}
            sessionHasChanges={sessionDirty}
            layoutHasChanges={layoutDirty}
            onRememberChoiceChange={setRememberCloseChoice}
            onCancel={cancelCloseDialog}
            onExit={handleExitFromCloseDialog}
            onHideToTray={handleHideToTrayFromCloseDialog}
          />
        </Suspense>
      )}

      {shouldMountSettingsModal && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            focusTabSettingsRequest={focusTabSettingsRequest}
            onClose={() => { setIsSettingsOpen(false); setFocusTabSettingsRequest(0); }}
            globalShortcut={globalShortcutSettings}
            globalShortcutLoaded={globalShortcutLoaded}
            globalShortcutSupported={globalShortcutSupported}
            globalShortcutError={globalShortcutError}
            onGlobalShortcutChange={changeGlobalShortcutSettings}
            instancePreferences={instancePreferences}
            instancePreferencesLoaded={instancePreferencesLoaded}
            instancePreferencesSupported={instancePreferencesSupported}
            instancePreferencesError={instancePreferencesError}
            onInstancePreferencesChange={changeInstancePreferences}
            emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
            mouseGesturesEnabled={mouseGesturesEnabled}
            onEmptyAreaDoubleClickNavigatesUpChange={setEmptyAreaDoubleClickNavigatesUp}
            onMouseGesturesEnabledChange={setMouseGesturesEnabled}
            folderStyleLocked={folderStyleLocked}
            onFolderStyleLockedChange={handleFolderStyleLockChange}
            recentItemStyle={recentItemStyle}
            hiddenItemStyle={hiddenItemStyle}
            onRecentItemStyleChange={setRecentItemStyle}
            onHiddenItemStyleChange={setHiddenItemStyle}
            onHiddenItemStyleReset={() => setHiddenItemStyle({ ...DEFAULT_HIDDEN_ITEM_STYLE, enabled: hiddenItemStyle.enabled })}
            onRecentItemStyleReset={() => setRecentItemStyle({ ...DEFAULT_RECENT_ITEM_STYLE, enabled: recentItemStyle.enabled })}
            imageTooltipThumbnailsEnabled={imageTooltipThumbnailsEnabled}
            onImageTooltipThumbnailsEnabledChange={setImageTooltipThumbnailsEnabled}
            notificationBannersEnabled={notificationBannersEnabled}
            onNotificationBannersEnabledChange={setNotificationBannersEnabled}
            tooltipsEnabled={tooltipsEnabled}
            onTooltipsEnabledChange={setTooltipsEnabled}
            navigationTransitionsEnabled={navigationTransitionsEnabled}
            onNavigationTransitionsEnabledChange={setNavigationTransitionsEnabled}
            navigationTransitionStyle={navigationTransitionStyle}
            onNavigationTransitionStyleChange={setNavigationTransitionStyle}
            dateFormat={dateFormat}
            onDateFormatChange={setDateFormat}
            startupBehavior={startupBehavior}
            onStartupBehaviorChange={setStartupBehavior}
            startupSessionId={startupSessionId}
            onStartupSessionIdChange={setStartupSessionId}
            sessions={workspaceStore.sessions}
            autoFolderSizeEnabled={autoFolderSizeEnabled}
            onAutoFolderSizeEnabledChange={setAutoFolderSizeEnabled}
            singleClickOpen={singleClickOpen}
            onSingleClickOpenChange={setSingleClickOpen}
            sidebarLocationsOpenInNewTab={sidebarLocationsOpenInNewTab}
            onSidebarLocationsOpenInNewTabChange={setSidebarLocationsOpenInNewTab}
            newTabsNextToCurrent={newTabsNextToCurrent}
            onNewTabsNextToCurrentChange={setNewTabsNextToCurrent}
            tabStripPosition={tabStripPosition}
            onTabStripPositionChange={setTabStripPosition}
            showNewTabButton={showNewTabButton}
            onShowNewTabButtonChange={setShowNewTabButton}
            doubleClickTabBar={doubleClickTabBar}
            onDoubleClickTabBarChange={setDoubleClickTabBar}
            onShowAbout={() => {
              setIsSettingsOpen(false);
              setFocusTabSettingsRequest(0);
              setIsAboutOpen(true);
            }}
            onShowOnboarding={() => {
              setIsSettingsOpen(false);
              setFocusTabSettingsRequest(0);
              setIsOnboardingOpen(true);
            }}
          />
        </Suspense>
      )}

      {shouldMountAboutModal && (
        <Suspense fallback={null}>
          <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
        </Suspense>
      )}

      {shouldMountOnboardingModal && (
        <Suspense fallback={null}>
          <OnboardingWelcome
            isOpen={isOnboardingOpen}
            onContinue={activateSystemHome}
            onSkip={activateSystemHome}
            folderStyleLocked={folderStyleLocked}
            onFolderStyleLockedChange={handleFolderStyleLockChange}
            startupBehavior={startupBehavior}
            onStartupBehaviorChange={setStartupBehavior}
            startupSessionId={startupSessionId}
            onStartupSessionIdChange={setStartupSessionId}
            sessions={workspaceStore.sessions}
          />
        </Suspense>
      )}
      </div>
    </TooltipPreferenceContext.Provider>
  );
}
