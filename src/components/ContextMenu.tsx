import React, { useEffect, useRef } from 'react';
import {
  Check,
  ClipboardPaste,
  BookmarkPlus,
  Copy,
  Edit3,
  Eye,
  FilterX,
  FolderPlus,
  FolderOpen,
  LayoutGrid,
  List,
  MoveRight,
  RotateCw,
  StretchHorizontal,
  Trash2,
  Layers,
  RotateCcw,
  Scissors,
} from 'lucide-react';
import { ContextMenuPosition, FileItem, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  viewMode: ViewMode;
  hasFolder: boolean;
  hasFilter: boolean;
  onClose: () => void;
  onOpenFolder: () => void;
  onOpenLocation: (item: FileItem) => void;
  onAddToQuickAccess: (item: FileItem) => void;
  onRefresh: () => void;
  onClearFilter: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onPreview: (item: FileItem) => void;
  onCopyOpposite: (item: FileItem) => void;
  onMoveOpposite: (item: FileItem) => void;
  onCopyToClipboard: (item: FileItem) => void;
  onCutToClipboard: (item: FileItem) => void;
  onPaste: () => void;
  onNewFolder: () => void;
  canModifyFolder: boolean;
  fileClipboardSupported: boolean;
  onRename: (item: FileItem) => void;
  onBatchRename: () => void;
  onDelete: (item: FileItem) => void;
  onRestore: (item: FileItem) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  viewMode,
  hasFolder,
  hasFilter,
  onClose,
  onOpenFolder,
  onOpenLocation,
  onAddToQuickAccess,
  onRefresh,
  onClearFilter,
  onViewModeChange,
  onPreview,
  onCopyOpposite,
  onMoveOpposite,
  onCopyToClipboard,
  onCutToClipboard,
  onPaste,
  onNewFolder,
  canModifyFolder,
  fileClipboardSupported,
  onRename,
  onBatchRename,
  onDelete,
  onRestore,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

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
  const menuWidth = 264;
  const menuHeight = isSystemLocation || item?.recycleBinId ? 96 : item?.isFolder ? 370 : item ? 330 : 390;
  const adjustedX = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 8));
  const adjustedY = Math.max(8, Math.min(position.y, window.innerHeight - menuHeight - 8));

  return (
    <div
      ref={menuRef}
      role="menu"
      onContextMenu={event => event.preventDefault()}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-50 w-[264px] max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-neutral-700/80 bg-neutral-900/95 py-1 text-xs shadow-2xl backdrop-blur-md select-none"
    >
      {item ? (
        item.recycleBinId ? (
          <>
            <div className="truncate border-b border-neutral-800 px-3 py-1.5 font-mono text-[10px] text-neutral-400">{item.name}</div>
            <div className="py-0.5">
              <MenuButton
                icon={<RotateCcw className="h-3.5 w-3.5 text-cyan-400" />}
                label={t.contextMenu.restore}
                disabled={!item.originalPath}
                onClick={() => { onRestore(item); onClose(); }}
              />
            </div>
          </>
        ) : isSystemLocation ? (
          <>
            <div className="truncate border-b border-neutral-800 px-3 py-1.5 font-mono text-[10px] text-neutral-400">{item.name}</div>
            <div className="py-0.5">
              <MenuButton icon={<FolderOpen className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.openLocation} onClick={() => { onOpenLocation(item); onClose(); }} />
            </div>
          </>
        ) : (
        <>
          <div className="truncate border-b border-neutral-800 px-3 py-1.5 font-mono text-[10px] text-neutral-400">{item.name}</div>
          {item.isFolder && (
            <>
              <div className="py-0.5">
                <MenuButton icon={<BookmarkPlus className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.addToQuickAccess} onClick={() => { onAddToQuickAccess(item); onClose(); }} />
              </div>
              <MenuDivider />
            </>
          )}
          <div className="py-0.5">
            <MenuButton icon={<Eye className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.openPreview} shortcut="Space" onClick={() => { onPreview(item); onClose(); }} />
            <MenuButton icon={<Copy className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.copyToClipboard} shortcut="Ctrl+C" onClick={() => { onCopyToClipboard(item); onClose(); }} />
            <MenuButton icon={<Scissors className="h-3.5 w-3.5 text-amber-400" />} label={t.contextMenu.cutToClipboard} shortcut="Ctrl+X" onClick={() => { onCutToClipboard(item); onClose(); }} />
            <MenuButton icon={<Copy className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.copyToOpposite} shortcut="F5" onClick={() => { onCopyOpposite(item); onClose(); }} />
            <MenuButton icon={<MoveRight className="h-3.5 w-3.5 text-blue-400" />} label={t.contextMenu.moveToOpposite} shortcut="F6" onClick={() => { onMoveOpposite(item); onClose(); }} />
          </div>
          <MenuDivider />
          <div className="py-0.5">
            <MenuButton icon={<Edit3 className="h-3.5 w-3.5 text-amber-400" />} label={t.contextMenu.rename} shortcut="F2" onClick={() => { onRename(item); onClose(); }} />
            <MenuButton icon={<Layers className="h-3.5 w-3.5 text-amber-400" />} label={t.contextMenu.batchRename} shortcut="Ctrl+R" onClick={() => { onBatchRename(); onClose(); }} />
          </div>
          <MenuDivider />
          <div className="py-0.5">
            <MenuButton icon={<Trash2 className="h-3.5 w-3.5 text-rose-400" />} label={t.contextMenu.delete} shortcut="Del" danger onClick={() => { onDelete(item); onClose(); }} />
          </div>
        </>
        )
      ) : (
        <>
          <div className="border-b border-neutral-800 px-3 py-1.5 font-medium text-neutral-300">{t.contextMenu.workspace}</div>
          <div className="py-0.5">
            <MenuButton icon={<FolderOpen className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.openFolder} onClick={() => { onOpenFolder(); onClose(); }} />
            <MenuButton icon={<FolderPlus className="h-3.5 w-3.5 text-emerald-400" />} label={t.contextMenu.newFolder} shortcut="F7" disabled={!canModifyFolder} onClick={() => { onNewFolder(); onClose(); }} />
            <MenuButton icon={<ClipboardPaste className="h-3.5 w-3.5 text-cyan-400" />} label={t.contextMenu.paste} shortcut="Ctrl+V" disabled={!canModifyFolder || !fileClipboardSupported} onClick={() => { onPaste(); onClose(); }} />
            <MenuButton icon={<RotateCw className="h-3.5 w-3.5 text-neutral-400" />} label={t.toolbar.refresh} disabled={!hasFolder} onClick={() => { onRefresh(); onClose(); }} />
            {hasFilter && <MenuButton icon={<FilterX className="h-3.5 w-3.5 text-amber-400" />} label={t.contextMenu.clearFilter} onClick={() => { onClearFilter(); onClose(); }} />}
          </div>
          <MenuDivider />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t.toolbar.viewModes}</div>
          <div className="py-0.5">
            <ViewMenuButton icon={<List className="h-3.5 w-3.5" />} label={t.toolbar.viewDetails} selected={viewMode === 'details'} onClick={() => { onViewModeChange('details'); onClose(); }} />
            <ViewMenuButton icon={<StretchHorizontal className="h-3.5 w-3.5" />} label={t.toolbar.viewCompact} selected={viewMode === 'compact'} onClick={() => { onViewModeChange('compact'); onClose(); }} />
            <ViewMenuButton icon={<LayoutGrid className="h-3.5 w-3.5" />} label={t.toolbar.viewIcons} selected={viewMode === 'icons'} onClick={() => { onViewModeChange('icons'); onClose(); }} />
          </div>
        </>
      )}
    </div>
  );
};

const MenuDivider = () => <div className="my-0.5 h-px bg-neutral-800" />;

const MenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}> = ({ icon, label, shortcut, onClick, disabled = false, danger = false }) => (
  <Tooltip label={label} placement="right">
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={"flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 " + (danger ? "text-rose-300 hover:bg-rose-950/40" : "text-neutral-200 hover:bg-neutral-800")}
    >
      <span className="flex min-w-0 items-center gap-2">{icon}<span className="truncate">{label}</span></span>
      {shortcut && <span className="shrink-0 font-mono text-[10px] text-neutral-500">{shortcut}</span>}
    </button>
  </Tooltip>
);
const ViewMenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}> = ({ icon, label, selected, onClick }) => (
  <Tooltip label={label} placement="right">
    <button type="button" role="menuitemradio" aria-checked={selected} onClick={onClick} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-neutral-200 transition-colors hover:bg-neutral-800">
      <span className="flex items-center gap-2">{icon}<span>{label}</span></span>
      {selected && <Check className="h-3.5 w-3.5 text-cyan-300" />}
    </button>
  </Tooltip>
);
