import React, { useState, useRef, useEffect, useLayoutEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Code2, 
  Archive, 
  Music, 
  Video, 
  Binary, 
  FileCode, 
  ArrowLeft, 
  ArrowRight, 
  ArrowUp, 
  ArrowDown,
  CornerUpLeft,
  Search, 
  X, 
  Plus, 
  RotateCw,
  Calculator,
  LoaderCircle,
  ChevronRight, 
  FileCheck,
  Monitor,
  Download,
  HardDrive,
  Usb,
  Disc3,
  Network,
  ChevronDown,
  Trash2,
  LockKeyhole,
  UnlockKeyhole,
  History,
} from 'lucide-react';
import { DriveInfo, FileItem, FileType, GroupByField, HiddenItemStyle, NavigationTransitionStyle, SortField, TabState, ViewMode, RECYCLE_BIN_PATH, SYSTEM_HOME_PATH, RecentItemStyle } from '../types';
import { formatDateTimeForDisplay, type DateFormatMode } from '../utils/dateTime';
import { formatFileSize, getParentPath } from '../utils/fileSystem';
import { calculateNativeFolderSize, cancelNativeFolderSizeCalculation, getNativeFileIcons, isTauriDesktop, loadNativeImageThumbnail, pauseNativeFolderSizeCalculation, resumeNativeFolderSizeCalculation, startNativeFolderSizeCalculation, type NativeFileIconRequest } from '../utils/nativeFileSystem';
import { listen } from '@tauri-apps/api/event';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip, TooltipPreferenceContext } from './Tooltip';
import {
  DEFAULT_FILE_COLUMN_LAYOUT,
  DEFAULT_FILE_COLUMN_WIDTHS,
  FILE_COLUMN_LAYOUT_STORAGE_KEY,
  FILE_COLUMN_WIDTHS_STORAGE_KEY,
} from '../utils/fileColumnPreferences';
import type { PaneColumnsSnapshot, TabStripPosition } from '../utils/workspaceProfiles';

