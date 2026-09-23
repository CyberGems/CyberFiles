import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { 
  FileItem, 
  TabState, 
  ViewLayout, 
  ViewMode, 
  SortField,
  SortOrder,
  SYSTEM_HOME_PATH,
  ContextMenuPosition, 
  DriveInfo, 
  QuickAccessItem 
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
  isMediaPreviewPath,
  isWindowsDriveRoot,
  isValidFileName,
  joinWindowsPath,
  rewritePathPrefix,
  normalizeWindowsPath,
} from './utils/fileSystem';
import { HeaderBar } from './components/HeaderBar';
import { Sidebar } from './components/Sidebar';
import { FilePane } from './components/FilePane';
import { PreviewPane } from './components/PreviewPane';
import { BatchRenameModal } from './components/BatchRenameModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { BottomStatusBar } from './components/BottomStatusBar';
import { ContextMenu } from './components/ContextMenu';
import { FindFilesModal } from './components/FindFilesModal';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { CloseWindowModal } from './components/CloseWindowModal';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingWelcome } from './components/OnboardingWelcome';
import { useLanguage } from './locales/LanguageContext';
import { chooseNativeFolder, isTauriDesktop, listNativeDirectory, listNativeDrives, listNativeSystemLocations, loadNativeFolder, setNativeTrayLanguage, type NativeLocation } from './utils/nativeFileSystem';

const ONBOARDING_STORAGE_KEY = 'cyberfiles_onboarding_complete';
const CLOSE_BEHAVIOR_STORAGE_KEY = 'cyberfiles_close_behavior';
const PANEL_VIEW_PREFERENCES_KEY = 'cyberfiles_panel_view_preferences_v1';
const EMPTY_AREA_DOUBLE_CLICK_KEY = 'cyberfiles_empty_area_double_click_navigate_up';
const FOLDER_STYLE_LOCKED_KEY = 'cyberfiles_folder_style_locked';
const SIDEBAR_LOCATIONS_NEW_TAB_KEY = 'cyberfiles_sidebar_locations_open_in_new_tab_v1';
const NEW_TABS_NEXT_TO_CURRENT_KEY = 'cyberfiles_new_tabs_next_to_current_v1';
const DEFAULT_GLOBAL_SHORTCUT = 'Alt+Shift+F';
const DEFAULT_FOLDER_STYLE = { viewMode: 'details' as ViewMode, sortField: 'name' as SortField, sortOrder: 'asc' as SortOrder };

interface PanelViewPreferences {
  layout: ViewLayout;
  previewOpen: boolean;
  activePane: 'left' | 'right';
  leftViewMode: ViewMode;
  rightViewMode: ViewMode;
  leftSortField: SortField;
  leftSortOrder: SortOrder;
  rightSortField: SortField;
  rightSortOrder: SortOrder;
}

interface GlobalShortcutSettingsState {
  enabled: boolean;
  shortcut: string;
  registered: boolean;
}

const DEFAULT_PANEL_VIEW_PREFERENCES: PanelViewPreferences = {
  layout: 'dual-vertical',
  previewOpen: true,
  activePane: 'left',
  leftViewMode: 'details',
  rightViewMode: 'details',
  leftSortField: 'name',
  leftSortOrder: 'asc',
  rightSortField: 'name',
  rightSortOrder: 'asc',
};

function isViewMode(value: unknown): value is ViewMode {
  return value === 'details' || value === 'compact' || value === 'icons';
}

function isSortField(value: unknown): value is SortField {
  return value === 'name' || value === 'size' || value === 'type' || value === 'modifiedDate' || value === 'extension';
}

function readPanelViewPreferences(): PanelViewPreferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PANEL_VIEW_PREFERENCES_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_PANEL_VIEW_PREFERENCES;
    return {
      layout: saved.layout === 'dual-horizontal' || saved.layout === 'single' ? saved.layout : 'dual-vertical',
      previewOpen: typeof saved.previewOpen === 'boolean' ? saved.previewOpen : true,
      activePane: saved.activePane === 'right' ? 'right' : 'left',
      leftViewMode: isViewMode(saved.leftViewMode) ? saved.leftViewMode : 'details',
      rightViewMode: isViewMode(saved.rightViewMode) ? saved.rightViewMode : 'details',
      leftSortField: isSortField(saved.leftSortField) ? saved.leftSortField : 'name',
      leftSortOrder: saved.leftSortOrder === 'desc' ? 'desc' : 'asc',
      rightSortField: isSortField(saved.rightSortField) ? saved.rightSortField : 'name',
      rightSortOrder: saved.rightSortOrder === 'desc' ? 'desc' : 'asc',
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

function styleForPath(path: string, style: typeof DEFAULT_FOLDER_STYLE) {
  return { ...style, viewMode: isMediaPreviewPath(path) ? 'icons' as ViewMode : style.viewMode };
}

function getTabFolderStyle(tab: TabState) {
  return tab.folderStyle ?? { viewMode: tab.viewMode, sortField: tab.sortField, sortOrder: tab.sortOrder };
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
}

interface BrowserDirectoryCursor {
  iterator: AsyncIterator<any>;
  pending?: any;
}

const DIRECTORY_PAGE_SIZE = 400;
const MAX_TAB_HISTORY_ENTRIES = 200;

const getPathKey = (path: string) => normalizeWindowsPath(path).replace(/[\\/]+$/, '').toLowerCase();

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
  selectedIds: [],
  focusedId: null,
  sortField,
  sortOrder,
  viewMode,
  folderStyle: { sortField, sortOrder, viewMode },
});

const createInitialTab = (
  id: string,
  viewMode: ViewMode,
  sortField: SortField,
  sortOrder: SortOrder,
  startsAtSystemHome: boolean,
  systemHomeTitle: string,
): TabState => {
  const tab = createEmptyTab(id, viewMode, sortField, sortOrder);
  return startsAtSystemHome
    ? { ...tab, title: systemHomeTitle, currentPath: SYSTEM_HOME_PATH, history: [SYSTEM_HOME_PATH], historyIndex: 0 }
    : tab;
};

