import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Check,
  ClipboardCopy,
  Copy,
  Eye,
  FileText,
  FolderOpen,
  Info,
  ListChecks,
  MoreHorizontal,
  Palette,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { ArchiveExtractionMode, FileItem } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

/* Pane-scoped callbacks. Everything here must act on the pane that renders the bar, never on
   whichever pane happens to be active, so each one receives the pane from the caller. */
export interface PaneSelectionActions {
  isDualPane: boolean;
  isHorizontalDual: boolean;
  /* Which pane renders this bar: it decides where the transfer arrows point, so the right
     pane offers `← Copiar` instead of always pointing right. */
  paneSide: 'left' | 'right';
  transferEnabled: boolean;
  supportsArchiveCreation: boolean;
  supportsArchiveExtraction: boolean;
  propertiesOpen: boolean;
  onDelete: (items: FileItem[]) => void;
  onRename: (item: FileItem) => void;
  onPreview: (item: FileItem) => void;
  onCompress: (items: FileItem[]) => void;
  onExtract: (item: FileItem, mode: ArchiveExtractionMode) => void;
  onCopyPath: (items: FileItem[]) => void;
  onCopyFolderPath: (path: string) => void;
  onCompressCurrentFolder: () => void;
  canCompressCurrentFolder: boolean;
  onCustomizeFolderIcon: (item: FileItem) => void;
  onCustomizeCurrentFolderIcon: () => void;
  onRestore: (items: FileItem[]) => void;
  onCopyToOtherPane: () => void;
  onMoveToOtherPane: () => void;
  onToggleProperties: () => void;
}

interface PaneActionBarProps {
  filterQuery: string;
  filterPlaceholder: string;
  onFilterChange: (query: string) => void;
  /* Focused when type-to-filter starts, so the following keystrokes land in the input. */
  filterInputRef?: React.RefObject<HTMLInputElement | null>;
  /* Returns focus to the list after the filter chip disappears, so typing keeps working. */
  onFocusList?: () => void;
  itemCountLabel: string;
  visibleFiles: FileItem[];
  selectedItems: FileItem[];
  onSetSelection: (ids: string[]) => void;
  folderPath: string;
  onRefresh?: () => void;
  actions: PaneSelectionActions;
}