interface FilePaneProps {
  paneId: 'left' | 'right';
  tabStripPosition: TabStripPosition;
  isActive: boolean;
  styleLocked: boolean;
  recentItemStyle: RecentItemStyle;
  hiddenItemStyle: HiddenItemStyle;
  navigationTransitionsEnabled: boolean;
  navigationTransitionStyle: NavigationTransitionStyle;
  emptyAreaDoubleClickNavigatesUp: boolean;
  imageTooltipThumbnailsEnabled: boolean;
  showFileExtensions: boolean;
  singleClickOpens: boolean;
  onStyleLockToggle: () => void;
  onActivate: () => void;
  tab: TabState;
  tabs: TabState[];
  activeTabIndex: number;
  onSelectTab: (index: number) => void;
  onAddTab: () => void;
  onCloseTab: (index: number) => void;
  files: FileItem[];
  recentFolderPaths: string[];
  onClearRecentFolders: () => void;
  autoFolderSizeEnabled: boolean;
  relativeGraphsEnabled: boolean;
  dateFormat: DateFormatMode;
  drives: DriveInfo[];
  hasMore?: boolean;
  isLoadingDirectory?: boolean;
  onLoadMore?: () => void;
  allFiles: FileItem[];
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onNavigateUp: () => void;
  onFilterChange: (query: string) => void;
  onSelectItems: (ids: string[], isAdditive?: boolean, isRange?: boolean, replaceExactly?: boolean) => void;
  onSortChange: (field: SortField) => void;
  onItemDoubleClick: (item: FileItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onBackgroundContextMenu: (e: React.MouseEvent, pane: 'left' | 'right') => void;
  onBackgroundClick: (e: React.MouseEvent, pane: 'left' | 'right') => void;
  onBackgroundDoubleClick: (e: React.MouseEvent, pane: 'left' | 'right') => void;
  onDropFilesFromOtherPane: (droppedIds: string[], targetFolder?: string, sourcePane?: 'left' | 'right') => void;
  onInlineRename: (itemId: string, newName: string, paneId: 'left' | 'right') => void;
  renameRequest: { requestId: number; itemId: string; paneId: 'left' | 'right' } | null;
  onRenameRequestHandled: (requestId: number) => void;
  columnPreferencesRevision: number;
  columnPreferences: PaneColumnsSnapshot;
  onColumnPreferencesChange: (pane: 'left' | 'right', preferences: PaneColumnsSnapshot) => void;
}

type SystemHomeSection = 'folders' | 'devices' | 'network';
type CollapsedSystemHomeSections = Record<SystemHomeSection, boolean>;
type FileColumn = 'extension' | 'name' | 'type' | 'size' | 'created' | 'modified';
type RelativeGraphColumn = 'size' | 'created' | 'modified';
type RelativeGraphWidths = Partial<Record<RelativeGraphColumn, number>>;
type ResizableColumn = FileColumn;
type FolderSizeState = { status: 'loading' | 'paused' | 'done' | 'error'; size?: number; entriesScanned?: number };
type NavigationMotion = 'into' | 'up' | 'back' | 'forward' | 'other';

function normalizeNavigationPath(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function isNavigationDescendant(path: string, possibleParent: string): boolean {
  const child = normalizeNavigationPath(path);
  const parent = normalizeNavigationPath(possibleParent);
  return Boolean(parent) && child !== parent && child.startsWith(`${parent}\\`);
}

function getDisplayItemName(item: FileItem, showFileExtensions: boolean): string {
  if (showFileExtensions || item.isFolder) return item.name;
  const extensionSeparator = item.name.lastIndexOf('.');
  return extensionSeparator > 0 ? item.name.slice(0, extensionSeparator) : item.name;
}

interface ColumnPointerDrag {
  pointerId: number;
  column: FileColumn;
  startX: number;
  startY: number;
  moved: boolean;
  target: FileColumn | null;
}

interface FileColumnWidths {
  extension: number;
  name: number | null;
  type: number;
  size: number;
  created: number;
  modified: number;
}

interface ColumnResizeDrag {
  pointerId: number;
  startX: number;
  latestClientX: number;
  guideStartX: number;
  column: ResizableColumn;
  widths: FileColumnWidths;
}

interface ColumnResizeGuide {
  left: number;
  top: number;
  height: number;
  fadingOut: boolean;
}

interface MarqueeBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MarqueeDrag {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
  initialIds: string[];
  hasMoved: boolean;
}

const COLLAPSED_SYSTEM_HOME_SECTIONS_KEY = 'cyberfiles_system_home_collapsed_sections_v1';
const FILE_COLUMNS: FileColumn[] = ['extension', 'name', 'type', 'size', 'created', 'modified'];
const MIN_NAME_COLUMN_WIDTH = 100;
const RECENT_ITEM_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COLLAPSED_SYSTEM_HOME_SECTIONS: CollapsedSystemHomeSections = {
  folders: false,
  devices: false,
  network: false,
};

function resizeFileColumns(widths: FileColumnWidths, column: ResizableColumn, delta: number): FileColumnWidths {
  const clampWidth = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  switch (column) {
    case 'extension':
      return { ...widths, extension: clampWidth(widths.extension + delta, 42, 220) };
    case 'name':
      return { ...widths, name: clampWidth((widths.name ?? MIN_NAME_COLUMN_WIDTH) + delta, MIN_NAME_COLUMN_WIDTH, 1600) };
    case 'type':
      return { ...widths, type: clampWidth(widths.type + delta, 80, 500) };
    case 'size':
      return { ...widths, size: clampWidth(widths.size + delta, 56, 320) };
    case 'created':
      return { ...widths, created: clampWidth(widths.created + delta, 80, 480) };
    case 'modified':
      return { ...widths, modified: clampWidth(widths.modified + delta, 80, 480) };
  }
}

function readCollapsedSystemHomeSections(paneId: 'left' | 'right'): CollapsedSystemHomeSections {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${COLLAPSED_SYSTEM_HOME_SECTIONS_KEY}_${paneId}`) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_COLLAPSED_SYSTEM_HOME_SECTIONS;
    return {
      folders: saved.folders === true,
      devices: saved.devices === true,
      network: saved.network === true,
    };
  } catch {
    return DEFAULT_COLLAPSED_SYSTEM_HOME_SECTIONS;
  }
}

function ImageFileThumbnail({
  item,
  fallback,
  className = 'h-20 w-full',
  fit = 'cover',
}: {
  item: FileItem;
  fallback: React.ReactNode;
  className?: string;
  fit?: 'cover' | 'contain';
}) {
  const [source, setSource] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    let requested = false;
    setSource(null);

    const loadThumbnail = async () => {
      if (requested) return;
      requested = true;
      try {
        if (item.handle && 'getFile' in item.handle) {
          const file = await (item.handle as FileSystemFileHandle).getFile();
          if (cancelled || file.size > 64 * 1024 * 1024) return;
          objectUrl = URL.createObjectURL(file);
          setSource(objectUrl);
          return;
        }
        if (isTauriDesktop()) {
          const thumbnail = await loadNativeImageThumbnail(item.path);
          if (!cancelled) setSource(thumbnail);
        }
      } catch {
        // Some image formats or protected files cannot provide a preview.
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      void loadThumbnail();
    } else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          void loadThumbnail();
          observer.disconnect();
        }
      });
      observer.observe(container);
      return () => {
        cancelled = true;
        observer.disconnect();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.handle, item.path]);

  return (
    <div ref={containerRef} className={`flex ${className} items-center justify-center overflow-hidden rounded-md border border-neutral-700/70 bg-neutral-900/80`}>
      {source
        ? <img src={source} alt={item.name} loading="lazy" decoding="async" className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        : <div className="scale-150">{fallback}</div>}
    </div>
  );
}

export const FilePane: React.FC<FilePaneProps> = ({
  paneId,
  tabStripPosition,
  isActive,
  styleLocked,
  recentItemStyle,
  hiddenItemStyle,
  navigationTransitionsEnabled,
  navigationTransitionStyle,
  emptyAreaDoubleClickNavigatesUp,
  imageTooltipThumbnailsEnabled,
  showFileExtensions,
  singleClickOpens,
  onStyleLockToggle,
  onActivate,
  tab,
  tabs,
  activeTabIndex,
  onSelectTab,
  onAddTab,
  onCloseTab,
  files,
  recentFolderPaths,
  onClearRecentFolders,
  autoFolderSizeEnabled,
  relativeGraphsEnabled,
  dateFormat,
  drives,
  hasMore = false,
  isLoadingDirectory = false,
  onLoadMore,
  onNavigate,
  onRefresh,
  onNavigateBack,
  onNavigateForward,
  onNavigateUp,
  onFilterChange,
  onSelectItems,
  onSortChange,
  onItemDoubleClick,
  onItemContextMenu,
  onBackgroundContextMenu,
  onBackgroundClick,
  onBackgroundDoubleClick,
  onDropFilesFromOtherPane,
  onInlineRename,
  renameRequest,
  onRenameRequestHandled,
  columnPreferencesRevision,
  columnPreferences,
  onColumnPreferencesChange,
}) => {
  const { t, language } = useLanguage();
  const tooltipsEnabled = useContext(TooltipPreferenceContext);
  const isSystemHome = tab.currentPath === SYSTEM_HOME_PATH;
  const isRecycleBin = tab.currentPath === RECYCLE_BIN_PATH;
  const effectiveViewMode = tab.viewMode;
  const nativeFileIconSize = effectiveViewMode === 'icons' ? 'large' : 'small';
  const nativeFileIconScope = `${tab.currentPath}\u0000${nativeFileIconSize}`;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [recentFoldersMenuPosition, setRecentFoldersMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [pathInput, setPathInput] = useState(tab.currentPath);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const renameCommitItemRef = useRef<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedSystemHomeSections, setCollapsedSystemHomeSections] = useState(() => readCollapsedSystemHomeSections(paneId));
  const [folderSizeStates, setFolderSizeStates] = useState<Record<string, FolderSizeState>>({});
  const folderSizeStatesRef = useRef(folderSizeStates);
  folderSizeStatesRef.current = folderSizeStates;
  const folderSizeHoverTimersRef = useRef(new Map<string, number>());
  const hoveredFolderItemsRef = useRef(new Map<string, FileItem>());
  const folderSizeJobsRef = useRef(new Map<string, string>());
  const folderSizeLeaveTimersRef = useRef(new Map<string, number>());
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [columnWidths, setColumnWidths] = useState(() => columnPreferences.widths);
  const [columnLayout, setColumnLayout] = useState(() => columnPreferences.layout);
  const [columnMenuPosition, setColumnMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [columnResizeGuide, setColumnResizeGuide] = useState<ColumnResizeGuide | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<FileColumn | null>(null);
  const [nativeFileIconState, setNativeFileIconState] = useState<{ scope: string; byItemId: Record<string, string> }>({ scope: '', byItemId: {} });
  const lastSingleClickOpenRef = useRef<{ itemId: string; timestamp: number } | null>(null);
  const pendingDeselectionRef = useRef<number | null>(null);
  const latestTabRef = useRef(tab);
  latestTabRef.current = tab;

  const clearPendingDeselection = () => {
    if (pendingDeselectionRef.current !== null) window.clearTimeout(pendingDeselectionRef.current);
    pendingDeselectionRef.current = null;
  };

  const pathInputRef = useRef<HTMLInputElement>(null);
  const recentFoldersMenuRef = useRef<HTMLDivElement>(null);
  const recentFoldersButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const columnResizeDragRef = useRef<ColumnResizeDrag | null>(null);
  const columnResizeFrameRef = useRef<number | null>(null);
  const columnResizeGuideRef = useRef<HTMLDivElement>(null);
  const columnResizeGuideFadeTimeoutRef = useRef<number | null>(null);
  const nativeFileIconGenerationRef = useRef(0);
  const nativeFileIconRequestsRef = useRef<NativeFileIconRequest[]>([]);
  const columnWidthsSaveTimeoutRef = useRef<number | null>(null);
  const columnPointerDragRef = useRef<ColumnPointerDrag | null>(null);
  const lastColumnPreferencesRevision = useRef(columnPreferencesRevision);
  const lastReportedColumnPreferences = useRef(JSON.stringify(columnPreferences));
  const suppressColumnSortRef = useRef(false);
  const previousPathRef = useRef(tab.currentPath);
  const navigationSnapshotRef = useRef({
    tabId: tab.id,
    path: tab.currentPath,
    historyIndex: tab.historyIndex,
    historyLength: tab.history.length,
  });
  const pendingNavigationRef = useRef<{ tabId: string; path: string; motion: NavigationMotion } | null>(null);
  const [navigationTransition, setNavigationTransition] = useState<{ tabId: string; path: string; motion: NavigationMotion } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastScrolledFocusedIdRef = useRef<string | null>(null);
  const columnHeadersRef = useRef<HTMLDivElement>(null);
  const marqueeDragRef = useRef<MarqueeDrag | null>(null);
  const marqueePreviewIdsRef = useRef<string[] | null>(null);
  const suppressViewportClickRef = useRef(false);
  const [marqueeBounds, setMarqueeBounds] = useState<MarqueeBounds | null>(null);
  const [marqueePreviewIds, setMarqueePreviewIds] = useState<string[] | null>(null);
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0);

  const visibleFileColumns = columnLayout.order.filter(column =>
    columnLayout.visible.includes(column) || (editingItemId !== null && column === 'name'),
  );
  const { requests: nativeFileIconRequests, key: nativeFileIconRequestKey } = React.useMemo(() => {
    const requests: NativeFileIconRequest[] = [];
    const keyParts: string[] = [];
    files.forEach(item => {
      if (item.isFolder || item.recycleBinId || !item.path) return;
      requests.push({ id: item.id, path: item.path });
      keyParts.push(`${item.id}\u0000${item.path}\u0000${item.modifiedAtMs ?? ''}`);
    });
    keyParts.sort();
    return { requests, key: keyParts.join('\u0001') };
  }, [files]);
  nativeFileIconRequestsRef.current = nativeFileIconRequests;

  useEffect(() => {
    const generation = ++nativeFileIconGenerationRef.current;
    const scope = nativeFileIconScope;
    const iconRequests = nativeFileIconRequestsRef.current;
    let cancelled = false;
    let scheduledBatch: number | null = null;

    setNativeFileIconState(previous => previous.scope === scope ? previous : { scope, byItemId: {} });
    if (!isTauriDesktop() || isRecycleBin || iconRequests.length === 0) {
      return () => { cancelled = true; };
    }

    let nextIndex = 0;
    const loadNextIconBatch = async () => {
      const batch = iconRequests.slice(nextIndex, nextIndex + 48);
      nextIndex += batch.length;
      try {
        const groups = await getNativeFileIcons(batch, nativeFileIconSize === 'large');
        if (cancelled || generation !== nativeFileIconGenerationRef.current) return;
        setNativeFileIconState(previous => {
          if (generation !== nativeFileIconGenerationRef.current) return previous;
          const byItemId = previous.scope === scope ? previous.byItemId : {};
          const nextByItemId = { ...byItemId };
          groups.forEach(group => group.itemIds.forEach(id => { nextByItemId[id] = group.dataUrl; }));
          return { scope, byItemId: nextByItemId };
        });
      } catch {
        // Shell icons are an enhancement. Keep the generic file icons when a lookup fails.
      }

      if (!cancelled && generation === nativeFileIconGenerationRef.current && nextIndex < iconRequests.length) {
        scheduledBatch = window.setTimeout(() => { void loadNextIconBatch(); }, 24);
      }
    };

    if (nativeFileIconRequestKey) {
      scheduledBatch = window.setTimeout(() => { void loadNextIconBatch(); }, 48);
    }
    return () => {
      cancelled = true;
      if (scheduledBatch !== null) window.clearTimeout(scheduledBatch);
    };
  }, [isRecycleBin, nativeFileIconRequestKey, nativeFileIconScope, nativeFileIconSize]);

  const relativeGraphWidths = React.useMemo(() => {
    const widths = new Map<string, RelativeGraphWidths>();
    if (!relativeGraphsEnabled || isSystemHome || effectiveViewMode !== 'details') return widths;

    const timestampFor = (item: FileItem, column: 'created' | 'modified') => {
      const timestamp = column === 'created' ? item.createdAtMs : item.modifiedAtMs;
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
      const label = column === 'created' ? item.createdDate : item.modifiedDate;
      if (!label) return undefined;
      const parsed = Date.parse(label);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const itemGroups = [files.filter(item => !item.isFolder), files.filter(item => item.isFolder)];
    itemGroups.forEach(groupItems => {
      const knownSizes = groupItems.flatMap(item => {
        const folderSize = folderSizeStates[item.id];
        const size = item.isFolder
          ? folderSize?.status === 'done' ? folderSize.size : undefined
          : item.size;
        return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? [{ item, size }] : [];
      });
      const largestSize = knownSizes.reduce((largest, entry) => Math.max(largest, entry.size), 0);
      if (largestSize > 0) {
        knownSizes.forEach(({ item, size }) => {
          widths.set(item.id, { ...widths.get(item.id), size: size / largestSize * 100 });
        });
      }

      (['created', 'modified'] as const).forEach(column => {
        const datedItems = groupItems.flatMap(item => {
          const timestamp = timestampFor(item, column);
          return timestamp === undefined ? [] : [{ item, timestamp }];
        });
        if (datedItems.length < 2) return;
        const oldest = datedItems.reduce((minimum, entry) => Math.min(minimum, entry.timestamp), Infinity);
        const newest = datedItems.reduce((maximum, entry) => Math.max(maximum, entry.timestamp), -Infinity);
        if (oldest === newest) return;
        datedItems.forEach(({ item, timestamp }) => {
          const width = (newest - timestamp) / (newest - oldest) * 100;
          widths.set(item.id, { ...widths.get(item.id), [column]: width });
        });
      });
    });
    return widths;
  }, [effectiveViewMode, files, folderSizeStates, isSystemHome, relativeGraphsEnabled]);
  const getRelativeGraphStyle = (width: number | undefined, field: 'size' | 'date'): React.CSSProperties | undefined => {
    if (width === undefined || width <= 0) return undefined;
    const percentage = Math.min(100, Math.max(0, width));
    const color = field === 'size' ? 'var(--color-cyan-400)' : 'var(--color-amber-400)';
    const fill = `color-mix(in srgb, ${color} 22%, transparent)`;
    return { backgroundImage: `linear-gradient(to right, ${fill} ${percentage}%, transparent ${percentage}%)` };
  };
  const columnSortFields: Record<FileColumn, SortField> = {
    extension: 'extension',
    name: 'name',
    type: 'type',
    size: 'size',
    created: 'createdDate',
    modified: 'modifiedDate',
  };
  const columnLabel = (column: FileColumn) => {
    switch (column) {
      case 'extension': return t.pane.columns.extension;
      case 'name': return t.pane.columns.name;
      case 'type': return t.pane.columns.type;
      case 'size': return t.pane.columns.size;
      case 'created': return t.pane.columns.created;
      case 'modified': return isRecycleBin ? t.pane.columns.deleted : t.pane.columns.modified;
    }
  };
  const columnWidth = (column: FileColumn) => {
    if (column === 'name') return columnWidths.name === null
      ? `minmax(${MIN_NAME_COLUMN_WIDTH}px, 1fr)`
      : `${columnWidths.name}px`;
    return `${columnWidths[column]}px`;
  };

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => () => {
    clearPendingDeselection();
    if (columnResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(columnResizeFrameRef.current);
    }
    if (columnResizeGuideFadeTimeoutRef.current !== null) {
      window.clearTimeout(columnResizeGuideFadeTimeoutRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    const previous = navigationSnapshotRef.current;
    const current = {
      tabId: tab.id,
      path: tab.currentPath,
      historyIndex: tab.historyIndex,
      historyLength: tab.history.length,
    };
    navigationSnapshotRef.current = current;
    if (previous.tabId !== current.tabId || previous.path !== current.path) {
      let motion: NavigationMotion = 'other';
      if (previous.tabId === current.tabId) {
        if (previous.historyLength === current.historyLength && current.historyIndex < previous.historyIndex) motion = 'back';
        else if (previous.historyLength === current.historyLength && current.historyIndex > previous.historyIndex) motion = 'forward';
        else if (isNavigationDescendant(current.path, previous.path)) motion = 'into';
        else if (isNavigationDescendant(previous.path, current.path)) motion = 'up';
      }
      pendingNavigationRef.current = { tabId: current.tabId, path: current.path, motion };
      setNavigationTransition(null);
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    }

    if (!navigationTransitionsEnabled) {
      pendingNavigationRef.current = null;
      setNavigationTransition(null);
      return;
    }
    if (document.documentElement.dataset.cyberfilesNavigationPane === paneId) {
      pendingNavigationRef.current = null;
      return;
    }
    const pending = pendingNavigationRef.current;
    if (pending && !isLoadingDirectory && pending.tabId === current.tabId && pending.path === current.path) {
      pendingNavigationRef.current = null;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setNavigationTransition(pending);
    }
  }, [navigationTransitionsEnabled, isLoadingDirectory, tab.id, tab.currentPath, tab.historyIndex, tab.history.length]);

  const hasRecentActivity = (item: FileItem) => {
    const changedAt = Math.max(item.createdAtMs ?? 0, item.modifiedAtMs ?? 0);
    const age = Math.max(currentTime, Date.now()) - changedAt;
    return changedAt > 0 && age >= -60_000 && age <= RECENT_ITEM_WINDOW_MS;
  };

  const isRecentlyChanged = (item: FileItem) => recentItemStyle.enabled && hasRecentActivity(item);
  const hasHiddenAttribute = (item: FileItem) => (
    item.attributes?.toUpperCase().includes('H') === true || (!isTauriDesktop() && item.name.startsWith('.'))
  );
  const isHiddenItem = (item: FileItem) => hiddenItemStyle.enabled && hasHiddenAttribute(item);

  const getItemNameStyle = (item: FileItem, selected = false): React.CSSProperties | undefined => {
    const hidden = isHiddenItem(item);
    const recent = isRecentlyChanged(item);
    if (!hidden && !recent) return undefined;

    const backgroundStyle = hidden && hiddenItemStyle.backgroundEnabled
      ? hiddenItemStyle
      : recent && recentItemStyle.backgroundEnabled ? recentItemStyle : null;
    const textColor = hidden
      ? hiddenItemStyle.textColor === 'auto' ? 'var(--cyberfiles-hidden-item-color)' : hiddenItemStyle.textColor
      : recentItemStyle.textColor === 'auto' ? 'var(--cyberfiles-recent-item-color)' : recentItemStyle.textColor;

    return {
      color: textColor,
      fontWeight: (hidden && hiddenItemStyle.bold) || (recent && recentItemStyle.bold) ? 700 : 400,
      fontStyle: (hidden && hiddenItemStyle.italic) || (recent && recentItemStyle.italic) ? 'italic' : 'normal',
      ...(selected && backgroundStyle ? {
        backgroundColor: `color-mix(in srgb, ${backgroundStyle.backgroundColor} 18%, transparent)`,
        borderRadius: 3,
        paddingInline: 3,
      } : {}),
    };
  };

  const getItemBackgroundStyle = (item: FileItem, selected: boolean): React.CSSProperties | undefined => {
    if (selected) return undefined;
    const hidden = isHiddenItem(item);
    const recent = isRecentlyChanged(item);
    const backgroundStyle = hidden && hiddenItemStyle.backgroundEnabled
      ? hiddenItemStyle
      : recent && recentItemStyle.backgroundEnabled ? recentItemStyle : null;
    return backgroundStyle
      ? { backgroundColor: `color-mix(in srgb, ${backgroundStyle.backgroundColor} 18%, transparent)` }
      : undefined;
  };

  const getFolderTooltipSizeText = (item: FileItem) => {
    const folderSize = folderSizeStates[item.id];
    if (folderSize?.status === 'done') return t.pane.folderSizeTotal.replace('{size}', formatFileSize(folderSize.size ?? 0));
    if (folderSize?.status === 'loading') return t.pane.folderSizeCalculating.replace('{size}', formatFileSize(folderSize.size ?? 0)).replace('{entries}', String(folderSize.entriesScanned ?? 0));
    if (folderSize?.status === 'paused') return t.pane.folderSizePaused.replace('{size}', formatFileSize(folderSize.size ?? 0)).replace('{entries}', String(folderSize.entriesScanned ?? 0));
    if (folderSize?.status === 'error') return t.pane.folderSizeFailed;
    if (!autoFolderSizeEnabled) return t.pane.folderSizeHoverDisabled;
    return isTauriDesktop() ? t.pane.folderSizeHoverHint : t.pane.folderSizeHoverDesktopOnly;
  };

  const renderItemTooltip = (item: FileItem, additionalDetails?: React.ReactNode) => (
    <div className="flex max-w-[18rem] flex-col items-center gap-1 text-center">
      {imageTooltipThumbnailsEnabled && item.type === 'image' && !item.isFolder && (
        <ImageFileThumbnail
          item={item}
          fallback={getFileIcon(item.type, item.isFolder)}
          className="h-28 w-48"
          fit="contain"
        />
      )}
      <span className="font-semibold">{item.name}</span>
      {item.path && <span className="break-all font-sans text-[10px] text-cyan-200">{item.path}</span>}
      {item.isFolder && !item.recycleBinId && !isRecycleBin && (
        <span className="text-cyan-100">{getFolderTooltipSizeText(item)}</span>
      )}
      {!item.isFolder && <span>{formatFileSize(item.size)}</span>}
      {(item.modifiedDate || item.modifiedAtMs !== undefined) && (
        <span className="text-[10px] text-neutral-300">
          {t.pane.itemTooltipModifiedDate.replace('{date}', formatDateTimeForDisplay(item.modifiedAtMs, item.modifiedDate, dateFormat, language))}
        </span>
      )}
      {hasRecentActivity(item) && (
        <span className="mt-0.5 rounded-full border border-cyan-400/25 bg-cyan-950/50 px-2 py-0.5 text-[10px] text-cyan-200">
          {t.pane.itemTooltipRecentActivity}
        </span>
      )}
      {hasHiddenAttribute(item) && (
        <span className="mt-0.5 rounded-full border border-rose-400/30 bg-rose-950/45 px-2 py-0.5 text-[10px] text-rose-200">
          {item.isFolder ? t.pane.itemTooltipHiddenFolder : t.pane.itemTooltipHiddenFile}
        </span>
      )}
      {additionalDetails}
    </div>
  );

  const fileGridTemplateColumns = visibleFileColumns.map(columnWidth).join(' ');
  const detailsRowWidth = visibleFileColumns.reduce((total, column) => total + (column === 'name' ? columnWidths.name ?? MIN_NAME_COLUMN_WIDTH : columnWidths[column]), 0)
    + Math.max(0, visibleFileColumns.length - 1) * 8 + 18;
  const getFileTypeLabel = (item: FileItem) => t.pane.folderTypeLabels[item.type]
    .replace('{extension}', item.extension.toUpperCase()).trim();
  const getGroupForItem = (item: FileItem): { id: string; label: string } => {
    if (tab.groupBy === 'name') {
      const initial = item.name.trim().charAt(0).toLocaleUpperCase() || '#';
      return { id: initial, label: initial };
    }
    if (tab.groupBy === 'type') return { id: item.type, label: getFileTypeLabel(item) };
    if (tab.groupBy === 'size') {
      if (item.isFolder) return { id: 'folders', label: t.pane.groups.folders };
      const sizeGroup = item.size === 0 ? 'emptyFiles'
        : item.size < 1024 * 1024 ? 'smallFiles'
          : item.size < 100 * 1024 * 1024 ? 'mediumFiles'
            : item.size < 1024 * 1024 * 1024 ? 'largeFiles' : 'hugeFiles';
      return { id: sizeGroup, label: t.pane.groups[sizeGroup] };
    }
    if (tab.groupBy === 'modifiedDate') {
      const modifiedAt = item.modifiedAtMs ?? Date.parse(item.modifiedDate);
      if (!Number.isFinite(modifiedAt)) return { id: 'unknownDate', label: t.pane.groups.unknownDate };
      const age = Math.max(0, Date.now() - modifiedAt);
      const day = 24 * 60 * 60 * 1000;
      const dateGroup = age < day ? 'today' : age < 2 * day ? 'yesterday' : age < 7 * day ? 'earlierWeek' : age < 30 * day ? 'earlierMonth' : 'older';
      return { id: dateGroup, label: t.pane.groups[dateGroup] };
    }
    return { id: 'all', label: '' };
  };
  const fileGroups = (() => {
    if (!tab.groupBy || tab.groupBy === 'none') return [{ id: 'all', label: '', items: files }];
    const groups = new Map<string, { id: string; label: string; items: FileItem[] }>();
    files.forEach(item => {
      const group = getGroupForItem(item);
      const existing = groups.get(group.id);
      if (existing) existing.items.push(item);
      else groups.set(group.id, { ...group, items: [item] });
    });
    return [...groups.values()];
  })();
  const renderFileGroupHeading = (group: { id: string; label: string }) => {
    if (!group.label) return null;
    const key = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
    const isCollapsed = collapsedGroups[key] === true;
    return (
      <Tooltip label={group.label} placement="top">
        <button
          key={`group-${key}`}
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => setCollapsedGroups(previous => ({ ...previous, [key]: !previous[key] }))}
          className="collapse-toggle sticky top-0 z-[1] col-span-full flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
        >
          <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-neutral-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
          <span>{group.label} ({fileGroups.find(candidate => candidate.id === group.id)?.items.length ?? 0})</span>
          <span className="h-px flex-1 bg-neutral-800" />
        </button>
      </Tooltip>
    );
  };
  const calculateFolderSize = async (item: FileItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isTauriDesktop()) return;
    const activeJobId = folderSizeJobsRef.current.get(item.id);
    if (activeJobId) {
      folderSizeJobsRef.current.delete(item.id);
      const leaveTimer = folderSizeLeaveTimersRef.current.get(item.id);
      if (leaveTimer !== undefined) window.clearTimeout(leaveTimer);
      folderSizeLeaveTimersRef.current.delete(item.id);
      void cancelNativeFolderSizeCalculation(activeJobId);
    }
    setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'loading', size: 0, entriesScanned: 0 } }));
    try {
      const size = await calculateNativeFolderSize(item.path);
      setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'done', size } }));
    } catch {
      setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'error' } }));
    }
  };
  const startFolderSizeOnHover = async (item: FileItem) => {
    if (!isTauriDesktop() || !autoFolderSizeEnabled || !hoveredFolderItemsRef.current.has(item.id)) return;
    if (folderSizeStatesRef.current[item.id]?.status === 'done' || folderSizeJobsRef.current.has(item.id)) return;
    const jobId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    folderSizeJobsRef.current.set(item.id, jobId);
    setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'loading', size: 0, entriesScanned: 0 } }));
    try {
      await startNativeFolderSizeCalculation(item.path, jobId);
      if (!hoveredFolderItemsRef.current.has(item.id) && folderSizeJobsRef.current.get(item.id) === jobId) {
        await pauseNativeFolderSizeCalculation(jobId);
      }
    } catch {
      if (folderSizeJobsRef.current.get(item.id) !== jobId) return;
      folderSizeJobsRef.current.delete(item.id);
      setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'error' } }));
    }
  };
  const scheduleFolderSizeOnHover = (item: FileItem) => {
    if (!tooltipsEnabled || !autoFolderSizeEnabled || !isTauriDesktop() || !item.isFolder || item.recycleBinId || !item.path) return;
    if (folderSizeStatesRef.current[item.id]?.status === 'done' || folderSizeJobsRef.current.has(item.id)) return;
    const pendingTimer = folderSizeHoverTimersRef.current.get(item.id);
    if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
    const timer = window.setTimeout(() => {
      folderSizeHoverTimersRef.current.delete(item.id);
      if (!hoveredFolderItemsRef.current.has(item.id)) return;
      void startFolderSizeOnHover(item);
    }, 2000);
    folderSizeHoverTimersRef.current.set(item.id, timer);
  };
  const handleFolderTooltipMouseEnter = (item: FileItem) => {
    if (!item.isFolder || item.recycleBinId || isRecycleBin) return;
    hoveredFolderItemsRef.current.set(item.id, item);
    const leaveTimer = folderSizeLeaveTimersRef.current.get(item.id);
    if (leaveTimer !== undefined) {
      window.clearTimeout(leaveTimer);
      folderSizeLeaveTimersRef.current.delete(item.id);
    }
    const jobId = folderSizeJobsRef.current.get(item.id);
    if (jobId) {
      if (folderSizeStatesRef.current[item.id]?.status === 'paused') {
        setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'loading', size: 0, entriesScanned: 0 } }));
        void resumeNativeFolderSizeCalculation(jobId);
      }
      return;
    }
    scheduleFolderSizeOnHover(item);
  };
  const handleFolderTooltipMouseLeave = (item: FileItem) => {
    hoveredFolderItemsRef.current.delete(item.id);
    const timer = folderSizeHoverTimersRef.current.get(item.id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      folderSizeHoverTimersRef.current.delete(item.id);
    }
    const jobId = folderSizeJobsRef.current.get(item.id);
    if (!jobId) return;
    setFolderSizeStates(previous => ({ ...previous, [item.id]: { status: 'paused' } }));
    void pauseNativeFolderSizeCalculation(jobId);
    const existingLeaveTimer = folderSizeLeaveTimersRef.current.get(item.id);
    if (existingLeaveTimer !== undefined) window.clearTimeout(existingLeaveTimer);
    const leaveTimer = window.setTimeout(() => {
      folderSizeLeaveTimersRef.current.delete(item.id);
      if (hoveredFolderItemsRef.current.has(item.id) || folderSizeJobsRef.current.get(item.id) !== jobId) return;
      folderSizeJobsRef.current.delete(item.id);
      setFolderSizeStates(previous => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      void cancelNativeFolderSizeCalculation(jobId);
    }, 1800);
    folderSizeLeaveTimersRef.current.set(item.id, leaveTimer);
  };
  useEffect(() => () => {
    for (const timer of folderSizeHoverTimersRef.current.values()) window.clearTimeout(timer);
    for (const timer of folderSizeLeaveTimersRef.current.values()) window.clearTimeout(timer);
    for (const jobId of folderSizeJobsRef.current.values()) void cancelNativeFolderSizeCalculation(jobId);
    folderSizeHoverTimersRef.current.clear();
    folderSizeLeaveTimersRef.current.clear();
    hoveredFolderItemsRef.current.clear();
    folderSizeJobsRef.current.clear();
  }, []);
  useEffect(() => {
    if (autoFolderSizeEnabled && tooltipsEnabled) return;
    for (const timer of folderSizeHoverTimersRef.current.values()) window.clearTimeout(timer);
    for (const timer of folderSizeLeaveTimersRef.current.values()) window.clearTimeout(timer);
    for (const jobId of folderSizeJobsRef.current.values()) void cancelNativeFolderSizeCalculation(jobId);
    folderSizeHoverTimersRef.current.clear();
    folderSizeLeaveTimersRef.current.clear();
    folderSizeJobsRef.current.clear();
    hoveredFolderItemsRef.current.clear();
    setFolderSizeStates(previous => Object.fromEntries(
      Object.entries(previous).filter(([, state]) => state.status === 'done'),
    ));
  }, [autoFolderSizeEnabled, tooltipsEnabled]);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<{ jobId: string; size: number; entriesScanned: number }>('folder-size-calculation-progress', event => {
      const itemId = [...folderSizeJobsRef.current.entries()].find(([, activeJobId]) => activeJobId === event.payload.jobId)?.[0];
      if (!itemId) return;
      setFolderSizeStates(previous => ({
        ...previous,
        [itemId]: {
          status: previous[itemId]?.status === 'paused' ? 'paused' : 'loading',
          size: event.payload.size,
          entriesScanned: event.payload.entriesScanned,
        },
      }));
    }).then(stopListening => {
      if (cancelled) stopListening();
      else unlisten = stopListening;
    });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<{ jobId: string; size?: number; error?: string }>('folder-size-calculation-finished', event => {
      const { jobId, size, error } = event.payload;
      const itemId = [...folderSizeJobsRef.current.entries()].find(([, activeJobId]) => activeJobId === jobId)?.[0];
      if (!itemId) return;
      folderSizeJobsRef.current.delete(itemId);
      const leaveTimer = folderSizeLeaveTimersRef.current.get(itemId);
      if (leaveTimer !== undefined) window.clearTimeout(leaveTimer);
      folderSizeLeaveTimersRef.current.delete(itemId);
      setFolderSizeStates(previous => ({
        ...previous,
        [itemId]: error ? { status: 'error' } : { status: 'done', size: size ?? 0 },
      }));
    }).then(stopListening => {
      if (cancelled) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const detailsTableMinimumWidth = visibleFileColumns.reduce((total, column) => total + (column === 'name' ? columnWidths.name ?? MIN_NAME_COLUMN_WIDTH : columnWidths[column]), 0)
    + Math.max(0, visibleFileColumns.length - 1) * 8 + 18 + viewportScrollbarWidth + 32;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measureScrollbar = () => setViewportScrollbarWidth(Math.max(0, viewport.offsetWidth - viewport.clientWidth));
    measureScrollbar();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureScrollbar);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  }, [files.length, effectiveViewMode]);

  useEffect(() => {
    if (!tab.focusedId || !tab.selectedIds.includes(tab.focusedId)) {
      lastScrolledFocusedIdRef.current = null;
      return;
    }
    if (lastScrolledFocusedIdRef.current === tab.focusedId) return;
    const focusedItem = [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-file-item][data-file-id]') ?? [])]
      .find(element => element.dataset.fileId === tab.focusedId);
    if (focusedItem) {
      focusedItem.scrollIntoView({ block: 'nearest' });
      lastScrolledFocusedIdRef.current = tab.focusedId;
    }
  }, [files, tab.focusedId, tab.selectedIds]);

  useEffect(() => {
    setPathInput(tab.currentPath);
  }, [tab.currentPath]);

  useEffect(() => {
    if (!recentFoldersMenuPosition) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (
        recentFoldersMenuRef.current?.contains(target)
        || recentFoldersButtonRef.current?.contains(target)
      )) return;
      setRecentFoldersMenuPosition(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRecentFoldersMenuPosition(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismissOnEscape, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', dismissOnEscape, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [recentFoldersMenuPosition]);

  useEffect(() => {
    const input = pathInputRef.current;
    if (!input) return;
    const navigateToClipboardAddress = (event: Event) => {
      const path = (event as CustomEvent<string>).detail?.trim();
      if (!path) return;
      setPathInput(path);
      setIsEditingPath(false);
      onNavigate(path);
    };
    input.addEventListener('cyberfiles-paste-and-go', navigateToClipboardAddress);
    return () => input.removeEventListener('cyberfiles-paste-and-go', navigateToClipboardAddress);
  }, [onNavigate, isEditingPath]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${COLLAPSED_SYSTEM_HOME_SECTIONS_KEY}_${paneId}`, JSON.stringify(collapsedSystemHomeSections));
    } catch {
      // Section state remains available for the current session if storage is unavailable.
    }
  }, [collapsedSystemHomeSections, paneId]);

  useEffect(() => {
    if (lastColumnPreferencesRevision.current === columnPreferencesRevision) return;
    lastColumnPreferencesRevision.current = columnPreferencesRevision;
    setColumnLayout(columnPreferences.layout);
    setColumnWidths(columnPreferences.widths);
  }, [columnPreferencesRevision, paneId, columnPreferences]);

  useEffect(() => {
    if (columnWidthsSaveTimeoutRef.current !== null) window.clearTimeout(columnWidthsSaveTimeoutRef.current);
    columnWidthsSaveTimeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`${FILE_COLUMN_WIDTHS_STORAGE_KEY}_${paneId}`, JSON.stringify(columnWidths));
      } catch {
        // Column widths remain available for the current session if storage is unavailable.
      }
      onColumnPreferencesChange(paneId, { layout: columnLayout, widths: columnWidths });
      columnWidthsSaveTimeoutRef.current = null;
    }, 180);
    return () => {
      if (columnWidthsSaveTimeoutRef.current !== null) window.clearTimeout(columnWidthsSaveTimeoutRef.current);
      columnWidthsSaveTimeoutRef.current = null;
    };
  }, [columnWidths, columnLayout, onColumnPreferencesChange, paneId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${FILE_COLUMN_LAYOUT_STORAGE_KEY}_${paneId}`, JSON.stringify(columnLayout));
    } catch {
      // Column layout remains available for the current session if storage is unavailable.
    }
    const preferences = { layout: columnLayout, widths: columnWidths };
    const serialized = JSON.stringify(preferences);
    if (lastReportedColumnPreferences.current !== serialized) {
      lastReportedColumnPreferences.current = serialized;
      onColumnPreferencesChange(paneId, preferences);
    }
  }, [columnLayout, columnWidths, onColumnPreferencesChange, paneId]);

  useEffect(() => {
    if (!columnMenuPosition) return;
    const dismissMenu = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-file-column-menu]')) return;
      setColumnMenuPosition(null);
    };
    const dismissMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenuPosition(null);
    };
    document.addEventListener('pointerdown', dismissMenu);
    document.addEventListener('keydown', dismissMenuOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissMenu);
      document.removeEventListener('keydown', dismissMenuOnEscape);
    };
  }, [columnMenuPosition]);

  useEffect(() => {
    if (previousPathRef.current !== tab.currentPath) {
      previousPathRef.current = tab.currentPath;
    }
    if (!styleLocked) setColumnWidths(DEFAULT_FILE_COLUMN_WIDTHS);
  }, [tab.currentPath, styleLocked]);

  useEffect(() => {
    if (!styleLocked) setColumnLayout(DEFAULT_FILE_COLUMN_LAYOUT);
  }, [styleLocked]);

  const startColumnResize = (column: ResizableColumn, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (columnResizeGuideFadeTimeoutRef.current !== null) {
      window.clearTimeout(columnResizeGuideFadeTimeoutRef.current);
      columnResizeGuideFadeTimeoutRef.current = null;
    }
    const measuredNameWidth = event.currentTarget.parentElement?.clientWidth ?? MIN_NAME_COLUMN_WIDTH;
    const dragWidths = column === 'name' && columnWidths.name === null
      ? { ...columnWidths, name: measuredNameWidth }
      : columnWidths;
    const separatorRect = event.currentTarget.getBoundingClientRect();
    const headerRect = columnHeadersRef.current?.getBoundingClientRect();
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    const guideStartX = separatorRect.left + separatorRect.width / 2;
    if (columnResizeGuideRef.current) columnResizeGuideRef.current.style.translate = '0px 0px';
    columnResizeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      latestClientX: event.clientX,
      guideStartX,
      column,
      widths: dragWidths,
    };
    if (headerRect && viewportRect) {
      setColumnResizeGuide({
        left: guideStartX,
        top: headerRect.top,
        height: Math.max(0, viewportRect.bottom - headerRect.top),
        fadingOut: false,
      });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateColumnResizeGuide = (drag: ColumnResizeDrag, clientX: number) => {
    const resizedWidths = resizeFileColumns(drag.widths, drag.column, clientX - drag.startX);
    const initialWidth = drag.column === 'name' ? drag.widths.name ?? MIN_NAME_COLUMN_WIDTH : drag.widths[drag.column];
    const resizedWidth = drag.column === 'name' ? resizedWidths.name ?? MIN_NAME_COLUMN_WIDTH : resizedWidths[drag.column];
    if (columnResizeGuideRef.current) {
      columnResizeGuideRef.current.style.translate = `${resizedWidth - initialWidth}px 0`;
    }
    return resizedWidths;
  };

  const moveColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = columnResizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.latestClientX = event.clientX;
    if (columnResizeFrameRef.current !== null) return;
    columnResizeFrameRef.current = window.requestAnimationFrame(() => {
      columnResizeFrameRef.current = null;
      if (columnResizeDragRef.current === drag) updateColumnResizeGuide(drag, drag.latestClientX);
    });
  };

  const finishColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = columnResizeDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      drag.latestClientX = event.clientX;
      if (columnResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(columnResizeFrameRef.current);
        columnResizeFrameRef.current = null;
      }
      setColumnWidths(updateColumnResizeGuide(drag, drag.latestClientX));
      columnResizeDragRef.current = null;
      setColumnResizeGuide(previous => previous ? { ...previous, fadingOut: true } : null);
      if (columnResizeGuideFadeTimeoutRef.current !== null) {
        window.clearTimeout(columnResizeGuideFadeTimeoutRef.current);
      }
      columnResizeGuideFadeTimeoutRef.current = window.setTimeout(() => {
        setColumnResizeGuide(null);
        columnResizeGuideFadeTimeoutRef.current = null;
      }, 120);
    }
  };

  const autoFitColumn = (column: ResizableColumn) => {
    const headerContent = columnHeadersRef.current?.querySelector<HTMLElement>(`[data-file-column-header="${column}"]`);
    const cells = viewportRef.current?.querySelectorAll<HTMLElement>(`[data-file-column-content="${column}"]`) ?? [];
    const headerWidth = headerContent ? headerContent.scrollWidth + 28 : 0;
    const widestCell = [...cells].reduce((widest, cell) => {
      const hasColorLabel = column === 'name' && Boolean(cell.parentElement?.querySelector('[data-file-name-decoration="color-label"]'));
      const cellPadding = column === 'name' ? 28 + (hasColorLabel ? 16 : 0) : 4;
      return Math.max(widest, cell.scrollWidth + cellPadding);
    }, 0);
    const fittedWidth = Math.max(headerWidth, widestCell);

    setColumnWidths(previous => {
      const currentWidth = column === 'name'
        ? previous.name ?? MIN_NAME_COLUMN_WIDTH
        : previous[column];
      return resizeFileColumns(previous, column, fittedWidth - currentWidth);
    });
  };

  const resizeHandle = (column: ResizableColumn, label: string) => (
    <Tooltip label={t.pane.resizeColumn.replace('{column}', label)} placement="top">
      <button
        type="button"
        role="separator"
        aria-orientation="vertical"
        aria-label={t.pane.resizeColumn.replace('{column}', label)}
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => {
          event.preventDefault();
          event.stopPropagation();
          autoFitColumn(column);
        }}
        onPointerDown={event => startColumnResize(column, event)}
        onPointerMove={moveColumnResize}
        onPointerUp={finishColumnResize}
        onPointerCancel={finishColumnResize}
        onLostPointerCapture={finishColumnResize}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          setColumnWidths(previous => {
            const measuredNameWidth = event.currentTarget.parentElement?.clientWidth ?? MIN_NAME_COLUMN_WIDTH;
            const widths = column === 'name' && previous.name === null ? { ...previous, name: measuredNameWidth } : previous;
            return resizeFileColumns(widths, column, event.key === 'ArrowRight' ? 10 : -10);
          });
        }}
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none outline-none before:pointer-events-none before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-1 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-transparent before:transition-colors after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:top-1 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-neutral-700/80 after:transition-colors group-hover:before:bg-neutral-500/70 group-hover:after:bg-neutral-500 hover:before:bg-cyan-300 hover:after:bg-cyan-300 focus-visible:before:bg-cyan-300 focus-visible:after:bg-cyan-300"
      />
    </Tooltip>
  );

  const openColumnMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 200;
    const menuHeight = 52 + FILE_COLUMNS.length * 34;
    setColumnMenuPosition({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const toggleFileColumn = (column: FileColumn) => {
    setColumnLayout(previous => {
      const visible = previous.visible.includes(column)
        ? previous.visible.filter(current => current !== column)
        : [...previous.visible, column];
      return { ...previous, visible: visible.length > 0 ? visible : ['name'] };
    });
  };

  const reorderFileColumns = (source: FileColumn, target: FileColumn) => {
    if (source === target) return;
    setColumnLayout(previous => {
      const order = [...previous.order];
      const sourceIndex = order.indexOf(source);
      const targetIndex = order.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return previous;
      order.splice(sourceIndex, 1);
      order.splice(targetIndex, 0, source);
      return { ...previous, order };
    });
  };

  const beginColumnPointerDrag = (column: FileColumn, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('[role="separator"]'))) return;
    columnPointerDragRef.current = {
      pointerId: event.pointerId,
      column,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      target: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveColumnPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = columnPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-file-column-id]')?.dataset.fileColumnId as FileColumn | undefined;
    drag.target = target && FILE_COLUMNS.includes(target) ? target : null;
    setColumnDropTarget(drag.target);
  };

  const finishColumnPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = columnPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressColumnSortRef.current = true;
      if (drag.target) reorderFileColumns(drag.column, drag.target);
      window.setTimeout(() => { suppressColumnSortRef.current = false; }, 100);
    }
    columnPointerDragRef.current = null;
    setColumnDropTarget(null);
  };

  useEffect(() => {
    if (isEditingPath && pathInputRef.current) {
      pathInputRef.current.focus();
      pathInputRef.current.select();
    }
  }, [isEditingPath]);

  useEffect(() => {
    if (!renameRequest || renameRequest.paneId !== paneId) return;
    const item = files.find(candidate => candidate.id === renameRequest.itemId);
    onRenameRequestHandled(renameRequest.requestId);
    if (!item || item.recycleBinId) return;
    renameCommitItemRef.current = item.id;
    setEditingItemName(item.name);
    setEditingItemId(item.id);
  }, [files, onRenameRequestHandled, paneId, renameRequest]);

  useEffect(() => {
    if (editingItemId && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select base name without extension
      const dotIndex = editingItemName.lastIndexOf('.');
      if (dotIndex > 0) {
        renameInputRef.current.setSelectionRange(0, dotIndex);
      } else {
        renameInputRef.current.select();
      }
    }
  }, [editingItemId]);

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditingPath(false);
    if (pathInput.trim() && pathInput !== tab.currentPath) {
      onNavigate(pathInput.trim());
    }
  };

  const toggleRecentFoldersMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (recentFoldersMenuPosition) {
      setRecentFoldersMenuPosition(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    setRecentFoldersMenuPosition({
      left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 400)),
      width,
    });
  };

  const handleRenameSubmit = (itemId: string, originalName: string) => {
    if (renameCommitItemRef.current !== itemId) return;
    renameCommitItemRef.current = null;
    const nextName = editingItemName.trim();
    if (nextName && nextName !== originalName) {
      onInlineRename(itemId, nextName, paneId);
    }
    setEditingItemId(null);
  };

  const renderInlineRenameInput = (item: FileItem, formClassName: string, inputAlignment = 'text-left') => (
    <form
      onSubmit={event => { event.preventDefault(); handleRenameSubmit(item.id, item.name); }}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      className={formClassName}
    >
      <input
        ref={renameInputRef}
        type="text"
        aria-label={t.toolbar.rename}
        value={editingItemName}
        onChange={event => setEditingItemName(event.target.value)}
        onBlur={() => handleRenameSubmit(item.id, item.name)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            renameCommitItemRef.current = null;
            setEditingItemName(item.name);
            setEditingItemId(null);
          }
        }}
        className={`w-full min-w-0 select-text rounded border border-cyan-400 bg-neutral-950 px-1 py-0.5 text-xs text-neutral-100 outline-none ${inputAlignment}`}
      />
    </form>
  );

  const getFileIcon = (type: FileType, isFolder: boolean) => {
    if (isFolder) return <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />;
    switch (type) {
      case 'image': return <ImageIcon className="w-4 h-4 text-rose-400" />;
      case 'code': return <Code2 className="w-4 h-4 text-cyan-400" />;
      case 'text': return <FileText className="w-4 h-4 text-blue-300" />;
      case 'archive': return <Archive className="w-4 h-4 text-purple-400" />;
      case 'audio': return <Music className="w-4 h-4 text-yellow-400" />;
      case 'video': return <Video className="w-4 h-4 text-pink-400" />;
      case 'document': return <FileCheck className="w-4 h-4 text-emerald-400" />;
      case 'binary': return <Binary className="w-4 h-4 text-orange-400" />;
      default: return <FileCode className="w-4 h-4 text-neutral-400" />;
    }
  };

  const getDisplayFileIcon = (item: FileItem, size: 'small' | 'large' = 'small') => {
    const nativeIcon = !item.isFolder && nativeFileIconState.scope === nativeFileIconScope
      ? nativeFileIconState.byItemId[item.id]
      : undefined;
    if (nativeIcon) {
      return (
        <img
          src={nativeIcon}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={`${size === 'large' ? 'h-8 w-8' : 'h-4 w-4'} flex-shrink-0 object-contain`}
        />
      );
    }
    const fallback = getFileIcon(item.type, item.isFolder);
    return size === 'large' ? <span className="scale-[2]">{fallback}</span> : fallback;
  };

  // Breadcrumbs generator for Windows paths: "C:\Users\Cali\Documents"
  const breadcrumbSegments = React.useMemo(() => {
    if (!tab.currentPath || isSystemHome || isRecycleBin) return [];
    const raw = tab.currentPath.replace(/\/+$/, '').replace(/\\+$/, '');
    const segments = raw.split(/\\|\//);
    const result: { label: string; fullPath: string }[] = [];
    
    let accumulated = '';
    segments.forEach((seg, idx) => {
      if (idx === 0) {
        accumulated = seg.includes(':') ? `${seg}\\` : seg;
        result.push({ label: seg, fullPath: accumulated });
      } else {
        accumulated = `${accumulated.replace(/\\+$/, '')}\\${seg}`;
        result.push({ label: seg, fullPath: accumulated });
      }
    });
    return result;
  }, [tab.currentPath, isSystemHome, isRecycleBin]);

  // Handle Drag & Drop between panes
  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    const idsToDrag = tab.selectedIds.includes(item.id) ? tab.selectedIds : [item.id];
    e.dataTransfer.setData('text/plain', JSON.stringify({ sourcePane: paneId, itemIds: idsToDrag }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent, targetFolderItem?: FileItem) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      if (data.sourcePane !== paneId && data.itemIds) {
        const destPath = targetFolderItem && targetFolderItem.isFolder ? targetFolderItem.path : tab.currentPath;
        onDropFilesFromOtherPane(data.itemIds, destPath, data.sourcePane);
      }
    } catch {
      // Ignored
    }
  };

  // Selection logic
  const handleItemClick = (e: React.MouseEvent, item: FileItem, index: number) => {
    onActivate();
    clearPendingDeselection();

    // A second click completes the open gesture; keep the selection from its first click.
    if (e.detail > 1) return;

    if (e.detail === 1 && !e.ctrlKey && !e.metaKey && !e.shiftKey && tab.selectedIds.includes(item.id)) {
      const selectedIds = [...tab.selectedIds];
      const currentPath = tab.currentPath;
      const tabId = tab.id;
      const timer = window.setTimeout(() => {
        pendingDeselectionRef.current = null;
        const currentTab = latestTabRef.current;
        const selectionUnchanged = currentTab.selectedIds.length === selectedIds.length
          && currentTab.selectedIds.every((id, selectedIndex) => id === selectedIds[selectedIndex]);
        if (currentTab.id === tabId && currentTab.currentPath === currentPath && selectionUnchanged) {
          onSelectItems([item.id], false, false);
        }
      }, 220);
      pendingDeselectionRef.current = timer;
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      onSelectItems([item.id], true, false);
    } else if (e.shiftKey) {
      onSelectItems([item.id], false, true);
    } else {
      onSelectItems([item.id], false, false);
    }
  };

  const handleConfiguredSingleClick = (event: React.MouseEvent, item: FileItem) => {
    if (!singleClickOpens || event.ctrlKey || event.metaKey || event.shiftKey || item.recycleBinId) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;

    const timestamp = Date.now();
    const previous = lastSingleClickOpenRef.current;
    if (previous?.itemId === item.id && timestamp - previous.timestamp < 450) {
      previous.timestamp = timestamp;
      return;
    }

    lastSingleClickOpenRef.current = { itemId: item.id, timestamp };
    onItemDoubleClick(item);
  };

  const handleConfiguredDoubleClick = (item: FileItem) => {
    if (!singleClickOpens || item.recycleBinId) onItemDoubleClick(item);
  };

  const handleViewportContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-file-item], button, input, select, textarea, a')) return;
    onBackgroundContextMenu(event, paneId);
  };

  const handleViewportClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressViewportClickRef.current) {
      suppressViewportClickRef.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[data-file-item]')) return;
    clearPendingDeselection();
    if (target.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
    onBackgroundClick(event, paneId);
  };

  const handleViewportDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-file-item], button, input, select, textarea, a')) return;
    onBackgroundDoubleClick(event, paneId);
  };

  const handleFileItemContextMenu = (event: React.MouseEvent, item: FileItem) => {
    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    onItemContextMenu(event, item);
  };

  const updateMarqueeSelection = (drag: MarqueeDrag, clientX: number, clientY: number) => {
    const left = Math.min(drag.startX, clientX);
    const top = Math.min(drag.startY, clientY);
    const right = Math.max(drag.startX, clientX);
    const bottom = Math.max(drag.startY, clientY);
    setMarqueeBounds({ left, top, width: right - left, height: bottom - top });

    const matchingIds = [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-file-item][data-file-id]') ?? [])]
      .filter(element => {
        const bounds = element.getBoundingClientRect();
        return left < bounds.right && right > bounds.left && top < bounds.bottom && bottom > bounds.top;
      })
      .map(element => element.dataset.fileId)
      .filter((id): id is string => Boolean(id));
    const selectedIds = drag.additive
      ? [...new Set([...drag.initialIds, ...matchingIds])]
      : matchingIds;
    marqueePreviewIdsRef.current = selectedIds;
    setMarqueePreviewIds(selectedIds);
  };

  const handleMarqueePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-file-item], button, input, select, textarea, a, [contenteditable="true"]')) return;
    onActivate();
    marqueeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      initialIds: tab.selectedIds,
      hasMoved: false,
    };
    marqueePreviewIdsRef.current = null;
    setMarqueePreviewIds(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMarqueePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = marqueeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.hasMoved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    if (!drag.hasMoved) {
      drag.hasMoved = true;
      marqueeDragRef.current = drag;
    }
    event.preventDefault();
    updateMarqueeSelection(drag, event.clientX, event.clientY);
  };

  const finishMarqueeSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = marqueeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    marqueeDragRef.current = null;
    if (drag.hasMoved) {
      suppressViewportClickRef.current = true;
      onSelectItems(marqueePreviewIdsRef.current ?? (drag.additive ? drag.initialIds : []), false, false, true);
    }
    marqueePreviewIdsRef.current = null;
    setMarqueePreviewIds(null);
    setMarqueeBounds(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const visibleSelectedIds = marqueePreviewIds ?? tab.selectedIds;
  const selectedFiles = files.filter(f => visibleSelectedIds.includes(f.id));
  const selectedBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const folderBytes = files.filter(file => !file.isFolder).reduce((acc, file) => acc + file.size, 0);

  const renderSystemHomeCard = (item: FileItem, index: number, category: 'folder' | 'drive' | 'network') => {
    const selected = visibleSelectedIds.includes(item.id);
    const drive = category === 'folder' ? undefined : drives.find(candidate => item.id === `system-drive-${candidate.id}`);
    let icon: React.ReactNode;
    if (drive?.type === 'network') icon = <Network className="h-7 w-7" />;
    else if (drive?.type === 'removable') icon = <Usb className="h-7 w-7" />;
    else if (drive?.type === 'optical') icon = <Disc3 className="h-7 w-7" />;
    else if (drive) icon = <HardDrive className="h-7 w-7" />;
    else if (item.id.endsWith('-downloads')) icon = <Download className="h-6 w-6" />;
    else if (item.id.endsWith('-desktop')) icon = <Monitor className="h-6 w-6" />;
    else if (item.id.endsWith('-documents')) icon = <FileText className="h-6 w-6" />;
    else if (item.id.endsWith('-pictures')) icon = <ImageIcon className="h-6 w-6" />;
    else if (item.id.endsWith('-music')) icon = <Music className="h-6 w-6" />;
    else if (item.id.endsWith('-videos')) icon = <Video className="h-6 w-6" />;
    else icon = <Folder className="h-6 w-6" />;

    const hasCapacity = Boolean(drive && drive.totalBytes > 0);
    const usedPercent = hasCapacity && drive
      ? Math.min(100, Math.round((drive.usedBytes / drive.totalBytes) * 100))
      : 0;
    const tooltipLabel = category === 'folder'
      ? renderItemTooltip(item)
      : renderItemTooltip(item, drive ? (
        <span className="mt-1">
          {hasCapacity
            ? t.pane.availableOf
              .replace('{free}', formatFileSize(Math.max(0, drive.totalBytes - drive.usedBytes)))
              .replace('{total}', formatFileSize(drive.totalBytes))
            : t.pane.capacityUnavailable}
        </span>
      ) : undefined);

    return (
      <Tooltip label={tooltipLabel} placement="top">
      <button
        key={item.id}
        type="button"
        data-file-item="true"
        data-file-id={item.id}
        onClick={event => { handleItemClick(event, item, index); handleConfiguredSingleClick(event, item); }}
        onDoubleClick={() => handleConfiguredDoubleClick(item)}
        onContextMenu={event => handleFileItemContextMenu(event, item)}
        style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getItemBackgroundStyle(item, selected) }}
        className={`group flex min-h-[68px] w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
          selected
            ? 'border-cyan-500/60 bg-cyan-950/45 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
            : 'border-transparent bg-neutral-900/35 hover:border-neutral-700/80 hover:bg-neutral-800/70'
        }`}
      >
        <span
          data-system-home-icon={category === 'folder' ? 'folder' : drive?.type ?? 'drive'}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${
          category === 'folder'
            ? 'bg-amber-300/10 text-amber-300 group-hover:bg-amber-300/15'
            : drive?.type === 'network'
              ? 'bg-indigo-400/10 text-indigo-300'
              : drive?.type === 'removable'
                ? 'bg-violet-400/10 text-violet-300'
                : 'bg-cyan-400/10 text-cyan-300'
        }`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span onMouseEnter={() => handleFolderTooltipMouseEnter(item)} onMouseLeave={() => handleFolderTooltipMouseLeave(item)} className="inline-block max-w-full truncate text-xs text-neutral-100 font-medium" style={getItemNameStyle(item, selected)}>{getDisplayItemName(item, showFileExtensions)}</span>
          {category === 'folder' ? (
            <span className="mt-1 block truncate text-[10px] text-neutral-500">{item.path}</span>
          ) : hasCapacity && drive ? (
            <>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neutral-700/80">
                <span
                  className={`block h-full rounded-full transition-[width] ${usedPercent > 90 ? 'bg-rose-400' : usedPercent > 75 ? 'bg-amber-300' : 'bg-cyan-400'}`}
                  style={{ width: `${usedPercent}%` }}
                />
              </span>
              <span className="mt-1 block truncate text-[10px] text-neutral-400">
                {t.pane.availableOf
                  .replace('{free}', formatFileSize(Math.max(0, drive.totalBytes - drive.usedBytes)))
                  .replace('{total}', formatFileSize(drive.totalBytes))}
              </span>
            </>
          ) : (
            <span className="mt-1 block truncate text-[10px] text-neutral-500">{t.pane.capacityUnavailable}</span>
          )}
        </span>
      </button>
      </Tooltip>
    );
  };

  const systemFolders = files.filter(item => item.id.startsWith('system-location-'));
  const systemVolumes = files.filter(item => item.id.startsWith('system-drive-'));
  const networkVolumes = systemVolumes.filter(item => drives.find(drive => item.id === `system-drive-${drive.id}`)?.type === 'network');
  const deviceVolumes = systemVolumes.filter(item => !networkVolumes.includes(item));
  const sectionHeading = (section: SystemHomeSection, label: string) => {
    const isCollapsed = collapsedSystemHomeSections[section];
    const contentId = `${paneId}-system-home-${section}-content`;
    return (
      <button
        type="button"
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        onClick={() => setCollapsedSystemHomeSections(previous => ({ ...previous, [section]: !previous[section] }))}
        className="collapse-toggle mb-2 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
      >
        <ChevronDown data-collapse-chevron="true" className={`h-3.5 w-3.5 flex-shrink-0 text-neutral-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
        <span className="whitespace-nowrap">{label}</span>
        <span data-collapse-rule="true" className="h-px flex-1 bg-neutral-800" />
      </button>
    );
  };

  const tabStrip = (
      <div className={`flex shrink-0 items-center bg-neutral-950/90 border-neutral-800 px-1 overflow-x-auto no-scrollbar select-none ${tabStripPosition === 'bottom' ? 'border-t pb-1' : 'border-b pt-1'}`}>
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {tabs.map((tabItem, idx) => {
            const isTabActive = idx === activeTabIndex;
            return (
              <div
                key={tabItem.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTab(idx);
                }}
                className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer border-x transition-colors max-w-[180px] min-w-[100px] ${tabStripPosition === 'bottom' ? 'rounded-b-md border-b' : 'rounded-t-md border-t'} ${
                  isTabActive
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-100 relative z-10'
                    : 'bg-neutral-950/40 border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
                }`}
              >
                <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isTabActive ? 'text-cyan-400' : 'text-neutral-500'}`} />
                <span className="truncate text-[11px]">{tabItem.title || t.pane.noFolderOpen}</span>

                {tabs.length > 1 && (
                  <Tooltip label={t.pane.closeTab} placement={tabStripPosition === 'bottom' ? 'top' : 'bottom'}>
                    <button
                      type="button"
                      aria-label={`${t.pane.closeTab}: ${tabItem.title || t.pane.noFolderOpen}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(idx);
                      }}
                      className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          })}

          <Tooltip label={`${t.pane.addTab} (Ctrl+T)`} placement={tabStripPosition === 'bottom' ? 'top' : 'bottom'}>
            <button
              type="button"
              aria-label={t.pane.addTab}
              onClick={(e) => {
                e.stopPropagation();
                onAddTab();
              }}
              className="inline-flex items-center gap-1.5 p-1.5 ml-1 text-neutral-400 hover:text-cyan-300 hover:bg-neutral-800 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <kbd className="keyboard-hint">Ctrl+T</kbd>
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-sans px-2">
          <span>{paneId === 'left' ? t.statusBar.leftPane : t.statusBar.rightPane}</span>
        </div>
      </div>
  );

  return (
    <div
      onClick={onActivate}
      className={`flex flex-col h-full bg-neutral-900/60 overflow-hidden relative border transition-colors ${
        isActive
          ? 'border-cyan-500/50 shadow-sm shadow-cyan-950/40'
          : 'border-neutral-800/80 opacity-90'
      } ${isDragOver ? 'ring-2 ring-cyan-400/80 bg-cyan-950/20' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e)}
    >
      {tabStripPosition === 'top' && tabStrip}

      {/* 2. Navigation & Breadcrumb Bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-neutral-900 border-b border-neutral-800 text-xs select-none">
        <Tooltip label={`${t.toolbar.back} (Alt+${language === 'es' ? 'Izquierda' : 'Left'})`} disabled={tab.historyIndex <= 0}><button onClick={onNavigateBack} disabled={tab.historyIndex <= 0} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowLeft className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={`${t.toolbar.forward} (Alt+${language === 'es' ? 'Derecha' : 'Right'})`} disabled={tab.historyIndex >= tab.history.length - 1}><button onClick={onNavigateForward} disabled={tab.historyIndex >= tab.history.length - 1} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowRight className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={`${t.toolbar.up} (Backspace / Alt+${language === 'es' ? 'Arriba' : 'Up'})`} disabled={isSystemHome}><button onClick={onNavigateUp} disabled={isSystemHome} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowUp className="w-3.5 h-3.5" /></button></Tooltip>

        {/* Breadcrumb Path Box */}
        <div 
          onClick={() => {
            if (isRecycleBin) return;
            setPathInput(isSystemHome ? '' : tab.currentPath);
            setIsEditingPath(true);
          }}
          className={`flex-1 min-w-0 flex h-8 min-h-8 items-center bg-neutral-950 px-2 rounded border border-neutral-800 overflow-hidden ${!isRecycleBin ? 'cursor-text hover:border-neutral-700' : 'cursor-default'}`}
        >
          {isEditingPath ? (
            <form onSubmit={handlePathSubmit} onClick={event => event.stopPropagation()} className="w-full">
              <input
                ref={pathInputRef}
                type="text"
                data-paste-and-go="true"
                value={pathInput}
                placeholder={t.pane.addressPathPlaceholder}
                onChange={(e) => setPathInput(e.target.value)}
                onBlur={() => setIsEditingPath(false)}
                className="w-full bg-transparent text-neutral-100 text-xs outline-none font-sans"
              />
            </form>
          ) : isSystemHome ? (
            <div className="flex items-center gap-1.5 px-1 text-neutral-200 text-xs font-sans">
              <Monitor className="h-3.5 w-3.5 text-cyan-400" />
              <span>{t.sidebar.thisPc}</span>
            </div>
          ) : isRecycleBin ? (
            <div className="flex items-center gap-1.5 px-1 text-neutral-200 text-xs font-sans">
              <Trash2 className="h-3.5 w-3.5 text-rose-300" />
              <span>{t.sidebar.recycleBinTitle}</span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar font-sans text-xs">
              {breadcrumbSegments.length === 0 && <span className="px-1 text-neutral-500">{t.pane.noFolderOpen}</span>}
              {breadcrumbSegments.map((seg, i) => (
                <React.Fragment key={seg.fullPath}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(seg.fullPath);
                    }}
                    className="rounded-md px-1.5 py-1 text-neutral-300 transition-colors duration-150 hover:bg-neutral-800/80 hover:text-neutral-100 active:bg-neutral-700/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 truncate"
                  >
                    {seg.label}
                  </button>
                  {i < breadcrumbSegments.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-neutral-600 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          <Tooltip label={t.pane.recentFolders} placement="bottom">
            <button
              ref={recentFoldersButtonRef}
              type="button"
              aria-label={t.pane.recentFolders}
              aria-haspopup="menu"
              aria-expanded={Boolean(recentFoldersMenuPosition)}
              aria-hidden={isEditingPath}
              tabIndex={isEditingPath ? -1 : undefined}
              disabled={isEditingPath}
              onClick={toggleRecentFoldersMenu}
              className={`ml-auto h-6 w-6 flex-shrink-0 rounded p-1 transition-colors ${isEditingPath ? 'invisible pointer-events-none' : recentFoldersMenuPosition ? 'bg-neutral-800 text-cyan-200' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'}`}
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>

        {recentFoldersMenuPosition && createPortal(
          <div
            ref={recentFoldersMenuRef}
            role="menu"
            aria-label={t.pane.recentFolders}
            style={{ left: recentFoldersMenuPosition.left, top: recentFoldersMenuPosition.top, width: recentFoldersMenuPosition.width }}
            className="fixed z-[110] max-h-[min(24rem,calc(100vh-1rem))] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/95 p-1.5 text-xs shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t.pane.recentFolders}</div>
            {recentFolderPaths.length > 0 ? recentFolderPaths.map(path => (
              <button
                key={path}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPathInput(path);
                  setIsEditingPath(false);
                  setRecentFoldersMenuPosition(null);
                  onNavigate(path);
                }}
                className="flex w-full min-w-0 items-center gap-2 rounded px-2.5 py-2 text-left text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-cyan-200"
              >
                <Folder className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" />
                <span className="min-w-0 flex-1 truncate font-sans">{path}</span>
              </button>
            )) : (
              <div className="px-2.5 py-3 text-center text-neutral-500">{t.pane.noRecentFolders}</div>
            )}
            <div className="my-1 h-px bg-neutral-800" />
            <button
              type="button"
              role="menuitem"
              disabled={recentFolderPaths.length === 0}
              onClick={onClearRecentFolders}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-rose-300 transition-colors hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.pane.clearRecentFolders}</span>
            </button>
          </div>,
          document.body,
        )}

        <Tooltip label={`${t.toolbar.refresh} (F5)`} disabled={!tab.currentPath}><button onClick={() => onRefresh ? onRefresh() : onNavigate(tab.currentPath)} disabled={!tab.currentPath} className="p-1 rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"><RotateCw className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={styleLocked ? t.pane.folderStyleLocked : t.pane.folderStyleUnlocked} placement="bottom">
          <button
            type="button"
            aria-label={styleLocked ? t.pane.folderStyleLocked : t.pane.folderStyleUnlocked}
            aria-pressed={styleLocked}
            onClick={onStyleLockToggle}
            className={`rounded border p-1 transition-colors ${styleLocked ? 'border-cyan-700/60 bg-cyan-950/60 text-cyan-300' : 'border-transparent text-neutral-500 hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-200'}`}
          >
            {styleLocked ? <LockKeyhole className="h-3.5 w-3.5" /> : <UnlockKeyhole className="h-3.5 w-3.5" />}
          </button>
        </Tooltip>
      </div>

      {/* 3. Live Filter Bar (Find as you type) */}
      <div className="px-2 py-1 bg-neutral-950/60 border-b border-neutral-800/80 flex items-center gap-2 text-xs">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-500" />
          <input
            type="text"
            placeholder={t.pane.filterPlaceholder}
            value={tab.filterQuery}
            onChange={(e) => onFilterChange(e.target.value)}
            className="w-full bg-neutral-900 pl-7 pr-7 py-1 rounded text-xs text-neutral-200 placeholder:text-neutral-500 border border-neutral-800 focus:border-cyan-500/60 focus:outline-none font-sans"
          />
          {tab.filterQuery && (
            <button
              onClick={() => onFilterChange('')}
              className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="text-[10px] text-neutral-400 font-sans whitespace-nowrap">
          {files.length} elem.
        </div>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${isSystemHome ? 'overflow-x-hidden' : 'overflow-x-auto'} overflow-y-hidden`}>
        <div className="flex min-h-0 flex-1 flex-col" style={{ width: !isSystemHome && effectiveViewMode === 'details' ? `max(100%, ${detailsTableMinimumWidth}px)` : '100%' }}>
      {/* 4. Column Headers (Details View) */}
      {effectiveViewMode === 'details' && !isSystemHome && (
        <div
          ref={columnHeadersRef}
          className="mx-4 grid shrink-0 items-center gap-2 border-x border-b border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 select-none"
          style={{ width: columnWidths.name === null ? 'calc(100% - 2rem)' : `${detailsRowWidth + viewportScrollbarWidth}px`, gridTemplateColumns: fileGridTemplateColumns, paddingRight: `${8 + viewportScrollbarWidth}px` }}
          onContextMenu={openColumnMenu}
        >
          {visibleFileColumns.map(column => {
            const sortField = columnSortFields[column];
            const isSorted = tab.sortField === sortField;
            const DirectionIcon = isSorted && tab.sortOrder === 'desc' ? ArrowDown : ArrowUp;
            return (
              <Tooltip key={column} label={column === 'extension' ? `${t.pane.columns.extensionTooltip}. ${t.pane.columns.columnHeaderTooltip}` : t.pane.columns.columnHeaderTooltip} placement="bottom">
                <div
                  data-file-column-id={column}
                  onPointerDown={event => beginColumnPointerDrag(column, event)}
                  onPointerMove={moveColumnPointerDrag}
                  onPointerUp={finishColumnPointerDrag}
                  onPointerCancel={finishColumnPointerDrag}
                  onClick={() => {
                    if (suppressColumnSortRef.current) return;
                    onSortChange(sortField);
                  }}
                  className={`group relative flex min-w-0 items-center gap-1 rounded-sm px-1 pr-2 cursor-grab active:cursor-grabbing transition-colors hover:bg-neutral-800/60 hover:text-neutral-100 ${columnDropTarget === column ? 'bg-cyan-950/70 text-cyan-200' : ''} ${column === 'size' || column === 'created' || column === 'modified' ? 'justify-end' : ''}`}
                >
                  <span data-file-column-header={column} className="min-w-0 truncate">{columnLabel(column)}</span>
                  <DirectionIcon aria-hidden="true" className={`h-3 w-3 flex-shrink-0 ${isSorted ? 'text-cyan-400' : 'text-neutral-700'}`} />
                  {resizeHandle(column, columnLabel(column))}
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}

      {columnMenuPosition && (
        createPortal(
          <div
            data-file-column-menu
            role="menu"
            aria-label={t.pane.columns.columnSettings}
            className="fixed z-50 min-w-[200px] overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 py-1 shadow-xl shadow-black/50"
            style={{ left: columnMenuPosition.left, top: columnMenuPosition.top }}
          >
            <div className="border-b border-neutral-800 px-3 py-2 text-[11px] font-semibold text-neutral-200">
              {t.pane.columns.columnSettings}
              <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-neutral-500">{t.pane.columns.manageColumns}</span>
            </div>
            {columnLayout.order.map(column => {
              const isVisible = columnLayout.visible.includes(column);
              return (
                <button
                  key={column}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={isVisible}
                  onClick={() => toggleFileColumn(column)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <span aria-hidden="true" className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${isVisible ? 'border-cyan-500 bg-cyan-950 text-cyan-300' : 'border-neutral-600 text-transparent'}`}>✓</span>
                  <span>{columnLabel(column)}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
      )}

      {columnResizeGuide && createPortal(
        <div
          ref={columnResizeGuideRef}
          aria-hidden="true"
          className={`column-resize-guide pointer-events-none fixed z-[80] w-px rounded-full bg-cyan-200/60 ${columnResizeGuide.fadingOut ? 'column-resize-guide-out' : 'column-resize-guide-in'}`}
          style={{
            left: columnResizeGuide.left,
            top: columnResizeGuide.top,
            height: columnResizeGuide.height,
            transform: 'translateX(-50%)',
          }}
        />,
        document.body,
      )}

      {/* 5. File Items Viewport */}
      <div 
        ref={viewportRef}
        data-cyberfiles-pane-viewport={paneId}
        className={`relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto py-0.5 select-none focus:outline-none ${marqueeBounds ? 'cursor-crosshair' : ''}`}
        tabIndex={0}
        onScroll={event => {
          if (!hasMore || isLoadingDirectory || !onLoadMore) return;
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
          if (scrollHeight - scrollTop - clientHeight <= Math.max(500, clientHeight)) onLoadMore();
        }}
        onClick={handleViewportClick}
        onContextMenu={handleViewportContextMenu}
        onDoubleClick={handleViewportDoubleClick}
        onPointerDown={handleMarqueePointerDown}
        onPointerMove={handleMarqueePointerMove}
        onPointerUp={finishMarqueeSelection}
        onPointerCancel={finishMarqueeSelection}
      >
        {marqueeBounds && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-20 border border-cyan-300/90 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(8,145,178,0.2)]"
            style={marqueeBounds}
          />
        )}
        <div
          key={`${tab.id}:${tab.currentPath}`}
          className={`min-h-full ${navigationTransition?.tabId === tab.id && navigationTransition.path === tab.currentPath ? `cyberfiles-navigation-transition cyberfiles-navigation-${navigationTransitionStyle} cyberfiles-navigation-${navigationTransition.motion}` : ''}`}
          onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.animationName.startsWith('cyberfiles-navigation-')) {
              setNavigationTransition(null);
            }
          }}
        >
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-2 p-6">
            {isLoadingDirectory ? <RotateCw className="w-7 h-7 text-cyan-500 animate-spin" /> : <Folder className="w-8 h-8 text-neutral-600 stroke-[1.5]" />}
            <div className="text-xs">{isLoadingDirectory ? t.pane.loadingFolder : tab.currentPath ? t.pane.emptyFolder : t.pane.noFolderOpen}</div>
            {!isLoadingDirectory && !tab.filterQuery && tab.currentPath && !isSystemHome && !isRecycleBin && getParentPath(tab.currentPath) !== tab.currentPath && (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-[11px] tracking-wide text-neutral-500">
                <CornerUpLeft className="h-3 w-3 text-cyan-500/80" aria-hidden="true" />
                <span>{emptyAreaDoubleClickNavigatesUp ? t.pane.emptyFolderDoubleClickHint : t.pane.emptyFolderBackspaceHint}</span>
              </div>
            )}
            {tab.filterQuery && (
              <button 
                onClick={() => onFilterChange('')}
                className="text-[11px] text-cyan-400 hover:underline"
              >
                Limpiar filtro de búsqueda
              </button>
            )}
          </div>
        ) : isSystemHome ? (
          <div className="space-y-5 p-3 sm:p-4">
            {systemFolders.length > 0 && (
              <section>
                {sectionHeading('folders', t.pane.systemFolders.replace('{count}', String(systemFolders.length)))}
                <div id={`${paneId}-system-home-folders-content`} style={{ display: collapsedSystemHomeSections.folders ? 'none' : undefined }} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                  {systemFolders.map(item => renderSystemHomeCard(item, files.indexOf(item), 'folder'))}
                </div>
              </section>
            )}
            {deviceVolumes.length > 0 && (
              <section>
                {sectionHeading('devices', t.pane.systemDevices.replace('{count}', String(deviceVolumes.length)))}
                <div id={`${paneId}-system-home-devices-content`} style={{ display: collapsedSystemHomeSections.devices ? 'none' : undefined }} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                  {deviceVolumes.map(item => renderSystemHomeCard(item, files.indexOf(item), 'drive'))}
                </div>
              </section>
            )}
            {networkVolumes.length > 0 && (
              <section>
                {sectionHeading('network', t.pane.systemNetwork.replace('{count}', String(networkVolumes.length)))}
                <div id={`${paneId}-system-home-network-content`} style={{ display: collapsedSystemHomeSections.network ? 'none' : undefined }} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                  {networkVolumes.map(item => renderSystemHomeCard(item, files.indexOf(item), 'network'))}
                </div>
              </section>
            )}
          </div>
        ) : effectiveViewMode === 'details' ? (
          <div className="space-y-0.5 px-4">
            {fileGroups.map(group => {
              const groupCollapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
              const groupCollapsed = collapsedGroups[groupCollapseKey] === true;
              return (
              <React.Fragment key={`file-group-${groupCollapseKey}`}>
              {renderFileGroupHeading(group)}
              {!groupCollapsed && group.items.map(item => {
              const idx = files.indexOf(item);
              const isSelected = visibleSelectedIds.includes(item.id);
              const isEditing = editingItemId === item.id;
              const isZebra = idx % 2 === 1;

              return (
                <div
                  key={item.id}
                  data-file-item="true"
                  data-file-id={item.id}
                  draggable={!item.recycleBinId}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDrop={(e) => {
                    if (item.isFolder && !item.recycleBinId) {
                      e.stopPropagation();
                      handleDrop(e, item);
                    }
                  }}
                  onClick={(e) => { handleItemClick(e, item, idx); handleConfiguredSingleClick(e, item); }}
                  onDoubleClick={() => handleConfiguredDoubleClick(item)}
                  onContextMenu={event => handleFileItemContextMenu(event, item)}
                  style={{ width: columnWidths.name === null ? '100%' : `${detailsRowWidth}px`, gridTemplateColumns: fileGridTemplateColumns, cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getItemBackgroundStyle(item, isSelected) }}
                  className={`grid min-h-[30px] items-center gap-2 border px-2 py-1 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-950/70 border-cyan-700/60 text-neutral-100 font-medium'
                      : isZebra
                        ? 'bg-neutral-900/30 border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100'
                        : 'bg-transparent border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100'
                  }`}
                >
                  {visibleFileColumns.map(column => {
                    if (column === 'extension') {
                      return <div key={column} className="min-w-0 truncate font-sans text-[10px] uppercase text-neutral-400"><span data-file-column-content={column} className="inline-block max-w-none whitespace-nowrap">{item.isFolder || !showFileExtensions ? '' : (item.extension || '')}</span></div>;
                    }
                    if (column === 'name') {
                      return (
                        <div key={column} className="flex min-w-0 items-center gap-2">
                          <span className="flex-shrink-0">{getDisplayFileIcon(item)}</span>
                          {item.colorLabel && (
                            <span data-file-name-decoration="color-label" className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              item.colorLabel === 'red' ? 'bg-red-400' :
                              item.colorLabel === 'blue' ? 'bg-blue-400' :
                              item.colorLabel === 'green' ? 'bg-emerald-400' :
                              item.colorLabel === 'yellow' ? 'bg-amber-400' : 'bg-purple-400'
                            }`} />
                          )}
                          {isEditing ? (
                            renderInlineRenameInput(item, 'min-w-0 flex-1')
                          ) : (
                            <Tooltip label={renderItemTooltip(item)} placement="top">
                              <span data-file-column-content={column} onMouseEnter={() => handleFolderTooltipMouseEnter(item)} onMouseLeave={() => handleFolderTooltipMouseLeave(item)} className="truncate text-[11.5px] font-medium" style={getItemNameStyle(item, isSelected)} >{getDisplayItemName(item, showFileExtensions)}</span>
                            </Tooltip>
                          )}
                        </div>
                      );
                    }
                    if (column === 'type') {
                      return <div key={column} className="min-w-0 truncate font-sans text-[10px] text-neutral-400"><span data-file-column-content={column}>{getFileTypeLabel(item)}</span></div>;
                    }
                    if (column === 'size') {
                      const folderSize = folderSizeStates[item.id];
                      return <div key={column} className="min-w-0 text-right font-sans text-[11px] text-neutral-400" style={getRelativeGraphStyle(relativeGraphWidths.get(item.id)?.size, 'size')}>{item.isFolder ? (
                        isTauriDesktop() && !isRecycleBin && !item.recycleBinId ? (
                          folderSize?.status === 'done' ? (
                            <span data-file-column-content={column} className="inline-flex h-5 min-w-[44px] items-center justify-end whitespace-nowrap leading-none">{formatFileSize(folderSize.size ?? 0)}</span>
                          ) : (
                            <Tooltip label={folderSize?.status === 'error' ? t.pane.folderSizeFailed : t.pane.folderSizeTooltip} placement="top">
                              <button type="button" disabled={folderSize?.status === 'loading'} onClick={event => { void calculateFolderSize(item, event); }} className="ml-auto inline-flex h-5 w-[44px] shrink-0 items-center justify-end gap-1 rounded px-1 py-0 text-right leading-none text-neutral-400 transition-colors hover:bg-neutral-800/70 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-70" aria-label={folderSize?.status === 'error' ? t.pane.folderSizeFailed : t.pane.folderSizeTooltip}>
                                <span data-file-column-content={column} className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <span className={folderSize?.status === 'loading' ? 'invisible' : ''}>{folderSize?.status === 'error' ? '!' : t.pane.folderSizeCalculate}</span>
                                  <span className="grid h-3 w-3 flex-shrink-0 place-items-center">
                                    {folderSize?.status === 'loading'
                                      ? <LoaderCircle className="h-3 w-3 animate-spin" />
                                      : (!folderSize || folderSize.status === 'error') ? <Calculator className="h-3 w-3" /> : null}
                                  </span>
                                </span>
                              </button>
                            </Tooltip>
                          )
                        ) : <span data-file-column-content={column} className="inline-block max-w-none whitespace-nowrap">--</span>
                      ) : <span data-file-column-content={column} className="inline-block max-w-none whitespace-nowrap">{formatFileSize(item.size)}</span>}</div>;
                    }
                    if (column === 'created') {
                      const createdDate = formatDateTimeForDisplay(item.createdAtMs, item.createdDate, dateFormat, language);
                      return <div key={column} className="min-w-0 text-right font-sans text-[10px] text-neutral-400" style={getRelativeGraphStyle(relativeGraphWidths.get(item.id)?.created, 'date')}><span data-file-column-content={column} className="inline-block max-w-none whitespace-nowrap">{createdDate || '--'}</span></div>;
                    }
                    const modifiedDate = formatDateTimeForDisplay(item.modifiedAtMs, item.modifiedDate, dateFormat, language);
                    return <div key={column} className="min-w-0 text-right font-sans text-[10px] text-neutral-400" style={getRelativeGraphStyle(relativeGraphWidths.get(item.id)?.modified, 'date')}><span data-file-column-content={column} className="inline-block max-w-none whitespace-nowrap">{modifiedDate || '--'}</span></div>;
                  })}
                </div>
              );
              })}
              </React.Fragment>
              );
            })}
          </div>
        ) : effectiveViewMode === 'compact' ? (
          <div className="grid grid-cols-1 gap-x-2 gap-y-1 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {fileGroups.map(group => {
              const groupCollapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
              const groupCollapsed = collapsedGroups[groupCollapseKey] === true;
              return <React.Fragment key={`compact-group-${groupCollapseKey}`}>
              {renderFileGroupHeading(group)}
              {!groupCollapsed && group.items.map(item => {
              const idx = files.indexOf(item);
              const isSelected = visibleSelectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  data-file-item="true"
                  data-file-id={item.id}
                  draggable={!item.recycleBinId}
                  onDragStart={event => handleDragStart(event, item)}
                  onDrop={event => {
                    if (item.isFolder && !item.recycleBinId) {
                      event.stopPropagation();
                      handleDrop(event, item);
                    }
                  }}
                  onClick={event => { handleItemClick(event, item, idx); handleConfiguredSingleClick(event, item); }}
                  onDoubleClick={() => handleConfiguredDoubleClick(item)}
                  onContextMenu={event => handleFileItemContextMenu(event, item)}
                  style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getItemBackgroundStyle(item, isSelected) }}
                  className={`flex min-w-0 items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? 'border-cyan-700/60 bg-cyan-950/70 text-neutral-100'
                      : 'border-transparent text-neutral-300 hover:border-neutral-800 hover:bg-neutral-800/60 hover:text-neutral-100'
                  }`}
                >
                  <span className="flex-shrink-0">{getDisplayFileIcon(item)}</span>
                  {editingItemId === item.id ? (
                    renderInlineRenameInput(item, 'min-w-0 flex-1')
                  ) : (
                    <Tooltip label={renderItemTooltip(item)} placement="top">
                      <span className="min-w-0 flex-1">
                        <span onMouseEnter={() => handleFolderTooltipMouseEnter(item)} onMouseLeave={() => handleFolderTooltipMouseLeave(item)} className="inline-block max-w-full truncate" style={getItemNameStyle(item, isSelected)}>{getDisplayItemName(item, showFileExtensions)}</span>
                      </span>
                    </Tooltip>
                  )}
                  {!item.isFolder && <span className="flex-shrink-0 font-sans text-[10px] text-neutral-500">{formatFileSize(item.size)}</span>}
                </div>
              );
              })}
              </React.Fragment>;
            })}
          </div>
        ) : (
          /* Icons / Grid View */
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {fileGroups.map(group => {
              const groupCollapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
              const groupCollapsed = collapsedGroups[groupCollapseKey] === true;
              return <React.Fragment key={`icons-group-${groupCollapseKey}`}>
              {renderFileGroupHeading(group)}
              {!groupCollapsed && group.items.map(item => {
              const idx = files.indexOf(item);
              const isSelected = visibleSelectedIds.includes(item.id);

              return (
                <div
                  key={item.id}
                  data-file-item="true"
                  data-file-id={item.id}
                  draggable={!item.recycleBinId}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onClick={(e) => { handleItemClick(e, item, idx); handleConfiguredSingleClick(e, item); }}
                  onDoubleClick={() => handleConfiguredDoubleClick(item)}
                  onContextMenu={event => handleFileItemContextMenu(event, item)}
                  style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getItemBackgroundStyle(item, isSelected) }}
                  className={`flex min-w-0 flex-col items-center justify-start gap-1.5 rounded-lg border p-2.5 text-center cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-950/70 border-cyan-600/70 text-neutral-100 shadow'
                      : 'border-neutral-800/40 bg-neutral-950/30 text-neutral-300 hover:bg-neutral-800/60 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex w-full items-center justify-center">
                    {item.type === 'image' ? (
                      <ImageFileThumbnail item={item} fallback={getFileIcon(item.type, item.isFolder)} />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900/80">
                        {getDisplayFileIcon(item, 'large')}
                      </div>
                    )}
                  </div>
                  {editingItemId === item.id ? (
                    renderInlineRenameInput(item, 'w-full min-w-0', 'text-center')
                  ) : (
                    <Tooltip label={renderItemTooltip(item)} placement="top">
                      <span className="w-full min-w-0 px-1">
                        <span onMouseEnter={() => handleFolderTooltipMouseEnter(item)} onMouseLeave={() => handleFolderTooltipMouseLeave(item)} className="inline-block max-w-full truncate text-[11px] font-medium" style={getItemNameStyle(item, isSelected)}>{getDisplayItemName(item, showFileExtensions)}</span>
                      </span>
                    </Tooltip>
                  )}
                  <span className="mt-0.5 text-[9px] font-sans text-neutral-400">
                    {item.isFolder ? 'Carpeta' : formatFileSize(item.size)}
                  </span>
                </div>
              );
              })}
              </React.Fragment>;
            })}
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center border-t border-neutral-800/70 p-3">
            <button
              type="button"
              disabled={isLoadingDirectory}
              onClick={onLoadMore}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingDirectory ? t.pane.loadingFolder : t.pane.loadMore}
            </button>
          </div>
        )}
        </div>
        </div>
        </div>
      </div>

      {tabStripPosition === 'bottom' && tabStrip}

      {/* 6. Footer Status Bar with Mini Storage Distribution Strip */}
      <div className="px-2.5 py-1 bg-neutral-950 border-t border-neutral-800 text-[10px] font-sans text-neutral-400 flex items-center justify-between select-none gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span>{files.length} objetos</span>
          {selectedFiles.length > 0 ? (
            <span className="text-cyan-300 font-semibold truncate">
              {selectedFiles.length} selec. ({formatFileSize(selectedBytes)})
            </span>
          ) : (
            <span className="text-neutral-500 hidden sm:inline">
              ({formatFileSize(folderBytes)})
            </span>
          )}
        </div>

        {hasMore && <span className="hidden min-w-0 flex-1 truncate text-center text-cyan-500/80 sm:block">{t.pane.moreItemsAvailable}</span>}

        <div className="text-neutral-500 hidden lg:block">
          F2: Renombrar · F5: Copiar · F6: Mover · F3: Ver
        </div>
      </div>
    </div>
  );
};
