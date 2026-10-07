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
  Home,
} from 'lucide-react';
import { DriveInfo, FileItem, FileType, GroupByField, HiddenItemStyle, SortField, TabState, ViewMode, RECYCLE_BIN_PATH, SYSTEM_HOME_PATH, RecentItemStyle, TabCloseButtonMode } from '../types';
import { formatDateTimeForDisplay, type DateFormatMode } from '../utils/dateTime';
import { formatFileSize, getParentPath } from '../utils/fileSystem';
import { calculateNativeFolderSize, cancelNativeFolderSizeCalculation, getNativeFileIcons, isTauriDesktop, loadNativeImageThumbnail, pauseNativeFolderSizeCalculation, resumeNativeFolderSizeCalculation, startNativeFolderSizeCalculation, type NativeFileIconRequest } from '../utils/nativeFileSystem';
import { formatFolderContentLabel, loadFolderContentSummary, type FolderContentSummary } from '../utils/folderContent';
import { advanceMouseGesturePath, MOUSE_GESTURE_MIN_DISTANCE, type MouseGesturePath } from '../utils/mouseGesture';
import { getCustomFolderIcon, type SavedFolderIcons } from '../utils/folderIconPreferences';
import { FolderIconRenderer, FolderStatusBadge } from './folderIconsData';
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
  showNewTabButton: boolean;
  doubleClickTabBar: boolean;
  tabCloseButtonMode?: TabCloseButtonMode;
  isActive: boolean;
  styleLocked: boolean;
  recentItemStyle: RecentItemStyle;
  hiddenItemStyle: HiddenItemStyle;
  emptyAreaDoubleClickNavigatesUp: boolean;
  mouseGesturesEnabled: boolean;
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
  onTabContextMenu: (index: number, x: number, y: number) => void;
  onTabStripContextMenu: (x: number, y: number) => void;
  files: FileItem[];
  customFolderIcons?: SavedFolderIcons;
  recentFolderPaths: string[];
  onClearRecentFolders: () => void;
  autoFolderSizeEnabled: boolean;
  relativeGraphsEnabled: boolean;
  dateFormat: DateFormatMode;
  drives: DriveInfo[];
  hasMore?: boolean;
  totalItemCount?: number;
  isLoadingDirectory?: boolean;
  flatViewStatus?: { error?: string; skippedCount?: number };
  onLoadMore?: () => void;
  allFiles: FileItem[];
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onNavigateUp: () => void;
  onFilterChange: (query: string) => void;
  onSelectItems: (ids: string[], isAdditive?: boolean, isRange?: boolean, replaceExactly?: boolean, focusedId?: string) => void;
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
type FolderChildCountState = { status: 'loading' | 'error' } | { status: 'done'; summary: FolderContentSummary; checkedAt: number };
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

interface MouseGestureDrag {
  pointerId: number;
  target: Element;
  startX: number;
  startY: number;
  path: MouseGesturePath;
  pathData: string;
  moved: boolean;
}

