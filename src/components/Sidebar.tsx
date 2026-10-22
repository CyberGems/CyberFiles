import React, { useEffect, useState } from 'react';
import { 
  HardDrive, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Code2, 
  Music, 
  Video,
  Monitor, 
  FolderOpen, 
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
  Plus,
  GripVertical,
  Pencil,
  Check,
  Clock,
} from 'lucide-react';
import { DriveInfo, FileItem, QuickAccessItem, QuickAccessSortMode, RECENT_PATH, RECYCLE_BIN_PATH, SYSTEM_HOME_PATH } from '../types';
import { formatFileSize } from '../utils/fileSystem';
import { isTauriDesktop, listNativeDirectory, type RecycleBinStatus, type WindowsSpecialFolder } from '../utils/nativeFileSystem';
import { getCustomFolderIcon, type SavedFolderIcons } from '../utils/folderIconPreferences';
import { FolderIconRenderer } from './folderIconsData';
import { useLanguage } from '../locales/LanguageContext';
import { dismissAllTooltips, Tooltip } from './Tooltip';

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
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenDrive?: (path: string) => void;
  windowsSpecialFolders: WindowsSpecialFolder[];
  onOpenWindowsSpecialFolder: (folder: WindowsSpecialFolder) => void;
  recycleBinSupported: boolean;
  recycleBinStatus: RecycleBinStatus | null;
  onOpenRecycleBin: () => void;
  onRequestEmptyRecycleBin: () => void;
  onOpenRecents: () => void;
  customFolderIcons?: SavedFolderIcons;
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
  currentPath,
  onNavigate,
  onOpenDrive,
  windowsSpecialFolders,
  onOpenWindowsSpecialFolder,
  recycleBinSupported,
  recycleBinStatus,
  onOpenRecycleBin,
  onRequestEmptyRecycleBin,
  onOpenRecents,
  customFolderIcons,
}) => {
  const { t, language } = useLanguage();
  const windowsSpecialFolderLabels: Record<WindowsSpecialFolder['id'], string> = {
    programFilesX86: t.toolbar.programFilesX86,
    programFiles: t.toolbar.programFiles,
    appData: t.toolbar.appData,
    programData: t.toolbar.programData,
    system32: t.toolbar.system32,
    windows: t.toolbar.windowsFolder,
    editHosts: t.toolbar.editHostsFile,
  };
  const [editingQuickAccessId, setEditingQuickAccessId] = useState<string | null>(null);
  const [editingQuickAccessName, setEditingQuickAccessName] = useState('');
  const [draggingQuickAccessId, setDraggingQuickAccessId] = useState<string | null>(null);
  const quickAccessPointerDragRef = React.useRef<{
    sourceId: string;
    targetId: string | null;
    pointerId: number;
  } | null>(null);
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
      const page = await listNativeDirectory(path);
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
                    <FolderIconRenderer
                      config={getCustomFolderIcon(folder.path, customFolderIcons ?? {})}
                      size="small"
                      fallbackIcon={<FolderOpen className="h-3 w-3 flex-shrink-0 text-amber-300" />}
                    />
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
        advancedWindowsFolders: typeof saved?.advancedWindowsFolders === 'boolean' ? saved.advancedWindowsFolders : true,
      };
    } catch {
      return { drives: false, quickAccess: false, advancedWindowsFolders: true };
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

  const toggleSection = (section: 'drives' | 'quickAccess' | 'advancedWindowsFolders') => {
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

  const beginQuickAccessPointerDrag = (event: React.PointerEvent<HTMLButtonElement>, sourceId: string) => {
    if (quickAccessSortMode !== 'manual' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dismissAllTooltips();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    quickAccessPointerDragRef.current = { sourceId, targetId: null, pointerId: event.pointerId };
    setDraggingQuickAccessId(sourceId);
    setDragTargetQuickAccessId(null);
  };

  const updateQuickAccessPointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = quickAccessPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const targetElement = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-quick-access-drop-id]');
    const candidateId = targetElement?.dataset.quickAccessDropId ?? null;
    const targetId = candidateId && candidateId !== drag.sourceId ? candidateId : null;
    drag.targetId = targetId;
    setDragTargetQuickAccessId(previous => previous === targetId ? previous : targetId);
  };

  const finishQuickAccessPointerDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const drag = quickAccessPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!cancelled && drag.targetId) onReorderQuickAccess(drag.sourceId, drag.targetId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    quickAccessPointerDragRef.current = null;
    setDraggingQuickAccessId(null);
    setDragTargetQuickAccessId(null);
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

  const canEmptyRecycleBin = recycleBinSupported && recycleBinStatus?.available === true && recycleBinStatus.itemCount > 0;
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
    <aside className="cyberfiles-sidebar h-full w-full min-w-0 overflow-hidden bg-neutral-950 border-r border-neutral-800/80 flex flex-col justify-between select-none flex-shrink-0 text-xs">
      <div className="p-3 space-y-5 overflow-y-auto flex-1">
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
                    data-quick-access-drop-id={item.path === SYSTEM_HOME_PATH ? undefined : item.id}
                    className={"group flex min-w-0 items-center gap-0.5 rounded " + (dragTargetQuickAccessId === item.id ? "ring-1 ring-cyan-500/60 bg-cyan-950/20 " : "") + (draggingQuickAccessId === item.id ? "opacity-50" : "")}
                  >
                    {quickAccessSortMode === 'manual' && item.path !== SYSTEM_HOME_PATH && (
                      <Tooltip label={t.sidebar.quickAccessReorderHint} placement="right">
                        <button
                          type="button"
                          draggable={false}
                          aria-label={t.sidebar.quickAccessReorder + ': ' + item.name}
                          onPointerDown={event => beginQuickAccessPointerDrag(event, item.id)}
                          onPointerMove={updateQuickAccessPointerDrag}
                          onPointerUp={event => finishQuickAccessPointerDrag(event)}
                          onPointerCancel={event => finishQuickAccessPointerDrag(event, true)}
                          onLostPointerCapture={event => {
                            if (quickAccessPointerDragRef.current?.pointerId !== event.pointerId) return;
                            quickAccessPointerDragRef.current = null;
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
                          className={`touch-none select-none flex-shrink-0 rounded p-0.5 text-neutral-600 transition-colors hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 ${draggingQuickAccessId === item.id ? 'cursor-grabbing text-cyan-300' : 'cursor-grab'}`}
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
                        draggable={false}
                        onClick={() => item.path === SYSTEM_HOME_PATH || item.isCustom ? onOpenCustomQuickAccess(item) : onNavigate(item.path)}
                        className={`flex min-w-0 flex-1 items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-neutral-800/90 text-cyan-300 font-medium'
                            : 'text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={isSelected ? 'text-cyan-400' : 'text-neutral-400'}>
                            {getCustomFolderIcon(item.path, customFolderIcons ?? {}) ? (
                              <FolderIconRenderer
                                config={getCustomFolderIcon(item.path, customFolderIcons ?? {})}
                                size="small"
                              />
                            ) : (
                              getQuickAccessIcon(item.icon)
                            )}
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
                    <span>{t.sidebar.freeOf.replace('{free}', hasCapacity ? formatFileSize(drive.totalBytes - drive.usedBytes) : '—')}</span>
                    <span>{t.sidebar.totalOf.replace('{total}', hasCapacity ? formatFileSize(drive.totalBytes) : '—')}</span>
                  </div>
                </button>
              );
            })}
          </div>}
        </div>
        )}

        {windowsSpecialFolders.length > 0 && (
          <section className="space-y-1">
            <button
              type="button"
              onClick={() => toggleSection('advancedWindowsFolders')}
              aria-expanded={!collapsedSections.advancedWindowsFolders}
              aria-label={`${t.toolbar.advancedWindowsFolders}: ${collapsedSections.advancedWindowsFolders ? t.sidebar.expandSection : t.sidebar.collapseSection}`}
              className="collapse-toggle flex w-full min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              {collapsedSections.advancedWindowsFolders ? <ChevronRight data-collapse-chevron="true" className="h-3 w-3" /> : <ChevronDown data-collapse-chevron="true" className="h-3 w-3" />}
              <span>{t.toolbar.advancedWindowsFolders}</span>
            </button>
            {!collapsedSections.advancedWindowsFolders && <div className="space-y-0.5">
              {windowsSpecialFolders.map(folder => {
                const label = windowsSpecialFolderLabels[folder.id];
                const isSelected = currentPath.toLowerCase() === folder.path.toLowerCase();
                return (
                  <Tooltip key={folder.id} label={folder.path} placement="right">
                    <button
                      type="button"
                      onClick={() => onOpenWindowsSpecialFolder(folder)}
                      aria-label={`${label}: ${folder.path}`}
                      aria-current={isSelected ? 'location' : undefined}
                      className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${isSelected ? 'bg-neutral-800/90 font-medium text-cyan-300' : 'text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100'}`}
                    >
                      {folder.isFile ? <FileText className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-cyan-300' : 'text-neutral-500'}`} /> : <FolderOpen className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-cyan-300' : 'text-neutral-500'}`} />}
                      <span className="min-w-0 truncate text-[11px]">{label}</span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>}
          </section>
        )}
        <div className="flex items-center gap-1">
          <Tooltip label={t.sidebar.recentsHint} placement="right">
            <button
              type="button"
              onClick={onOpenRecents}
              aria-label={t.sidebar.recentsTitle}
              aria-current={currentPath === RECENT_PATH ? 'page' : undefined}
              className={"flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors " + (currentPath === RECENT_PATH ? "bg-neutral-800/90 text-cyan-300 font-medium" : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100")}
            >
              <Clock className={"h-4 w-4 flex-shrink-0 " + (currentPath === RECENT_PATH ? "text-cyan-300" : "text-neutral-500")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px]">{t.sidebar.recentsTitle}</span>
                <span className="block truncate text-[9px] text-neutral-500">{t.sidebar.recentsHint}</span>
              </span>
            </button>
          </Tooltip>
        </div>
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
              <Trash2 className={"h-4 w-4 flex-shrink-0 " + (currentPath === RECYCLE_BIN_PATH ? "text-cyan-300" : "text-neutral-500")} />
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

      </div>
    </aside>
  );
};