interface ActionEntry {
  key: string;
  label: string;
  /* Longer explanation for the tooltip when the visible label has to stay short. */
  tooltip?: string;
  icon: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const ARCHIVE_EXTENSIONS = ['zip', 'rar'];

/* The row keeps a constant height in both states, so selecting an item never shifts the list
   under the pointer. Labels collapse to icons when the pane is too narrow to hold them. */
export const PaneActionBar: React.FC<PaneActionBarProps> = ({
  filterQuery,
  filterPlaceholder,
  onFilterChange,
  filterInputRef,
  onFocusList,
  itemCountLabel,
  visibleFiles,
  selectedItems,
  onSetSelection,
  folderPath,
  onRefresh,
  actions,
}) => {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const hasSelection = selectedItems.length > 0;
  const singleItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const allFromRecycleBin = hasSelection && selectedItems.every(item => Boolean(item.recycleBinId));
  const singleArchive = singleItem && !singleItem.isFolder && ARCHIVE_EXTENSIONS.includes(singleItem.extension.toLowerCase())
    ? singleItem
    : null;
  const singleFolder = singleItem?.isFolder ? singleItem : null;

  /* The transfer target is always the *other* pane, so the arrow points away from this one:
     side by side the right pane points left, stacked the bottom pane points up. */
  const transferDirection: 'right' | 'left' | 'down' | 'up' = actions.isHorizontalDual
    ? (actions.paneSide === 'left' ? 'down' : 'up')
    : (actions.paneSide === 'left' ? 'right' : 'left');
  const TransferArrow = {
    right: ArrowRight,
    left: ArrowLeft,
    down: ArrowDown,
    up: ArrowUp,
  }[transferDirection];
  const copyTransferLabel = {
    right: t.sidebar.copyLeftToRight,
    left: t.sidebar.copyRightToLeft,
    down: t.sidebar.copyTopToBottom,
    up: t.sidebar.copyBottomToTop,
  }[transferDirection];
  const copyTransferHint = {
    right: t.sidebar.copyLeftToRightHint,
    left: t.sidebar.copyRightToLeftHint,
    down: t.sidebar.copyTopToBottomHint,
    up: t.sidebar.copyBottomToTopHint,
  }[transferDirection];
  const moveTransferLabel = {
    right: t.sidebar.moveLeftToRight,
    left: t.sidebar.moveRightToLeft,
    down: t.sidebar.moveTopToBottom,
    up: t.sidebar.moveBottomToTop,
  }[transferDirection];
  const moveTransferHint = {
    right: t.sidebar.moveLeftToRightHint,
    left: t.sidebar.moveRightToLeftHint,
    down: t.sidebar.moveTopToBottomHint,
    up: t.sidebar.moveBottomToTopHint,
  }[transferDirection];

  const selectionTooltip = (
    <div className="space-y-1">
      <p className="font-medium text-neutral-100">
        {(selectedItems.length === 1 ? t.sidebar.oneItemSelected : t.sidebar.manyItemsSelected)
          .replace('{count}', String(selectedItems.length))}
      </p>
      <div className="space-y-0.5">
        {selectedItems.slice(0, 5).map(item => (
          <p key={item.id} className="max-w-[220px] truncate font-sans text-[10px] text-neutral-400">{item.name}</p>
        ))}
        {selectedItems.length > 5 && (
          <p className="text-[10px] text-neutral-500">{t.sidebar.moreSelected.replace('{count}', String(selectedItems.length - 5))}</p>
        )}
      </div>
    </div>
  );

  const selectionActions: ActionEntry[] = [];
  if (hasSelection) {
    if (allFromRecycleBin) {
      selectionActions.push({
        key: 'restore',
        label: t.sidebar.restoreSelected,
        icon: <RotateCcw className="h-3.5 w-3.5" />,
        disabled: !selectedItems.every(item => Boolean(item.originalPath)),
        onSelect: () => actions.onRestore(selectedItems),
      });
    } else {
      if (actions.isDualPane) {
        selectionActions.push(
          {
            key: 'copy-to-pane',
            label: copyTransferLabel,
            tooltip: copyTransferHint,
            icon: <Copy className="h-3.5 w-3.5" />,
            disabled: !actions.transferEnabled,
            onSelect: actions.onCopyToOtherPane,
          },
          {
            key: 'move-to-pane',
            label: moveTransferLabel,
            tooltip: moveTransferHint,
            icon: <TransferArrow className="h-3.5 w-3.5" />,
            disabled: !actions.transferEnabled,
            onSelect: actions.onMoveToOtherPane,
          },
        );
      }
      if (singleItem) {
        selectionActions.push({
          key: 'rename',
          label: t.toolbar.rename,
          icon: <Pencil className="h-3.5 w-3.5" />,
          onSelect: () => actions.onRename(singleItem),
        });
      }
      selectionActions.push({
        key: 'delete',
        label: t.toolbar.delete,
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => actions.onDelete(selectedItems),
      });
    }
  }

  const selectionMenuGroups: ActionEntry[][] = [];
  if (hasSelection) {
    const primary: ActionEntry[] = [];
    if (!allFromRecycleBin && singleItem && !singleItem.isFolder) {
      primary.push({
        key: 'preview',
        label: t.sidebar.previewSelected,
        icon: <Eye className="h-3.5 w-3.5 text-cyan-300" />,
        onSelect: () => actions.onPreview(singleItem),
      });
    }
    if (!allFromRecycleBin && singleArchive && actions.supportsArchiveExtraction) {
      primary.push(
        {
          key: 'extract-here',
          label: t.contextMenu.extractArchiveHere,
          icon: <Archive className="h-3.5 w-3.5 text-violet-300" />,
          onSelect: () => actions.onExtract(singleArchive, 'here'),
        },
        {
          key: 'extract-folder',
          label: t.contextMenu.extractArchiveFolderShort,
          icon: <FolderOpen className="h-3.5 w-3.5 text-violet-300" />,
          onSelect: () => actions.onExtract(singleArchive, 'folder'),
        },
      );
    }
    if (!allFromRecycleBin && actions.supportsArchiveCreation) {
      primary.push({
        key: 'compress',
        label: t.contextMenu.compressSelectedToZip,
        icon: <Archive className="h-3.5 w-3.5 text-violet-300" />,
        onSelect: () => actions.onCompress(selectedItems),
      });
    }
    if (!allFromRecycleBin && singleFolder) {
      primary.push({
        key: 'folder-icon',
        label: t.sidebar.customizeFolderIcon,
        icon: <Palette className="h-3.5 w-3.5 text-pink-400" />,
        onSelect: () => actions.onCustomizeFolderIcon(singleFolder),
      });
    }
    if (primary.length > 0) selectionMenuGroups.push(primary);

    selectionMenuGroups.push([
      {
        key: 'copy-path',
        label: selectedItems.length === 1 ? t.sidebar.copySelectedPath : t.sidebar.copySelectedPaths,
        icon: <ClipboardCopy className="h-3.5 w-3.5 text-neutral-300" />,
        onSelect: () => actions.onCopyPath(selectedItems),
      },
      {
        key: 'properties',
        label: actions.propertiesOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel,
        icon: <Info className="h-3.5 w-3.5 text-cyan-300" />,
        shortcut: 'F3',
        onSelect: actions.onToggleProperties,
      },
    ]);

    selectionMenuGroups.push([
      {
        key: 'clear-selection',
        label: t.sidebar.unselectAll,
        icon: <Square className="h-3.5 w-3.5 text-neutral-400" />,
        onSelect: () => onSetSelection([]),
      },
    ]);
  }

  const folderMenuGroups: ActionEntry[][] = [
    [
      {
        key: 'select-all',
        label: t.sidebar.selectAll,
        icon: <ListChecks className="h-3.5 w-3.5 text-cyan-300" />,
        shortcut: 'Ctrl+A',
        disabled: visibleFiles.length === 0,
        onSelect: () => onSetSelection(visibleFiles.map(item => item.id)),
      },
      {
        key: 'select-none',
        label: t.sidebar.unselectAll,
        icon: <Square className="h-3.5 w-3.5 text-neutral-400" />,
        disabled: visibleFiles.length === 0,
        onSelect: () => onSetSelection([]),
      },
      {
        key: 'select-invert',
        label: t.sidebar.invertSelection,
        icon: <ArrowLeftRight className="h-3.5 w-3.5 text-amber-300" />,
        disabled: visibleFiles.length === 0,
        onSelect: () => {
          const selectedIds = new Set(selectedItems.map(item => item.id));
          onSetSelection(visibleFiles.filter(item => !selectedIds.has(item.id)).map(item => item.id));
        },
      },
      {
        key: 'select-files',
        label: t.contextMenu.selectOnlyFiles,
        icon: <FileText className="h-3.5 w-3.5 text-cyan-300" />,
        disabled: !visibleFiles.some(item => !item.isFolder),
        onSelect: () => onSetSelection(visibleFiles.filter(item => !item.isFolder).map(item => item.id)),
      },
      {
        key: 'select-folders',
        label: t.contextMenu.selectOnlyFolders,
        icon: <FolderOpen className="h-3.5 w-3.5 text-amber-300" />,
        disabled: !visibleFiles.some(item => item.isFolder),
        onSelect: () => onSetSelection(visibleFiles.filter(item => item.isFolder).map(item => item.id)),
      },
    ],
    [
      {
        key: 'copy-folder-path',
        label: t.sidebar.copyFolderPath,
        icon: <ClipboardCopy className="h-3.5 w-3.5 text-neutral-300" />,
        disabled: !folderPath,
        onSelect: () => actions.onCopyFolderPath(folderPath),
      },
      {
        key: 'compress-folder',
        label: t.contextMenu.compressCurrentFolderToZip,
        icon: <Archive className="h-3.5 w-3.5 text-violet-300" />,
        disabled: !actions.canCompressCurrentFolder,
        onSelect: actions.onCompressCurrentFolder,
      },
      {
        key: 'folder-icon',
        label: t.contextMenu.customizeThisFolderIcon,
        icon: <Palette className="h-3.5 w-3.5 text-pink-400" />,
        disabled: !folderPath || folderPath.startsWith('::'),
        onSelect: actions.onCustomizeCurrentFolderIcon,
      },
    ],
    [
      {
        key: 'refresh',
        label: t.toolbar.refresh,
        icon: <RefreshCw className="h-3.5 w-3.5 text-neutral-400" />,
        disabled: !onRefresh || !folderPath,
        onSelect: () => onRefresh?.(),
      },
      {
        key: 'properties',
        label: actions.propertiesOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel,
        icon: <Info className="h-3.5 w-3.5 text-cyan-300" />,
        shortcut: 'F3',
        onSelect: actions.onToggleProperties,
      },
    ],
  ];

  const menuGroups = hasSelection ? selectionMenuGroups : folderMenuGroups;
  const runAndClose = (entry: ActionEntry) => {
    setMenuOpen(false);
    entry.onSelect();
  };

  return (
    <div className="cyberfiles-pane-filter pane-action-bar flex h-9 flex-shrink-0 items-center gap-1.5 border-b border-neutral-800/80 bg-neutral-950/60 px-2 text-xs">
      {hasSelection ? (
        <>
          <Tooltip label={selectionTooltip} placement="bottom">
            <span className="flex h-6 flex-shrink-0 items-center gap-1 rounded-md border border-cyan-700/70 bg-cyan-950/60 px-1.5 text-[11px] font-semibold text-cyan-200">
              <Check className="h-3 w-3" />
              <span className="tabular-nums">{selectedItems.length}</span>
            </span>
          </Tooltip>
          {/* Read-only on purpose: typing from the list starts a fresh search and drops the
              selection, so the row never keeps an input mounted here. This chip only reports
              the active filter and offers a way to clear it without losing the selection. */}
          {filterQuery && (
            <Tooltip label={t.pane.filterActive} placement="bottom">
              <span className="flex h-6 max-w-[9rem] flex-shrink-0 items-center gap-1 rounded-md border border-amber-700/60 bg-amber-950/30 px-1.5 text-[11px] text-amber-200">
                <Search className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{filterQuery}</span>
                <button
                  type="button"
                  aria-label={t.pane.clearFilter}
                  /* Never takes the focus: the chip disappears once the query is empty, and a
                     focused element that unmounts drops the caret on the document body. */
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => {
                    onFilterChange('');
                    onFocusList?.();
                  }}
                  className="flex-shrink-0 text-amber-300/70 transition-colors hover:text-amber-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </Tooltip>
          )}
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            {selectionActions.map(entry => (
              <Tooltip key={entry.key} label={entry.tooltip ?? entry.label} placement="bottom" disabled={entry.disabled}>
                <button
                  type="button"
                  aria-label={entry.label}
                  disabled={entry.disabled}
                  onClick={entry.onSelect}
                  className={entry.danger
                    ? 'pane-action-btn flex h-6 flex-shrink-0 items-center gap-1 rounded-md border border-rose-900/60 bg-rose-950/20 px-2 text-[11px] text-rose-200 transition-colors hover:border-rose-700 hover:bg-rose-950/50 disabled:cursor-not-allowed disabled:opacity-40'
                    : 'pane-action-btn flex h-6 flex-shrink-0 items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 text-[11px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40'}
                >
                  {entry.icon}
                  <span className="pane-action-label">{entry.label}</span>
                </button>
              </Tooltip>
            ))}
          </div>
          {/* Outside the clipping group on purpose: leaving the selection mode must stay
              reachable even when the pane is too narrow for the action labels. */}
          <div aria-hidden="true" className="mx-0.5 h-4 w-px flex-shrink-0 bg-neutral-800" />
          <Tooltip label={t.pane.cancelSelection} placement="bottom" shortcut="Esc">
            <button
              type="button"
              aria-label={t.pane.cancelSelection}
              onClick={() => onSetSelection([])}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <div className="flex-1" />
        </>
      ) : (
        <>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            <input
              ref={filterInputRef}
              type="text"
              value={filterQuery}
              placeholder={filterPlaceholder}
              onChange={event => onFilterChange(event.target.value)}
              onKeyDown={event => {
                /* Escape always leaves the field, even when it is already empty: being in the
                   filter is itself the mode the user wants out of. */
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                onFilterChange('');
                onFocusList?.();
              }}
              className="w-full rounded border border-neutral-800 bg-neutral-900 py-1 pl-7 pr-7 font-sans text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-cyan-500/60 focus:outline-none"
            />
            {filterQuery && (
              <button
                type="button"
                aria-label={t.contextMenu.clearFilter}
                onMouseDown={event => event.preventDefault()}
                onClick={() => onFilterChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </>
      )}

      <div className="pane-action-count shrink-0 whitespace-nowrap font-sans text-[10px] text-neutral-400">{itemCountLabel}</div>

      <div ref={menuRootRef} className="relative shrink-0">
        <Tooltip label={t.toolbar.moreActions} placement="bottom">
          <button
            type="button"
            aria-label={t.toolbar.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${menuOpen ? 'border-cyan-700/70 bg-cyan-950/60 text-cyan-200' : 'border-neutral-800 bg-neutral-900/70 text-neutral-400 hover:border-cyan-800/70 hover:bg-neutral-800 hover:text-cyan-200'}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        {menuOpen && (
          <div role="menu" aria-label={t.toolbar.moreActions} className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] min-w-56 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl">
            {menuGroups.map((group, groupIndex) => (
              <React.Fragment key={groupIndex}>
                {groupIndex > 0 && <div className="my-1 h-px bg-neutral-800" />}
                {group.map(entry => (
                  <button
                    key={entry.key}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    onClick={() => runAndClose(entry)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${entry.danger ? 'text-rose-300 hover:bg-rose-950/40' : 'text-neutral-200 hover:bg-neutral-800'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">{entry.icon}<span className="truncate">{entry.label}</span></span>
                    {entry.shortcut && <kbd className="keyboard-hint shrink-0">{entry.shortcut}</kbd>}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .pane-action-bar { container-type: inline-size; container-name: paneactions; }
        @container paneactions (max-width: 520px) {
          .pane-action-label { display: none; }
          .pane-action-btn { padding-left: .3rem; padding-right: .3rem; }
        }
        @container paneactions (max-width: 320px) {
          .pane-action-count { display: none; }
        }
      `}</style>
    </div>
  );
};
