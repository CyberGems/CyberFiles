import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Check,
  ClipboardPaste,
  ChevronRight,
  BookmarkPlus,
  BookmarkX,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FilterX,
  FolderPlus,
  FolderOpen,
  FilePlus2,
  LayoutGrid,
  List,
  Link2,
  MoveRight,
  StretchHorizontal,
  Trash2,
  Layers,
  RotateCcw,
  Scissors,
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  BoxSelect,
  ClipboardCopy,
  FileText,
  ListChecks,
  Square,
  Palette,
  History,
  Undo2,
  Wrench,
  Star,
} from 'lucide-react';
import { ArchiveExtractionMode, ContextMenuPosition, FileItem, GroupByField, SortField, SortOrder, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import type { NewItemKind } from './CreateItemModal';
import { Tooltip } from './Tooltip';

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  viewMode: ViewMode;
  sortField: SortField;
  sortOrder: SortOrder;
  groupBy: GroupByField;
  supportsGrouping: boolean;
  onSortFieldChange: (field: SortField) => void;
  onSortOrderChange: (order: SortOrder) => void;
  onGroupByChange: (field: GroupByField) => void;
  hasFolder: boolean;
  hasFilter: boolean;
  onClose: () => void;
  onOpenLocation: (item: FileItem) => void;
  onOpenItem?: (item: FileItem) => void;
  onOpenInNewTab?: (item: FileItem) => void;
  onOpenProperties?: (item: FileItem) => void;
  onAddToQuickAccess: (item: FileItem) => void;
  onCustomizeFolderIcon?: (item: FileItem) => void;
  onClearFilter: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  hasSavedFolderStyle: boolean;
  onSaveFolderStyle: () => void;
  onRemoveFolderStyle: () => void;
  onPreview: (item: FileItem) => void;
  supportsArchiveExtraction: boolean;
  onExtractArchive: (item: FileItem, mode: ArchiveExtractionMode) => void;
  supportsArchiveCreation: boolean;
  onCompressToZip: (item: FileItem) => void;
  onCopyOpposite: (item: FileItem) => void;
  onMoveOpposite: (item: FileItem) => void;
  onCopyToClipboard: (item: FileItem) => void;
  onCutToClipboard: (item: FileItem) => void;
  onPaste: () => void;
  onCreateItem: (kind: NewItemKind) => void;
  canModifyFolder: boolean;
  fileClipboardSupported: boolean;
  onRename: (item: FileItem) => void;
  onBatchRename: () => void;
  onDelete: (item: FileItem) => void;
  onRestore: (item: FileItem) => void;
  isRecentLocation?: boolean;
  onRemoveFromRecent?: (item: FileItem) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onInvertSelection?: () => void;
  onSelectOnlyFiles?: () => void;
  onSelectOnlyFolders?: () => void;
  hasSelectableItems?: boolean;
  hasFoldersInFolder?: boolean;
  onCopyPath?: () => void;
  /* Mirrors the toolbar's undo so the last operation can be reversed from where the user is
     looking. Stays in the menu, disabled, when the history has nothing reversible. */
  onUndo?: () => void;
  undoAvailable?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  viewMode,
  sortField,
  sortOrder,
  groupBy,
  supportsGrouping,
  onSortFieldChange,
  onSortOrderChange,
  onGroupByChange,
  hasFolder,
  hasFilter,
  onClose,
  onOpenLocation,
  onOpenItem,
  onOpenInNewTab,
  onOpenProperties,
  onAddToQuickAccess,
  onCustomizeFolderIcon,
  onClearFilter,
  onViewModeChange,
  hasSavedFolderStyle,
  onSaveFolderStyle,
  onRemoveFolderStyle,
  onPreview,
  supportsArchiveExtraction,
  onExtractArchive,
  supportsArchiveCreation,
  onCompressToZip,
  onCopyOpposite,
  onMoveOpposite,
  onCopyToClipboard,
  onCutToClipboard,
  onPaste,
  onCreateItem,
  canModifyFolder,
  fileClipboardSupported,
  onRename,
  onBatchRename,
  onDelete,
  onRestore,
  isRecentLocation = false,
  onRemoveFromRecent,
  onSelectAll,
  onSelectNone,
  onInvertSelection,
  onSelectOnlyFiles,
  onSelectOnlyFolders,
  hasSelectableItems = true,
  hasFoldersInFolder = false,
  onCopyPath,
  onUndo,
  undoAvailable = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [screenPos, setScreenPos] = useState<{ left: number; top: number }>({
    left: position?.x ?? 0,
    top: position?.y ?? 0,
  });
  const { t } = useLanguage();

  useEffect(() => {
    setNewMenuOpen(false);
    setSortMenuOpen(false);
    setGroupMenuOpen(false);
    setSelectMenuOpen(false);
  }, [position]);

  useLayoutEffect(() => {
    if (!position || !menuRef.current) return;
    const menuEl = menuRef.current;
    const updatePosition = () => {
      const rect = menuEl.getBoundingClientRect();
      const margin = 10;
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      setScreenPos({
        left: Math.max(margin, Math.min(position.x, maxLeft)),
        top: Math.max(margin, Math.min(position.y, maxTop)),
      });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(menuEl);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [position, newMenuOpen, sortMenuOpen, groupMenuOpen, selectMenuOpen]);

  useEffect(() => {
    if (!position) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  const item = position.targetItem;
  const isSystemLocation = Boolean(item && (item.id.startsWith('system-drive-') || item.id.startsWith('system-location-')));
  const archiveItem = Boolean(item && !item.isFolder && ['zip', 'rar'].includes(item.extension.toLowerCase()));
  const canRemoveFromRecent = Boolean(item && !item.isFolder && isRecentLocation && onRemoveFromRecent);

  /* Last group in the item menu: acts on the operation history rather than on what was clicked. */
  const undoGroup = onUndo ? (
    <>
      <MenuDivider />
      <div className="py-0.5">
        <MenuButton
          icon={<Undo2 className={`h-4 w-4 ${undoAvailable ? 'text-cyan-300' : 'text-neutral-500'}`} />}
          label={undoAvailable ? t.contextMenu.undoLast : t.contextMenu.undoNothing}
          shortcut="Ctrl+Z"
          disabled={!undoAvailable}
          onClick={() => { onUndo(); onClose(); }}
        />
      </div>
    </>
  ) : null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onContextMenu={event => event.preventDefault()}
      style={{ left: screenPos.left, top: screenPos.top }}
      className="fixed z-[100] min-w-[304px] w-max max-w-[420px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-900/95 pb-1.5 text-xs shadow-2xl shadow-black/70 backdrop-blur-xl select-none"
    >
      {item ? (
        item.recycleBinId ? (
          <>
            <div className="flex w-0 min-w-full items-center gap-2 border-b border-neutral-800/90 bg-neutral-950/50 px-3 py-1.5 font-sans text-[11px] font-medium text-neutral-300">
              {item.isFolder ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
              <span className="truncate">{item.name}</span>
            </div>
            <div className="pt-1">
              <MenuButton
                icon={<RotateCcw className="h-4 w-4 text-cyan-400" />}
                label={t.contextMenu.restore}
                disabled={!item.originalPath}
                onClick={() => { onRestore(item); onClose(); }}
              />
            </div>
          </>
        ) : isSystemLocation ? (
          <>
            <div className="flex w-0 min-w-full items-center gap-2 border-b border-neutral-800/90 bg-neutral-950/50 px-3 py-1.5 font-sans text-[11px] font-medium text-neutral-300">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <span className="truncate">{item.name}</span>
            </div>
            <div className="pt-1">
              <MenuButton
                icon={<FolderOpen className="h-4 w-4 text-cyan-400" />}
                label={t.contextMenu.openLocation}
                shortcut="Enter"
                onClick={() => { onOpenLocation(item); onClose(); }}
              />
              {onCopyPath && (
                <MenuButton
                  icon={<ClipboardCopy className="h-4 w-4 text-neutral-300" />}
                  label={t.contextMenu.copyAsPath}
                  shortcut="Ctrl+Shift+C"
                  onClick={() => { onCopyPath(); onClose(); }}
                />
              )}
              {onOpenProperties && (
                <MenuButton
                  icon={<Wrench className="h-4 w-4 text-neutral-300" />}
                  label={t.contextMenu.properties}
                  shortcut="Alt+Enter"
                  onClick={() => { onOpenProperties(item); onClose(); }}
                />
              )}
            </div>
          </>
        ) : (
          <>
            {/* Compact item title line */}
            <div className="flex w-0 min-w-full items-center gap-2 border-b border-neutral-800/90 bg-neutral-950/50 px-3 py-1.5 font-sans text-[11px] font-medium text-neutral-300">
              {item.isFolder ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              ) : archiveItem ? (
                <Archive className="h-3.5 w-3.5 shrink-0 text-violet-300" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
              )}
              <span className="truncate">{item.name}</span>
            </div>

            {/* Win 11 Quick-Action Header Bar (Files / Folders): Cut | Copy | Rename | Delete */}
            <div
              role="group"
              className="flex divide-x divide-neutral-800/80 border-b border-neutral-800 bg-neutral-900/60"
            >
              <HeaderActionButton
                icon={<Scissors className="h-4 w-4 text-amber-400" />}
                label={t.contextMenu.cutShort}
                shortcut="Ctrl+X"
                onClick={() => { onCutToClipboard(item); onClose(); }}
              />
              <HeaderActionButton
                icon={<Copy className="h-4 w-4 text-cyan-400" />}
                label={t.contextMenu.copyShort}
                shortcut="Ctrl+C"
                onClick={() => { onCopyToClipboard(item); onClose(); }}
              />
              <HeaderActionButton
                icon={<Edit3 className="h-4 w-4 text-amber-300" />}
                label={t.contextMenu.renameShort}
                shortcut="F2"
                onClick={() => { onRename(item); onClose(); }}
              />
              <HeaderActionButton
                icon={<Trash2 className="h-4 w-4 text-rose-400" />}
                label={t.contextMenu.deleteShort}
                shortcut={t.contextMenu.deleteShortcut}
                danger
                onClick={() => { onDelete(item); onClose(); }}
              />
            </div>

            {/* Primary Open & Preview section */}
            <div className="pt-1 pb-0.5">
              <MenuButton
                icon={item.isFolder ? <FolderOpen className="h-4 w-4 text-cyan-400" /> : <ExternalLink className="h-4 w-4 text-cyan-400" />}
                label={t.contextMenu.open}
                shortcut="Enter"
                onClick={() => {
                  if (onOpenItem) onOpenItem(item);
                  else onOpenLocation(item);
                  onClose();
                }}
              />
              {item.isFolder && onOpenInNewTab && (
                <MenuButton
                  icon={<FolderPlus className="h-4 w-4 text-cyan-300" />}
                  label={t.contextMenu.openInNewTab}
                  onClick={() => { onOpenInNewTab(item); onClose(); }}
                />
              )}
              <MenuButton
                icon={<Eye className="h-4 w-4 text-cyan-400" />}
                label={t.contextMenu.openPreview}
                shortcut="Space"
                onClick={() => { onPreview(item); onClose(); }}
              />
              {onCopyPath && (
                <MenuButton
                  icon={<ClipboardCopy className="h-4 w-4 text-neutral-300" />}
                  label={t.contextMenu.copyAsPath}
                  shortcut="Ctrl+Shift+C"
                  onClick={() => { onCopyPath(); onClose(); }}
                />
              )}
            </div>

            {/* Archive / Compression section */}
            {((archiveItem && supportsArchiveExtraction) || supportsArchiveCreation) && (
              <>
                <MenuDivider />
                <div className="py-0.5">
                  {archiveItem && supportsArchiveExtraction && (
                    <>
                      <MenuButton
                        icon={<Archive className="h-4 w-4 text-violet-400" />}
                        label={t.contextMenu.extractArchiveHere}
                        onClick={() => { onExtractArchive(item, 'here'); onClose(); }}
                      />
                      <MenuButton
                        icon={<FolderOpen className="h-4 w-4 text-violet-300" />}
                        label={t.contextMenu.extractArchiveFolder.replace('{folder}', item.name.replace(/\.[^.]+$/, ''))}
                        onClick={() => { onExtractArchive(item, 'folder'); onClose(); }}
                      />
                    </>
                  )}
                  {supportsArchiveCreation && (
                    <MenuButton
                      icon={<Archive className="h-4 w-4 text-violet-300" />}
                      label={t.contextMenu.compressToZip}
                      onClick={() => { onCompressToZip(item); onClose(); }}
                    />
                  )}
                </div>
              </>
            )}

            {/* Quick Access & Folder Customization */}
            {(item.isFolder || canRemoveFromRecent) && (
              <>
                <MenuDivider />
                <div className="py-0.5">
                  {item.isFolder && (
                    <>
                      <MenuButton
                        icon={<Star className="h-4 w-4 text-amber-300" />}
                        label={t.contextMenu.addToQuickAccess}
                        onClick={() => { onAddToQuickAccess(item); onClose(); }}
                      />
                      {onCustomizeFolderIcon && (
                        <MenuButton
                          icon={<Palette className="h-4 w-4 text-pink-400" />}
                          label={t.contextMenu.customizeFolderIcon}
                          onClick={() => { onCustomizeFolderIcon(item); onClose(); }}
                        />
                      )}
                    </>
                  )}
                  {canRemoveFromRecent && (
                    <MenuButton
                      icon={<History className="h-4 w-4 text-amber-300" />}
                      label={t.contextMenu.removeFromRecent}
                      onClick={() => { onRemoveFromRecent!(item); onClose(); }}
                    />
                  )}
                </div>
              </>
            )}

            {/* Dual-Pane & Batch Operations */}
            <MenuDivider />
            <div className="py-0.5">
              <MenuButton
                icon={<Copy className="h-4 w-4 text-cyan-400" />}
                label={t.contextMenu.copyToOpposite}
                shortcut="F5"
                onClick={() => { onCopyOpposite(item); onClose(); }}
              />
              <MenuButton
                icon={<MoveRight className="h-4 w-4 text-blue-400" />}
                label={t.contextMenu.moveToOpposite}
                shortcut="F6"
                onClick={() => { onMoveOpposite(item); onClose(); }}
              />
              <MenuButton
                icon={<Layers className="h-4 w-4 text-amber-400" />}
                label={t.contextMenu.batchRename}
                shortcut="Ctrl+R"
                onClick={() => { onBatchRename(); onClose(); }}
              />
            </div>

            {/* Properties (Win 11 Alt+Enter) */}
            {onOpenProperties && (
              <>
                <MenuDivider />
                <div className="py-0.5">
                  <MenuButton
                    icon={<Wrench className="h-4 w-4 text-neutral-300" />}
                    label={t.contextMenu.properties}
                    shortcut="Alt+Enter"
                    onClick={() => { onOpenProperties(item); onClose(); }}
                  />
                </div>
              </>
            )}

            {undoGroup}
          </>
        )
      ) : (
        <>
          {/* Compact empty-area title line */}
          <div className="flex items-center gap-2 border-b border-neutral-800/90 bg-neutral-950/50 px-3 py-1.5 font-sans text-[11px] font-medium text-neutral-300">
            <Layers className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span className="truncate">{t.contextMenu.workspace}</span>
          </div>

          {/* Win 11 Quick-Action Header Bar (Empty Lister Area): New Folder | Paste | Select All | Undo */}
          <div
            role="group"
            className="flex divide-x divide-neutral-800/80 border-b border-neutral-800 bg-neutral-900/60"
          >
            <HeaderActionButton
              icon={<FolderPlus className="h-4 w-4 text-emerald-400" />}
              label={t.contextMenu.newFolderShort}
              shortcut="F7"
              disabled={!canModifyFolder}
              onClick={() => { onCreateItem('folder'); onClose(); }}
            />
            <HeaderActionButton
              icon={<ClipboardPaste className="h-4 w-4 text-cyan-400" />}
              label={t.contextMenu.pasteShort}
              shortcut="Ctrl+V"
              disabled={!canModifyFolder || !fileClipboardSupported}
              onClick={() => { onPaste(); onClose(); }}
            />
            <HeaderActionButton
              icon={<BoxSelect className="h-4 w-4 text-cyan-300" />}
              label={t.contextMenu.selectAllShort}
              shortcut="Ctrl+A"
              disabled={!hasFolder || !hasSelectableItems || !onSelectAll}
              onClick={() => { onSelectAll?.(); onClose(); }}
            />
            <HeaderActionButton
              icon={<Undo2 className={`h-4 w-4 ${undoAvailable ? 'text-cyan-300' : 'text-neutral-500'}`} />}
              label={t.contextMenu.undoShort}
              shortcut="Ctrl+Z"
              disabled={!undoAvailable || !onUndo}
              onClick={() => { onUndo?.(); onClose(); }}
            />
          </div>

          <div className="pt-1 pb-0.5">
            <MenuButton
              icon={<FolderPlus className="h-4 w-4 text-emerald-400" />}
              label={t.contextMenu.new}
              disabled={!canModifyFolder}
              expanded={newMenuOpen}
              trailing={<ChevronRight className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${newMenuOpen ? 'rotate-90' : ''}`} />}
              onClick={() => { setSortMenuOpen(false); setGroupMenuOpen(false); setSelectMenuOpen(false); setNewMenuOpen(open => !open); }}
            />
            {newMenuOpen && (
              <div role="menu" aria-label={t.contextMenu.new} className="ml-4 mr-1.5 my-0.5 border-l border-neutral-700/80 py-0.5 pl-1">
                <MenuButton icon={<FolderPlus className="h-4 w-4 text-emerald-400" />} label={t.contextMenu.newFolder} shortcut="F7" disabled={!canModifyFolder} onClick={() => { onCreateItem('folder'); onClose(); }} />
                <MenuButton icon={<FilePlus2 className="h-4 w-4 text-cyan-300" />} label={t.contextMenu.newTextFile} disabled={!canModifyFolder} onClick={() => { onCreateItem('text-file'); onClose(); }} />
                <MenuButton icon={<Link2 className="h-4 w-4 text-violet-300" />} label={t.contextMenu.newShortcut} disabled={!canModifyFolder} onClick={() => { onCreateItem('shortcut'); onClose(); }} />
              </div>
            )}
            {onSelectAll && (
              <>
                <MenuButton
                  icon={<ListChecks className="h-4 w-4 text-cyan-300" />}
                  label={t.contextMenu.select}
                  disabled={!hasFolder}
                  expanded={selectMenuOpen}
                  trailing={<ChevronRight className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${selectMenuOpen ? 'rotate-90' : ''}`} />}
                  onClick={() => { setNewMenuOpen(false); setSortMenuOpen(false); setGroupMenuOpen(false); setSelectMenuOpen(open => !open); }}
                />
                {selectMenuOpen && (
                  <div role="menu" aria-label={t.contextMenu.select} className="ml-4 mr-1.5 my-0.5 border-l border-neutral-700/80 py-0.5 pl-1">
                    <MenuButton icon={<BoxSelect className="h-4 w-4 text-cyan-300" />} label={t.sidebar.selectAll} shortcut="Ctrl+A" disabled={!hasSelectableItems} onClick={() => { onSelectAll(); onClose(); }} />
                    <MenuButton icon={<Square className="h-4 w-4 text-neutral-400" />} label={t.sidebar.unselectAll} onClick={() => { onSelectNone?.(); onClose(); }} />
                    <MenuButton icon={<ArrowLeftRight className="h-4 w-4 text-amber-300" />} label={t.sidebar.invertSelection} disabled={!hasSelectableItems} onClick={() => { onInvertSelection?.(); onClose(); }} />
                    <MenuDivider />
                    <MenuButton icon={<FileText className="h-4 w-4 text-cyan-300" />} label={t.contextMenu.selectOnlyFiles} onClick={() => { onSelectOnlyFiles?.(); onClose(); }} />
                    <MenuButton icon={<FolderOpen className="h-4 w-4 text-amber-300" />} label={t.contextMenu.selectOnlyFolders} disabled={!hasFoldersInFolder} onClick={() => { onSelectOnlyFolders?.(); onClose(); }} />
                  </div>
                )}
              </>
            )}
            {hasFilter && (
              <MenuButton
                icon={<FilterX className="h-4 w-4 text-amber-400" />}
                label={t.contextMenu.clearFilter}
                onClick={() => { onClearFilter(); onClose(); }}
              />
            )}
            {canModifyFolder && onCopyPath && (
              <MenuButton
                icon={<ClipboardCopy className="h-4 w-4 text-neutral-300" />}
                label={t.contextMenu.copyAsPath}
                shortcut="Ctrl+Shift+C"
                onClick={() => { onCopyPath(); onClose(); }}
              />
            )}
          </div>

          <MenuDivider />
          <div className="py-0.5">
            <MenuButton
              icon={<List className="h-4 w-4 text-cyan-300" />}
              label={t.contextMenu.sortBy}
              expanded={sortMenuOpen}
              trailing={<ChevronRight className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${sortMenuOpen ? 'rotate-90' : ''}`} />}
              onClick={() => { setNewMenuOpen(false); setGroupMenuOpen(false); setSelectMenuOpen(false); setSortMenuOpen(open => !open); }}
            />
            {sortMenuOpen && (
              <div role="menu" aria-label={t.contextMenu.sortBy} className="ml-4 mr-1.5 my-0.5 border-l border-neutral-700/80 py-0.5 pl-1">
                <ViewMenuButton icon={<span />} label={t.pane.columns.name} selected={sortField === 'name'} onClick={() => { onSortFieldChange('name'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.modified} selected={sortField === 'modifiedDate'} onClick={() => { onSortFieldChange('modifiedDate'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.created} selected={sortField === 'createdDate'} onClick={() => { onSortFieldChange('createdDate'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.type} selected={sortField === 'type'} onClick={() => { onSortFieldChange('type'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.size} selected={sortField === 'size'} onClick={() => { onSortFieldChange('size'); onClose(); }} />
                <MenuDivider />
                <ViewMenuButton icon={<ArrowUp className="h-3.5 w-3.5" />} label={t.contextMenu.ascending} selected={sortOrder === 'asc'} onClick={() => { onSortOrderChange('asc'); onClose(); }} />
                <ViewMenuButton icon={<ArrowDown className="h-3.5 w-3.5" />} label={t.contextMenu.descending} selected={sortOrder === 'desc'} onClick={() => { onSortOrderChange('desc'); onClose(); }} />
              </div>
            )}
            <MenuButton
              icon={<Layers className="h-4 w-4 text-violet-300" />}
              label={t.contextMenu.groupBy}
              disabled={!supportsGrouping}
              expanded={groupMenuOpen}
              trailing={<ChevronRight className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${groupMenuOpen ? 'rotate-90' : ''}`} />}
              onClick={() => { setNewMenuOpen(false); setSortMenuOpen(false); setSelectMenuOpen(false); setGroupMenuOpen(open => !open); }}
            />
            {groupMenuOpen && (
              <div role="menu" aria-label={t.contextMenu.groupBy} className="ml-4 mr-1.5 my-0.5 border-l border-neutral-700/80 py-0.5 pl-1">
                <ViewMenuButton icon={<span />} label={t.contextMenu.groupNone} selected={groupBy === 'none'} onClick={() => { onGroupByChange('none'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.name} selected={groupBy === 'name'} onClick={() => { onGroupByChange('name'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.modified} selected={groupBy === 'modifiedDate'} onClick={() => { onGroupByChange('modifiedDate'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.type} selected={groupBy === 'type'} onClick={() => { onGroupByChange('type'); onClose(); }} />
                <ViewMenuButton icon={<span />} label={t.pane.columns.size} selected={groupBy === 'size'} onClick={() => { onGroupByChange('size'); onClose(); }} />
              </div>
            )}
          </div>

          <MenuDivider />
          <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t.toolbar.viewModes}</div>
          <div className="py-0.5">
            <ViewMenuButton icon={<List className="h-4 w-4" />} label={t.toolbar.viewDetails} selected={viewMode === 'details'} onClick={() => { onViewModeChange('details'); onClose(); }} />
            <ViewMenuButton icon={<StretchHorizontal className="h-4 w-4" />} label={t.toolbar.viewCompact} selected={viewMode === 'compact'} onClick={() => { onViewModeChange('compact'); onClose(); }} />
            <ViewMenuButton icon={<LayoutGrid className="h-4 w-4" />} label={t.toolbar.viewIcons} selected={viewMode === 'icons'} onClick={() => { onViewModeChange('icons'); onClose(); }} />
          </div>

          {canModifyFolder && (
            <>
              <MenuDivider />
              <div className="py-0.5">
                <MenuButton
                  icon={<BookmarkPlus className="h-4 w-4 text-cyan-300" />}
                  label={hasSavedFolderStyle ? t.contextMenu.updateFolderStyle : t.contextMenu.saveFolderStyle}
                  onClick={() => { onSaveFolderStyle(); onClose(); }}
                />
                {hasSavedFolderStyle && (
                  <MenuButton
                    icon={<BookmarkX className="h-4 w-4 text-amber-300" />}
                    label={t.contextMenu.removeFolderStyle}
                    onClick={() => { onRemoveFolderStyle(); onClose(); }}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>,
    document.body
  );
};

const MenuDivider = () => <div className="my-1 h-px bg-neutral-800/90" />;

const HeaderActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}> = ({ icon, label, shortcut, onClick, disabled = false, danger = false }) => {
  const button = (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
      className={
        'flex flex-1 shrink-0 flex-col items-center justify-center gap-1 px-3 py-2 text-center transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-40 ' +
        (danger
          ? 'text-neutral-200 hover:bg-rose-950/50 hover:text-rose-200 focus-visible:bg-rose-950/50'
          : 'text-neutral-200 hover:bg-neutral-800/90 hover:text-cyan-100 focus-visible:bg-neutral-800/90')
      }
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span className="whitespace-nowrap text-[11px] leading-normal">{label}</span>
    </button>
  );

  return shortcut ? (
    <Tooltip label={shortcut} placement="top">
      {button}
    </Tooltip>
  ) : (
    button
  );
};

const MenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  trailing?: React.ReactNode;
  expanded?: boolean;
}> = ({ icon, label, shortcut, onClick, disabled = false, danger = false, trailing, expanded }) => (
  <div className="px-1.5">
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      onClick={onClick}
      className={
        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-40 ' +
        (danger
          ? 'text-rose-300 hover:bg-rose-950/45 focus-visible:bg-rose-950/45'
          : 'text-neutral-100 hover:bg-neutral-800/90 focus-visible:bg-neutral-800/90')
      }
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {shortcut && <span className="shrink-0 font-sans text-[11px] text-neutral-400">{shortcut}</span>}
      {trailing}
    </button>
  </div>
);

const ViewMenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}> = ({ icon, label, selected, onClick }) => (
  <div className="px-1.5">
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-neutral-100 transition-colors outline-none hover:bg-neutral-800/90 focus-visible:bg-neutral-800/90"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
        <span>{label}</span>
      </span>
      {selected && <Check className="h-3.5 w-3.5 text-cyan-300" />}
    </button>
  </div>
);