const MOUSE_GESTURE_MENU_TOLERANCE = 12;
const MOUSE_GESTURE_HOLD_TIMEOUT = 2000;
const FOLDER_SIZE_HOVER_DELAY_MS = 2000;

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
  showNewTabButton,
  doubleClickTabBar,
  tabCloseButtonMode = 'hover',
  isActive,
  styleLocked,
  recentItemStyle,
  hiddenItemStyle,
  emptyAreaDoubleClickNavigatesUp,
  mouseGesturesEnabled,
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
  onTabContextMenu,
  onTabStripContextMenu,
  files,
  customFolderIcons,
  recentFolderPaths,
  onClearRecentFolders,
  autoFolderSizeEnabled,
  relativeGraphsEnabled,
  dateFormat,
  drives,
  hasMore = false,
  totalItemCount,
  isLoadingDirectory = false,
  flatViewStatus,
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
  const showBreadcrumbHome = isTauriDesktop();
  const effectiveViewMode = tab.viewMode;
  const nativeFileIconSize = effectiveViewMode === 'icons' ? 'large' : 'small';
  const nativeFileIconScope = `${tab.currentPath}\u0000${nativeFileIconSize}`;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [recentFoldersMenuPosition, setRecentFoldersMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [breadcrumbMenuPosition, setBreadcrumbMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [firstVisibleBreadcrumb, setFirstVisibleBreadcrumb] = useState(0);
  const [pathInput, setPathInput] = useState(tab.currentPath);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const renameCommitItemRef = useRef<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedSystemHomeSections, setCollapsedSystemHomeSections] = useState(() => readCollapsedSystemHomeSections(paneId));
  const [folderSizeStates, setFolderSizeStates] = useState<Record<string, FolderSizeState>>({});
  const folderSizeStatesRef = useRef(folderSizeStates);
  folderSizeStatesRef.current = folderSizeStates;
  const [folderChildCounts, setFolderChildCounts] = useState<Record<string, FolderChildCountState>>({});
  const folderChildCountsRef = useRef(folderChildCounts);
  folderChildCountsRef.current = folderChildCounts;
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
  const typeAheadRef = useRef({ query: '', at: 0 });
  const selectionAnchorsRef = useRef(new Map<string, string>());
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
  const breadcrumbViewportRef = useRef<HTMLDivElement>(null);
  const breadcrumbMeasureRef = useRef<HTMLDivElement>(null);
  const breadcrumbMenuButtonRef = useRef<HTMLButtonElement>(null);
  const breadcrumbMenuRef = useRef<HTMLDivElement>(null);
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const verticalTabListRef = useRef<HTMLDivElement>(null);
  const lastScrolledFocusedIdRef = useRef<string | null>(null);
  const columnHeadersRef = useRef<HTMLDivElement>(null);
  const horizontalScrollContainerRef = useRef<HTMLDivElement>(null);
  const marqueeDragRef = useRef<MarqueeDrag | null>(null);
  const mouseGestureDragRef = useRef<MouseGestureDrag | null>(null);
  const replayingGestureContextMenuRef = useRef(false);
  const suppressGestureContextMenuUntilRef = useRef(0);
  const mouseGestureHoldTimerRef = useRef<number | null>(null);
  const mouseGestureFadeTimerRef = useRef<number | null>(null);
  const mouseGestureTrailRef = useRef<SVGSVGElement>(null);
  const mouseGestureTrailPathRef = useRef<SVGPathElement>(null);
  const mouseGestureTrailTipRef = useRef<SVGCircleElement>(null);
  const mouseGestureTrailMarkerRef = useRef<SVGTextElement>(null);
  useEffect(() => () => {
    if (mouseGestureHoldTimerRef.current !== null) window.clearTimeout(mouseGestureHoldTimerRef.current);
    if (mouseGestureFadeTimerRef.current !== null) window.clearTimeout(mouseGestureFadeTimerRef.current);
  }, []);
  const marqueePreviewIdsRef = useRef<string[] | null>(null);
  const suppressViewportClickRef = useRef(false);
  const [marqueeBounds, setMarqueeBounds] = useState<MarqueeBounds | null>(null);
  const [marqueePreviewIds, setMarqueePreviewIds] = useState<string[] | null>(null);
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0);
  const [viewportWindow, setViewportWindow] = useState({ top: 0, height: 600, screenWidth: window.innerWidth });
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportWindow(previous => {
      const next = { top: viewport.scrollTop, height: viewport.clientHeight, screenWidth: window.innerWidth };
      return previous.top === next.top && previous.height === next.height && previous.screenWidth === next.screenWidth
        ? previous : next;
    });
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [tab.currentPath, tab.id, effectiveViewMode]);
  useEffect(() => {
    if (tabStripPosition !== 'left' && tabStripPosition !== 'right') return;
    const list = verticalTabListRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active-folder-tab="true"]');
    if (!list || !active) return;
    const listBounds = list.getBoundingClientRect();
    const tabBounds = active.getBoundingClientRect();
    if (tabBounds.top < listBounds.top) list.scrollTop += tabBounds.top - listBounds.top;
    else if (tabBounds.bottom > listBounds.bottom) list.scrollTop += tabBounds.bottom - listBounds.bottom;
  }, [activeTabIndex, tabStripPosition, tabs[activeTabIndex]?.id]);

  const visibleFileColumns = columnLayout.order.filter(column =>
    columnLayout.visible.includes(column) || (editingItemId !== null && column === 'name'),
  );
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
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    if (horizontalScrollContainerRef.current) horizontalScrollContainerRef.current.scrollLeft = 0;
  }, [tab.id, tab.currentPath]);

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
      ...(backgroundStyle ? {
        borderRadius: 3,
        paddingInline: 3,
        ...(selected ? {
          backgroundColor: `color-mix(in srgb, ${backgroundStyle.backgroundColor} 18%, transparent)`,
        } : {}),
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

  const renderFolderSizeStatus = (item: FileItem) => {
    const folderSize = folderSizeStates[item.id];
    const isWaitingHover = !folderSize && autoFolderSizeEnabled && isTauriDesktop();

    let text = '';
    if (folderSize?.status === 'done') {
      text = t.pane.folderSizeTotal.replace('{size}', formatFileSize(folderSize.size ?? 0));
    } else if (folderSize?.status === 'loading') {
      text = t.pane.folderSizeCalculating.replace('{size}', formatFileSize(folderSize.size ?? 0)).replace('{entries}', String(folderSize.entriesScanned ?? 0));
    } else if (folderSize?.status === 'paused') {
      text = t.pane.folderSizePaused.replace('{size}', formatFileSize(folderSize.size ?? 0)).replace('{entries}', String(folderSize.entriesScanned ?? 0));
    } else if (folderSize?.status === 'error') {
      text = t.pane.folderSizeFailed;
    } else if (!autoFolderSizeEnabled) {
      text = t.pane.folderSizeHoverDisabled;
    } else {
      text = isTauriDesktop() ? t.pane.folderSizeHoverHint : t.pane.folderSizeHoverDesktopOnly;
    }

    return (
      <div className="relative mt-1 flex h-6 w-full items-center justify-center gap-1.5 overflow-hidden rounded border border-cyan-400/20 bg-cyan-950/20 px-2 text-[10px] text-cyan-200">
        {folderSize?.status === 'loading' && (
          <LoaderCircle className="h-2.5 w-2.5 animate-spin text-cyan-300 shrink-0" />
        )}
        <span className="min-w-0 truncate">{text}</span>
        {isWaitingHover && (
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-cyan-950/70">
            <div
              key={item.id}
              className="cyberfiles-folder-hover-progress h-full w-full origin-left bg-gradient-to-r from-cyan-600 via-cyan-300 to-white shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              style={{ animationDuration: `${FOLDER_SIZE_HOVER_DELAY_MS}ms` }}
            />
          </div>
        )}
      </div>
    );
  };

  const flatParentLabel = (item: FileItem) => {
    if (!tab.flatView) return '';
    const root = tab.currentPath.replace(/[\\/]+$/, '');
    const parent = getParentPath(item.path);
    if (!parent.toLowerCase().startsWith(`${root.toLowerCase()}\\`) && parent.toLowerCase() !== root.toLowerCase()) return parent;
    return parent.slice(root.length).replace(/^[\\/]+/, '');
  };

  const renderFolderContents = (item: FileItem) => {
    const state = folderChildCounts[item.id];
    return (
      <div className="mt-1 h-[76px] w-full overflow-hidden rounded-md border border-cyan-400/20 bg-cyan-950/20 px-2 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300">{t.pane.folderTooltipContents}</div>
        {state?.status === 'done' ? (
          <>
            <div className="mt-1 flex justify-center gap-3 text-[11px] text-neutral-100">
              <span>{t.pane.folderTooltipFiles.replace('{count}', new Intl.NumberFormat(language).format(state.summary.fileCount))}</span>
              <span>{t.pane.folderTooltipFolders.replace('{count}', new Intl.NumberFormat(language).format(state.summary.folderCount))}</span>
            </div>
            <div className="mt-1 truncate text-[10px] text-cyan-100">
              {t.pane.folderContentTypeLabel}: {formatFolderContentLabel(state.summary, t.pane.folderContentKinds)}
            </div>
          </>
        ) : (
          <div className="mt-1 text-[10px] text-neutral-400">
            {state?.status === 'error' ? t.pane.folderTooltipCountFailed : t.pane.folderTooltipCounting}
          </div>
        )}
      </div>
    );
  };

  const renderItemTooltip = (item: FileItem, additionalDetails?: React.ReactNode) => (
    <div className={`flex flex-col items-center gap-1 text-center ${item.isFolder ? 'w-64 max-w-[calc(100vw-2rem)]' : 'max-w-[18rem]'}`}>
      {imageTooltipThumbnailsEnabled && item.type === 'image' && !item.isFolder && (
        <ImageFileThumbnail
          item={item}
          fallback={getFileIcon(item.type, item.isFolder)}
          className="h-28 w-48"
          fit="contain"
        />
      )}
      <span className={`font-semibold ${item.isFolder ? 'block w-full break-all' : ''}`}>{item.name}</span>
      {item.path && <span className={`font-sans text-[10px] text-cyan-200 ${item.isFolder ? 'block w-full truncate' : 'break-all'}`}>{item.path}</span>}
      {item.isFolder && !item.recycleBinId && !isRecycleBin && (
        <>
          {renderFolderContents(item)}
          {renderFolderSizeStatus(item)}
        </>
      )}
      {!item.isFolder && <span>{formatFileSize(item.size)}</span>}
      {(item.modifiedDate || item.modifiedAtMs !== undefined) && (
        <span className={`text-[10px] text-neutral-300 ${item.isFolder ? 'block w-full truncate' : ''}`}>
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

  const responsiveColumnWidth = (column: FileColumn) => {
    const weight = column === 'name' ? columnWidths.name ?? 260 : columnWidths[column];
    return `minmax(${column === 'name' ? '100px' : '0px'}, ${weight}fr)`;
  };
  const fileGridTemplateColumns = visibleFileColumns
    .map(column => styleLocked ? columnWidth(column) : responsiveColumnWidth(column))
    .join(' ');
  const detailsRowWidth = visibleFileColumns.reduce((total, column) => total + (column === 'name' ? columnWidths.name ?? MIN_NAME_COLUMN_WIDTH : columnWidths[column]), 0)
    + Math.max(0, visibleFileColumns.length - 1) * 8 + 18;
  const detailsContentWidth = styleLocked && columnWidths.name !== null ? `${detailsRowWidth}px` : '100%';
  const detailsHeaderWidth = styleLocked && columnWidths.name !== null ? `${detailsRowWidth + viewportScrollbarWidth}px` : '100%';
  const getFileTypeLabel = (item: FileItem) => t.pane.folderTypeLabels[item.type]
    .replace('{extension}', item.extension.toUpperCase()).trim();
  const getGroupForItem = React.useCallback((item: FileItem): { id: string; label: string } => {
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
  }, [tab.groupBy, t]);
  const fileGroups = React.useMemo(() => {
    if (!tab.groupBy || tab.groupBy === 'none') return [{ id: 'all', label: '', items: files }];
    const groups = new Map<string, { id: string; label: string; items: FileItem[] }>();
    files.forEach(item => {
      const group = getGroupForItem(item);
      const existing = groups.get(group.id);
      if (existing) existing.items.push(item);
      else groups.set(group.id, { ...group, items: [item] });
    });
    return [...groups.values()];
  }, [files, getGroupForItem, tab.groupBy]);
  const navigableFiles = React.useMemo(() => fileGroups.flatMap(group =>
    collapsedGroups[`${paneId}:${tab.id}:${tab.groupBy}:${group.id}`] ? [] : group.items
  ), [fileGroups, collapsedGroups, paneId, tab.id, tab.groupBy]);
  const selectionContext = `${tab.id}\u0000${tab.currentPath}`;
  const navigableIdSet = React.useMemo(() => new Set(navigableFiles.map(item => item.id)), [navigableFiles]);
  const selectedIdSet = React.useMemo(() => new Set(tab.selectedIds), [tab.selectedIds]);
  const fileIndexById = React.useMemo(() => new Map(files.map((item, index) => [item.id, index])), [files]);
  const virtualizeFiles = !isSystemHome && files.length > 300;
  const virtualColumns = effectiveViewMode === 'details' ? 1
    : effectiveViewMode === 'compact' ? viewportWindow.screenWidth >= 1024 ? 3 : viewportWindow.screenWidth >= 640 ? 2 : 1
      : viewportWindow.screenWidth >= 1280 ? 5 : viewportWindow.screenWidth >= 768 ? 4 : viewportWindow.screenWidth >= 640 ? 3 : 2;
  const rowStride = effectiveViewMode === 'details' ? 32 : effectiveViewMode === 'compact' ? 34 : 156;
  const headingStride = effectiveViewMode === 'details' ? 30 : effectiveViewMode === 'compact' ? 32 : 40;
  const focusedGroupPosition = React.useMemo(() => {
    if (!tab.focusedId) return null;
    for (const group of fileGroups) {
      const index = group.items.findIndex(item => item.id === tab.focusedId);
      if (index >= 0) return { groupId: group.id, index };
    }
    return null;
  }, [fileGroups, tab.focusedId]);
  let groupTop = 0;
  const focusedVirtualOffset = new Map<string, number>();
  const renderGroups = fileGroups.map(group => {
    const collapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
    const collapsed = collapsedGroups[collapseKey] === true;
    const headingHeight = group.label ? headingStride : 0;
    const rows = collapsed ? 0 : Math.ceil(group.items.length / virtualColumns);
    const groupHeight = headingHeight + rows * rowStride;
    const itemTop = groupTop + headingHeight;
    if (tab.focusedId && focusedGroupPosition?.groupId === group.id && !collapsed) {
      focusedVirtualOffset.set(tab.focusedId, itemTop + Math.floor(focusedGroupPosition.index / virtualColumns) * rowStride);
    }
    const groupStart = groupTop;
    groupTop += groupHeight;
    if (!virtualizeFiles) {
      return { ...group, visibleItems: group.items, renderHeading: true, before: 0, after: 0 };
    }
    const bandStart = viewportWindow.top - 800;
    const bandEnd = viewportWindow.top + viewportWindow.height + 800;
    if (groupTop < bandStart || groupStart > bandEnd) {
      return { ...group, visibleItems: [], renderHeading: false, before: groupHeight, after: 0 };
    }
    const firstRow = Math.max(0, Math.min(rows, Math.floor((bandStart - itemTop) / rowStride)));
    const lastRow = Math.max(firstRow, Math.min(rows, Math.ceil((bandEnd - itemTop) / rowStride)));
    return {
      ...group,
      visibleItems: collapsed ? [] : group.items.slice(firstRow * virtualColumns, lastRow * virtualColumns),
      renderHeading: true,
      before: firstRow * rowStride,
      after: (rows - lastRow) * rowStride,
    };
  });
  const renderedFiles = renderGroups.flatMap(group => group.visibleItems);

  const { requests: nativeFileIconRequests, key: nativeFileIconRequestKey } = React.useMemo(() => {
    const requests: NativeFileIconRequest[] = [];
    const keyParts: string[] = [];
    renderedFiles.forEach(item => {
      if (item.isFolder || item.recycleBinId || !item.path) return;
      requests.push({ id: item.id, path: item.path });
      keyParts.push(`${item.id}\u0000${item.path}\u0000${item.modifiedAtMs ?? ''}`);
    });
    keyParts.sort();
    return { requests, key: keyParts.join('\u0001') };
  }, [renderedFiles]);
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
          className={`collapse-toggle sticky top-0 z-[1] col-span-full flex w-full ${virtualizeFiles ? 'h-7' : ''} items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70`}
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
    }, FOLDER_SIZE_HOVER_DELAY_MS);
    folderSizeHoverTimersRef.current.set(item.id, timer);
  };
  const loadFolderChildCounts = async (item: FileItem) => {
    if (!tooltipsEnabled || !item.path) return;
    const cached = folderChildCountsRef.current[item.id];
    if (cached?.status === 'loading' || (cached?.status === 'done' && Date.now() - cached.checkedAt < 30_000)) return;
    const loading: FolderChildCountState = { status: 'loading' };
    folderChildCountsRef.current = { ...folderChildCountsRef.current, [item.id]: loading };
    setFolderChildCounts(previous => ({ ...previous, [item.id]: loading }));
    let nextState: FolderChildCountState;
    try {
      const summary = await loadFolderContentSummary(item);
      nextState = { status: 'done', summary, checkedAt: summary.scannedAt };
    } catch {
      nextState = { status: 'error' };
    }
    setFolderChildCounts(previous => ({ ...previous, [item.id]: nextState }));
  };
  const handleFolderTooltipMouseEnter = (item: FileItem) => {
    if (!item.isFolder || item.recycleBinId || isRecycleBin) return;
    void loadFolderChildCounts(item);
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

  const detailsTableMinimumWidth = styleLocked
    ? visibleFileColumns.reduce((total, column) => total + (column === 'name' ? columnWidths.name ?? MIN_NAME_COLUMN_WIDTH : columnWidths[column]), 0)
      + Math.max(0, visibleFileColumns.length - 1) * 8 + 18 + viewportScrollbarWidth + 24
    : 0;

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
    const viewport = viewportRef.current;
    if (virtualizeFiles && viewport) {
      const offset = focusedVirtualOffset.get(tab.focusedId);
      if (offset !== undefined && (offset < viewport.scrollTop || offset + rowStride > viewport.scrollTop + viewport.clientHeight)) {
        viewport.scrollTop = Math.max(0, offset - Math.max(0, (viewport.clientHeight - rowStride) / 2));
        return;
      }
    }
    const focusedItem = [...(viewport?.querySelectorAll<HTMLElement>('[data-file-item][data-file-id]') ?? [])]
      .find(element => element.dataset.fileId === tab.focusedId);
    if (focusedItem && viewport) {
      const itemTop = focusedItem.offsetTop;
      const itemHeight = focusedItem.offsetHeight;
      if (itemTop < viewport.scrollTop) {
        viewport.scrollTop = itemTop;
      } else if (itemTop + itemHeight > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = itemTop + itemHeight - viewport.clientHeight;
      }
      lastScrolledFocusedIdRef.current = tab.focusedId;
    }
  }, [files, tab.focusedId, tab.selectedIds, virtualizeFiles, viewportWindow.top, viewportWindow.height, collapsedGroups]);

  useEffect(() => {
    if (horizontalScrollContainerRef.current) {
      horizontalScrollContainerRef.current.scrollLeft = 0;
    }
  }, [tab.currentPath, tab.id]);

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
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none outline-none"
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
    setBreadcrumbMenuPosition(null);
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
    if (item.isFolder) {
      const customConfig = getCustomFolderIcon(item.path, customFolderIcons ?? {});
      if (customConfig) {
        return <FolderIconRenderer config={customConfig} size={size === 'large' ? 'large' : 'small'} />;
      }
    }
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

  const renderFolderStatusBadge = (item: FileItem) => {
    if (!item.isFolder) return null;
    const customConfig = getCustomFolderIcon(item.path, customFolderIcons ?? {});
    if (!customConfig?.badge || customConfig.badge.type === 'none') return null;
    return <FolderStatusBadge badge={customConfig.badge} language={language} className="flex-shrink-0" />;
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
        const drive = drives.find(candidate => candidate.letter.toLowerCase() === seg.toLowerCase());
        const label = drive?.label && drive.label.toLowerCase() !== seg.toLowerCase()
          ? `${drive.label} (${seg})`
          : seg;
        result.push({ label, fullPath: accumulated });
      } else {
        accumulated = `${accumulated.replace(/\\+$/, '')}\\${seg}`;
        result.push({ label: seg, fullPath: accumulated });
      }
    });
    return result;
  }, [tab.currentPath, isSystemHome, isRecycleBin, drives]);
  const visibleBreadcrumbStart = Math.min(firstVisibleBreadcrumb, Math.max(0, breadcrumbSegments.length - 1));

  useLayoutEffect(() => {
    if (isEditingPath || isSystemHome || isRecycleBin) return;
    const viewport = breadcrumbViewportRef.current;
    const measure = breadcrumbMeasureRef.current;
    if (!viewport || !measure) return;
    const update = () => {
      const widths = Array.from(measure.children, child => child.getBoundingClientRect().width);
      const available = viewport.clientWidth;
      const gap = parseFloat(window.getComputedStyle(viewport).columnGap) || 0;
      const requiredWidth = (start: number) => {
        const pieces: number[] = showBreadcrumbHome ? [24, 16] : [];
        if (start > 0) pieces.push(24, 16);
        for (let index = start; index < widths.length; index++) {
          pieces.push(widths[index]);
          if (index < widths.length - 1) pieces.push(16);
        }
        return pieces.reduce((total, width) => total + width, 0) + Math.max(0, pieces.length - 1) * gap;
      };
      let start = 0;
      while (start < widths.length - 1 && requiredWidth(start) > available) start++;
      setFirstVisibleBreadcrumb(previous => previous === start ? previous : start);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    observer?.observe(measure);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [breadcrumbSegments, isEditingPath, isSystemHome, isRecycleBin, showBreadcrumbHome]);

  useEffect(() => setBreadcrumbMenuPosition(null), [tab.currentPath, firstVisibleBreadcrumb]);

  useEffect(() => {
    if (!breadcrumbMenuPosition) return;
    breadcrumbMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (breadcrumbMenuRef.current?.contains(target) || breadcrumbMenuButtonRef.current?.contains(target))) return;
      setBreadcrumbMenuPosition(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Tab') setBreadcrumbMenuPosition(null);
      if (event.key === 'Escape') {
        setBreadcrumbMenuPosition(null);
        breadcrumbMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismissOnEscape, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', dismissOnEscape, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [breadcrumbMenuPosition]);

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

  // Selection ranges follow the full displayed order, including virtual rows.
  const selectRangeTo = (anchorId: string, targetId: string, additive = false) => {
    const anchorIndex = navigableFiles.findIndex(item => item.id === anchorId);
    const targetIndex = navigableFiles.findIndex(item => item.id === targetId);
    if (targetIndex < 0) return;
    const start = anchorIndex < 0 ? targetIndex : Math.min(anchorIndex, targetIndex);
    const end = anchorIndex < 0 ? targetIndex : Math.max(anchorIndex, targetIndex);
    const rangeIds = navigableFiles.slice(start, end + 1).map(item => item.id);
    const selectedIds = additive ? [...new Set([...tab.selectedIds, ...rangeIds])] : rangeIds;
    onSelectItems(selectedIds, false, false, true, targetId);
  };

  const currentSelectionAnchor = (fallbackId: string) => {
    const savedId = selectionAnchorsRef.current.get(selectionContext);
    if (savedId && selectedIdSet.has(savedId) && navigableIdSet.has(savedId)) return savedId;
    return tab.focusedId && navigableIdSet.has(tab.focusedId)
      ? tab.focusedId : tab.selectedIds.find(id => navigableIdSet.has(id)) ?? fallbackId;
  };

  // Selection logic
  const handleItemClick = (e: React.MouseEvent, item: FileItem, index: number) => {
    viewportRef.current?.focus({ preventScroll: true });
    onActivate();
    clearPendingDeselection();
    if (!e.shiftKey) selectionAnchorsRef.current.set(selectionContext, item.id);

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

    if (e.shiftKey) {
      const anchorId = currentSelectionAnchor(item.id);
      selectionAnchorsRef.current.set(selectionContext, anchorId);
      selectRangeTo(anchorId, item.id, e.ctrlKey || e.metaKey);
    } else {
      onSelectItems([item.id], e.ctrlKey || e.metaKey, false);
    }
  };

  const handleTypeAhead = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isActive || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || event.key.length !== 1 || files.length === 0) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    if (!/[^\s]/u.test(event.key)) return;
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(language);
    const now = Date.now();
    const previous = typeAheadRef.current;
    const withinSequence = now - previous.at < 1000;
    const letter = normalize(event.key);
    const repeatedLetter = withinSequence && previous.query === letter;
    let query = withinSequence && !repeatedLetter ? previous.query + letter : letter;
    let start = repeatedLetter ? Math.max(0, files.findIndex(item => item.id === tab.focusedId) + 1) : 0;
    const findMatch = (prefix: string, from: number) => {
      for (let offset = 0; offset < files.length; offset += 1) {
        const item = files[(from + offset) % files.length];
        if (normalize(item.name).startsWith(prefix)) return item;
      }
      return undefined;
    };
    let match = findMatch(query, start);
    if (!match && query.length > 1) {
      query = letter;
      start = Math.max(0, files.findIndex(item => item.id === tab.focusedId) + 1);
      match = findMatch(query, start);
    }
    typeAheadRef.current = { query, at: now };
    if (!match) return;
    event.preventDefault();
    event.stopPropagation();
    const group = getGroupForItem(match);
    const collapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
    if (collapsedGroups[collapseKey]) setCollapsedGroups(previousGroups => ({ ...previousGroups, [collapseKey]: false }));
    lastScrolledFocusedIdRef.current = null;
    selectionAnchorsRef.current.set(selectionContext, match.id);
    onSelectItems([match.id], false, false, true, match.id);
  };

  const handleViewportKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable]:not([contenteditable="false"])')) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || !isActive || navigableFiles.length === 0) {
      handleTypeAhead(event);
      return;
    }
    const key = event.key;
    const grid = effectiveViewMode !== 'details';
    if (!['Home', 'End', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ...(grid ? ['ArrowLeft', 'ArrowRight'] : [])].includes(key)) {
      handleTypeAhead(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const focusedIndex = navigableFiles.findIndex(item => item.id === tab.focusedId);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : navigableFiles.findIndex(item => selectedIdSet.has(item.id));
    const lastIndex = navigableFiles.length - 1;
    const pageRows = Math.max(1, Math.floor((viewportRef.current?.clientHeight ?? 600) / rowStride));
    const pageStep = pageRows * virtualColumns;
    let targetIndex = currentIndex < 0 ? 0 : currentIndex;
    if (key === 'Home') targetIndex = 0;
    else if (key === 'End') targetIndex = lastIndex;
    else if (key === 'ArrowDown') targetIndex = currentIndex < 0 ? 0 : Math.min(lastIndex, targetIndex + (grid ? virtualColumns : 1));
    else if (key === 'ArrowUp') targetIndex = currentIndex < 0 ? 0 : Math.max(0, targetIndex - (grid ? virtualColumns : 1));
    else if (key === 'ArrowRight') targetIndex = currentIndex < 0 ? 0 : Math.min(lastIndex, targetIndex + 1);
    else if (key === 'ArrowLeft') targetIndex = currentIndex < 0 ? 0 : Math.max(0, targetIndex - 1);
    else if (key === 'PageDown') targetIndex = currentIndex < 0 ? 0 : Math.min(lastIndex, targetIndex + pageStep);
    else if (key === 'PageUp') targetIndex = currentIndex < 0 ? 0 : Math.max(0, targetIndex - pageStep);
    const targetItem = navigableFiles[targetIndex];
    if (event.shiftKey) {
      const anchorId = currentSelectionAnchor(navigableFiles[currentIndex >= 0 ? currentIndex : 0].id);
      selectionAnchorsRef.current.set(selectionContext, anchorId);
      selectRangeTo(anchorId, targetItem.id);
    } else {
      selectionAnchorsRef.current.set(selectionContext, targetItem.id);
      onSelectItems([targetItem.id], false, false, true, targetItem.id);
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

  const clearMouseGestureHoldTimer = () => {
    if (mouseGestureHoldTimerRef.current !== null) window.clearTimeout(mouseGestureHoldTimerRef.current);
    mouseGestureHoldTimerRef.current = null;
  };

  const paintMouseGestureTrail = (drag: MouseGestureDrag, colorOverride?: string) => {
    if (!drag.moved && !drag.path.cancelled) return;
    const svg = mouseGestureTrailRef.current;
    const path = mouseGestureTrailPathRef.current;
    const tip = mouseGestureTrailTipRef.current;
    const marker = mouseGestureTrailMarkerRef.current;
    if (!svg || !path || !tip || !marker) return;
    const color = colorOverride ?? (drag.path.cancelled ? '#fb7185' : '#22d3ee');
    svg.style.display = 'block';
    svg.style.opacity = '1';
    svg.style.filter = `drop-shadow(0 0 6px ${color})`;
    path.setAttribute('d', drag.pathData);
    path.setAttribute('stroke', color);
    tip.setAttribute('cx', String(drag.path.lastX));
    tip.setAttribute('cy', String(drag.path.lastY));
    tip.setAttribute('fill', color);
    marker.setAttribute('x', String(Math.max(20, Math.min(window.innerWidth - 20, drag.path.lastX + 18))));
    marker.setAttribute('y', String(Math.max(20, Math.min(window.innerHeight - 20, drag.path.lastY - 18))));
    marker.setAttribute('fill', color);
    marker.textContent = drag.path.cancelled ? '×' : drag.path.direction ? {
      left: '←', right: '→', up: '↑', down: '↓',
    }[drag.path.direction] : '';
  };

  const fadeMouseGestureTrail = () => {
    const svg = mouseGestureTrailRef.current;
    if (!svg || svg.style.display === 'none') return;
    svg.style.transition = 'opacity 220ms ease-out';
    svg.style.opacity = '0';
    if (mouseGestureFadeTimerRef.current !== null) window.clearTimeout(mouseGestureFadeTimerRef.current);
    mouseGestureFadeTimerRef.current = window.setTimeout(() => {
      svg.style.display = 'none';
      mouseGestureFadeTimerRef.current = null;
    }, 240);
  };

  const cancelMouseGesture = (drag: MouseGestureDrag) => {
    drag.path.cancelled = true;
    drag.moved = true;
    paintMouseGestureTrail(drag);
  };

  const extendMouseGesture = (drag: MouseGestureDrag, x: number, y: number) => {
    const next = advanceMouseGesturePath(drag.path, drag.startX, drag.startY, x, y);
    if (next === drag.path) return;
    drag.path = next;
    drag.pathData += ` L ${Math.round(x)} ${Math.round(y)}`;
    if (Math.hypot(x - drag.startX, y - drag.startY) > MOUSE_GESTURE_MENU_TOLERANCE) drag.moved = true;
    paintMouseGestureTrail(drag);
  };

  const handleMouseGesturePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!mouseGesturesEnabled || event.pointerType !== 'mouse' || event.button !== 2 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const control = target.closest('button, a');
    if (control && !control.hasAttribute('data-file-item')) return;
    clearMouseGestureHoldTimer();
    if (mouseGestureFadeTimerRef.current !== null) window.clearTimeout(mouseGestureFadeTimerRef.current);
    mouseGestureFadeTimerRef.current = null;
    const trail = mouseGestureTrailRef.current;
    if (trail) {
      trail.style.display = 'none';
      trail.style.opacity = '1';
      trail.style.transition = 'none';
    }
    suppressGestureContextMenuUntilRef.current = 0;
    const drag: MouseGestureDrag = {
      pointerId: event.pointerId,
      target,
      startX: event.clientX,
      startY: event.clientY,
      path: { lastX: event.clientX, lastY: event.clientY, length: 0, direction: null, peakProgress: 0, cancelled: false },
      pathData: `M ${Math.round(event.clientX)} ${Math.round(event.clientY)}`,
      moved: false,
    };
    mouseGestureDragRef.current = drag;
    mouseGestureHoldTimerRef.current = window.setTimeout(() => {
      if (mouseGestureDragRef.current === drag) cancelMouseGesture(drag);
      mouseGestureHoldTimerRef.current = null;
    }, MOUSE_GESTURE_HOLD_TIMEOUT);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMouseGesturePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mouseGestureDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    extendMouseGesture(drag, event.clientX, event.clientY);
    if (drag.moved) event.preventDefault();
  };

  const finishMouseGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mouseGestureDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    extendMouseGesture(drag, event.clientX, event.clientY);
    clearMouseGestureHoldTimer();
    mouseGestureDragRef.current = null;
    suppressGestureContextMenuUntilRef.current = Date.now() + 300;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === 'pointercancel') cancelMouseGesture(drag);
    if (drag.path.cancelled) {
      fadeMouseGestureTrail();
      return;
    }

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) <= MOUSE_GESTURE_MENU_TOLERANCE) {
      if (!drag.target.isConnected) return;
      replayingGestureContextMenuRef.current = true;
      try {
        drag.target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: drag.startX,
          clientY: drag.startY,
        }));
      } finally {
        replayingGestureContextMenuRef.current = false;
      }
      return;
    }

    const direction = drag.path.direction;
    const progress = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const viewport = viewportRef.current;
    const canPerform = direction === 'left' ? tab.historyIndex > 0
      : direction === 'right' ? tab.historyIndex < tab.history.length - 1
      : direction === 'up' ? Boolean(viewport && viewport.scrollTop > 0)
      : direction === 'down' ? Boolean(viewport && viewport.scrollTop < viewport.scrollHeight - viewport.clientHeight - 1)
      : false;
    if (direction && progress >= MOUSE_GESTURE_MIN_DISTANCE && canPerform) {
      paintMouseGestureTrail(drag, '#4ade80');
      onActivate();
      if (direction === 'left') onNavigateBack();
      else if (direction === 'right') onNavigateForward();
      else {
        if (viewport) {
          lastScrolledFocusedIdRef.current = tab.focusedId;
          viewport.scrollTop = direction === 'up' ? 0 : viewport.scrollHeight;
        }
      }
    } else {
      paintMouseGestureTrail(drag, '#fbbf24');
    }
    fadeMouseGestureTrail();
  };

  const handleMouseGestureContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (replayingGestureContextMenuRef.current || event.button !== 2) return;
    if (mouseGestureDragRef.current || Date.now() < suppressGestureContextMenuUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleMouseGestureLostCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mouseGestureDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      clearMouseGestureHoldTimer();
      cancelMouseGesture(drag);
      fadeMouseGestureTrail();
      mouseGestureDragRef.current = null;
      suppressGestureContextMenuUntilRef.current = Date.now() + 300;
    }
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
    viewportRef.current?.focus({ preventScroll: true });
    selectionAnchorsRef.current.delete(selectionContext);
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
  const visibleSelectedIdSet = React.useMemo(() => new Set(visibleSelectedIds), [visibleSelectedIds]);
  const selectedFiles = React.useMemo(() => files.filter(file => visibleSelectedIdSet.has(file.id)), [files, visibleSelectedIdSet]);
  const selectedBytes = React.useMemo(() => selectedFiles.reduce((total, file) => total + file.size, 0), [selectedFiles]);

  const folderBytes = React.useMemo(() => files.reduce((total, file) => total + (file.isFolder ? 0 : file.size), 0), [files]);

  const renderSystemHomeCard = (item: FileItem, index: number, category: 'folder' | 'drive' | 'network') => {
    const selected = visibleSelectedIdSet.has(item.id);
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
      <Tooltip key={item.id} label={tooltipLabel} placement="top">
      <button
        type="button"
        data-file-item="true"
        data-file-id={item.id}
        onClick={event => { handleItemClick(event, item, index); handleConfiguredSingleClick(event, item); }}
        onDoubleClick={() => handleConfiguredDoubleClick(item)}
        onContextMenu={event => handleFileItemContextMenu(event, item)}
        onMouseEnter={category === 'folder' ? () => handleFolderTooltipMouseEnter(item) : undefined}
        onMouseLeave={category === 'folder' ? () => handleFolderTooltipMouseLeave(item) : undefined}
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
          <span className="inline-block max-w-full truncate text-xs text-neutral-100 font-medium" style={getItemNameStyle(item, selected)}>{getDisplayItemName(item, showFileExtensions)}</span>
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

  const visibleItemCount = `${files.length}${hasMore ? '+' : ''}`;
  const itemCountLabel = isLoadingDirectory && tab.flatView ? t.pane.loadingFolder : hasMore && totalItemCount !== undefined
    ? t.pane.loadedOfTotal.replace('{loaded}', String(files.length)).replace('{total}', String(totalItemCount))
    : t.pane.itemsCount.replace('{count}', visibleItemCount);
  const renderFolderTab = (tabItem: TabState, idx: number, vertical: boolean) => {
    const isTabActive = idx === activeTabIndex;
    const tabName = tabItem.customTitle || tabItem.title || t.pane.noFolderOpen;
    const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    const tooltipPlacement = vertical ? (tabStripPosition === 'left' ? 'right' : 'left') : (tabStripPosition === 'bottom' ? 'top' : 'bottom');
    return (
      <div
        key={tabItem.id}
        role="button"
        tabIndex={isTabActive ? 0 : -1}
        aria-pressed={isTabActive}
        data-folder-tab="true"
        data-active-folder-tab={isTabActive ? 'true' : undefined}
        aria-label={tabName}
        onClick={event => { event.stopPropagation(); onActivate(); onSelectTab(idx); }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onActivate();
            onSelectTab(idx);
          } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            onTabContextMenu(idx, bounds.left + 16, bounds.bottom);
          } else if (event.key === previousKey || event.key === nextKey) {
            event.preventDefault();
            event.stopPropagation();
            const next = (idx + (event.key === nextKey ? 1 : -1) + tabs.length) % tabs.length;
            onActivate();
            onSelectTab(next);
            event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="button"][aria-pressed]')[next]?.focus();
          }
        }}
        onContextMenu={event => {
          event.preventDefault();
          event.stopPropagation();
          onTabContextMenu(idx, event.clientX, event.clientY);
        }}
        className={vertical
          ? `cyberfiles-folder-tab group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${isTabActive ? 'border-cyan-600/65 bg-cyan-950/45 text-cyan-100 shadow-sm shadow-cyan-950/30' : 'border-transparent bg-neutral-900/35 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-800/70 hover:text-neutral-100'}`
          : `cyberfiles-folder-tab group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer border-x transition-colors max-w-[180px] min-w-[100px] ${tabStripPosition === 'bottom' ? 'rounded-b-md border-b' : 'rounded-t-md border-t'} ${isTabActive ? 'bg-neutral-900 border-neutral-700 text-neutral-100 relative z-10' : 'bg-neutral-950/40 border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'}`}
      >
        <Folder className={`h-3.5 w-3.5 shrink-0 ${isTabActive ? 'text-cyan-400' : 'text-neutral-500'}`} style={tabItem.tabColor ? { color: tabItem.tabColor } : undefined} />
        <span className={`truncate text-[11px] ${vertical ? 'min-w-0 flex-1' : ''}`} style={tabItem.tabColor ? { color: tabItem.tabColor } : undefined}>{tabName}</span>
        {tabItem.lockClose && <LockKeyhole aria-label={t.tabMenu.lock} className="ml-auto h-3 w-3 shrink-0 text-amber-300/80" />}
        {tabs.length > 1 && !tabItem.lockClose && (
          <Tooltip label={t.pane.closeTab} placement={tooltipPlacement}>
            <button
              type="button"
              aria-label={`${t.pane.closeTab}: ${tabName}`}
              onClick={event => { event.stopPropagation(); onCloseTab(idx); }}
              className={`ml-auto shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 focus-visible:opacity-100 ${
                tabCloseButtonMode === 'always'
                  ? 'opacity-60 hover:opacity-100'
                  : tabCloseButtonMode === 'active'
                    ? (isTabActive ? 'opacity-60 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100')
                    : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <X className="h-3 w-3" />
            </button>
          </Tooltip>
        )}
      </div>
    );
  };
  const isBlankTabStripTarget = (target: EventTarget | null) =>
    target instanceof Element && !target.closest('[data-folder-tab], button, a, input, select, textarea, [contenteditable="true"]');
  const handleTabStripDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!doubleClickTabBar || !isBlankTabStripTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onActivate();
    onAddTab();
  };
  const handleTabStripContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (!isBlankTabStripTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onActivate();
    onTabStripContextMenu(event.clientX, event.clientY);
  };
  const handleTabStripKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') event.stopPropagation();
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      onActivate();
      onTabStripContextMenu(bounds.left + 16, bounds.top + 16);
    }
  };
  const tabStrip = (
      <div
        role="group"
        aria-label={t.tabMenu.tabsLabel}
        tabIndex={0}
        className={`cyberfiles-tab-strip flex shrink-0 items-center bg-neutral-950/90 border-neutral-800 px-1 overflow-x-auto no-scrollbar select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400 ${tabStripPosition === 'bottom' ? 'border-t pb-1' : 'border-b pt-1'}`}
        onKeyDown={handleTabStripKeyDown}
        onDoubleClick={handleTabStripDoubleClick}
        onContextMenu={handleTabStripContextMenu}
      >
        <div data-tab-strip-space="true" className="flex items-center gap-0.5 flex-1 min-w-0">
          {tabs.map((tabItem, idx) => renderFolderTab(tabItem, idx, false))}

          {showNewTabButton && <Tooltip label={t.pane.addTab} shortcut="Ctrl+T" placement={tabStripPosition === 'bottom' ? 'top' : 'bottom'}>
            <button
              type="button"
              aria-label={t.pane.addTab}
              onClick={(e) => {
                e.stopPropagation();
                onActivate();
                onAddTab();
              }}
              className="inline-flex items-center gap-1.5 p-1.5 ml-1 text-neutral-400 hover:text-cyan-300 hover:bg-neutral-800 rounded transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </Tooltip>}
        </div>

        <div className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-400 font-sans px-2 whitespace-nowrap">
          <span>{paneId === 'left' ? t.statusBar.leftPane : t.statusBar.rightPane}</span>
        </div>
      </div>
  );

  const verticalTabStrip = (
    <aside
      role="group"
      aria-label={t.tabMenu.tabsLabel}
      tabIndex={0}
      className={`cyberfiles-vertical-tabs flex min-h-0 shrink-0 flex-col bg-neutral-950/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400 ${tabStripPosition === 'left' ? 'border-r border-neutral-800' : 'border-l border-neutral-800'}`}
      style={{ width: 'clamp(104px, 22%, 184px)' }}
      onKeyDown={handleTabStripKeyDown}
      onDoubleClick={handleTabStripDoubleClick}
      onContextMenu={handleTabStripContextMenu}
    >
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-neutral-800 px-2.5 py-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.tabMenu.tabsShort}</span>
        {showNewTabButton && (
          <Tooltip label={t.pane.addTab} shortcut="Ctrl+T" placement={tabStripPosition === 'left' ? 'right' : 'left'}>
            <button type="button" aria-label={t.pane.addTab} onClick={event => { event.stopPropagation(); onActivate(); onAddTab(); }} className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-cyan-950/60 hover:text-cyan-200">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      <div ref={verticalTabListRef} data-tab-strip-space="true" className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-1.5">
        {tabs.map((tabItem, idx) => renderFolderTab(tabItem, idx, true))}
        {showNewTabButton && (
          <Tooltip label={t.pane.addTab} shortcut="Ctrl+T" placement={tabStripPosition === 'left' ? 'right' : 'left'}>
            <button
              type="button"
              aria-label={t.pane.addTab}
              onClick={event => { event.stopPropagation(); onActivate(); onAddTab(); }}
              className="vertical-add-tab-btn group mt-0.5 flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-800/80 bg-neutral-900/30 px-2.5 py-1.5 text-left text-xs font-medium text-neutral-400 transition-all hover:border-cyan-600/60 hover:bg-cyan-950/30 hover:text-cyan-200 outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition-colors group-hover:text-cyan-300" />
              <span className="truncate text-[11px]">{t.pane.addTab}</span>
            </button>
          </Tooltip>
        )}
      </div>
    </aside>
  );

  return (
    <div
      onClick={onActivate}
      data-active-pane={isActive ? 'true' : undefined}
      className={`cyberfiles-pane flex flex-col h-full bg-neutral-900/60 overflow-hidden relative border transition-colors ${
        isActive
          ? 'border-cyan-500/50 shadow-sm shadow-cyan-950/40'
          : 'border-neutral-800/80 opacity-90'
      } ${isDragOver ? 'ring-2 ring-cyan-400/80 bg-cyan-950/20' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e)}
    >
      {tabStripPosition === 'top' && tabStrip}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tabStripPosition === 'left' && verticalTabStrip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

      {/* 2. Navigation & Breadcrumb Bar */}
      <div className="cyberfiles-pane-navigation flex items-center gap-1.5 px-2 py-1.5 bg-neutral-900 border-b border-neutral-800 text-xs select-none">
        <Tooltip label={t.toolbar.back} shortcut={language === 'es' ? 'Alt+Izquierda' : 'Alt+Left'} disabled={tab.historyIndex <= 0}><button onClick={onNavigateBack} disabled={tab.historyIndex <= 0} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowLeft className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={t.toolbar.forward} shortcut={language === 'es' ? 'Alt+Derecha' : 'Alt+Right'} disabled={tab.historyIndex >= tab.history.length - 1}><button onClick={onNavigateForward} disabled={tab.historyIndex >= tab.history.length - 1} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowRight className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={t.toolbar.up} shortcut="Backspace" disabled={isSystemHome}><button onClick={onNavigateUp} disabled={isSystemHome} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowUp className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={t.toolbar.refresh} shortcut="F5" disabled={!tab.currentPath}><button onClick={() => onRefresh ? onRefresh() : onNavigate(tab.currentPath)} disabled={!tab.currentPath} className="p-1 rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"><RotateCw className="w-3.5 h-3.5" /></button></Tooltip>

        {/* Breadcrumb Path Box */}
        <div 
          onClick={() => {
            if (isRecycleBin) return;
            setPathInput(isSystemHome ? '' : tab.currentPath);
            setIsEditingPath(true);
          }}
          className={`cyberfiles-address-bar flex-1 min-w-0 flex h-9 min-h-9 items-center bg-neutral-950 px-2 rounded-full border border-neutral-800 overflow-hidden ${!isRecycleBin ? 'cursor-text hover:border-neutral-700' : 'cursor-default'}`}
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
            <div ref={breadcrumbViewportRef} className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden font-sans text-xs">
              <div ref={breadcrumbMeasureRef} aria-hidden="true" className="pointer-events-none invisible absolute flex w-max gap-1.5">
                {breadcrumbSegments.map(segment => <span key={segment.fullPath} className="shrink-0 whitespace-nowrap px-1.5 py-1">{segment.label}</span>)}
              </div>
              {showBreadcrumbHome && (
                <>
                  <Tooltip label={t.sidebar.thisPc} placement="bottom">
                    <button type="button" aria-label={t.sidebar.thisPc} onClick={event => { event.stopPropagation(); onNavigate(SYSTEM_HOME_PATH); }} className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-950/40 text-amber-300 transition-colors hover:bg-amber-950/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/70">
                      <Home className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  {breadcrumbSegments.length > 0 && <ChevronRight aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-neutral-500" />}
                </>
              )}
              {visibleBreadcrumbStart > 0 && (
                <>
                  <Tooltip label={t.pane.earlierFolders} placement="bottom">
                    <button
                      ref={breadcrumbMenuButtonRef}
                      type="button"
                      aria-label={t.pane.earlierFolders}
                      aria-haspopup="menu"
                      aria-expanded={Boolean(breadcrumbMenuPosition)}
                      onClick={event => {
                        event.stopPropagation();
                        if (breadcrumbMenuPosition) { setBreadcrumbMenuPosition(null); return; }
                        setRecentFoldersMenuPosition(null);
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const width = Math.min(260, window.innerWidth - 16);
                        setBreadcrumbMenuPosition({
                          left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
                          top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 220)),
                          width,
                        });
                      }}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                    >
                      <span aria-hidden="true" className="text-base leading-none">…</span>
                    </button>
                  </Tooltip>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                </>
              )}
              {breadcrumbSegments.length === 0 && <span className="px-1 text-neutral-500">{t.pane.noFolderOpen}</span>}
              {breadcrumbSegments.slice(visibleBreadcrumbStart).map((seg, i, visibleSegments) => (
                <React.Fragment key={seg.fullPath}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(seg.fullPath);
                    }}
                    className={`min-w-0 whitespace-nowrap rounded-md px-1.5 py-1 text-neutral-300 transition-colors duration-150 hover:bg-neutral-800/80 hover:text-neutral-100 active:bg-neutral-700/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 ${i === visibleSegments.length - 1 ? 'truncate' : 'flex-shrink-0'}`}
                  >
                    {seg.label}
                  </button>
                  {i < visibleSegments.length - 1 && (
                    <ChevronRight aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-neutral-500" />
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

        {breadcrumbMenuPosition && createPortal(
          <div
            ref={breadcrumbMenuRef}
            role="menu"
            aria-label={t.pane.earlierFolders}
            style={breadcrumbMenuPosition}
            className="fixed z-[110] max-h-[min(20rem,calc(100vh-1rem))] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/95 p-1.5 text-xs shadow-2xl backdrop-blur-md"
          >
            {breadcrumbSegments.slice(0, visibleBreadcrumbStart).map(segment => (
              <button
                key={segment.fullPath}
                type="button"
                role="menuitem"
                onClick={event => { event.stopPropagation(); setBreadcrumbMenuPosition(null); onNavigate(segment.fullPath); }}
                className="flex w-full min-w-0 items-center rounded px-2.5 py-2 text-left text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
              >
                <span className="truncate">{segment.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}

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
      <div className="cyberfiles-pane-filter px-2 py-1 bg-neutral-950/60 border-b border-neutral-800/80 flex items-center gap-2 text-xs">
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
          {itemCountLabel}
        </div>
      </div>

      <div ref={horizontalScrollContainerRef} className={`flex min-h-0 flex-1 flex-col ${styleLocked && !isSystemHome && effectiveViewMode === 'details' ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-hidden`}>
        <div className="flex min-h-0 flex-1 flex-col" style={{ width: styleLocked && !isSystemHome && effectiveViewMode === 'details' ? `max(100%, ${detailsTableMinimumWidth}px)` : '100%' }}>
      {/* 4. Column Headers (Details View) */}
      {effectiveViewMode === 'details' && !isSystemHome && (
        <div
          ref={columnHeadersRef}
          className="cyberfiles-column-headers grid shrink-0 items-center gap-2 border border-neutral-800/80 bg-neutral-900/90 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-300 select-none shadow-sm backdrop-blur-xs"
          style={{ width: detailsHeaderWidth, gridTemplateColumns: fileGridTemplateColumns, paddingRight: `${8 + viewportScrollbarWidth}px` }}
          onContextMenu={openColumnMenu}
        >
          {visibleFileColumns.map((column, colIdx) => {
            const sortField = columnSortFields[column];
            const isSorted = tab.sortField === sortField;
            const DirectionIcon = isSorted && tab.sortOrder === 'desc' ? ArrowDown : ArrowUp;
            const isLast = colIdx === visibleFileColumns.length - 1;
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
                  className={`cyberfiles-column-header-cell group relative flex min-w-0 items-center gap-1 rounded-sm px-1 pr-2 cursor-grab active:cursor-grabbing transition-colors hover:bg-neutral-800/60 hover:text-neutral-100 ${columnDropTarget === column ? 'bg-cyan-950/70 text-cyan-200' : ''} ${column === 'size' || column === 'created' || column === 'modified' ? 'justify-end' : ''} ${!isLast ? 'border-r border-neutral-800/60' : ''}`}
                >
                  <span data-file-column-header={column} className="min-w-0 truncate">{columnLabel(column)}</span>
                  <DirectionIcon aria-hidden="true" className={`h-3 w-3 flex-shrink-0 ${isSorted ? 'text-cyan-400' : 'text-neutral-600'}`} />
                  {!isLast && resizeHandle(column, columnLabel(column))}
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

      {createPortal(
        <svg
          ref={mouseGestureTrailRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[90]"
          style={{ display: 'none', width: '100vw', height: '100vh' }}
        >
          <path ref={mouseGestureTrailPathRef} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <circle ref={mouseGestureTrailTipRef} r="5" />
          <text ref={mouseGestureTrailMarkerRef} textAnchor="middle" dominantBaseline="middle" fontSize="23" fontWeight="700" stroke="#020617" strokeWidth="3" paintOrder="stroke" />
        </svg>,
        document.body,
      )}

      {/* 5. File Items Viewport */}
      <div 
        ref={viewportRef}
        data-cyberfiles-pane-viewport={paneId}
        className={`cyberfiles-file-viewport relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto py-0.5 select-none focus:outline-none ${marqueeBounds ? 'cursor-crosshair' : ''}`}
        tabIndex={0}
        onScroll={event => {
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
          setViewportWindow(previous => previous.top === scrollTop ? previous : { ...previous, top: scrollTop });
          if (!hasMore || isLoadingDirectory || !onLoadMore) return;
          if (scrollHeight - scrollTop - clientHeight <= Math.max(500, clientHeight)) onLoadMore();
        }}
        onClick={handleViewportClick}
        onKeyDown={handleViewportKeyDown}
        onContextMenu={handleViewportContextMenu}
        onContextMenuCapture={handleMouseGestureContextMenu}
        onDoubleClick={handleViewportDoubleClick}
        onPointerDownCapture={handleMouseGesturePointerDown}
        onPointerMoveCapture={handleMouseGesturePointerMove}
        onPointerUpCapture={finishMouseGesture}
        onPointerCancelCapture={finishMouseGesture}
        onLostPointerCapture={handleMouseGestureLostCapture}
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
        {tab.flatView && (flatViewStatus?.skippedCount ?? 0) > 0 && (
          <div role="status" className="mx-3 my-2 rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {t.pane.flatViewIncomplete.replace('{count}', String(flatViewStatus?.skippedCount ?? 0))}
          </div>
        )}
        <div key={`${tab.id}:${tab.currentPath}`} className="min-h-full">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-2 p-6">
            {isLoadingDirectory ? <RotateCw className="w-7 h-7 text-cyan-500 animate-spin" /> : <Folder className="w-8 h-8 text-neutral-600 stroke-[1.5]" />}
            <div className="text-xs">{isLoadingDirectory ? t.pane.loadingFolder : flatViewStatus?.error ? t.pane.flatViewLoadFailed : tab.currentPath ? t.pane.emptyFolder : t.pane.noFolderOpen}</div>
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
          <div
            className="cyberfiles-details-list min-h-full border-x border-b border-neutral-800/80 bg-neutral-950/50 py-1 shadow-inner overflow-hidden"
            style={{ width: detailsContentWidth }}
          >
            {renderGroups.map(group => {
              const groupCollapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
              const groupCollapsed = collapsedGroups[groupCollapseKey] === true;
              return (
              <React.Fragment key={`file-group-${groupCollapseKey}`}>
              {group.renderHeading && renderFileGroupHeading(group)}
              {group.before > 0 && <div aria-hidden="true" className="col-span-full" style={{ height: group.before }} />}
              {!groupCollapsed && group.visibleItems.map(item => {
              const idx = fileIndexById.get(item.id) ?? 0;
              const isSelected = visibleSelectedIdSet.has(item.id);
              const isEditing = editingItemId === item.id;
              const isZebra = idx % 2 === 1;

              return (
                <div
                  key={item.id}
                  data-file-item="true"
                  data-file-id={item.id}
                  data-selected={isSelected ? 'true' : undefined}
                  data-zebra={isZebra ? 'true' : undefined}
                  data-focused={isActive && tab.focusedId === item.id ? 'true' : undefined}
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
                  style={{ width: detailsContentWidth, gridTemplateColumns: fileGridTemplateColumns, cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getItemBackgroundStyle(item, isSelected) }}
                  className={`cyberfiles-file-row relative grid h-[30px] items-center gap-2 rounded-md border border-transparent px-2 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/25 text-neutral-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                      : isZebra
                        ? 'bg-neutral-900/35 text-neutral-200 hover:bg-neutral-800/70 hover:text-neutral-100'
                        : 'bg-transparent text-neutral-300 hover:bg-neutral-800/70 hover:text-neutral-100'
                  } ${isActive && tab.focusedId === item.id ? 'before:absolute before:left-0.5 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-cyan-400' : ''}`}
                >
                  {visibleFileColumns.map(column => {
                    if (column === 'extension') {
                      return <div key={column} className="cyberfiles-file-cell min-w-0 overflow-hidden truncate font-mono text-[10.5px] font-medium uppercase tracking-wide text-cyan-400/90"><span data-file-column-content={column} className="inline-block max-w-full truncate">{item.isFolder || !showFileExtensions ? '' : (item.extension || '')}</span></div>;
                    }
                    if (column === 'name') {
                      return (
                        <div key={column} className="cyberfiles-file-cell flex min-w-0 overflow-hidden items-center gap-2">
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
                              <span data-file-column-content={column} onMouseEnter={() => handleFolderTooltipMouseEnter(item)} onMouseLeave={() => handleFolderTooltipMouseLeave(item)} className={`${flatParentLabel(item) ? 'max-w-[55%] ' : ''}truncate text-[11.5px] font-medium text-neutral-100`} style={getItemNameStyle(item, isSelected)} >{getDisplayItemName(item, showFileExtensions)}</span>
                            </Tooltip>
                          )}
                          {renderFolderStatusBadge(item)}
                          {flatParentLabel(item) && <span className="min-w-0 truncate font-sans text-[10px] font-normal text-neutral-500">· {flatParentLabel(item)}</span>}
                        </div>
                      );
                    }
                    if (column === 'type') {
                      return <div key={column} className="cyberfiles-file-cell min-w-0 overflow-hidden truncate font-sans text-[10.5px] text-neutral-400"><span data-file-column-content={column} className="inline-block max-w-full truncate">{getFileTypeLabel(item)}</span></div>;
                    }
                    if (column === 'size') {
                      const folderSize = folderSizeStates[item.id];
                      return <div key={column} className="cyberfiles-file-cell min-w-0 overflow-hidden text-right font-sans text-[11px] tabular-nums text-neutral-300/90" style={getRelativeGraphStyle(relativeGraphWidths.get(item.id)?.size, 'size')}>{item.isFolder ? (
                        isTauriDesktop() && !isRecycleBin && !item.recycleBinId ? (
                          folderSize?.status === 'done' ? (
                            <span data-file-column-content={column} className="inline-flex h-5 min-w-0 max-w-full items-center justify-end truncate leading-none tabular-nums font-mono">{formatFileSize(folderSize.size ?? 0)}</span>
                          ) : (
                            <Tooltip label={folderSize?.status === 'error' ? t.pane.folderSizeFailed : t.pane.folderSizeTooltip} placement="top">
                              <button type="button" disabled={folderSize?.status === 'loading'} onClick={event => { void calculateFolderSize(item, event); }} className="ml-auto inline-flex h-5 w-[44px] shrink-0 items-center justify-end gap-1 rounded px-1 py-0 text-right leading-none text-neutral-400 transition-colors hover:bg-neutral-800/70 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-70" aria-label={folderSize?.status === 'error' ? t.pane.folderSizeFailed : t.pane.folderSizeTooltip}>
                                <span data-file-column-content={column} className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px]">
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
                        ) : <span data-file-column-content={column} className="inline-block max-w-full truncate tabular-nums font-mono">--</span>
                      ) : <span data-file-column-content={column} className="inline-block max-w-full truncate tabular-nums font-mono">{formatFileSize(item.size)}</span>}</div>;
                    }
                    if (column === 'created') {
                      const createdDate = formatDateTimeForDisplay(item.createdAtMs, item.createdDate, dateFormat, language);
                      return <div key={column} className="cyberfiles-file-cell min-w-0 overflow-hidden text-right font-sans text-[10.5px] tabular-nums text-neutral-400" style={getRelativeGraphStyle(relativeGraphWidths.get(item.id)?.created, 'date')}><span data-file-column-content={column} className="inline-block max-w-full truncate tabular-nums font-sans">{createdDate || '--'}</span></div>;
                    }
                    const modifiedDate = formatDateTimeForDisplay(item.modifiedAtMs, item.modifiedDate, dateFormat, language);
                    return <div key={column} className="cyberfiles-file-cell min-w-0 overflow-hidden text-right font-sans text-[10.5px] tabular-nums text-neutral-400" style={getRelativeGraphStyle(relativeGraphWidths.get(item.id)?.modified, 'date')}><span data-file-column-content={column} className="inline-block max-w-full truncate tabular-nums font-sans">{modifiedDate || '--'}</span></div>;
                  })}
                </div>
              );
              })}
              {group.after > 0 && <div aria-hidden="true" className="col-span-full" style={{ height: group.after }} />}
              </React.Fragment>
              );
            })}
          </div>
        ) : effectiveViewMode === 'compact' ? (
          <div className="grid grid-cols-1 gap-x-2 gap-y-1 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {renderGroups.map(group => {
              const groupCollapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
              const groupCollapsed = collapsedGroups[groupCollapseKey] === true;
              return <React.Fragment key={`compact-group-${groupCollapseKey}`}>
              {group.renderHeading && renderFileGroupHeading(group)}
              {group.before > 0 && <div aria-hidden="true" className="col-span-full" style={{ height: group.before }} />}
              {!groupCollapsed && group.visibleItems.map(item => {
              const idx = fileIndexById.get(item.id) ?? 0;
              const isSelected = visibleSelectedIdSet.has(item.id);
              return (
                <div
                  key={item.id}
                  data-file-item="true"
                  data-file-id={item.id}
                  data-selected={isSelected ? 'true' : undefined}
                  data-focused={isActive && tab.focusedId === item.id ? 'true' : undefined}
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
                  className={`cyberfiles-file-row relative flex min-w-0 h-[30px] items-center gap-2 rounded-md border border-transparent px-2 py-1 text-xs transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/25 text-neutral-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                      : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100'
                  } ${isActive && tab.focusedId === item.id ? 'before:absolute before:left-0.5 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-cyan-400' : ''}`}
                >
                  <span className="flex-shrink-0">{getDisplayFileIcon(item)}</span>
                  {editingItemId === item.id ? (
                    renderInlineRenameInput(item, 'min-w-0 flex-1')
                  ) : (
                    <Tooltip label={renderItemTooltip(item)} placement="top">
                      <span className="min-w-0 flex-1">
                        <span onMouseEnter={() => handleFolderTooltipMouseEnter(item)} onMouseLeave={() => handleFolderTooltipMouseLeave(item)} className="inline-block max-w-full truncate" style={getItemNameStyle(item, isSelected)}>{getDisplayItemName(item, showFileExtensions)}</span>
                        {flatParentLabel(item) && <span className="ml-1 inline-block max-w-[45%] align-bottom truncate font-sans text-[10px] text-neutral-500">· {flatParentLabel(item)}</span>}
                      </span>
                    </Tooltip>
                  )}
                  {renderFolderStatusBadge(item)}
                  {!item.isFolder && <span className="flex-shrink-0 font-sans text-[10px] text-neutral-500">{formatFileSize(item.size)}</span>}
                </div>
              );
              })}
              {group.after > 0 && <div aria-hidden="true" className="col-span-full" style={{ height: group.after }} />}
              </React.Fragment>;
            })}
          </div>
        ) : (
          /* Icons / Grid View */
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {renderGroups.map(group => {
              const groupCollapseKey = `${paneId}:${tab.id}:${tab.groupBy}:${group.id}`;
              const groupCollapsed = collapsedGroups[groupCollapseKey] === true;
              return <React.Fragment key={`icons-group-${groupCollapseKey}`}>
              {group.renderHeading && renderFileGroupHeading(group)}
              {group.before > 0 && <div aria-hidden="true" className="col-span-full" style={{ height: group.before }} />}
              {!groupCollapsed && group.visibleItems.map(item => {
              const idx = fileIndexById.get(item.id) ?? 0;
              const isSelected = visibleSelectedIdSet.has(item.id);

              return (
                <Tooltip key={item.id} label={renderItemTooltip(item)} placement="top" disabled={editingItemId === item.id}>
                <div
                  data-file-item="true"
                  data-file-id={item.id}
                  data-selected={isSelected ? 'true' : undefined}
                  data-focused={isActive && tab.focusedId === item.id ? 'true' : undefined}
                  draggable={!item.recycleBinId}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onClick={(e) => { handleItemClick(e, item, idx); handleConfiguredSingleClick(e, item); }}
                  onDoubleClick={() => handleConfiguredDoubleClick(item)}
                  onContextMenu={event => handleFileItemContextMenu(event, item)}
                  onMouseEnter={() => handleFolderTooltipMouseEnter(item)}
                  onMouseLeave={() => handleFolderTooltipMouseLeave(item)}
                  style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getItemBackgroundStyle(item, isSelected) }}
                  className={`relative flex min-w-0 ${virtualizeFiles ? 'h-36' : ''} flex-col items-center justify-start gap-1.5 rounded-lg border border-transparent p-2.5 text-center cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/25 text-neutral-100 shadow-md shadow-cyan-950/20'
                      : 'bg-neutral-950/30 text-neutral-300 hover:bg-neutral-800/60'
                  } ${isActive && tab.focusedId === item.id ? 'before:absolute before:top-1 before:left-1/2 before:-translate-x-1/2 before:w-6 before:h-[3px] before:rounded-full before:bg-cyan-400' : ''}`}
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
                    <span className="w-full min-w-0 px-1">
                      <span className="inline-block max-w-full truncate text-[11px] font-medium" style={getItemNameStyle(item, isSelected)}>{getDisplayItemName(item, showFileExtensions)}</span>
                    </span>
                  )}
                  {flatParentLabel(item) && <span className="w-full truncate px-1 font-sans text-[9px] text-neutral-500">{flatParentLabel(item)}</span>}
                  {renderFolderStatusBadge(item)}
                  <span className="mt-0.5 text-[9px] font-sans text-neutral-400">
                    {item.isFolder ? t.pane.iconFolderLabel : formatFileSize(item.size)}
                  </span>
                </div>
                </Tooltip>
              );
              })}
              {group.after > 0 && <div aria-hidden="true" className="col-span-full" style={{ height: group.after }} />}
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
        </div>
        {tabStripPosition === 'right' && verticalTabStrip}
      </div>

      {tabStripPosition === 'bottom' && tabStrip}

      {/* 6. Footer Status Bar with Mini Storage Distribution Strip */}
      <div className="cyberfiles-pane-status px-2.5 py-1 bg-neutral-950 border-t border-neutral-800 text-[10px] font-sans text-neutral-400 flex items-center justify-between select-none gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span>{itemCountLabel}</span>
          {selectedFiles.length > 0 ? (
            <span className="text-cyan-300 font-semibold truncate">
              {t.pane.selectedCount.replace('{count}', String(selectedFiles.length))} ({formatFileSize(selectedBytes)})
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
