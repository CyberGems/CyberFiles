import React, { useEffect, useState, useMemo } from 'react';
import { 
  HardDrive, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Code2, 
  Music, 
  Video,
  Archive,
  Binary,
  Monitor, 
  FolderOpen, 
  ChevronDown,
  ChevronRight,
  Clock,
  FolderTree,
  Search,
  Trash2,
  Eye,
  X,
  Plus,
  GripVertical,
  Copy,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Pencil,
  Check,
  Square,
  ListRestart,
  Info,
  RotateCcw,
  Home,
  ListChecks,
} from 'lucide-react';
import { ArchiveExtractionMode, DriveInfo, FileItem, FileType, QuickAccessItem, QuickAccessSortMode, RECYCLE_BIN_PATH, SYSTEM_HOME_PATH } from '../types';
import { formatFileSize, formatRelativeTime, getParentPath } from '../utils/fileSystem';
import { isTauriDesktop, listNativeDirectory, type RecycleBinStatus } from '../utils/nativeFileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface FolderTreeState {
  folders: FileItem[];
  hasMore: boolean;
  nextOffset: number;
  loading: boolean;
  loaded: boolean;
  error: boolean;
}

interface SidebarProps {
  drives: DriveInfo[];
  quickAccess: QuickAccessItem[];
  onAddQuickAccess?: () => void;
  quickAccessSortMode: QuickAccessSortMode;
  onQuickAccessSortModeChange: (mode: QuickAccessSortMode) => void;
  onReorderQuickAccess: (draggedId: string, targetId: string) => void;
  onMoveQuickAccess: (itemId: string, direction: -1 | 1) => void;
  onOpenCustomQuickAccess: (item: QuickAccessItem) => void;
  onRenameQuickAccess: (id: string, name: string) => void;
  onRemoveQuickAccess: (id: string) => void;
  allFiles?: FileItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenDrive?: (path: string) => void;
  onSelectRecentFile?: (file: FileItem) => void;
  onClearRecentFiles?: () => void;
  selectedItems: FileItem[];
  onClearSelection: () => void;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onInvertSelection: () => void;
  onTogglePropertiesPanel: () => void;
  propertiesPanelOpen: boolean;
  onRenameSelected: () => void;
  onDeleteSelected: () => void;
  onPreviewSelectedFile: (item: FileItem) => void;
  supportsArchiveExtraction: boolean;
  onExtractSelected: (item: FileItem, mode: ArchiveExtractionMode) => void;
  supportsArchiveCreation: boolean;
  onCreateZipSelected: () => void;
  onCopySelectedPaths: (items: FileItem[]) => void;
  recycleBinSupported: boolean;
  recycleBinStatus: RecycleBinStatus | null;
  isDualPane: boolean;
  isHorizontalDual: boolean;
  hasLeftPaneSelection: boolean;
  hasRightPaneSelection: boolean;
  onCopyLeftToRight: () => void;
  onCopyRightToLeft: () => void;
  onMoveLeftToRight: () => void;
  onMoveRightToLeft: () => void;
  onOpenRecycleBin: () => void;
  onRestoreRecycleBinItems: () => void;
  onRequestEmptyRecycleBin: () => void;
  isCollapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  drives,
  quickAccess,
  onAddQuickAccess,
  quickAccessSortMode,
  onQuickAccessSortModeChange,
  onReorderQuickAccess,
  onMoveQuickAccess,
  onOpenCustomQuickAccess,
  onRenameQuickAccess,
  onRemoveQuickAccess,
  allFiles = [],
  currentPath,
  onNavigate,
  onOpenDrive,
  onSelectRecentFile,
  onClearRecentFiles,
  selectedItems,
  onClearSelection,
  onSelectAll,
  onUnselectAll,
  onInvertSelection,
  onTogglePropertiesPanel,
  propertiesPanelOpen,
  onRenameSelected,
  onDeleteSelected,
  onPreviewSelectedFile,
  supportsArchiveExtraction,
  onExtractSelected,
  supportsArchiveCreation,
  onCreateZipSelected,
  onCopySelectedPaths,
  recycleBinSupported,
  recycleBinStatus,
  isDualPane,
  isHorizontalDual,
  hasLeftPaneSelection,
  hasRightPaneSelection,
  onCopyLeftToRight,
  onCopyRightToLeft,
  onMoveLeftToRight,
  onMoveRightToLeft,
  onOpenRecycleBin,
  onRestoreRecycleBinItems,
  onRequestEmptyRecycleBin,
}) => {
  const { t, language } = useLanguage();
  const ForwardPaneArrow = isHorizontalDual ? ArrowDown : ArrowRight;
  const BackwardPaneArrow = isHorizontalDual ? ArrowUp : ArrowLeft;
  const [activeTab, setActiveTab] = useState<'tree' | 'recent'>('tree');
  const [showLauncherWithSelection, setShowLauncherWithSelection] = useState(false);
  const showSelectionContext = selectedItems.length > 0 && !showLauncherWithSelection;
  const [recentSearch, setRecentSearch] = useState('');
  const [recentCategory, setRecentCategory] = useState<'all' | 'code' | 'image' | 'document' | 'media'>('all');
  const [editingQuickAccessId, setEditingQuickAccessId] = useState<string | null>(null);
  const [editingQuickAccessName, setEditingQuickAccessName] = useState('');
  const [draggingQuickAccessId, setDraggingQuickAccessId] = useState<string | null>(null);
  const [dragTargetQuickAccessId, setDragTargetQuickAccessId] = useState<string | null>(null);
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(() => new Set());
  const [folderTreeStates, setFolderTreeStates] = useState<Record<string, FolderTreeState>>({});
  const [quickAccessSortOpen, setQuickAccessSortOpen] = useState(false);
  const quickAccessSortRef = React.useRef<HTMLDivElement>(null);

  const loadFolderTreeChildren = async (path: string, offset = 0) => {
    setFolderTreeStates(previous => {
      const current = previous[path];
      if (current?.loading) return previous;
      return {
        ...previous,
        [path]: {
          folders: current?.folders ?? [],
          hasMore: current?.hasMore ?? false,
          nextOffset: current?.nextOffset ?? 0,
          loading: true,
          loaded: current?.loaded ?? false,
          error: false,
        },
      };
    });
    try {
      const page = await listNativeDirectory(path, offset);
      setFolderTreeStates(previous => {
        const current = previous[path];
        const folders = page.entries.filter(entry => entry.isFolder);
        return {
          ...previous,
          [path]: {
            folders: offset === 0 ? folders : [...(current?.folders ?? []), ...folders],
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            loading: false,
            loaded: true,
            error: false,
          },
        };
      });
    } catch {
      setFolderTreeStates(previous => ({
        ...previous,
        [path]: {
          folders: previous[path]?.folders ?? [],
          hasMore: false,
          nextOffset: previous[path]?.nextOffset ?? 0,
          loading: false,
          loaded: previous[path]?.loaded ?? false,
          error: true,
        },
      }));
    }
  };

  const toggleFolderTreePath = (path: string) => {
    const willExpand = !expandedFolderPaths.has(path);
    setExpandedFolderPaths(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    const state = folderTreeStates[path];
    if (willExpand && !state?.loaded && !state?.loading) void loadFolderTreeChildren(path);
  };

  const renderFolderTreeChildren = (path: string, depth: number): React.ReactNode => {
    const state = folderTreeStates[path];
    if (!state) return null;
    return (
      <div className="space-y-0.5">
        {state.loading && state.folders.length === 0 && (
          <div className="px-2 py-1 text-[10px] text-neutral-500">{t.sidebar.loadingFolderTree}</div>
        )}
        {state.error && state.folders.length === 0 && (
          <div className="px-2 py-1 text-[10px] text-rose-300">{t.sidebar.folderTreeFailed}</div>
        )}
        {state.loaded && state.folders.length === 0 && !state.error && (
          <div className="px-2 py-1 text-[10px] text-neutral-500">{t.sidebar.noSubfolders}</div>
        )}
        {state.folders.map(folder => {
          const childExpanded = expandedFolderPaths.has(folder.path);
          const childState = folderTreeStates[folder.path];
          return (
            <div key={folder.path}>
              <div className="flex min-w-0 items-center gap-0.5" style={{ paddingLeft: String(Math.min(depth, 12) * 10) + 'px' }}>
                <Tooltip label={(childExpanded ? t.sidebar.collapseFolderTree : t.sidebar.expandFolderTree).replace('{name}', folder.name)} placement="right">
                  <button
                    type="button"
                    aria-label={(childExpanded ? t.sidebar.collapseFolderTree : t.sidebar.expandFolderTree).replace('{name}', folder.name)}
                    aria-expanded={childExpanded}
                    onClick={() => toggleFolderTreePath(folder.path)}
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-cyan-200"
                  >
                    {childExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                </Tooltip>
                <Tooltip label={t.sidebar.openTreeFolder.replace('{name}', folder.name)} placement="right">
                  <button
                    type="button"
                    onClick={() => onNavigate(folder.path)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[10px] text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
                  >
                    <FolderOpen className="h-3 w-3 flex-shrink-0 text-amber-300" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </Tooltip>
              </div>
              {childExpanded && renderFolderTreeChildren(folder.path, depth + 1)}
              {childExpanded && childState?.loading && childState.folders.length > 0 && (
                <div className="py-0.5 text-[9px] text-neutral-500" style={{ paddingLeft: String(Math.min(depth + 1, 12) * 10 + 20) + 'px' }}>{t.sidebar.loadingFolderTree}</div>
              )}
            </div>
          );
        })}
        {state.hasMore && (
          <Tooltip label={t.sidebar.loadNextFolderPage} placement="right">
            <button
              type="button"
              disabled={state.loading}
              onClick={() => void loadFolderTreeChildren(path, state.nextOffset)}
              className="ml-5 rounded px-1.5 py-0.5 text-left text-[9px] text-cyan-300 hover:bg-neutral-900 disabled:opacity-50"
            >
              {state.loading ? t.sidebar.loadingFolderTree : t.sidebar.loadMoreFolders}
            </button>
          </Tooltip>
        )}
      </div>
    );
  };
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('cyberfiles_sidebar_collapsed_sections_v1') || 'null');
      return {
        drives: saved?.drives === true,
        quickAccess: saved?.quickAccess === true,
      };
    } catch {
      return { drives: false, quickAccess: false };
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('cyberfiles_sidebar_collapsed_sections_v1', JSON.stringify(collapsedSections));
    } catch {
      // Sidebar section preferences remain available for the current session.
    }
  }, [collapsedSections]);

  useEffect(() => {
    if (selectedItems.length === 0) setShowLauncherWithSelection(false);
  }, [selectedItems.length]);

  useEffect(() => {
    if (!quickAccessSortOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!quickAccessSortRef.current?.contains(event.target as Node)) setQuickAccessSortOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuickAccessSortOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [quickAccessSortOpen]);

  const toggleSection = (section: 'drives' | 'quickAccess') => {
    setCollapsedSections(previous => ({ ...previous, [section]: !previous[section] }));
  };

  const startQuickAccessRename = (item: QuickAccessItem) => {
    setEditingQuickAccessId(item.id);
    setEditingQuickAccessName(item.name);
  };

  const cancelQuickAccessRename = () => {
    setEditingQuickAccessId(null);
    setEditingQuickAccessName('');
  };

  const saveQuickAccessRename = (id: string) => {
    const name = editingQuickAccessName.trim().slice(0, 80);
    if (!name) return;
    onRenameQuickAccess(id, name);
    cancelQuickAccessRename();
  };

  const getQuickAccessIcon = (iconName: string) => {
    switch (iconName) {
      case 'monitor': return <Monitor className="w-3.5 h-3.5" />;
      case 'desktop': return <Monitor className="w-3.5 h-3.5" />;
      case 'download': return <Download className="w-3.5 h-3.5" />;
      case 'downloads': return <Download className="w-3.5 h-3.5" />;
      case 'documents': return <FileText className="w-3.5 h-3.5" />;
      case 'pictures': return <ImageIcon className="w-3.5 h-3.5" />;
      case 'music': return <Music className="w-3.5 h-3.5" />;
      case 'videos': return <Video className="w-3.5 h-3.5" />;
      case 'folder': return <FolderOpen className="w-3.5 h-3.5" />;
      case 'image': return <ImageIcon className="w-3.5 h-3.5" />;
      case 'code': return <Code2 className="w-3.5 h-3.5" />;
      case 'music': return <Music className="w-3.5 h-3.5" />;
      default: return <FolderOpen className="w-3.5 h-3.5" />;
    }
  };

  const getFileTypeIcon = (type: FileType) => {
    switch (type) {
      case 'code': return <Code2 className="w-3.5 h-3.5 text-cyan-400" />;
      case 'image': return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
      case 'audio': return <Music className="w-3.5 h-3.5 text-pink-400" />;
      case 'video': return <Video className="w-3.5 h-3.5 text-purple-400" />;
      case 'document':
      case 'text': return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'archive': return <Archive className="w-3.5 h-3.5 text-amber-400" />;
      default: return <Binary className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  // Recent files list sorted by lastAccessed descending
  const recentFiles = useMemo(() => {
    const list = allFiles.filter(f => !f.isFolder && f.lastAccessed);
    return list.sort((a, b) => {
      const timeA = new Date(a.lastAccessed!).getTime();
      const timeB = new Date(b.lastAccessed!).getTime();
      return timeB - timeA;
    });
  }, [allFiles]);

  // Filtered recent files
  const filteredRecentFiles = useMemo(() => {
    return recentFiles.filter(f => {
      if (recentCategory === 'code' && f.type !== 'code') return false;
      if (recentCategory === 'image' && f.type !== 'image') return false;
      if (recentCategory === 'document' && f.type !== 'document' && f.type !== 'text') return false;
      if (recentCategory === 'media' && f.type !== 'audio' && f.type !== 'video') return false;

      if (recentSearch.trim()) {
        const q = recentSearch.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [recentFiles, recentCategory, recentSearch]);

  const canEmptyRecycleBin = recycleBinSupported && recycleBinStatus?.available === true && recycleBinStatus.itemCount > 0;
  const hasRecycleBinSelection = selectedItems.length > 0 && selectedItems.every(item => Boolean(item.recycleBinId));
  const canRestoreRecycleBinSelection = hasRecycleBinSelection && selectedItems.every(item => Boolean(item.originalPath));
  const recycleBinStateLabel = !recycleBinSupported
    ? t.sidebar.recycleBinDesktopOnly
    : !recycleBinStatus
      ? t.sidebar.recycleBinChecking
      : !recycleBinStatus.available
        ? t.sidebar.recycleBinUnavailable
        : recycleBinStatus.itemCount === 0
          ? t.sidebar.recycleBinEmpty
          : t.sidebar.recycleBinContents
            .replace('{count}', new Intl.NumberFormat(language === 'es' ? 'es' : 'en').format(recycleBinStatus.itemCount))
            .replace('{size}', formatFileSize(recycleBinStatus.totalBytes));

  return (
    <aside className="h-full w-full min-w-0 overflow-hidden bg-neutral-950 border-r border-neutral-800/80 flex flex-col justify-between select-none flex-shrink-0 text-xs">
      
      {/* 1. Header Tabs: Explorador vs Archivos Recientes */}
      <div className="p-2 border-b border-neutral-800/80 bg-neutral-900/60 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('tree')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-[11px] transition-all ${
            activeTab === 'tree'
              ? 'bg-neutral-800 text-cyan-300 shadow-sm border border-neutral-700/60 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t.sidebar.tabLocations}</span>
        </button>

        <button
          onClick={() => setActiveTab('recent')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-[11px] transition-all relative ${
            activeTab === 'recent'
              ? 'bg-neutral-800 text-cyan-300 shadow-sm border border-neutral-700/60 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>{t.sidebar.tabRecent}</span>
          {recentFiles.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-sans bg-neutral-950 text-cyan-400 border border-neutral-700">
              {recentFiles.length}
            </span>
          )}
        </button>
      </div>

      {currentPath !== SYSTEM_HOME_PATH && (
        <div className="border-b border-neutral-800/80 bg-neutral-950 px-2 py-2">
          <div className="grid grid-cols-4 gap-1.5">
            <Tooltip label={t.sidebar.selectAll} placement="right">
              <button type="button" onClick={onSelectAll} aria-label={t.sidebar.selectAll} className="flex h-9 min-w-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900/70 text-cyan-300 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800">
                <Check className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label={t.sidebar.unselectAll} placement="right">
              <button type="button" onClick={onUnselectAll} aria-label={t.sidebar.unselectAll} className="flex h-9 min-w-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 hover:text-neutral-100">
                <Square className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label={t.sidebar.invertSelection} placement="right">
              <button type="button" onClick={onInvertSelection} aria-label={t.sidebar.invertSelection} className="flex h-9 min-w-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900/70 text-amber-300 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800">
                <ListRestart className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label={propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel} placement="right">
              <button type="button" onClick={onTogglePropertiesPanel} aria-label={propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel} aria-pressed={propertiesPanelOpen} className={`flex h-9 w-full min-w-0 items-center justify-center rounded-md border transition-colors ${propertiesPanelOpen ? "border-cyan-700/70 bg-cyan-950/70 text-cyan-300" : "border-neutral-800 bg-neutral-900/70 text-neutral-400 hover:border-cyan-700/70 hover:bg-neutral-800 hover:text-cyan-200"}`}>
                <Info className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* 2. Main Tab Body */}
      {!showSelectionContext && selectedItems.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800/80 bg-cyan-950/15 px-3 py-2">
          <span className="truncate text-[10px] font-medium text-cyan-100">
            {selectedItems.length === 1 ? t.sidebar.oneItemSelected : t.sidebar.manyItemsSelected.replace('{count}', String(selectedItems.length))}
          </span>
          <Tooltip label={t.sidebar.showSelectionActions} placement="right">
            <button type="button" onClick={() => setShowLauncherWithSelection(false)} aria-label={t.sidebar.showSelectionActions} className="rounded p-1 text-cyan-300 transition-colors hover:bg-cyan-900/40">
              <ListChecks className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      )}
      {showSelectionContext ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.sidebar.selectionTitle}</h2>
              <p className="mt-1 text-xs font-medium text-neutral-100">
                {selectedItems.length === 1 ? t.sidebar.oneItemSelected : t.sidebar.manyItemsSelected.replace('{count}', String(selectedItems.length))}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip label={t.sidebar.showLauncher}>
                <button
                  type="button"
                  onClick={() => { setActiveTab('tree'); setShowLauncherWithSelection(true); }}
                  aria-label={t.sidebar.showLauncher}
                  className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-cyan-200"
                >
                  <Home className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip label={t.sidebar.clearSelection}>
                <button
                  type="button"
                  onClick={onClearSelection}
                  aria-label={t.sidebar.clearSelection}
                  className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2">
            {selectedItems.slice(0, 3).map(item => (
              <div key={item.id} className="flex min-w-0 items-center gap-2 py-1">
                <span className="flex-shrink-0">{item.isFolder ? <FolderOpen className="h-3.5 w-3.5 text-amber-300" /> : getFileTypeIcon(item.type)}</span>
                <div className="min-w-0 flex-1">
                  <Tooltip label={item.name} placement="top"><p className="truncate text-[11px] font-medium text-neutral-200">{item.name}</p></Tooltip>
                  <Tooltip label={item.path} placement="top"><p className="truncate font-sans text-[9px] text-neutral-500">{item.path}</p></Tooltip>
                </div>
              </div>
            ))}
            {selectedItems.length > 3 && (
              <p className="pt-1 text-[10px] text-neutral-500">{t.sidebar.moreSelected.replace('{count}', String(selectedItems.length - 3))}</p>
            )}
          </div>

          {hasRecycleBinSelection && (
            <button
              type="button"
              onClick={onRestoreRecycleBinItems}
              disabled={!canRestoreRecycleBinSelection}
              className="flex w-full items-center gap-2 rounded-md border border-cyan-800/70 bg-cyan-950/40 px-2.5 py-2 text-left text-[11px] font-medium text-cyan-200 transition-colors hover:border-cyan-600 hover:bg-cyan-950/70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t.sidebar.restoreSelected}</span>
            </button>
          )}

          {!hasRecycleBinSelection && selectedItems.length === 1 && !selectedItems[0].isFolder && (
            <button
              type="button"
              onClick={() => onPreviewSelectedFile(selectedItems[0])}
              className="flex w-full items-center gap-2 rounded-md border border-cyan-800/70 bg-cyan-950/40 px-2.5 py-2 text-left text-[11px] font-medium text-cyan-200 transition-colors hover:border-cyan-600 hover:bg-cyan-950/70"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{t.sidebar.previewSelected}</span>
            </button>
          )}

          {!hasRecycleBinSelection && supportsArchiveExtraction && selectedItems.length === 1 && !selectedItems[0].isFolder && ['zip', 'rar'].includes(selectedItems[0].extension.toLowerCase()) && (
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => onExtractSelected(selectedItems[0], 'here')} className="flex min-w-0 items-center gap-1.5 rounded-md border border-violet-900/60 bg-violet-950/20 px-2 py-2 text-left text-[10px] text-violet-100 transition-colors hover:border-violet-700 hover:bg-violet-950/50">
                <Archive className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" /><span className="truncate">{t.contextMenu.extractArchiveHere}</span>
              </button>
              <button type="button" onClick={() => onExtractSelected(selectedItems[0], 'folder')} className="flex min-w-0 items-center gap-1.5 rounded-md border border-violet-900/60 bg-violet-950/20 px-2 py-2 text-left text-[10px] text-violet-100 transition-colors hover:border-violet-700 hover:bg-violet-950/50">
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" /><span className="truncate">{t.contextMenu.extractArchiveFolderShort}</span>
              </button>
            </div>
          )}

          {!hasRecycleBinSelection && <>
          {isDualPane && (
            <div className="grid grid-cols-2 gap-1.5">
              <Tooltip label={isHorizontalDual ? t.sidebar.copyTopToBottomHint : t.sidebar.copyLeftToRightHint} placement="right">
                <button type="button" onClick={onCopyLeftToRight} disabled={!hasLeftPaneSelection} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
                  <ForwardPaneArrow className="h-3.5 w-3.5 flex-shrink-0 text-cyan-300" /><span>{isHorizontalDual ? t.sidebar.copyTopToBottom : t.sidebar.copyLeftToRight}</span>
                </button>
              </Tooltip>
              <Tooltip label={isHorizontalDual ? t.sidebar.copyBottomToTopHint : t.sidebar.copyRightToLeftHint} placement="right">
                <button type="button" onClick={onCopyRightToLeft} disabled={!hasRightPaneSelection} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
                  <BackwardPaneArrow className="h-3.5 w-3.5 flex-shrink-0 text-cyan-300" /><span>{isHorizontalDual ? t.sidebar.copyBottomToTop : t.sidebar.copyRightToLeft}</span>
                </button>
              </Tooltip>
              <Tooltip label={isHorizontalDual ? t.sidebar.moveTopToBottomHint : t.sidebar.moveLeftToRightHint} placement="right">
                <button type="button" onClick={onMoveLeftToRight} disabled={!hasLeftPaneSelection} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
                  <ForwardPaneArrow className="h-3.5 w-3.5 flex-shrink-0 text-blue-300" /><span>{isHorizontalDual ? t.sidebar.moveTopToBottom : t.sidebar.moveLeftToRight}</span>
                </button>
              </Tooltip>
              <Tooltip label={isHorizontalDual ? t.sidebar.moveBottomToTopHint : t.sidebar.moveRightToLeftHint} placement="right">
                <button type="button" onClick={onMoveRightToLeft} disabled={!hasRightPaneSelection} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
                  <BackwardPaneArrow className="h-3.5 w-3.5 flex-shrink-0 text-blue-300" /><span>{isHorizontalDual ? t.sidebar.moveBottomToTop : t.sidebar.moveRightToLeft}</span>
                </button>
              </Tooltip>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onRenameSelected} disabled={selectedItems.length !== 1} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
              <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" /><span>{t.toolbar.rename}</span>
            </button>
            <button type="button" onClick={onDeleteSelected} className="flex min-w-0 items-center gap-1.5 rounded-md border border-rose-900/60 bg-rose-950/20 px-2 py-2 text-left text-[10px] text-rose-200 transition-colors hover:border-rose-700 hover:bg-rose-950/50">
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" /><span>{t.toolbar.delete}</span>
            </button>
          </div>

          {supportsArchiveCreation && currentPath !== SYSTEM_HOME_PATH && currentPath !== RECYCLE_BIN_PATH && <Tooltip label={t.contextMenu.compressSelectionTooltip} placement="right">
            <button type="button" onClick={onCreateZipSelected} className="flex w-full items-center gap-2 rounded-md border border-violet-900/60 bg-violet-950/20 px-2.5 py-2 text-left text-[11px] font-medium text-violet-100 transition-colors hover:border-violet-700 hover:bg-violet-950/50">
              <Archive className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" /><span>{t.contextMenu.compressSelectedToZip}</span>
            </button>
          </Tooltip>}

          <button type="button" onClick={() => onCopySelectedPaths(selectedItems)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[10px] text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200">
            <Copy className="h-3.5 w-3.5" />{selectedItems.length === 1 ? t.sidebar.copySelectedPath : t.sidebar.copySelectedPaths}
          </button>
          </>}
        </div>
      ) : activeTab === 'tree' ? (
        <div className="p-3 space-y-5 overflow-y-auto flex-1">
          {drives.length > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => toggleSection('drives')}
              aria-expanded={!collapsedSections.drives}
              aria-label={`${t.sidebar.drivesTitle}: ${collapsedSections.drives ? t.sidebar.expandSection : t.sidebar.collapseSection}`}
              className="collapse-toggle flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              {collapsedSections.drives ? <ChevronRight data-collapse-chevron="true" className="h-3 w-3" /> : <ChevronDown data-collapse-chevron="true" className="h-3 w-3" />}
              <span>{t.sidebar.drivesTitle}</span>
            </button>

            {!collapsedSections.drives && <div className="space-y-1">
              {drives.map((drive) => {
                const hasCapacity = Number.isFinite(drive.totalBytes) && drive.totalBytes > 0;
                const usedPercentage = hasCapacity ? Math.min(100, Math.round((drive.usedBytes / drive.totalBytes) * 100)) : 0;
                const isSelected = currentPath.startsWith(drive.letter);

                return (
                  <button
                    key={drive.id}
                    onClick={() => onOpenDrive ? onOpenDrive(drive.letter + '\\') : onNavigate(drive.letter + '\\')}
                    className={`w-full text-left p-2 rounded-lg border transition-all ${
                      isSelected 
                        ? 'bg-neutral-900 border-cyan-500/40 text-neutral-100 shadow-sm' 
                        : 'bg-neutral-950/60 border-neutral-800/60 text-neutral-300 hover:bg-neutral-900/70 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <HardDrive className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-neutral-400'}`} />
                        <span className="font-sans font-bold text-xs">{drive.letter}</span>
                        <span className="text-[11px] text-neutral-400 truncate max-w-[100px]">{drive.label}</span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-sans">{hasCapacity ? `${usedPercentage}%` : '—'}</span>
                    </div>

                    {/* Usage Meter Bar */}
                    <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          usedPercentage > 85 ? 'bg-rose-500' : usedPercentage > 65 ? 'bg-amber-400' : 'bg-cyan-500'
                        }`}
                        style={{ width: hasCapacity ? `${usedPercentage}%` : '0%' }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] text-neutral-400 mt-1 font-sans">
                      <span>{language === 'es' ? 'Libre' : 'Free'}: {hasCapacity ? formatFileSize(drive.totalBytes - drive.usedBytes) : '—'}</span>
                      <span>Total: {hasCapacity ? formatFileSize(drive.totalBytes) : '—'}</span>
                    </div>
                  </button>
                );
              })}
            </div>}
          </div>
          )}

          <div className="flex items-center gap-1">
            <Tooltip label={recycleBinSupported ? t.sidebar.openRecycleBinAction : t.sidebar.recycleBinDesktopOnly} placement="right">
              <button
                type="button"
                disabled={!recycleBinSupported}
                onClick={onOpenRecycleBin}
                aria-label={t.sidebar.openRecycleBinAction}
                aria-current={currentPath === RECYCLE_BIN_PATH ? 'page' : undefined}
                className={"flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 " + (currentPath === RECYCLE_BIN_PATH ? "bg-neutral-800/90 text-cyan-300 font-medium" : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100")}
              >
                <Trash2 className={"h-4 w-4 flex-shrink-0 " + (currentPath === RECYCLE_BIN_PATH ? "text-cyan-300" : canEmptyRecycleBin ? "text-rose-300" : "text-neutral-500")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px]">{t.sidebar.recycleBinTitle}</span>
                  <span className="block truncate text-[9px] text-neutral-500">{recycleBinStateLabel}</span>
                </span>
              </button>
            </Tooltip>
            {canEmptyRecycleBin && (
              <Tooltip label={t.sidebar.emptyRecycleBinAction} placement="right">
                <button
                  type="button"
                  onClick={onRequestEmptyRecycleBin}
                  aria-label={t.sidebar.emptyRecycleBinAction}
                  className="flex-shrink-0 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-[9px] text-neutral-400 transition-colors hover:border-rose-800/70 hover:bg-rose-950/30 hover:text-rose-200"
                >
                  {t.sidebar.emptyRecycleBinButton}
                </button>
              </Tooltip>
            )}
          </div>

          {(quickAccess.length > 0 || onAddQuickAccess) && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleSection('quickAccess')}
                  aria-expanded={!collapsedSections.quickAccess}
                  aria-label={`${t.sidebar.quickAccessTitle}: ${collapsedSections.quickAccess ? t.sidebar.expandSection : t.sidebar.collapseSection}`}
                  className="collapse-toggle flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                >
                  {collapsedSections.quickAccess ? <ChevronRight data-collapse-chevron="true" className="h-3 w-3" /> : <ChevronDown data-collapse-chevron="true" className="h-3 w-3" />}
                  <span>{t.sidebar.quickAccessTitle}</span>
                </button>
                <div ref={quickAccessSortRef} className="relative">
                  <Tooltip label={t.sidebar.quickAccessSort} placement="right">
                    <button
                      type="button"
                      aria-label={t.sidebar.quickAccessSort}
                      aria-haspopup="menu"
                      aria-expanded={quickAccessSortOpen}
                      onClick={() => setQuickAccessSortOpen(open => !open)}
                      className="flex max-w-[68px] items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[9px] text-neutral-300 outline-none transition-colors hover:border-cyan-800 hover:bg-neutral-800 hover:text-cyan-100 focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                    >
                      <span>{quickAccessSortMode === 'manual' ? t.sidebar.quickAccessSortManual : quickAccessSortMode === 'name' ? t.sidebar.quickAccessSortName : t.sidebar.quickAccessSortNameDescending}</span>
                      <ChevronDown className="h-3 w-3 flex-shrink-0 text-neutral-500" />
                    </button>
                  </Tooltip>
                  {quickAccessSortOpen && (
                    <div role="menu" aria-label={t.sidebar.quickAccessSort} className="absolute right-0 top-full z-40 mt-1 w-28 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
                      {([
                        ['manual', t.sidebar.quickAccessSortManual],
                        ['name', t.sidebar.quickAccessSortName],
                        ['name-desc', t.sidebar.quickAccessSortNameDescending],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          role="menuitemradio"
                          aria-checked={quickAccessSortMode === mode}
                          onClick={() => { onQuickAccessSortModeChange(mode); setQuickAccessSortOpen(false); }}
                          className={"flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[10px] transition-colors " + (quickAccessSortMode === mode ? "bg-neutral-800 text-cyan-200" : "text-neutral-300 hover:bg-neutral-800/70 hover:text-neutral-100")}
                        >
                          <span>{label}</span>
                          {quickAccessSortMode === mode && <Check className="h-3 w-3 text-cyan-300" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {onAddQuickAccess && (
                  <Tooltip label={t.sidebar.addQuickAccess} placement="right">
                    <button
                      type="button"
                      onClick={onAddQuickAccess}
                      aria-label={t.sidebar.addQuickAccess}
                      className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
              </div>

              {!collapsedSections.quickAccess && <div className="space-y-0.5">
                {quickAccess.map(item => {
                  const isSelected = currentPath.toLowerCase() === item.path.toLowerCase();
                  const isEditing = editingQuickAccessId === item.id;

                  if (isEditing && item.isCustom) {
                    return (
                      <form
                        key={item.id}
                        onSubmit={event => {
                          event.preventDefault();
                          saveQuickAccessRename(item.id);
                        }}
                        className="flex min-w-0 items-center gap-1 rounded-md bg-neutral-900/80 px-1 py-1"
                      >
                        <Tooltip label={t.sidebar.quickAccessNamePlaceholder} placement="right">
                          <input
                            autoFocus
                            type="text"
                            value={editingQuickAccessName}
                            aria-label={t.sidebar.quickAccessNamePlaceholder}
                            maxLength={80}
                            onChange={event => setEditingQuickAccessName(event.target.value)}
                            onKeyDown={event => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelQuickAccessRename();
                              }
                            }}
                            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-[11px] text-neutral-100 outline-none focus:border-cyan-500/70"
                          />
                        </Tooltip>
                        <Tooltip label={t.sidebar.saveQuickAccessName} placement="right">
                          <button
                            type="submit"
                            disabled={!editingQuickAccessName.trim()}
                            aria-label={t.sidebar.saveQuickAccessName}
                            className="rounded p-1 text-cyan-300 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </Tooltip>
                        <Tooltip label={t.sidebar.cancelQuickAccessRename} placement="right">
                          <button
                            type="button"
                            onClick={cancelQuickAccessRename}
                            aria-label={t.sidebar.cancelQuickAccessRename}
                            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Tooltip>
                      </form>
                    );
                  }

                  const canExpandTree = isTauriDesktop() && item.path !== SYSTEM_HOME_PATH;
                  const treeExpanded = expandedFolderPaths.has(item.path);

                  return (
                    <React.Fragment key={item.id}>
                    <div
                      className={"group flex min-w-0 items-center gap-0.5 rounded " + (dragTargetQuickAccessId === item.id ? "ring-1 ring-cyan-500/60 bg-cyan-950/20 " : "") + (draggingQuickAccessId === item.id ? "opacity-50" : "")}
                      onDragOver={event => {
                        if (quickAccessSortMode !== 'manual' || item.path === SYSTEM_HOME_PATH) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragTargetQuickAccessId(item.id);
                      }}
                      onDrop={event => {
                        event.preventDefault();
                        const draggedId = event.dataTransfer.getData('text/plain') || draggingQuickAccessId;
                        if (draggedId && item.path !== SYSTEM_HOME_PATH) onReorderQuickAccess(draggedId, item.id);
                        setDraggingQuickAccessId(null);
                        setDragTargetQuickAccessId(null);
                      }}
                    >
                      {quickAccessSortMode === 'manual' && item.path !== SYSTEM_HOME_PATH && (
                        <Tooltip label={t.sidebar.quickAccessReorderHint} placement="right">
                          <button
                            type="button"
                            draggable
                            aria-label={t.sidebar.quickAccessReorder + ': ' + item.name}
                            onDragStart={event => {
                              setDraggingQuickAccessId(item.id);
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', item.id);
                            }}
                            onDragEnd={() => {
                              setDraggingQuickAccessId(null);
                              setDragTargetQuickAccessId(null);
                            }}
                            onKeyDown={event => {
                              if (!event.altKey) return;
                              const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
                              if (direction === 0) return;
                              event.preventDefault();
                              onMoveQuickAccess(item.id, direction);
                            }}
                            className="flex-shrink-0 cursor-grab rounded p-0.5 text-neutral-600 transition-colors hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>
                      )}
                      {canExpandTree && (
                        <Tooltip label={(treeExpanded ? t.sidebar.collapseFolderTree : t.sidebar.expandFolderTree).replace('{name}', item.name)} placement="right">
                          <button
                            type="button"
                            aria-label={(treeExpanded ? t.sidebar.collapseFolderTree : t.sidebar.expandFolderTree).replace('{name}', item.name)}
                            aria-expanded={treeExpanded}
                            onClick={() => toggleFolderTreePath(item.path)}
                            className="flex h-6 w-5 flex-shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-cyan-200"
                          >
                            {treeExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip label={item.path === SYSTEM_HOME_PATH ? item.name : item.path} placement="right">
                        <button
                          type="button"
                          onClick={() => item.path === SYSTEM_HOME_PATH || item.isCustom ? onOpenCustomQuickAccess(item) : onNavigate(item.path)}
                          className={`flex min-w-0 flex-1 items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-neutral-800/90 text-cyan-300 font-medium'
                              : 'text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={isSelected ? 'text-cyan-400' : 'text-neutral-400'}>
                              {getQuickAccessIcon(item.icon)}
                            </span>
                            <span className="truncate text-[11px]">{item.name}</span>
                          </span>

                          {item.count !== undefined && (
                            <span className="ml-1 flex-shrink-0 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[9px] font-sans text-neutral-400">
                              {item.count}
                            </span>
                          )}
                        </button>
                      </Tooltip>

                      {item.isCustom && (
                        <div className="flex flex-shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Tooltip label={t.sidebar.renameQuickAccess} placement="right">
                            <button
                              type="button"
                              onClick={() => startQuickAccessRename(item)}
                              aria-label={t.sidebar.renameQuickAccess}
                              className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </Tooltip>
                          <Tooltip label={t.sidebar.removeQuickAccess} placement="right">
                            <button
                              type="button"
                              onClick={() => onRemoveQuickAccess(item.id)}
                              aria-label={t.sidebar.removeQuickAccess}
                              className="rounded p-1 text-neutral-500 transition-colors hover:bg-rose-950/60 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/70"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                    {treeExpanded && (
                      <div className="pb-1" style={{ paddingLeft: quickAccessSortMode === 'manual' ? '1.75rem' : '0.25rem' }}>
                        {renderFolderTreeChildren(item.path, 1)}
                      </div>
                    )}
                    </React.Fragment>
                  );
                })}
              </div>}
            </div>
          )}
        </div>
      ) : (
        /* RECENT FILES TAB */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Recent Controls: Search & Category Filter */}
          <div className="p-2.5 border-b border-neutral-800/80 bg-neutral-900/30 space-y-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
                placeholder="Filtrar recientes..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-7 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-500/60 font-sans"
              />
              {recentSearch && (
                <button
                  onClick={() => setRecentSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
              {(['all', 'code', 'document', 'image', 'media'] as const).map(cat => {
                const labels: Record<string, string> = {
                  all: 'Todos',
                  code: 'Código',
                  document: 'Docs',
                  image: 'Imágenes',
                  media: 'Media',
                };
                const isSelected = recentCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setRecentCategory(cat)}
                    className={`px-2 py-0.5 rounded-full font-sans transition-all ${
                      isSelected
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold'
                        : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                    }`}
                  >
                    {labels[cat]}
                  </button>
                );
              })}
            </div>

            {/* Sub-header with Count & Clear */}
            <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-0.5">
              <span>{filteredRecentFiles.length} de {recentFiles.length} archivos</span>
              {onClearRecentFiles && recentFiles.length > 0 && (
                <Tooltip label={t.sidebar.clearRecentTooltip}>
                  <button
                    onClick={onClearRecentFiles}
                    className="flex items-center gap-1 text-neutral-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>{t.sidebar.clearRecentHistory}</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* List of Recent Items */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-neutral-900/60">
            {filteredRecentFiles.length === 0 ? (
              <div className="p-6 text-center text-neutral-500 flex flex-col items-center justify-center space-y-2">
                <Clock className="w-8 h-8 text-neutral-700" />
                <p className="text-xs font-medium text-neutral-400">Sin archivos recientes</p>
                <p className="text-[10px] text-neutral-500 leading-relaxed max-w-[190px]">
                  Los archivos que abras, muevas o renombres en cualquier unidad aparecerán aquí automáticamente.
                </p>
              </div>
            ) : (
              filteredRecentFiles.map(file => {
                const parent = getParentPath(file.path);
                const parentName = parent.split(/\\|\//).filter(Boolean).pop() || parent;

                return (
                  <div
                    key={file.id}
                    onClick={() => onSelectRecentFile && onSelectRecentFile(file)}
                    className="group pt-1 pb-1.5 px-2 rounded-lg hover:bg-neutral-900/90 border border-transparent hover:border-neutral-800 cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 p-1 rounded bg-neutral-900/90 border border-neutral-800/80 group-hover:border-cyan-500/40 flex-shrink-0">
                        {getFileTypeIcon(file.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="font-medium text-neutral-200 truncate group-hover:text-cyan-300 text-xs"
                          >
                            <Tooltip label={file.name} placement="top"><span>{file.name}</span></Tooltip>
                          </span>
                        </div>

                        {/* Location folder & Size */}
                        <div className="flex items-center justify-between text-[10px] font-sans text-neutral-500 mt-0.5">
                          <Tooltip label={file.path} placement="top"><span className="truncate max-w-[110px]">📁 {parentName}</span></Tooltip>
                          <span className="text-neutral-400 font-semibold">{formatFileSize(file.size)}</span>
                        </div>

                        {/* Relative Timestamp */}
                        <div className="flex items-center justify-between text-[9px] font-sans text-neutral-400 mt-1">
                          <span className="flex items-center gap-1 text-amber-400/90">
                            <Clock className="w-2.5 h-2.5" />
                            {file.lastAccessed ? formatRelativeTime(file.lastAccessed) : 'Reciente'}
                          </span>

                          {/* Quick Actions on Hover */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip label={`${t.sidebar.goToFolder}: ${parent}`} placement="top">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigate(parent);
                                }}
                                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-300"
                              >
                                <FolderOpen className="w-3 h-3" />
                              </button>
                            </Tooltip>
                            <Tooltip label={t.sidebar.previewInViewer} placement="top">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectRecentFile) onSelectRecentFile(file);
                                }}
                                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-300"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

    </aside>
  );
};
