import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { DriveInfo, FileItem, FileType, SortField, TabState, ViewMode, RECYCLE_BIN_PATH, SYSTEM_HOME_PATH, RecentItemStyle } from '../types';
import { formatFileSize, getParentPath } from '../utils/fileSystem';
import { isTauriDesktop, loadNativeImageThumbnail } from '../utils/nativeFileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface FilePaneProps {
  paneId: 'left' | 'right';
  isActive: boolean;
  styleLocked: boolean;
  recentItemStyle: RecentItemStyle;
  emptyAreaDoubleClickNavigatesUp: boolean;
  imageTooltipThumbnailsEnabled: boolean;
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
  onInlineRename: (itemId: string, newName: string) => void;
}

type SystemHomeSection = 'folders' | 'devices' | 'network';
type CollapsedSystemHomeSections = Record<SystemHomeSection, boolean>;
type FileColumn = 'extension' | 'name' | 'size' | 'created' | 'modified';
type ResizableColumn = FileColumn;

interface ColumnPointerDrag {
  pointerId: number;
  column: FileColumn;
  startX: number;
  startY: number;
  moved: boolean;
  target: FileColumn | null;
}

interface FileColumnLayout {
  order: FileColumn[];
  visible: FileColumn[];
}

interface FileColumnWidths {
  extension: number;
  name: number | null;
  size: number;
  created: number;
  modified: number;
}

interface ColumnResizeDrag {
  pointerId: number;
  startX: number;
  column: ResizableColumn;
  widths: FileColumnWidths;
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
const FILE_COLUMN_WIDTHS_KEY = 'cyberfiles_file_column_widths_v1';
const FILE_COLUMN_LAYOUT_KEY = 'cyberfiles_file_column_layout_v1';
const FILE_COLUMNS: FileColumn[] = ['extension', 'name', 'size', 'created', 'modified'];
const DEFAULT_FILE_COLUMN_LAYOUT: FileColumnLayout = {
  order: FILE_COLUMNS,
  visible: ['name', 'size', 'created', 'modified'],
};
const DEFAULT_FILE_COLUMN_WIDTHS: FileColumnWidths = { extension: 58, name: null, size: 84, created: 116, modified: 116 };
const MIN_NAME_COLUMN_WIDTH = 100;
const RECENT_ITEM_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COLLAPSED_SYSTEM_HOME_SECTIONS: CollapsedSystemHomeSections = {
  folders: false,
  devices: false,
  network: false,
};

function readFileColumnWidths(paneId: 'left' | 'right'): FileColumnWidths {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${FILE_COLUMN_WIDTHS_KEY}_${paneId}`) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_FILE_COLUMN_WIDTHS;
    return {
      extension: typeof saved.extension === 'number' ? Math.min(220, Math.max(42, saved.extension)) : DEFAULT_FILE_COLUMN_WIDTHS.extension,
      name: typeof saved.name === 'number' ? Math.min(1600, Math.max(MIN_NAME_COLUMN_WIDTH, saved.name)) : DEFAULT_FILE_COLUMN_WIDTHS.name,
      size: typeof saved.size === 'number' ? Math.min(320, Math.max(56, saved.size)) : DEFAULT_FILE_COLUMN_WIDTHS.size,
      created: typeof saved.created === 'number' ? Math.min(480, Math.max(80, saved.created)) : DEFAULT_FILE_COLUMN_WIDTHS.created,
      modified: typeof saved.modified === 'number' ? Math.min(480, Math.max(80, saved.modified)) : DEFAULT_FILE_COLUMN_WIDTHS.modified,
    };
  } catch {
    return DEFAULT_FILE_COLUMN_WIDTHS;
  }
}

function readFileColumnLayout(paneId: 'left' | 'right'): FileColumnLayout {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${FILE_COLUMN_LAYOUT_KEY}_${paneId}`) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_FILE_COLUMN_LAYOUT;
    const order = Array.isArray(saved.order)
      ? FILE_COLUMNS.filter(column => saved.order.includes(column))
      : DEFAULT_FILE_COLUMN_LAYOUT.order;
    FILE_COLUMNS.forEach(column => {
      if (!order.includes(column)) order.push(column);
    });
    const visible = Array.isArray(saved.visible)
      ? order.filter(column => saved.visible.includes(column))
      : DEFAULT_FILE_COLUMN_LAYOUT.visible;
    return { order, visible: visible.length > 0 ? visible : ['name'] };
  } catch {
    return DEFAULT_FILE_COLUMN_LAYOUT;
  }
}