export default function App() {
  const { t, language } = useLanguage();
  const startsAtSystemHome = isTauriDesktop();
  const [initialPanelPreferences] = useState(readPanelViewPreferences);
  const [folderStyleLocked, setFolderStyleLocked] = useState(readFolderStyleLockPreference);
  const [sidebarLocationsOpenInNewTab, setSidebarLocationsOpenInNewTab] = useState(() => readBooleanPreference(SIDEBAR_LOCATIONS_NEW_TAB_KEY, true));
  const [newTabsNextToCurrent, setNewTabsNextToCurrent] = useState(() => readBooleanPreference(NEW_TABS_NEXT_TO_CURRENT_KEY, true));

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
  const nativeRootPath = useRef(startsAtSystemHome ? SYSTEM_HOME_PATH : '');
  const systemHomeWorkspace = useRef(startsAtSystemHome);
  const browserRootPath = useRef('');
  const browserDirectoryCursors = useRef(new Map<string, BrowserDirectoryCursor>());
  const [nativeDirectories, setNativeDirectories] = useState<Record<string, NativeDirectoryState>>({});
  const nativeLoadedDirectories = useRef(new Set<string>());
  const nativeInFlightDirectories = useRef(new Map<string, number>());
  const nativeWorkspaceGeneration = useRef(0);
  const nativeOpeningWorkspace = useRef(false);

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
  const [previewOpen, setPreviewOpen] = useState<boolean>(initialPanelPreferences.previewOpen);
  const [activePane, setActivePane] = useState<'left' | 'right'>(initialPanelPreferences.activePane);
  const [emptyAreaDoubleClickNavigatesUp, setEmptyAreaDoubleClickNavigatesUp] = useState(readEmptyAreaDoubleClickPreference);

  // Notifications / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

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
    createInitialTab('tab-left-1', folderStyleLocked ? initialPanelPreferences.leftViewMode : DEFAULT_FOLDER_STYLE.viewMode, folderStyleLocked ? initialPanelPreferences.leftSortField : DEFAULT_FOLDER_STYLE.sortField, folderStyleLocked ? initialPanelPreferences.leftSortOrder : DEFAULT_FOLDER_STYLE.sortOrder, startsAtSystemHome, t.sidebar.thisPc),
  ]);
  const [activeLeftTabIndex, setActiveLeftTabIndex] = useState(0);

  // Right Pane State & Tabs
  const [rightTabs, setRightTabs] = useState<TabState[]>([
    createInitialTab('tab-right-1', folderStyleLocked ? initialPanelPreferences.rightViewMode : DEFAULT_FOLDER_STYLE.viewMode, folderStyleLocked ? initialPanelPreferences.rightSortField : DEFAULT_FOLDER_STYLE.sortField, folderStyleLocked ? initialPanelPreferences.rightSortOrder : DEFAULT_FOLDER_STYLE.sortOrder, startsAtSystemHome, t.sidebar.thisPc),
  ]);
  const [activeRightTabIndex, setActiveRightTabIndex] = useState(0);

  // Modals state
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const [isCloseActionBusy, setIsCloseActionBusy] = useState(false);
  const [globalShortcutSettings, setGlobalShortcutSettings] = useState<GlobalShortcutSettingsState>({
    enabled: true,
    shortcut: DEFAULT_GLOBAL_SHORTCUT,
    registered: false,
  });
  const [globalShortcutLoaded, setGlobalShortcutLoaded] = useState(false);
  const [globalShortcutSupported, setGlobalShortcutSupported] = useState(false);
  const [globalShortcutError, setGlobalShortcutError] = useState<string | null>(null);
  const closeActionInProgress = useRef(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [pendingDeleteItems, setPendingDeleteItems] = useState<FileItem[]>([]);

  useEffect(() => {
    void refreshSystemHome();
  }, [refreshSystemHome]);

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

  const runCloseAction = useCallback(async (choice: 'hide' | 'quit', remember = rememberCloseChoice) => {
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
  }, [rememberCloseChoice, showToast, t.closeWindow.closeFailed]);

  const cancelCloseDialog = useCallback(() => {
    if (closeActionInProgress.current) return;
    setRememberCloseChoice(false);
    setIsCloseDialogOpen(false);
  }, []);

  const handleExitFromCloseDialog = useCallback(() => {
    void runCloseAction('quit');
  }, [runCloseAction]);

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

      if (rememberedChoice === 'hide' || rememberedChoice === 'quit') {
        void runCloseAction(rememberedChoice, true);
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

  // Helper references to active pane and inactive pane
  const activeTabs = activePane === 'left' ? leftTabs : rightTabs;
  const setActiveTabs = activePane === 'left' ? setLeftTabs : setRightTabs;
  const activeTabIndex = activePane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
  const currentTab = activeTabs[activeTabIndex] || activeTabs[0];
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
  const sidebarQuickAccess = systemHomeWorkspace.current || currentTab.history.includes(SYSTEM_HOME_PATH)
    ? systemQuickAccess
    : quickAccess;
  const leftViewMode = leftTabs[activeLeftTabIndex]?.viewMode ?? initialPanelPreferences.leftViewMode;
  const rightViewMode = rightTabs[activeRightTabIndex]?.viewMode ?? initialPanelPreferences.rightViewMode;
  const leftSort = leftTabs[activeLeftTabIndex] ?? leftTabs[0];
  const rightSort = rightTabs[activeRightTabIndex] ?? rightTabs[0];

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
        previewOpen,
        activePane,
        leftViewMode,
        rightViewMode,
        leftSortField: leftSort.sortField,
        leftSortOrder: leftSort.sortOrder,
        rightSortField: rightSort.sortField,
        rightSortOrder: rightSort.sortOrder,
      } satisfies PanelViewPreferences));
    } catch {
      // Preference persistence is optional if browser storage is unavailable.
    }
  }, [layout, previewOpen, activePane, leftViewMode, rightViewMode, leftSort.sortField, leftSort.sortOrder, rightSort.sortField, rightSort.sortOrder]);

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
      window.localStorage.setItem(EMPTY_AREA_DOUBLE_CLICK_KEY, String(emptyAreaDoubleClickNavigatesUp));
    } catch {
      // Keep the in-memory preference when browser storage is unavailable.
    }
  }, [emptyAreaDoubleClickNavigatesUp]);

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

  const listBrowserDirectoryPage = useCallback(async (path: string, forceRefresh = false, explicitHandle?: any) => {
    const pathKey = getPathKey(path);
    const directoryHandle = explicitHandle ?? allFiles.find(item => getPathKey(item.path) === pathKey && item.isFolder)?.handle;
    if (!directoryHandle || directoryHandle.kind !== 'directory') {
      throw new Error('The browser folder handle is not available.');
    }

    if (forceRefresh) browserDirectoryCursors.current.delete(pathKey);
    const savedCursor = browserDirectoryCursors.current.get(pathKey);
    const iterator: AsyncIterator<any> = savedCursor?.iterator ?? directoryHandle.values();
    const pageHandles: any[] = [];
    if (savedCursor?.pending) pageHandles.push(savedCursor.pending);
    while (pageHandles.length < DIRECTORY_PAGE_SIZE + 1) {
      const next = await iterator.next();
      if (next.done) break;
      pageHandles.push(next.value);
    }

    const hasMore = pageHandles.length > DIRECTORY_PAGE_SIZE;
    const pending = hasMore ? pageHandles.pop() : undefined;
    browserDirectoryCursors.current.set(pathKey, { iterator, pending });
    const mapEntry = async (entry: any): Promise<FileItem> => {
      const isFolder = entry.kind === 'directory';
      const itemPath = joinWindowsPath(path, entry.name);
      let size = 0;
      let modifiedDate = '';
      if (!isFolder) {
        try {
          const file = await entry.getFile();
          size = file.size;
          modifiedDate = file.lastModified
            ? new Date(file.lastModified).toISOString().replace('T', ' ').slice(0, 16)
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
        extension: isFolder ? '' : getFileExtension(entry.name),
        handle: entry as FileSystemHandle,
      };
    };
    const entries: FileItem[] = [];
    for (let index = 0; index < pageHandles.length; index += 64) {
      const batch = await Promise.all(pageHandles.slice(index, index + 64).map(mapEntry));
      entries.push(...batch);
    }
    return { entries, hasMore };
  }, [allFiles]);

  // Get filtered & sorted files for a pane
  const getPaneDisplayFiles = useCallback((tabState: TabState) => {
    let items = tabState.currentPath === SYSTEM_HOME_PATH
      ? systemHomeItems
      : childrenByParent.get(getPathKey(tabState.currentPath)) ?? [];

    // Simple, predictable filtering. Advanced filters belong in the global search.
    if (tabState.filterQuery.trim()) {
      const q = tabState.filterQuery.toLowerCase();
      const normalizedQuery = q.startsWith('*.') ? q.slice(2) : q.replace(/^\./, '');
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
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
  }, [childrenByParent, systemHomeItems]);

  const leftDisplayFiles = getPaneDisplayFiles(leftTabs[activeLeftTabIndex]);
  const rightDisplayFiles = getPaneDisplayFiles(rightTabs[activeRightTabIndex]);
  const filesById = useMemo(() => new Map(allFiles.map(file => [file.id, file])), [allFiles]);

  // Current item for the Preview Pane
  const activeDisplayFiles = activePane === 'left' ? leftDisplayFiles : rightDisplayFiles;
  const selectedItemsForDelete = currentTab.selectedIds.flatMap(id => {
    const item = filesById.get(id);
    return item ? [item] : [];
  });
  const previewItem = React.useMemo(() => {
    if (currentTab.currentPath === SYSTEM_HOME_PATH) return null;
    if (currentTab.selectedIds.length > 0) {
      const found = filesById.get(currentTab.selectedIds[0]);
      if (found) return found;
    }
    return activeDisplayFiles[0] || null;
  }, [currentTab.currentPath, currentTab.selectedIds, filesById, activeDisplayFiles]);

  useEffect(() => {
    const fileHandle = previewItem?.handle as (FileSystemFileHandle | undefined);
    if (!previewItem || previewItem.isFolder || !fileHandle ||
      (previewItem.type !== 'code' && previewItem.type !== 'text') || previewItem.contentPreview) {
      return;
    }

    let cancelled = false;
    void fileHandle.getFile().then(async file => {
      if (file.size >= 200_000) return;
      const content = await file.text();
      if (!cancelled) {
        setAllFiles(previous => previous.map(item =>
          item.id === previewItem.id ? { ...item, size: file.size, contentPreview: content } : item
        ));
      }
    }).catch(() => {
      // The item can disappear or lose access after it was listed.
    });

    return () => { cancelled = true; };
  }, [previewItem?.id, previewItem?.handle, previewItem?.type, previewItem?.isFolder, previewItem?.contentPreview]);

  // Navigation handlers
  const handleNavigate = useCallback(async (newPath: string, targetPane: 'left' | 'right' = activePane, forceRefresh = false, openInNewTab = false) => {
    const targetPath = newPath === SYSTEM_HOME_PATH ? newPath : normalizeWindowsPath(newPath);
    const pathKey = getPathKey(targetPath);
    if (nativeOpeningWorkspace.current) return;
    const isDesktop = isTauriDesktop();
    const targetTabs = targetPane === 'left' ? leftTabs : rightTabs;
    const targetTabIndex = targetPane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
    const targetTab = targetTabs[targetTabIndex];
    const systemWorkspace = systemHomeWorkspace.current || targetTab?.history.includes(SYSTEM_HOME_PATH) === true;
    const workspaceRoot = isDesktop ? nativeRootPath.current : browserRootPath.current;
    if (workspaceRoot && !systemWorkspace && !isSameOrDescendantPath(targetPath, workspaceRoot)) {
      showToast(language === 'es' ? 'Abre una unidad o carpeta para cambiar el espacio de trabajo.' : 'Open a drive or folder to change the workspace.');
      return;
    }

    const folderName = targetPath === SYSTEM_HOME_PATH
      ? t.sidebar.thisPc
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
      updatePaneTab(targetPane, tab => {
        if (getPathKey(tab.currentPath) === pathKey) return { ...tab, selectedIds: [], focusedId: null };
        const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), targetPath].slice(-MAX_TAB_HISTORY_ENTRIES);
        const rememberedStyle = folderStyleLocked ? getTabFolderStyle(tab) : DEFAULT_FOLDER_STYLE;
        return {
          ...tab,
          currentPath: targetPath,
          title: folderName,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          ...styleForPath(targetPath, rememberedStyle),
          folderStyle: rememberedStyle,
          filterQuery: '',
          selectedIds: [],
          focusedId: null,
        };
      });
    }

    if (targetPath === SYSTEM_HOME_PATH) {
      if (forceRefresh) void refreshSystemHome();
      return;
    }
    if (!workspaceRoot || (!systemWorkspace && !isSameOrDescendantPath(targetPath, workspaceRoot))) return;
    if (!forceRefresh && nativeLoadedDirectories.current.has(pathKey)) return;
    if (nativeInFlightDirectories.current.has(pathKey)) return;

    const generation = nativeWorkspaceGeneration.current;
    nativeInFlightDirectories.current.set(pathKey, generation);
    setNativeDirectories(previous => ({ ...previous, [pathKey]: { ...(previous[pathKey] || { nextOffset: 0, hasMore: false }), loading: true } }));
    try {
      const listing = isDesktop
        ? await listNativeDirectory(targetPath)
        : await listBrowserDirectoryPage(targetPath, forceRefresh);
      if (generation !== nativeWorkspaceGeneration.current) return;
      const newEntryPaths = new Set(listing.entries.map(item => getPathKey(item.path)));
      setAllFiles(previous => {
        const previousDirectChildren = previous.filter(item => getPathKey(getParentPath(item.path)) === pathKey);
        const vanishedRoots = previousDirectChildren
          .filter(item => !newEntryPaths.has(getPathKey(item.path)))
          .map(item => item.path);
        const retained = previous.filter(item =>
          getPathKey(getParentPath(item.path)) !== pathKey &&
          !vanishedRoots.some(root => isSameOrDescendantPath(item.path, root))
        );
        return [...retained, ...listing.entries];
      });
      nativeLoadedDirectories.current.add(pathKey);
      setNativeDirectories(previous => ({
        ...previous,
        [pathKey]: {
          nextOffset: 'nextOffset' in listing && typeof listing.nextOffset === 'number'
            ? listing.nextOffset
            : listing.entries.length,
          hasMore: listing.hasMore,
          loading: false,
        },
      }));
    } catch {
      if (generation === nativeWorkspaceGeneration.current) {
        setNativeDirectories(previous => ({ ...previous, [pathKey]: { nextOffset: 0, hasMore: false, loading: false } }));
        showToast(language === 'es' ? 'No se pudo leer esta carpeta.' : 'This folder could not be read.');
      }
    } finally {
      if (nativeInFlightDirectories.current.get(pathKey) === generation) nativeInFlightDirectories.current.delete(pathKey);
    }
  }, [activePane, activeLeftTabIndex, activeRightTabIndex, leftTabs, rightTabs, updatePaneTab, language, listBrowserDirectoryPage, refreshSystemHome, showToast, t.sidebar.thisPc, folderStyleLocked, newTabsNextToCurrent]);

  const loadMoreNativeDirectory = useCallback(async (path: string) => {
    const pathKey = getPathKey(path);
    const directory = nativeDirectories[pathKey];
    if (!directory?.hasMore || directory.loading || nativeInFlightDirectories.current.has(pathKey)) return;
    const generation = nativeWorkspaceGeneration.current;
    nativeInFlightDirectories.current.set(pathKey, generation);
    setNativeDirectories(previous => ({ ...previous, [pathKey]: { ...directory, loading: true } }));
    try {
      const listing = isTauriDesktop()
        ? await listNativeDirectory(path, directory.nextOffset)
        : await listBrowserDirectoryPage(path);
      if (generation !== nativeWorkspaceGeneration.current) return;
      setAllFiles(previous => {
        const indexed = new Map(previous.map(item => [getPathKey(item.path), item]));
        for (const entry of listing.entries) indexed.set(getPathKey(entry.path), entry);
        return [...indexed.values()];
      });
      setNativeDirectories(previous => ({
        ...previous,
        [pathKey]: {
          nextOffset: 'nextOffset' in listing && typeof listing.nextOffset === 'number'
            ? listing.nextOffset
            : directory.nextOffset + listing.entries.length,
          hasMore: listing.hasMore,
          loading: false,
        },
      }));
    } catch {
      if (generation === nativeWorkspaceGeneration.current) {
        setNativeDirectories(previous => ({ ...previous, [pathKey]: { ...directory, loading: false } }));
        showToast(language === 'es' ? 'No se pudo cargar la siguiente página.' : 'The next page could not be loaded.');
      }
    } finally {
      if (nativeInFlightDirectories.current.get(pathKey) === generation) nativeInFlightDirectories.current.delete(pathKey);
    }
  }, [nativeDirectories, language, listBrowserDirectoryPage]);

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
    browserDirectoryCursors.current.clear();
    setNativeDirectories({});
    setAllFiles([]);
    setQuickAccess([]);
    openWorkspaceRoot(SYSTEM_HOME_PATH, t.sidebar.thisPc);
    void refreshSystemHome();
  }, [completeOnboarding, openWorkspaceRoot, refreshSystemHome, t.sidebar.thisPc]);

  const handleNavigateBack = useCallback((targetPane: 'left' | 'right' = activePane) => {
    updatePaneTab(targetPane, tab => {
      if (tab.historyIndex > 0) {
        const nextIdx = tab.historyIndex - 1;
        const prevPath = tab.history[nextIdx];
        const folderName = prevPath === SYSTEM_HOME_PATH
          ? t.sidebar.thisPc
          : prevPath.split(/\\|\//).filter(Boolean).pop() || prevPath;
        const rememberedStyle = folderStyleLocked ? getTabFolderStyle(tab) : DEFAULT_FOLDER_STYLE;
        return {
          ...tab,
          currentPath: prevPath,
          title: folderName,
          historyIndex: nextIdx,
          ...styleForPath(prevPath, rememberedStyle),
          folderStyle: rememberedStyle,
          filterQuery: '',
          selectedIds: [],
          focusedId: null,
        };
      }
      return tab;
    });
  }, [activePane, updatePaneTab, t.sidebar.thisPc, folderStyleLocked]);

  const handleNavigateForward = useCallback((targetPane: 'left' | 'right' = activePane) => {
    updatePaneTab(targetPane, tab => {
      if (tab.historyIndex < tab.history.length - 1) {
        const nextIdx = tab.historyIndex + 1;
        const nextPath = tab.history[nextIdx];
        const folderName = nextPath === SYSTEM_HOME_PATH
          ? t.sidebar.thisPc
          : nextPath.split(/\\|\//).filter(Boolean).pop() || nextPath;
        const rememberedStyle = folderStyleLocked ? getTabFolderStyle(tab) : DEFAULT_FOLDER_STYLE;
        return {
          ...tab,
          currentPath: nextPath,
          title: folderName,
          historyIndex: nextIdx,
          ...styleForPath(nextPath, rememberedStyle),
          folderStyle: rememberedStyle,
          filterQuery: '',
          selectedIds: [],
          focusedId: null,
        };
      }
      return tab;
    });
  }, [activePane, updatePaneTab, t.sidebar.thisPc, folderStyleLocked]);

  const handleNavigateUp = useCallback((targetPane: 'left' | 'right' = activePane) => {
    const activeTabObj = targetPane === 'left' ? leftTabs[activeLeftTabIndex] : rightTabs[activeRightTabIndex];
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
  }, [leftTabs, rightTabs, activeLeftTabIndex, activeRightTabIndex, handleNavigate]);

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
  const handleAddTab = (pane: 'left' | 'right') => {
    const sourceTabs = pane === 'left' ? leftTabs : rightTabs;
    const currentActive = sourceTabs[pane === 'left' ? activeLeftTabIndex : activeRightTabIndex];
    const baseStyle = folderStyleLocked ? getTabFolderStyle(currentActive) : DEFAULT_FOLDER_STYLE;
    const newPath = isTauriDesktop() ? SYSTEM_HOME_PATH : currentActive.currentPath;
    const newTab: TabState = {
      ...currentActive,
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    const activeIndex = pane === 'left' ? activeLeftTabIndex : activeRightTabIndex;
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

  const handleCloseTab = (pane: 'left' | 'right', indexToClose: number) => {
    const sourceTabs = pane === 'left' ? leftTabs : rightTabs;
    if (sourceTabs.length <= 1) return; // Keep at least 1 tab

    const newTabs = sourceTabs.filter((_, idx) => idx !== indexToClose);
    if (pane === 'left') {
      setLeftTabs(newTabs);
      setActiveLeftTabIndex(Math.min(activeLeftTabIndex, newTabs.length - 1));
    } else {
      setRightTabs(newTabs);
      setActiveRightTabIndex(Math.min(activeRightTabIndex, newTabs.length - 1));
    }
  };

  // Selection handler
  const handleSelectItems = (pane: 'left' | 'right', ids: string[], isAdditive = false, isRange = false) => {
    setActivePane(pane);
    updatePaneTab(pane, tab => {
      let newSelection = [...tab.selectedIds];

      if (isRange && tab.selectedIds.length > 0) {
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
        newSelection = ids;
      }

      return {
        ...tab,
        selectedIds: newSelection,
        focusedId: ids[0] || null,
      };
    });
  };

  // Double click on file/folder
  const handleItemDoubleClick = (item: FileItem, pane: 'left' | 'right') => {
    if (item.isFolder) {
      handleNavigate(item.path, pane);
    } else {
      // Toggle or focus preview & update lastAccessed
      touchFileAccessed(item.id);
      setPreviewOpen(true);
      showToast(`Visualizando "${item.name}"`);
    }
  };

  const createOperationId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const moveItemsToPath = useCallback((selectedIds: string[], targetPath: string, sourcePane: 'left' | 'right' = activePane) => {
    if (targetPath === SYSTEM_HOME_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    const roots = getRootItems(allFiles, selectedIds);
    if (roots.length === 0) return;

    if (roots.some(root => root.isFolder && isSameOrDescendantPath(targetPath, root.path))) {
      showToast(t.core.cannotMoveIntoSelf);
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

    updatePaneTab(sourcePane, tab => ({ ...tab, selectedIds: [], focusedId: null }));
    showToast(t.core.moved.replace('{count}', String(roots.length)).replace('{target}', targetPath));
  }, [activePane, allFiles, t.core.cannotMoveIntoSelf, t.core.moved, t.pane.chooseRealFolderFirst, showToast, updatePaneTab]);

  const handleCopySelected = useCallback(() => {
    const roots = getRootItems(allFiles, currentTab.selectedIds);
    if (roots.length === 0) return;
    const targetPath = inactiveTab.currentPath;
    if (targetPath === SYSTEM_HOME_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    if (roots.some(root => root.isFolder && isSameOrDescendantPath(targetPath, root.path))) {
      showToast(t.core.cannotCopyIntoSelf);
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
    showToast(t.core.copied.replace('{count}', String(roots.length)).replace('{target}', inactiveTab.title));
  }, [allFiles, currentTab.selectedIds, inactiveTab.currentPath, inactiveTab.title, t.core.cannotCopyIntoSelf, t.core.copied, t.pane.chooseRealFolderFirst, showToast]);

  const handleMoveSelected = useCallback(() => {
    moveItemsToPath(currentTab.selectedIds, inactiveTab.currentPath);
  }, [currentTab.selectedIds, inactiveTab.currentPath, moveItemsToPath]);

  const handleDropFiles = useCallback((droppedIds: string[], targetFolderPath?: string, sourcePane?: 'left' | 'right') => {
    moveItemsToPath(droppedIds, targetFolderPath || currentTab.currentPath, sourcePane);
  }, [currentTab.currentPath, moveItemsToPath]);

  const handleInlineRename = useCallback((itemId: string, newName: string) => {
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
    showToast(t.core.renamed.replace('{name}', newName));
  }, [allFiles, t.core.conflict, t.core.invalidName, t.core.renamed]);

  const handleRenameSelected = useCallback(() => {
    const item = selectedItemsForDelete[0];
    if (!item) {
      showToast(t.core.noSelection);
      return;
    }

    const newName = window.prompt(language === 'es' ? 'Renombrar:' : 'Rename:', item.name);
    if (newName && newName !== item.name) {
      handleInlineRename(item.id, newName);
    }
  }, [handleInlineRename, language, selectedItemsForDelete, t.core.noSelection]);

  const handleCopySelectedPaths = useCallback(async (items: FileItem[]) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(items.map(item => item.path).join('\n'));
      showToast(t.sidebar.copyPathsSuccess);
    } catch {
      showToast(t.sidebar.copyPathsFailure);
    }
  }, [showToast, t.sidebar.copyPathsFailure, t.sidebar.copyPathsSuccess]);

  const handleApplyBatchRename = useCallback((renames: { id: string; original: string; renamed: string }[]) => {
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

    const now = new Date().toISOString();
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
    showToast(`${renames.length} ${language === 'es' ? 'elementos renombrados.' : 'items renamed.'}`);
  }, [allFiles, language, t.core.conflict, t.core.invalidName]);

  const handleNewFolder = useCallback((suggestedName?: string) => {
    if (!currentTab.currentPath) {
      showToast(t.pane.noFolderOpen);
      return;
    }
    if (currentTab.currentPath === SYSTEM_HOME_PATH) {
      showToast(t.pane.chooseRealFolderFirst);
      return;
    }
    const baseName = suggestedName || (language === 'es' ? 'Nueva Carpeta' : 'New Folder');
    if (!isValidFileName(baseName)) {
      showToast(t.core.invalidName);
      return;
    }
    const activePath = currentTab.currentPath;
    const folderName = getUniqueName(baseName, getChildItems(allFiles, activePath).map(item => item.name));
    const now = new Date().toISOString();
    const newFolderItem: FileItem = {
      id: createOperationId('folder'),
      name: folderName,
      path: joinWindowsPath(activePath, folderName),
      isFolder: true,
      type: 'folder',
      size: 0,
      modifiedDate: now.replace('T', ' ').slice(0, 16),
      lastAccessed: now,
      extension: '',
    };

    setAllFiles(prev => [...prev, newFolderItem]);
    updateActiveTab(tab => ({ ...tab, selectedIds: [newFolderItem.id], focusedId: newFolderItem.id }));
    showToast(t.core.createdFolder.replace('{name}', folderName));
  }, [allFiles, currentTab.currentPath, language, showToast, t.core.createdFolder, t.core.invalidName, t.pane.chooseRealFolderFirst, t.pane.noFolderOpen, updateActiveTab]);

  const handleDeleteSelected = useCallback((itemsToDelete?: FileItem[]) => {
    const selectedItems = itemsToDelete ?? selectedItemsForDelete;
    const idsToDelete = selectedItems.map(item => item.id);
    const roots = getRootItems(allFiles, idsToDelete);
    if (roots.length > 0) {
      setPendingDeleteItems(roots);
      return;
    }

    showToast(t.core.noSelection);
  }, [allFiles, selectedItemsForDelete, t.core.noSelection]);

  const handleConfirmDelete = useCallback(() => {
    const rootPaths = pendingDeleteItems.map(item => item.path);
    const deletedIds = new Set(
      allFiles
        .filter(item => rootPaths.some(rootPath => isSameOrDescendantPath(item.path, rootPath)))
        .map(item => item.id)
    );
    setAllFiles(prev => prev.filter(item => !rootPaths.some(rootPath => isSameOrDescendantPath(item.path, rootPath))));
    const clearDeletedSelections = (tabs: TabState[]) => tabs.map(tab => ({
      ...tab,
      selectedIds: tab.selectedIds.filter(id => !deletedIds.has(id)),
      focusedId: tab.focusedId && deletedIds.has(tab.focusedId) ? null : tab.focusedId,
    }));
    setLeftTabs(clearDeletedSelections);
    setRightTabs(clearDeletedSelections);
    showToast(t.core.deletedCount.replace('{count}', String(pendingDeleteItems.length)));
    setPendingDeleteItems([]);
  }, [allFiles, pendingDeleteItems, t.core.deletedCount]);

  // Opens only a user-selected folder. Native builds scan it without following links.
  const handleOpenRealFolder = async () => {
    try {
      if (isTauriDesktop()) {
        const selectedPath = await chooseNativeFolder();
        if (!selectedPath) return;

        nativeOpeningWorkspace.current = true;
        const generation = ++nativeWorkspaceGeneration.current;
        const loaded = await loadNativeFolder(selectedPath);
        if (generation !== nativeWorkspaceGeneration.current) return;
        const rootKey = getPathKey(loaded.rootPath);
        browserRootPath.current = '';
        browserDirectoryCursors.current.clear();
        nativeLoadedDirectories.current.clear();
        nativeLoadedDirectories.current.add(rootKey);
        nativeInFlightDirectories.current.clear();
        nativeRootPath.current = loaded.rootPath;
        systemHomeWorkspace.current = false;
        setNativeDirectories({
          [rootKey]: { nextOffset: loaded.nextOffset, hasMore: loaded.hasMore, loading: false },
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
        const suffix = loaded.hasMore
          ? (language === 'es' ? ', primeros 400. Usa “Cargar más” para continuar.' : ', first 400. Use “Load more” to continue.')
          : '';
        showToast(`${language === 'es' ? 'Carpeta cargada' : 'Folder loaded'}: "${loaded.rootName}" (${count} ${language === 'es' ? 'elementos' : 'items'})${suffix}`);
        return;
      }

      if (typeof (window as any).showDirectoryPicker === 'function') {
        const dirHandle = await (window as any).showDirectoryPicker();
        const rootPath = joinWindowsPath('Local folders', dirHandle.name);
        const rootItem: FileItem = {
          id: `real-root-${encodeURIComponent(rootPath.toLowerCase())}`,
          name: dirHandle.name,
          path: rootPath,
          isFolder: true,
          type: 'folder',
          size: 0,
          modifiedDate: new Date().toISOString().replace('T', ' ').slice(0, 16),
          extension: '',
          handle: dirHandle,
        };

        nativeOpeningWorkspace.current = true;
        const generation = ++nativeWorkspaceGeneration.current;
        const firstPage = await listBrowserDirectoryPage(rootPath, true, dirHandle);
        if (generation !== nativeWorkspaceGeneration.current) return;
        const rootKey = getPathKey(rootPath);
        const rootCursor = browserDirectoryCursors.current.get(rootKey);
        browserDirectoryCursors.current.clear();
        if (rootCursor) browserDirectoryCursors.current.set(rootKey, rootCursor);
        nativeRootPath.current = '';
        browserRootPath.current = rootPath;
        systemHomeWorkspace.current = false;
        nativeLoadedDirectories.current.clear();
        nativeLoadedDirectories.current.add(rootKey);
        nativeInFlightDirectories.current.clear();
        setNativeDirectories({
          [rootKey]: { nextOffset: firstPage.entries.length, hasMore: firstPage.hasMore, loading: false },
        });
        setAllFiles([rootItem, ...firstPage.entries]);
        setQuickAccess([{
          id: `qa-${encodeURIComponent(rootPath.toLowerCase())}`,
          name: dirHandle.name,
          path: rootPath,
          icon: 'folder',
          count: firstPage.entries.length,
        }]);
        nativeOpeningWorkspace.current = false;
        openWorkspaceRoot(rootPath, dirHandle.name);
        completeOnboarding();
        const suffix = firstPage.hasMore
          ? (language === 'es' ? ', primeros 400. Usa “Cargar más” para continuar.' : ', first 400. Use “Load more” to continue.')
          : '';
        showToast(`${language === 'es' ? 'Carpeta cargada' : 'Folder loaded'}: "${dirHandle.name}" (${firstPage.entries.length} ${language === 'es' ? 'elementos' : 'items'})${suffix}`);
      } else {
        showToast(language === 'es' ? 'File System Access API no disponible en este navegador.' : 'File System Access API is not available in this browser.');
      }
    } catch (err: any) {
      nativeOpeningWorkspace.current = false;
      if (err.name !== 'AbortError') {
        showToast(language === 'es' ? 'No se pudo acceder a la carpeta seleccionada.' : 'The selected folder could not be opened.');
      }
    }
  };

  const handleOpenDrive = useCallback((path: string) => {
    if (isTauriDesktop()) {
      // Opening a drive from the sidebar is an explicit request to leave a
      // previously selected-folder scope, but it should still be normal tab
      // navigation so Back/Forward retain their per-tab history.
      systemHomeWorkspace.current = true;
      nativeRootPath.current = SYSTEM_HOME_PATH;
      browserRootPath.current = '';
    }
    void handleNavigate(path, activePane, false, sidebarLocationsOpenInNewTab);
  }, [activePane, handleNavigate, sidebarLocationsOpenInNewTab]);

  // Keyboard Shortcuts listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isCloseDialogOpen || isSettingsOpen || isSearchOpen || isShortcutsOpen || isBatchRenameOpen || pendingDeleteItems.length > 0) return;

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
        const visibleIds = activeDisplayFiles.map(file => file.id);
        updateActiveTab(tab => ({
          ...tab,
          selectedIds: visibleIds,
          focusedId: visibleIds[0] || null,
        }));
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
    handleDeleteSelected,
    handleNewFolder,
    handleRenameSelected,
    handleNavigateUp,
    activeDisplayFiles,
    updateActiveTab,
    isCloseDialogOpen,
    isSettingsOpen,
    isSearchOpen,
    isShortcutsOpen,
    isBatchRenameOpen,
    pendingDeleteItems.length,
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
    const target = event.target as HTMLElement;
    const preserveNativeMenu = target.closest(
      'textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"]), input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])',
    );
    if (!preserveNativeMenu) event.preventDefault();
  };

  const selectedCount = currentTab.selectedIds.filter(id => filesById.has(id)).length;
  const selectedItemsForRename = currentTab.selectedIds.flatMap(id => {
    const item = filesById.get(id);
    return item ? [item] : [];
  });
  const leftDirectoryState = nativeDirectories[getPathKey(leftTabs[activeLeftTabIndex].currentPath)];
  const rightDirectoryState = nativeDirectories[getPathKey(rightTabs[activeRightTabIndex].currentPath)];
  const leftAtSystemHome = leftTabs[activeLeftTabIndex].currentPath === SYSTEM_HOME_PATH;
  const rightAtSystemHome = rightTabs[activeRightTabIndex].currentPath === SYSTEM_HOME_PATH;
  const contextPane = contextMenuPos?.paneId ?? activePane;
  const contextPaneTab = contextPane === 'left'
    ? leftTabs[activeLeftTabIndex]
    : rightTabs[activeRightTabIndex];

  return (
    <div
      className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans select-none overflow-hidden"
      onContextMenuCapture={handleApplicationContextMenuCapture}
    >
      {/* 1. Top Command Bar */}
      <HeaderBar
        layout={layout}
        onLayoutChange={setLayout}
        viewMode={currentTab.viewMode}
        onViewModeChange={handleViewModeChange}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen(!previewOpen)}
        onRenameSelected={handleRenameSelected}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onNewFolder={handleNewFolder}
        onCopySelected={handleCopySelected}
        onMoveSelected={handleMoveSelected}
        onDeleteSelected={() => handleDeleteSelected(selectedItemsForDelete)}
        selectedCount={selectedCount}
        onOpenRealFolder={handleOpenRealFolder}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Main Workstation Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar (Drives, Quick Access & Recent Files) */}
        <Sidebar
          drives={drives}
          quickAccess={sidebarQuickAccess}
          allFiles={allFiles}
          currentPath={currentTab.currentPath}
          onNavigate={(path) => handleNavigate(path, activePane, false, sidebarLocationsOpenInNewTab)}
          onOpenDrive={handleOpenDrive}
          onSelectRecentFile={handleSelectRecentFile}
          onClearRecentFiles={handleClearRecentFiles}
          selectedItems={selectedItemsForDelete}
          onClearSelection={() => updateActiveTab(tab => ({ ...tab, selectedIds: [], focusedId: null }))}
          onCopySelected={handleCopySelected}
          onMoveSelected={handleMoveSelected}
          onRenameSelected={handleRenameSelected}
          onDeleteSelected={() => handleDeleteSelected(selectedItemsForDelete)}
          onOpenSelectedFolder={item => { void handleNavigate(item.path, activePane); }}
          onPreviewSelectedFile={handleSelectRecentFile}
          onCopySelectedPaths={handleCopySelectedPaths}
        />

        {/* File Panes Canvas */}
        <div className="flex-1 flex overflow-hidden">
          {/* Dual Vertical Layout */}
          {layout === 'dual-vertical' && (
            <div className="flex-1 flex h-full overflow-hidden">
              {/* Left file pane */}
              <div className="flex-1 h-full overflow-hidden">
                <FilePane
                  paneId="left"
                  isActive={activePane === 'left'}
                  styleLocked={folderStyleLocked}
                  onStyleLockToggle={() => setFolderStyleLocked(value => !value)}
                  onActivate={() => setActivePane('left')}
                  tab={leftTabs[activeLeftTabIndex]}
                  tabs={leftTabs}
                  activeTabIndex={activeLeftTabIndex}
                  onSelectTab={(idx) => setActiveLeftTabIndex(idx)}
                  onAddTab={() => handleAddTab('left')}
                  onCloseTab={(idx) => handleCloseTab('left', idx)}
                  files={leftDisplayFiles}
                  drives={drives}
                  hasMore={leftDirectoryState?.hasMore}
                  isLoadingDirectory={leftDirectoryState?.loading || (leftAtSystemHome && systemHomeLoading)}
                  onLoadMore={() => void loadMoreNativeDirectory(leftTabs[activeLeftTabIndex].currentPath)}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'left')}
                  onRefresh={() => void handleNavigate(leftTabs[activeLeftTabIndex].currentPath, 'left', true)}
                  onNavigateBack={() => handleNavigateBack('left')}
                  onNavigateForward={() => handleNavigateForward('left')}
                  onNavigateUp={() => handleNavigateUp('left')}
                  onFilterChange={(q) => updatePaneTab('left', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range) => handleSelectItems('left', ids, additive, range)}
                  onSortChange={field => updatePaneTab('left', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'left')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'left')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                />
              </div>

              {/* Vertical Splitter Visual Bar */}
              <div className="w-1 bg-neutral-900 border-x border-neutral-800/80 hover:bg-cyan-500/40 cursor-col-resize flex-shrink-0" />

              {/* Right file pane */}
              <div className="flex-1 h-full overflow-hidden">
                <FilePane
                  paneId="right"
                  isActive={activePane === 'right'}
                  styleLocked={folderStyleLocked}
                  onStyleLockToggle={() => setFolderStyleLocked(value => !value)}
                  onActivate={() => setActivePane('right')}
                  tab={rightTabs[activeRightTabIndex]}
                  tabs={rightTabs}
                  activeTabIndex={activeRightTabIndex}
                  onSelectTab={(idx) => setActiveRightTabIndex(idx)}
                  onAddTab={() => handleAddTab('right')}
                  onCloseTab={(idx) => handleCloseTab('right', idx)}
                  files={rightDisplayFiles}
                  drives={drives}
                  hasMore={rightDirectoryState?.hasMore}
                  isLoadingDirectory={rightDirectoryState?.loading || (rightAtSystemHome && systemHomeLoading)}
                  onLoadMore={() => void loadMoreNativeDirectory(rightTabs[activeRightTabIndex].currentPath)}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'right')}
                  onRefresh={() => void handleNavigate(rightTabs[activeRightTabIndex].currentPath, 'right', true)}
                  onNavigateBack={() => handleNavigateBack('right')}
                  onNavigateForward={() => handleNavigateForward('right')}
                  onNavigateUp={() => handleNavigateUp('right')}
                  onFilterChange={(q) => updatePaneTab('right', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range) => handleSelectItems('right', ids, additive, range)}
                  onSortChange={field => updatePaneTab('right', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'right')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'right')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                />
              </div>
            </div>
          )}

          {/* Dual Horizontal Layout */}
          {layout === 'dual-horizontal' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex-1 h-1/2 overflow-hidden">
                <FilePane
                  paneId="left"
                  isActive={activePane === 'left'}
                  styleLocked={folderStyleLocked}
                  onStyleLockToggle={() => setFolderStyleLocked(value => !value)}
                  onActivate={() => setActivePane('left')}
                  tab={leftTabs[activeLeftTabIndex]}
                  tabs={leftTabs}
                  activeTabIndex={activeLeftTabIndex}
                  onSelectTab={(idx) => setActiveLeftTabIndex(idx)}
                  onAddTab={() => handleAddTab('left')}
                  onCloseTab={(idx) => handleCloseTab('left', idx)}
                  files={leftDisplayFiles}
                  drives={drives}
                  hasMore={leftDirectoryState?.hasMore}
                  isLoadingDirectory={leftDirectoryState?.loading || (leftAtSystemHome && systemHomeLoading)}
                  onLoadMore={() => void loadMoreNativeDirectory(leftTabs[activeLeftTabIndex].currentPath)}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'left')}
                  onRefresh={() => void handleNavigate(leftTabs[activeLeftTabIndex].currentPath, 'left', true)}
                  onNavigateBack={() => handleNavigateBack('left')}
                  onNavigateForward={() => handleNavigateForward('left')}
                  onNavigateUp={() => handleNavigateUp('left')}
                  onFilterChange={(q) => updatePaneTab('left', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range) => handleSelectItems('left', ids, additive, range)}
                  onSortChange={field => updatePaneTab('left', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'left')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'left')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
                />
              </div>
              <div className="h-1 bg-neutral-900 border-y border-neutral-800/80 hover:bg-cyan-500/40 cursor-row-resize flex-shrink-0" />
              <div className="flex-1 h-1/2 overflow-hidden">
                <FilePane
                  paneId="right"
                  isActive={activePane === 'right'}
                  styleLocked={folderStyleLocked}
                  onStyleLockToggle={() => setFolderStyleLocked(value => !value)}
                  onActivate={() => setActivePane('right')}
                  tab={rightTabs[activeRightTabIndex]}
                  tabs={rightTabs}
                  activeTabIndex={activeRightTabIndex}
                  onSelectTab={(idx) => setActiveRightTabIndex(idx)}
                  onAddTab={() => handleAddTab('right')}
                  onCloseTab={(idx) => handleCloseTab('right', idx)}
                  files={rightDisplayFiles}
                  drives={drives}
                  hasMore={rightDirectoryState?.hasMore}
                  isLoadingDirectory={rightDirectoryState?.loading || (rightAtSystemHome && systemHomeLoading)}
                  onLoadMore={() => void loadMoreNativeDirectory(rightTabs[activeRightTabIndex].currentPath)}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, 'right')}
                  onRefresh={() => void handleNavigate(rightTabs[activeRightTabIndex].currentPath, 'right', true)}
                  onNavigateBack={() => handleNavigateBack('right')}
                  onNavigateForward={() => handleNavigateForward('right')}
                  onNavigateUp={() => handleNavigateUp('right')}
                  onFilterChange={(q) => updatePaneTab('right', t => ({ ...t, filterQuery: q }))}
                  onSelectItems={(ids, additive, range) => handleSelectItems('right', ids, additive, range)}
                  onSortChange={field => updatePaneTab('right', tab => toggleTabSort(tab, field))}
                  onItemDoubleClick={(item) => handleItemDoubleClick(item, 'right')}
                  onItemContextMenu={(e, item) => handleItemContextMenu(e, item, 'right')}
                  onBackgroundContextMenu={handleBackgroundContextMenu}
                  onBackgroundDoubleClick={handleBackgroundDoubleClick}
                  onDropFilesFromOtherPane={handleDropFiles}
                  onInlineRename={handleInlineRename}
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
                isActive={true}
                styleLocked={folderStyleLocked}
                onStyleLockToggle={() => setFolderStyleLocked(value => !value)}
                onActivate={() => {}}
                tab={currentTab}
                tabs={activeTabs}
                activeTabIndex={activeTabIndex}
                onSelectTab={(idx) => (activePane === 'left' ? setActiveLeftTabIndex(idx) : setActiveRightTabIndex(idx))}
                onAddTab={() => handleAddTab(activePane)}
                onCloseTab={(idx) => handleCloseTab(activePane, idx)}
                  files={activeDisplayFiles}
                  drives={drives}
                  hasMore={(activePane === 'left' ? leftDirectoryState : rightDirectoryState)?.hasMore}
                  isLoadingDirectory={(activePane === 'left' ? leftDirectoryState : rightDirectoryState)?.loading || (currentTab.currentPath === SYSTEM_HOME_PATH && systemHomeLoading)}
                  onLoadMore={() => void loadMoreNativeDirectory(currentTab.currentPath)}
                  allFiles={allFiles}
                  onNavigate={(path) => handleNavigate(path, activePane)}
                  onRefresh={() => void handleNavigate(currentTab.currentPath, activePane, true)}
                onNavigateBack={() => handleNavigateBack(activePane)}
                onNavigateForward={() => handleNavigateForward(activePane)}
                onNavigateUp={() => handleNavigateUp(activePane)}
                onFilterChange={(q) => updateActiveTab(t => ({ ...t, filterQuery: q }))}
                onSelectItems={(ids, additive, range) => handleSelectItems(activePane, ids, additive, range)}
                onSortChange={field => updateActiveTab(tab => toggleTabSort(tab, field))}
                onItemDoubleClick={(item) => handleItemDoubleClick(item, activePane)}
                onItemContextMenu={(e, item) => handleItemContextMenu(e, item, activePane)}
                onBackgroundContextMenu={handleBackgroundContextMenu}
                onBackgroundDoubleClick={handleBackgroundDoubleClick}
                onDropFilesFromOtherPane={handleDropFiles}
                onInlineRename={handleInlineRename}
              />
            </div>
          )}

          {/* 3. Docked Quick Preview Pane */}
          {previewOpen && (
            <PreviewPane
              item={previewItem}
              onClose={() => setPreviewOpen(false)}
              onRename={handleRenameSelected}
            />
          )}
        </div>
      </div>

      {/* 3. Global Bottom Status Bar */}
      <BottomStatusBar
        activePane={activePane}
        currentTab={currentTab}
        activeFiles={activeDisplayFiles}
        drives={drives}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Floating Action Toast */}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 border border-cyan-500/50 text-cyan-200 px-4 py-2 rounded-lg shadow-2xl backdrop-blur-md text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Context Menu */}
      <ContextMenu
        position={contextMenuPos}
        viewMode={contextPaneTab.viewMode}
        hasFolder={Boolean(contextPaneTab.currentPath)}
        hasFilter={Boolean(contextPaneTab.filterQuery)}
        onClose={() => setContextMenuPos(null)}
        onOpenFolder={handleOpenRealFolder}
        onOpenLocation={item => { void handleNavigate(item.path, contextPane); }}
        onRefresh={() => void handleNavigate(contextPaneTab.currentPath, contextPane, true)}
        onClearFilter={() => updatePaneTab(contextPane, tab => ({ ...tab, filterQuery: '' }))}
        onViewModeChange={mode => updatePaneTab(contextPane, tab => setTabViewMode(tab, mode))}
        onPreview={(item) => {
          touchFileAccessed(item.id);
          setPreviewOpen(true);
        }}
        onCopyOpposite={() => handleCopySelected()}
        onMoveOpposite={() => handleMoveSelected()}
        onRename={(item) => {
          const newName = window.prompt(language === 'es' ? 'Nuevo nombre para el archivo:' : 'New file name:', item.name);
          if (newName && newName !== item.name) {
            handleInlineRename(item.id, newName);
          }
        }}
        onBatchRename={() => setIsBatchRenameOpen(true)}
          onDelete={(item) => handleDeleteSelected([item])}
      />

      {/* Batch Rename Modal */}
      <BatchRenameModal
        isOpen={isBatchRenameOpen}
        onClose={() => setIsBatchRenameOpen(false)}
        selectedItems={selectedItemsForRename.length > 0 ? selectedItemsForRename : activeDisplayFiles}
        onApplyRename={handleApplyBatchRename}
      />

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Global file and content search modal (Ctrl+F) */}
      <FindFilesModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        allFiles={allFiles}
        currentPath={currentTab.currentPath}
        onNavigateToFile={handleNavigateToFile}
        onPreviewFile={handlePreviewFileFromSearch}
      />

      <ConfirmActionModal
        items={pendingDeleteItems}
        onCancel={() => setPendingDeleteItems([])}
        onConfirm={handleConfirmDelete}
      />

      <CloseWindowModal
        isOpen={isCloseDialogOpen}
        rememberChoice={rememberCloseChoice}
        isBusy={isCloseActionBusy}
        onRememberChoiceChange={setRememberCloseChoice}
        onCancel={cancelCloseDialog}
        onExit={handleExitFromCloseDialog}
        onHideToTray={handleHideToTrayFromCloseDialog}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        globalShortcut={globalShortcutSettings}
        globalShortcutLoaded={globalShortcutLoaded}
        globalShortcutSupported={globalShortcutSupported}
        globalShortcutError={globalShortcutError}
        onGlobalShortcutChange={changeGlobalShortcutSettings}
        emptyAreaDoubleClickNavigatesUp={emptyAreaDoubleClickNavigatesUp}
        onEmptyAreaDoubleClickNavigatesUpChange={setEmptyAreaDoubleClickNavigatesUp}
        folderStyleLocked={folderStyleLocked}
        onFolderStyleLockedChange={setFolderStyleLocked}
        sidebarLocationsOpenInNewTab={sidebarLocationsOpenInNewTab}
        onSidebarLocationsOpenInNewTabChange={setSidebarLocationsOpenInNewTab}
        newTabsNextToCurrent={newTabsNextToCurrent}
        onNewTabsNextToCurrentChange={setNewTabsNextToCurrent}
        onShowOnboarding={() => {
          setIsSettingsOpen(false);
          setIsOnboardingOpen(true);
        }}
      />

      <OnboardingWelcome
        isOpen={isOnboardingOpen}
        onOpenFolder={handleOpenRealFolder}
        onContinue={activateSystemHome}
        onSkip={activateSystemHome}
      />
    </div>
  );
}
