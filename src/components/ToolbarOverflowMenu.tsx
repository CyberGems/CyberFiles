import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsRight } from 'lucide-react';
import { KeyboardShortcutContent } from './KeyboardShortcut';

export interface ToolbarOverflowEntry {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  pressed?: boolean;
  onSelect: () => void;
}

export interface ToolbarOverflowGroup {
  id: string;
  label: string;
  entries: ToolbarOverflowEntry[];
}

interface ToolbarOverflowMenuProps {
  label: string;
  groups: ToolbarOverflowGroup[];
  /** Ids of groups currently folded into this menu by the toolbar fit pass. */
  collapsedIds: string[];
}

/**
 * Overflow menu for the command bar. The panel is portalled to `document.body`
 * with fixed positioning: the bar clips its own overflow, so a menu rendered
 * inline inside it gets cut off and focusing its items can drag ancestor
 * scroll offsets and shift the whole bar's content out of view.
 */
export const ToolbarOverflowMenu: React.FC<ToolbarOverflowMenuProps> = ({ label, groups, collapsedIds }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{ top: number; right: number; maxHeight: number } | null>(null);

  const hasCollapsed = collapsedIds.length > 0;

  useEffect(() => {
    if (open && !hasCollapsed) setOpen(false);
  }, [open, hasCollapsed]);

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = Math.min(rect.bottom + 6, window.innerHeight - 200);
    setPlacement({
      top,
      right: Math.max(8, window.innerWidth - rect.right),
      maxHeight: Math.max(160, Math.min(window.innerHeight - top - 12, Math.round(window.innerHeight * 0.7), 512)),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !menuRef.current) return;
      const items = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)'));
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[nextIndex]?.focus({ preventScroll: true });
    };
    const onWindowResize = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onWindowResize);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [open]);

  const openGroups = groups.filter(group => collapsedIds.includes(group.id) && group.entries.length > 0);
  return (
    <div ref={rootRef} className="toolbar-overflow-root relative shrink-0">
      {hasCollapsed && (
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          className={`command-control ${open ? 'border-cyan-700/70 text-cyan-200' : ''}`}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {open && placement && hasCollapsed && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ position: 'fixed', top: placement.top, right: placement.right, maxHeight: placement.maxHeight }}
          className="z-[90] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/95 p-1.5 text-xs shadow-2xl backdrop-blur-md"
        >
          {openGroups.map(group => (
            <div key={group.id} role="group" aria-label={group.label} className="py-1">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.label}</div>
              {group.entries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  role={entry.pressed === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={entry.pressed}
                  aria-label={entry.label}
                  disabled={entry.disabled}
                  onClick={() => {
                    setOpen(false);
                    entry.onSelect();
                    triggerRef.current?.focus({ preventScroll: true });
                  }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {entry.icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400">{entry.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.shortcut && <kbd className="keyboard-hint shrink-0"><KeyboardShortcutContent shortcut={entry.shortcut} /></kbd>}
                  {entry.pressed !== undefined && <span aria-hidden="true" className={`ml-1 h-1.5 w-1.5 shrink-0 rounded-full ${entry.pressed ? 'bg-cyan-300' : 'bg-transparent'}`} />}
                </button>
              ))}
            </div>
          ))}
          {openGroups.length === 0 && (
            <div className="px-2.5 py-2 text-neutral-500" role="presentation">{label}</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