function resizeFileColumns(widths: FileColumnWidths, column: ResizableColumn, delta: number): FileColumnWidths {
  const clampWidth = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  switch (column) {
    case 'extension':
      return { ...widths, extension: clampWidth(widths.extension + delta, 42, 220) };
    case 'name':
      return { ...widths, name: clampWidth((widths.name ?? MIN_NAME_COLUMN_WIDTH) + delta, MIN_NAME_COLUMN_WIDTH, 1600) };
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
  isActive,
  styleLocked,
  recentItemStyle,
  emptyAreaDoubleClickNavigatesUp,
  imageTooltipThumbnailsEnabled,
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
}) => {
  const { t, language } = useLanguage();
  const isSystemHome = tab.currentPath === SYSTEM_HOME_PATH;
  const isRecycleBin = tab.currentPath === RECYCLE_BIN_PATH;
  const effectiveViewMode = tab.viewMode;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(tab.currentPath);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedSystemHomeSections, setCollapsedSystemHomeSections] = useState(() => readCollapsedSystemHomeSections(paneId));
  const [columnWidths, setColumnWidths] = useState(() => readFileColumnWidths(paneId));
  const [columnLayout, setColumnLayout] = useState(() => readFileColumnLayout(paneId));
  const [columnMenuPosition, setColumnMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<FileColumn | null>(null);
  const lastSingleClickOpenRef = useRef<{ itemId: string; timestamp: number } | null>(null);

  const pathInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const columnResizeDragRef = useRef<ColumnResizeDrag | null>(null);
  const columnWidthsSaveTimeoutRef = useRef<number | null>(null);
  const columnPointerDragRef = useRef<ColumnPointerDrag | null>(null);
  const suppressColumnSortRef = useRef(false);
  const previousPathRef = useRef(tab.currentPath);
  const viewportRef = useRef<HTMLDivElement>(null);
  const marqueeDragRef = useRef<MarqueeDrag | null>(null);
  const marqueePreviewIdsRef = useRef<string[] | null>(null);
  const suppressViewportClickRef = useRef(false);
  const [marqueeBounds, setMarqueeBounds] = useState<MarqueeBounds | null>(null);
  const [marqueePreviewIds, setMarqueePreviewIds] = useState<string[] | null>(null);
  const [viewportScrollbarWidth, setViewportScrollbarWidth] = useState(0);

  const visibleFileColumns = columnLayout.order.filter(column => columnLayout.visible.includes(column));
  const columnSortFields: Record<FileColumn, SortField> = {
    extension: 'extension',
    name: 'name',
    size: 'size',
    created: 'createdDate',
    modified: 'modifiedDate',
  };
  const columnLabel = (column: FileColumn) => {
    switch (column) {
      case 'extension': return t.pane.columns.extension;
      case 'name': return t.pane.columns.name;
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

  const hasRecentActivity = (item: FileItem) => {
    const changedAt = Math.max(item.createdAtMs ?? 0, item.modifiedAtMs ?? 0);
    return changedAt > 0 && changedAt <= currentTime && currentTime - changedAt <= RECENT_ITEM_WINDOW_MS;
  };

  const isRecentlyChanged = (item: FileItem) => recentItemStyle.enabled && hasRecentActivity(item);

  const getRecentNameStyle = (item: FileItem, selected = false): React.CSSProperties | undefined => isRecentlyChanged(item)
    ? {
      color: recentItemStyle.textColor,
      fontWeight: recentItemStyle.bold ? 700 : 400,
      fontStyle: recentItemStyle.italic ? 'italic' : 'normal',
      ...(selected && recentItemStyle.backgroundEnabled ? {
        backgroundColor: `color-mix(in srgb, ${recentItemStyle.backgroundColor} 18%, transparent)`,
        borderRadius: 3,
        paddingInline: 3,
      } : {}),
    }
    : undefined;

  const getRecentBackgroundStyle = (item: FileItem, selected: boolean): React.CSSProperties | undefined =>
    isRecentlyChanged(item) && recentItemStyle.backgroundEnabled && !selected
      ? { backgroundColor: `color-mix(in srgb, ${recentItemStyle.backgroundColor} 18%, transparent)` }
      : undefined;

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
      {item.path && <span className="break-all font-mono text-[10px] text-cyan-200">{item.path}</span>}
      {!item.isFolder && <span>{formatFileSize(item.size)}</span>}
      {item.modifiedDate && (
        <span className="text-[10px] text-neutral-300">
          {t.pane.itemTooltipModifiedDate.replace('{date}', item.modifiedDate)}
        </span>
      )}
      {hasRecentActivity(item) && (
        <span className="mt-0.5 rounded-full border border-cyan-400/25 bg-cyan-950/50 px-2 py-0.5 text-[10px] text-cyan-200">
          {t.pane.itemTooltipRecentActivity}
        </span>
      )}
      {additionalDetails}
    </div>
  );

  const fileGridTemplateColumns = visibleFileColumns.map(columnWidth).join(' ');
  const detailsTableMinimumWidth = visibleFileColumns.reduce((total, column) => total + (column === 'name' ? columnWidths.name ?? MIN_NAME_COLUMN_WIDTH : columnWidths[column]), 0)
    + Math.max(0, visibleFileColumns.length - 1) * 8 + 18 + viewportScrollbarWidth;

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
    setPathInput(tab.currentPath);
  }, [tab.currentPath]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${COLLAPSED_SYSTEM_HOME_SECTIONS_KEY}_${paneId}`, JSON.stringify(collapsedSystemHomeSections));
    } catch {
      // Section state remains available for the current session if storage is unavailable.
    }
  }, [collapsedSystemHomeSections, paneId]);

  useEffect(() => {
    if (columnWidthsSaveTimeoutRef.current !== null) window.clearTimeout(columnWidthsSaveTimeoutRef.current);
    columnWidthsSaveTimeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`${FILE_COLUMN_WIDTHS_KEY}_${paneId}`, JSON.stringify(columnWidths));
      } catch {
        // Column widths remain available for the current session if storage is unavailable.
      }
      columnWidthsSaveTimeoutRef.current = null;
    }, 180);
    return () => {
      if (columnWidthsSaveTimeoutRef.current !== null) window.clearTimeout(columnWidthsSaveTimeoutRef.current);
      columnWidthsSaveTimeoutRef.current = null;
    };
  }, [columnWidths, paneId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${FILE_COLUMN_LAYOUT_KEY}_${paneId}`, JSON.stringify(columnLayout));
    } catch {
      // Column layout remains available for the current session if storage is unavailable.
    }
  }, [columnLayout, paneId]);

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
    if (previousPathRef.current === tab.currentPath) return;
    previousPathRef.current = tab.currentPath;
    if (!styleLocked) setColumnWidths(DEFAULT_FILE_COLUMN_WIDTHS);
  }, [tab.currentPath, styleLocked]);

  const startColumnResize = (column: ResizableColumn, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const measuredNameWidth = event.currentTarget.parentElement?.clientWidth ?? MIN_NAME_COLUMN_WIDTH;
    const dragWidths = column === 'name' && columnWidths.name === null
      ? { ...columnWidths, name: measuredNameWidth }
      : columnWidths;
    columnResizeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      column,
      widths: dragWidths,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = columnResizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setColumnWidths(resizeFileColumns(drag.widths, drag.column, event.clientX - drag.startX));
  };

  const finishColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (columnResizeDragRef.current?.pointerId === event.pointerId) columnResizeDragRef.current = null;
  };

  const resizeHandle = (column: ResizableColumn, label: string) => (
    <Tooltip label={t.pane.resizeColumn.replace('{column}', label)} placement="top">
      <button
        type="button"
        role="separator"
        aria-orientation="vertical"
        aria-label={t.pane.resizeColumn.replace('{column}', label)}
        onClick={event => event.stopPropagation()}
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

  const handleRenameSubmit = (itemId: string) => {
    if (editingItemName.trim()) {
      onInlineRename(itemId, editingItemName.trim());
    }
    setEditingItemId(null);
  };

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
    if ((event.target as HTMLElement).closest('[data-file-item], button, input, select, textarea, a, [contenteditable="true"]')) return;
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
    const tooltipLabel = renderItemTooltip(item, drive ? (
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
        style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getRecentBackgroundStyle(item, selected) }}
        className={`group flex min-h-[68px] w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
          selected
            ? 'border-cyan-500/60 bg-cyan-950/45 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
            : 'border-transparent bg-neutral-900/35 hover:border-neutral-700/80 hover:bg-neutral-800/70'
        }`}
      >
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${
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
          <span className="block truncate text-xs text-neutral-100 font-medium" style={getRecentNameStyle(item, selected)}>{item.name}</span>
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
        className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded text-left text-[11px] font-semibold text-neutral-300 outline-none hover:text-neutral-100 focus-visible:ring-1 focus-visible:ring-cyan-500/70"
      >
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-neutral-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
        <span className="whitespace-nowrap">{label}</span>
        <span className="h-px flex-1 bg-neutral-800" />
      </button>
    );
  };

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
      {/* 1. File tabs header */}
      <div className="flex items-center bg-neutral-950/90 border-b border-neutral-800 px-1 pt-1 overflow-x-auto no-scrollbar select-none">
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
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-medium cursor-pointer border-t border-x transition-colors max-w-[180px] min-w-[100px] ${
                  isTabActive
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-100 border-b-transparent relative z-10'
                    : 'bg-neutral-950/40 border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
                }`}
              >
                <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isTabActive ? 'text-cyan-400' : 'text-neutral-500'}`} />
                <span className="truncate text-[11px]">{tabItem.title || t.pane.noFolderOpen}</span>

                {tabs.length > 1 && (
                  <Tooltip label={t.pane.closeTab} placement="bottom">
                    <button
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

          {/* Add Tab Button */}
          <Tooltip label={`${t.pane.addTab} (Ctrl+T)`} placement="bottom">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddTab();
              }}
              className="p-1.5 ml-1 text-neutral-400 hover:text-cyan-300 hover:bg-neutral-800 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-mono px-2">
          <span>{paneId === 'left' ? t.statusBar.leftPane : t.statusBar.rightPane}</span>
        </div>
      </div>

      {/* 2. Navigation & Breadcrumb Bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-neutral-900 border-b border-neutral-800 text-xs select-none">
        <Tooltip label={`${t.toolbar.back} (Alt+${language === 'es' ? 'Izquierda' : 'Left'})`} disabled={tab.historyIndex <= 0}><button onClick={onNavigateBack} disabled={tab.historyIndex <= 0} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowLeft className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={`${t.toolbar.forward} (Alt+${language === 'es' ? 'Derecha' : 'Right'})`} disabled={tab.historyIndex >= tab.history.length - 1}><button onClick={onNavigateForward} disabled={tab.historyIndex >= tab.history.length - 1} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowRight className="w-3.5 h-3.5" /></button></Tooltip>
        <Tooltip label={`${t.toolbar.up} (Backspace / Alt+${language === 'es' ? 'Arriba' : 'Up'})`} disabled={isSystemHome}><button onClick={onNavigateUp} disabled={isSystemHome} className="p-1 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 transition-colors"><ArrowUp className="w-3.5 h-3.5" /></button></Tooltip>

        {/* Breadcrumb Path Box */}
        <div 
          onClick={() => tab.currentPath && !isSystemHome && !isRecycleBin && setIsEditingPath(true)}
          className={`flex-1 flex items-center bg-neutral-950 px-2 py-1 rounded border border-neutral-800 min-h-[28px] overflow-hidden ${tab.currentPath && !isSystemHome && !isRecycleBin ? 'cursor-text hover:border-neutral-700' : 'cursor-default'}`}
        >
          {isSystemHome ? (
            <div className="flex items-center gap-1.5 px-1 text-neutral-200 text-xs font-mono">
              <Monitor className="h-3.5 w-3.5 text-cyan-400" />
              <span>{t.sidebar.thisPc}</span>
            </div>
          ) : isRecycleBin ? (
            <div className="flex items-center gap-1.5 px-1 text-neutral-200 text-xs font-mono">
              <Trash2 className="h-3.5 w-3.5 text-rose-300" />
              <span>{t.sidebar.recycleBinTitle}</span>
            </div>
          ) : isEditingPath ? (
            <form onSubmit={handlePathSubmit} className="w-full">
              <input
                ref={pathInputRef}
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onBlur={() => setIsEditingPath(false)}
                className="w-full bg-transparent text-neutral-100 text-xs outline-none font-mono"
              />
            </form>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar font-mono text-xs">
              {breadcrumbSegments.length === 0 && <span className="px-1 text-neutral-500">{t.pane.noFolderOpen}</span>}
              {breadcrumbSegments.map((seg, i) => (
                <React.Fragment key={seg.fullPath}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(seg.fullPath);
                    }}
                    className="hover:text-cyan-300 hover:underline px-1 py-0.5 rounded text-neutral-300 truncate"
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
        </div>

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
            className="w-full bg-neutral-900 pl-7 pr-7 py-1 rounded text-xs text-neutral-200 placeholder:text-neutral-500 border border-neutral-800 focus:border-cyan-500/60 focus:outline-none font-mono"
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

        <div className="text-[10px] text-neutral-400 font-mono whitespace-nowrap">
          {files.length} elem.
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
        <div className="flex min-h-0 flex-1 flex-col" style={{ width: effectiveViewMode === 'details' ? `max(100%, ${detailsTableMinimumWidth}px)` : '100%' }}>
      {/* 4. Column Headers (Details View) */}
      {effectiveViewMode === 'details' && !isSystemHome && (
        <div
          className="grid shrink-0 items-center gap-2 border-x border-b border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 select-none"
          style={{ gridTemplateColumns: fileGridTemplateColumns, paddingRight: `${8 + viewportScrollbarWidth}px` }}
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
                  <span className="min-w-0 truncate">{columnLabel(column)}</span>
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
                <Tooltip key={column} label={t.pane.columns.columnHeaderTooltip} placement="right">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isVisible}
                    onClick={() => toggleFileColumn(column)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                  >
                    <span aria-hidden="true" className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${isVisible ? 'border-cyan-500 bg-cyan-950 text-cyan-300' : 'border-neutral-600 text-transparent'}`}>✓</span>
                    <span>{columnLabel(column)}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>,
          document.body,
        )
      )}

      {/* 5. File Items Viewport */}
      <div 
        ref={viewportRef}
        className={`relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto py-0.5 select-none focus:outline-none ${marqueeBounds ? 'cursor-crosshair' : ''}`}
        tabIndex={0}
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
          <div className="divide-y divide-neutral-900/40">
            {files.map((item, idx) => {
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
                  style={{ gridTemplateColumns: fileGridTemplateColumns, cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getRecentBackgroundStyle(item, isSelected) }}
                  className={`grid items-center gap-2 border px-2 py-1 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-950/70 border-cyan-700/60 text-neutral-100 font-medium'
                      : isZebra
                        ? 'bg-neutral-900/30 border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100'
                        : 'bg-transparent border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100'
                  }`}
                >
                  {visibleFileColumns.map(column => {
                    if (column === 'extension') {
                      return <div key={column} className="min-w-0 truncate font-mono text-[10px] uppercase text-neutral-400">{item.isFolder ? '' : (item.extension || '')}</div>;
                    }
                    if (column === 'name') {
                      return (
                        <div key={column} className="flex min-w-0 items-center gap-2">
                          <span className="flex-shrink-0">{getFileIcon(item.type, item.isFolder)}</span>
                          {item.colorLabel && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              item.colorLabel === 'red' ? 'bg-red-400' :
                              item.colorLabel === 'blue' ? 'bg-blue-400' :
                              item.colorLabel === 'green' ? 'bg-emerald-400' :
                              item.colorLabel === 'yellow' ? 'bg-amber-400' : 'bg-purple-400'
                            }`} />
                          )}
                          {isEditing ? (
                            <form onSubmit={event => { event.preventDefault(); handleRenameSubmit(item.id); }} className="flex-1">
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={editingItemName}
                                onChange={event => setEditingItemName(event.target.value)}
                                onBlur={() => handleRenameSubmit(item.id)}
                                className="w-full bg-neutral-950 text-neutral-100 px-1 py-0.5 rounded border border-cyan-400 outline-none text-xs"
                              />
                            </form>
                          ) : (
                            <Tooltip label={renderItemTooltip(item)} placement="top">
                              <span className="truncate text-[11.5px] font-medium" style={getRecentNameStyle(item, isSelected)}>{item.name}</span>
                            </Tooltip>
                          )}
                        </div>
                      );
                    }
                    if (column === 'size') {
                      return <div key={column} className="min-w-0 text-right font-mono text-[11px] text-neutral-400">{item.isFolder ? '--' : formatFileSize(item.size)}</div>;
                    }
                    if (column === 'created') {
                      const createdDate = item.createdDate || (item.createdAtMs ? new Date(item.createdAtMs).toISOString().replace('T', ' ').slice(0, 16) : '');
                      return <div key={column} className="min-w-0 text-right font-mono text-[10px] text-neutral-400">{createdDate || '--'}</div>;
                    }
                    return <div key={column} className="min-w-0 text-right font-mono text-[10px] text-neutral-400">{item.modifiedDate || '--'}</div>;
                  })}
                </div>
              );
            })}
          </div>
        ) : effectiveViewMode === 'compact' ? (
          <div className="grid grid-cols-1 gap-x-2 gap-y-1 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((item, idx) => {
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
                  style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getRecentBackgroundStyle(item, isSelected) }}
                  className={`flex min-w-0 items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? 'border-cyan-700/60 bg-cyan-950/70 text-neutral-100'
                      : 'border-transparent text-neutral-300 hover:border-neutral-800 hover:bg-neutral-800/60 hover:text-neutral-100'
                  }`}
                >
                  <span className="flex-shrink-0">{getFileIcon(item.type, item.isFolder)}</span>
                  <Tooltip label={renderItemTooltip(item)} placement="top">
                    <span className="min-w-0 flex-1 truncate" style={getRecentNameStyle(item, isSelected)}>{item.name}</span>
                  </Tooltip>
                  {!item.isFolder && <span className="flex-shrink-0 font-mono text-[10px] text-neutral-500">{formatFileSize(item.size)}</span>}
                </div>
              );
            })}
          </div>
        ) : (
          /* Icons / Grid View */
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {files.map((item, idx) => {
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
                  style={{ cursor: singleClickOpens && !item.recycleBinId ? 'pointer' : 'default', ...getRecentBackgroundStyle(item, isSelected) }}
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
                        <div className="scale-[2]">
                        {getFileIcon(item.type, item.isFolder)}
                        </div>
                      </div>
                    )}
                  </div>
                  <Tooltip label={renderItemTooltip(item)} placement="top">
                    <span className="w-full truncate px-1 text-[11px] font-medium" style={getRecentNameStyle(item, isSelected)}>{item.name}</span>
                  </Tooltip>
                  <span className="mt-0.5 text-[9px] font-mono text-neutral-400">
                    {item.isFolder ? 'Carpeta' : formatFileSize(item.size)}
                  </span>
                </div>
              );
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

      {/* 6. Footer Status Bar with Mini Storage Distribution Strip */}
      <div className="px-2.5 py-1 bg-neutral-950 border-t border-neutral-800 text-[10px] font-mono text-neutral-400 flex items-center justify-between select-none gap-2">
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

        <div className="text-neutral-500 hidden lg:block">
          F2: Renombrar · F5: Copiar · F6: Mover · F3: Ver
        </div>
      </div>
    </div>
  );
};
