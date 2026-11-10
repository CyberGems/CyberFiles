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
  RefreshCw,
  History,
  Undo2,
  Wrench,
  Star,
  CornerDownLeft,
  HardDrive,
  Unplug,
} from 'lucide-react';
import { ArchiveExtractionMode, ContextMenuPosition, FileItem, GroupByField, SortField, SortOrder, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { isUncPath, isUncServerRoot } from '../utils/fileSystem';
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
  onMapNetworkDrive?: (item: FileItem) => void;
  onDisconnectNetworkDrive?: (item: FileItem) => void;
  isMappedNetworkDriveItem?: (item: FileItem) => boolean;
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
  onRefresh?: () => void;
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
  onMapNetworkDrive,
  onDisconnectNetworkDrive,
  isMappedNetworkDriveItem,
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
  onRefresh,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  /* Submenus render as flyout panels anchored to their trigger, like native
     Windows menus, instead of expanding inline. One open flyout at a time. */
  const [openFlyout, setOpenFlyout] = useState<{ id: string; rect: DOMRect } | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null);
  /* Keyboard flow needs the trigger to hand focus back to after ArrowLeft or
     Escape, and a flag so only keyboard-opened flyouts steal focus on mount. */
  const flyoutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusFlyoutOnOpenRef = useRef(false);
  const openFlyoutRef = useRef<{ id: string; rect: DOMRect } | null>(null);
  openFlyoutRef.current = openFlyout;
  const flyoutTimersRef = useRef<{ open: number | null; close: number | null }>({ open: null, close: null });
  const cancelFlyoutTimers = () => {
    if (flyoutTimersRef.current.open !== null) window.clearTimeout(flyoutTimersRef.current.open);
    if (flyoutTimersRef.current.close !== null) window.clearTimeout(flyoutTimersRef.current.close);
    flyoutTimersRef.current = { open: null, close: null };
  };
  const openFlyoutFor = (id: string, rect: DOMRect) => {
    cancelFlyoutTimers();
    setOpenFlyout({ id, rect });
  };
  const toggleFlyout = (id: string, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    flyoutTriggerRef.current = event.currentTarget as HTMLButtonElement;
    /* Keyboard activation produces a click with detail 0; only then should the
       panel move focus to its first row. */
    focusFlyoutOnOpenRef.current = event.detail === 0;
    if (openFlyout?.id === id) {
      cancelFlyoutTimers();
      setOpenFlyout(null);
    } else {
      openFlyoutFor(id, rect);
    }
  };
  /* Hover opens after a short dwell so scanning the menu vertically does not
     flash panels; leaving either the trigger or the panel closes after a
     grace period so small pointer detours do not dismiss it. */
  const scheduleFlyoutOpen = (id: string, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    flyoutTriggerRef.current = event.currentTarget as HTMLButtonElement;
    focusFlyoutOnOpenRef.current = false;
    cancelFlyoutTimers();
    flyoutTimersRef.current.open = window.setTimeout(() => openFlyoutFor(id, rect), 150);
  };
  const scheduleFlyoutClose = () => {
    cancelFlyoutTimers();
    flyoutTimersRef.current.close = window.setTimeout(() => setOpenFlyout(null), 250);
  };
  const focusFirstFlyoutItem = () => {
    flyoutRef.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus();
  };
  /* Rows of one menu level, in DOM order, skipping disabled entries. */
  const getMenuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)') ?? []);
  const getFlyoutItems = () => Array.from(flyoutRef.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)') ?? []);
  const moveFocusWithin = (items: HTMLButtonElement[], key: string) => {
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = key === 'Home'
      ? 0
      : key === 'End'
        ? items.length - 1
        : currentIndex === -1
          ? (key === 'ArrowUp' ? items.length - 1 : 0)
          : (currentIndex + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    /* Plain focus() so a long menu scrolls the focused row into view. */
    items[nextIndex]?.focus();
  };
  /* Opens the flyout for a trigger and moves focus to its first row. The
     synthetic call from the window-level arrow handler passes the trigger
     element directly, since that event's currentTarget is the window. */
  const openFlyoutFromKeyboard = (id: string, event: React.KeyboardEvent<HTMLButtonElement> | { preventDefault: () => void; currentTarget: HTMLButtonElement }) => {
    event.preventDefault();
    flyoutTriggerRef.current = event.currentTarget;
    focusFlyoutOnOpenRef.current = true;
    openFlyoutFor(id, event.currentTarget.getBoundingClientRect());
  };  /* ArrowRight opens the submenu and focuses its first row, mirroring native
     Windows menus. Arrow keys are owned by the window-level handler below so
     they reach the menu before the file list handles them. */
  const handleSubmenuTriggerKeyDown = (id: string, enabled: boolean, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    if (event.key === 'ArrowRight') {
      openFlyoutFromKeyboard(id, event);
    }
  };
  const [screenPos, setScreenPos] = useState<{ left: number; top: number }>({
    left: position?.x ?? 0,
    top: position?.y ?? 0,
  });
  const { t } = useLanguage();

  useEffect(() => {
    setOpenFlyout(null);
    cancelFlyoutTimers();
  }, [position]);

  /* Keyboard-opened menus start on their first row, like native Windows menus.
     The row is focused once the portal has painted; a hidden element cannot
     take focus. When the menu closes, focus returns to the element that had it
     before the menu opened, so a full keyboard pass never falls to the background. */
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!position) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (position.openedViaKeyboard) {
      requestAnimationFrame(() => {
        getMenuItems()[0]?.focus();
      });
    }
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
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
  }, [position]);

  /* Flyouts are fixed panels portalled next to the main menu, so their
     placement is measured after mount and flipped to the left when they would
     overflow the viewport. */
  useLayoutEffect(() => {
    if (!openFlyout || !flyoutRef.current) {
      setFlyoutPos(null);
      return;
    }
    const panel = flyoutRef.current.getBoundingClientRect();
    const anchor = openFlyout.rect;
    const margin = 10;
    const gap = 2;
    let left = anchor.right + gap;
    if (left + panel.width + margin > window.innerWidth) left = anchor.left - panel.width - gap;
    left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin));
    const top = Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - panel.height - margin));
    setFlyoutPos(current => (current && current.left === left && current.top === top ? current : { left, top }));
  }, [openFlyout]);

  /* Focus moves only once the panel is positioned; a hidden panel cannot take
     focus, so this waits for flyoutPos instead of running in the effect above. */
  useEffect(() => {
    if (!openFlyout || !flyoutPos || !focusFlyoutOnOpenRef.current) return;
    focusFlyoutOnOpenRef.current = false;
    focusFirstFlyoutItem();
  }, [openFlyout, flyoutPos]);

  useEffect(() => () => cancelFlyoutTimers(), []);

  useEffect(() => {
    if (!position) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || flyoutRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      /* Keyboard shortcuts with modifiers (Alt+Left back, etc.) keep working. */
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const navigationKey = event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End';

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        /* Esc closes one level: the open flyout first, the whole menu next. */
        if (openFlyoutRef.current) {
          cancelFlyoutTimers();
          setOpenFlyout(null);
          flyoutTriggerRef.current?.focus();
        } else {
          onClose();
        }
        return;
      }

      if (openFlyoutRef.current) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          cancelFlyoutTimers();
          setOpenFlyout(null);
          flyoutTriggerRef.current?.focus();
          return;
        }
        /* Tab cycles inside the open flyout instead of escaping to the UI
           behind the menu. */
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          moveFocusWithin(getFlyoutItems(), event.shiftKey ? 'ArrowUp' : 'ArrowDown');
          return;
        }
        if (!navigationKey) return;
        event.preventDefault();
        event.stopPropagation();
        /* Enters the panel at the top or bottom depending on the arrow key
           when focus was not already inside it. */
        moveFocusWithin(getFlyoutItems(), event.key);
        return;
      }

      /* Tab cycles inside the menu itself; the close effect hands focus back
         to the element that had it before the menu opened. */
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        moveFocusWithin(getMenuItems(), event.shiftKey ? 'ArrowUp' : 'ArrowDown');
        return;
      }

      /* The quick-action header bar and the vertical list navigate separately,
         like native menus: Left/Right walk the header row, Up/Down walk the
         list, and the arrows cross between the two bands. */
      const allItems = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []);
      const headerItems = allItems.filter(element => Boolean(element.closest('[role="group"]')));
      const listItems = allItems.filter(element => !element.closest('[role="group"]'));
      const activeElement = document.activeElement as HTMLButtonElement | null;
      const inHeader = Boolean(activeElement?.closest('[role="group"]'));
      const band = inHeader ? headerItems : listItems;

      const moveIn = (items: HTMLButtonElement[], key: string) => {
        if (!items.length) return;
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex = key === 'Home'
          ? 0
          : key === 'End'
            ? items.length - 1
            : currentIndex === -1
              ? (key === 'ArrowUp' ? items.length - 1 : 0)
              : (currentIndex + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[nextIndex]?.focus();
      };

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        /* From the header row, Down drops straight into the list below; from
           the list, Up at the top returns to the header row when it exists. */
        if (inHeader && event.key === 'ArrowDown') {
          listItems[0]?.focus();
          return;
        }
        if (!inHeader && headerItems.length && event.key === 'ArrowUp' && listItems.indexOf(activeElement as HTMLButtonElement) === 0) {
          headerItems[headerItems.length - 1]?.focus();
          return;
        }
        moveIn(band, event.key);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        /* Inside the header row the arrows stay in that row. */
        if (inHeader) {
          moveIn(headerItems, event.key);
          return;
        }
        /* On a submenu trigger, Right opens the flyout. */
        if (event.key === 'ArrowRight' && activeElement?.getAttribute('aria-haspopup') === 'menu' && activeElement.dataset.flyoutId) {
          openFlyoutFromKeyboard(activeElement.dataset.flyoutId, {
            preventDefault: () => {},
            currentTarget: activeElement,
          } as unknown as React.KeyboardEvent<HTMLButtonElement>);
          return;
        }
        /* In a plain list, Left steps back up to the header row when present. */
        if (event.key === 'ArrowLeft' && headerItems.length && listItems.indexOf(activeElement as HTMLButtonElement) === 0) {
          headerItems[0]?.focus();
          return;
        }
        return;
      }

      if (!navigationKey) return;
      /* Captured at the window so the file list never sees the arrow press
         that enters the menu. */
      event.preventDefault();
      event.stopPropagation();
      moveFocusWithin(getMenuItems(), event.key);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown, true);
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
      <div>
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

  const flyoutLabels: Record<string, string> = {
    new: t.contextMenu.new,
    select: t.contextMenu.select,
    sort: t.contextMenu.sortBy,
    group: t.contextMenu.groupBy,
  };
  const flyoutLabel = openFlyout ? flyoutLabels[openFlyout.id] : undefined;

  /* Content of the open submenu. Kept inline so each row still closes the whole
     menu after running its action, exactly like the inline panels did. */
  const flyoutContent = () => {
    if (!openFlyout) return null;
    switch (openFlyout.id) {
      case 'new':
        return (
          <>
            <MenuButton icon={<FolderPlus className="h-4 w-4 text-emerald-400" />} label={t.contextMenu.newFolder} shortcut="F7" disabled={!canModifyFolder} onClick={() => { onCreateItem('folder'); onClose(); }} />
            <MenuButton icon={<FilePlus2 className="h-4 w-4 text-cyan-300" />} label={t.contextMenu.newTextFile} disabled={!canModifyFolder} onClick={() => { onCreateItem('text-file'); onClose(); }} />
            <MenuButton icon={<Link2 className="h-4 w-4 text-violet-300" />} label={t.contextMenu.newShortcut} disabled={!canModifyFolder} onClick={() => { onCreateItem('shortcut'); onClose(); }} />
          </>
        );
      case 'select':
        return (
          <>
            <MenuButton icon={<BoxSelect className="h-4 w-4 text-cyan-300" />} label={t.sidebar.selectAll} shortcut="Ctrl+A" disabled={!hasSelectableItems} onClick={() => { onSelectAll?.(); onClose(); }} />
            <MenuButton icon={<Square className="h-4 w-4 text-neutral-400" />} label={t.sidebar.unselectAll} onClick={() => { onSelectNone?.(); onClose(); }} />
            <MenuButton icon={<ArrowLeftRight className="h-4 w-4 text-amber-300" />} label={t.sidebar.invertSelection} disabled={!hasSelectableItems} onClick={() => { onInvertSelection?.(); onClose(); }} />
            <MenuDivider />
            <MenuButton icon={<FileText className="h-4 w-4 text-cyan-300" />} label={t.contextMenu.selectOnlyFiles} onClick={() => { onSelectOnlyFiles?.(); onClose(); }} />
            <MenuButton icon={<FolderOpen className="h-4 w-4 text-amber-300" />} label={t.contextMenu.selectOnlyFolders} disabled={!hasFoldersInFolder} onClick={() => { onSelectOnlyFolders?.(); onClose(); }} />
          </>
        );
      case 'sort':
        return (
          <>
            <ViewMenuButton icon={<span />} label={t.pane.columns.name} selected={sortField === 'name'} onClick={() => { onSortFieldChange('name'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.modified} selected={sortField === 'modifiedDate'} onClick={() => { onSortFieldChange('modifiedDate'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.created} selected={sortField === 'createdDate'} onClick={() => { onSortFieldChange('createdDate'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.type} selected={sortField === 'type'} onClick={() => { onSortFieldChange('type'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.size} selected={sortField === 'size'} onClick={() => { onSortFieldChange('size'); onClose(); }} />
            <MenuDivider />
            <ViewMenuButton icon={<ArrowUp className="h-3.5 w-3.5" />} label={t.contextMenu.ascending} selected={sortOrder === 'asc'} onClick={() => { onSortOrderChange('asc'); onClose(); }} />
            <ViewMenuButton icon={<ArrowDown className="h-3.5 w-3.5" />} label={t.contextMenu.descending} selected={sortOrder === 'desc'} onClick={() => { onSortOrderChange('desc'); onClose(); }} />
          </>
        );
      case 'group':
        return (
          <>
            <ViewMenuButton icon={<span />} label={t.contextMenu.groupNone} selected={groupBy === 'none'} onClick={() => { onGroupByChange('none'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.name} selected={groupBy === 'name'} onClick={() => { onGroupByChange('name'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.modified} selected={groupBy === 'modifiedDate'} onClick={() => { onGroupByChange('modifiedDate'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.type} selected={groupBy === 'type'} onClick={() => { onGroupByChange('type'); onClose(); }} />
            <ViewMenuButton icon={<span />} label={t.pane.columns.size} selected={groupBy === 'size'} onClick={() => { onGroupByChange('size'); onClose(); }} />
          </>
        );
      default:
        return null;
    }
  };

  return createPortal(
    <>
    <div
      ref={menuRef}
      role="menu"
      onContextMenu={event => event.preventDefault()}
      onScroll={() => {
        /* A flyout is pinned to a trigger position captured on open; scrolling
           the menu would detach it, so dismiss it instead. */
        cancelFlyoutTimers();
        setOpenFlyout(null);
      }}
      style={{ left: screenPos.left, top: screenPos.top }}
      className="fixed z-[100] min-w-[304px] w-max max-w-[420px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-900/95 text-xs shadow-2xl shadow-black/70 backdrop-blur-xl select-none"
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
            <div className="pt-0.5">
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
                <div>
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
                <div>
                  {item.isFolder && (
                    <>
                      <MenuButton
                        icon={<Star className="h-4 w-4 text-amber-300" />}
                        label={t.contextMenu.addToQuickAccess}
                        onClick={() => { onAddToQuickAccess(item); onClose(); }}
                      />
                      {onMapNetworkDrive && isUncPath(item.path) && !isUncServerRoot(item.path) && (
                        <MenuButton
                          icon={<HardDrive className="h-4 w-4 text-indigo-300" />}
                          label={t.contextMenu.mapNetworkDrive}
                          onClick={() => { onMapNetworkDrive(item); onClose(); }}
                        />
                      )}
                      {onDisconnectNetworkDrive && isMappedNetworkDriveItem?.(item) && (
                        <MenuButton
                          icon={<Unplug className="h-4 w-4 text-rose-400" />}
                          label={t.contextMenu.disconnectNetworkDrive}
                          onClick={() => { onDisconnectNetworkDrive(item); onClose(); }}
                        />
                      )}
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
            <div>
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
                <div>
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
              icon={<RefreshCw className="h-4 w-4 text-cyan-300" />}
              label={t.toolbar.refresh}
              shortcut="F5"
              disabled={!hasFolder || !onRefresh}
              onClick={() => { onRefresh?.(); onClose(); }}
            />
            <HeaderActionButton
              icon={<Undo2 className={`h-4 w-4 ${undoAvailable ? 'text-cyan-300' : 'text-neutral-500'}`} />}
              label={t.contextMenu.undoShort}
              shortcut="Ctrl+Z"
              disabled={!undoAvailable || !onUndo}
              onClick={() => { onUndo?.(); onClose(); }}
            />
          </div>

          <div className="pt-0.5">
            <MenuButton
              icon={<FolderPlus className="h-4 w-4 text-emerald-400" />}
              label={t.contextMenu.new}
              disabled={!canModifyFolder}
              expanded={openFlyout?.id === 'new'}
              trailing={<ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
              onClick={event => toggleFlyout('new', event)}
              flyoutId="new"
              onMouseEnter={canModifyFolder ? event => scheduleFlyoutOpen('new', event) : undefined}
              onMouseLeave={scheduleFlyoutClose}
              onKeyDown={event => handleSubmenuTriggerKeyDown('new', canModifyFolder, event)}
            />
            {onSelectAll && (
              <MenuButton
                icon={<ListChecks className="h-4 w-4 text-cyan-300" />}
                label={t.contextMenu.select}
                disabled={!hasFolder}
                expanded={openFlyout?.id === 'select'}
                trailing={<ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
                onClick={event => toggleFlyout('select', event)}
              flyoutId="select"
                onMouseEnter={hasFolder ? event => scheduleFlyoutOpen('select', event) : undefined}
                onMouseLeave={scheduleFlyoutClose}
                onKeyDown={event => handleSubmenuTriggerKeyDown('select', hasFolder, event)}
              />
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
          <div>
            <MenuButton
              icon={<List className="h-4 w-4 text-cyan-300" />}
              label={t.contextMenu.sortBy}
              expanded={openFlyout?.id === 'sort'}
              trailing={<ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
              onClick={event => toggleFlyout('sort', event)}
              flyoutId="sort"
              onMouseEnter={event => scheduleFlyoutOpen('sort', event)}
              onMouseLeave={scheduleFlyoutClose}
              onKeyDown={event => handleSubmenuTriggerKeyDown('sort', true, event)}
            />
            <MenuButton
              icon={<Layers className="h-4 w-4 text-violet-300" />}
              label={t.contextMenu.groupBy}
              disabled={!supportsGrouping}
              expanded={openFlyout?.id === 'group'}
              trailing={<ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
              onClick={event => toggleFlyout('group', event)}
              flyoutId="group"
              onMouseEnter={supportsGrouping ? event => scheduleFlyoutOpen('group', event) : undefined}
              onMouseLeave={scheduleFlyoutClose}
              onKeyDown={event => handleSubmenuTriggerKeyDown('group', supportsGrouping, event)}
            />
          </div>

          <MenuDivider />
          <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t.toolbar.viewModes}</div>
          <div>
            <ViewMenuButton icon={<List className="h-4 w-4" />} label={t.toolbar.viewDetails} selected={viewMode === 'details'} onClick={() => { onViewModeChange('details'); onClose(); }} />
            <ViewMenuButton icon={<StretchHorizontal className="h-4 w-4" />} label={t.toolbar.viewCompact} selected={viewMode === 'compact'} onClick={() => { onViewModeChange('compact'); onClose(); }} />
            <ViewMenuButton icon={<LayoutGrid className="h-4 w-4" />} label={t.toolbar.viewIcons} selected={viewMode === 'icons'} onClick={() => { onViewModeChange('icons'); onClose(); }} />
          </div>

          {canModifyFolder && (
            <>
              <MenuDivider />
              <div>
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
    </div>
    {openFlyout && (
      <div
        ref={flyoutRef}
        role="menu"
        aria-label={flyoutLabel}
        style={{
          left: flyoutPos?.left ?? 0,
          top: flyoutPos?.top ?? 0,
          visibility: flyoutPos ? 'visible' : 'hidden',
        }}
        onMouseEnter={cancelFlyoutTimers}
        onMouseLeave={scheduleFlyoutClose}
        onContextMenu={event => event.preventDefault()}
        className="fixed z-[110] min-w-[232px] w-max max-w-[340px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-900/95 text-xs shadow-2xl shadow-black/70 backdrop-blur-xl select-none"
      >
        {flyoutContent()}
      </div>
    )}
    </>,
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
    <Tooltip label={shortcut} placement="top" pointerOnly>
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
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
  trailing?: React.ReactNode;
  expanded?: boolean;
  flyoutId?: string;
}> = ({ icon, label, shortcut, onClick, onMouseEnter, onMouseLeave, onKeyDown, disabled = false, danger = false, trailing, expanded, flyoutId }) => (
  <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      data-flyout-id={flyoutId}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
      className={
        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-40 ' +
        (danger
          ? 'text-rose-300 hover:bg-rose-950/45 focus-visible:bg-rose-950/45'
          : 'text-neutral-100 hover:bg-neutral-800/90 focus-visible:bg-neutral-800/90') +
        /* Keep the trigger highlighted while its flyout is open, even after
           the pointer moves into the panel. */
        (expanded ? ' bg-neutral-800/90 text-cyan-100' : '')
      }
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {shortcut && (
        /* Suite-wide convention: shortcuts render as keyboard-hint chips, and the
           Enter hint uses the return glyph, matching DialogButton. */
        <kbd className="keyboard-hint shrink-0 text-neutral-400">
          {shortcut === 'Enter' ? <CornerDownLeft className="h-2.5 w-2.5" strokeWidth={2.5} /> : shortcut}
        </kbd>
      )}
      {trailing}
    </button>
);

const ViewMenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}> = ({ icon, label, selected, onClick }) => (
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
);
