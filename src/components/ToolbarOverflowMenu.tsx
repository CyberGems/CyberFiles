import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronsRight } from 'lucide-react';

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
}

export const ToolbarOverflowMenu: React.FC<ToolbarOverflowMenuProps> = ({ label, groups }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<string[]>([]);

  useLayoutEffect(() => {
    const toolbar = rootRef.current?.closest<HTMLElement>('.command-bar-container');
    if (!toolbar) return;
    const updateHiddenGroups = () => {
      const hidden = groups
        .filter(group => group.entries.length > 0)
        .filter(group => {
          const element = toolbar.querySelector<HTMLElement>(`[data-overflow-group="${group.id}"]`);
          return !element || window.getComputedStyle(element).display === 'none';
        })
        .map(group => group.id);
      setHiddenGroupIds(previous => previous.length === hidden.length && previous.every((id, index) => id === hidden[index]) ? previous : hidden);
    };
    updateHiddenGroups();
    const observer = new ResizeObserver(updateHiddenGroups);
    observer.observe(toolbar);
    window.addEventListener('resize', updateHiddenGroups);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHiddenGroups);
    };
  }, [groups]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
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
      items[nextIndex]?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus());
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="toolbar-overflow-root relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`toolbar-overflow-trigger h-9 w-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70 ${open ? 'border-cyan-700/70 bg-cyan-950/70 text-cyan-200' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-cyan-800 hover:bg-neutral-800 hover:text-cyan-200'}`}
      >
        <ChevronsRight className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label={label} className="absolute right-0 top-full z-[80] mt-2 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/95 p-1.5 text-xs shadow-2xl backdrop-blur-md">
          {groups.filter(group => hiddenGroupIds.includes(group.id)).map(group => group.entries.length === 0 ? null : (
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
                    triggerRef.current?.focus();
                  }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {entry.icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400">{entry.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.shortcut && <kbd className="keyboard-hint shrink-0">{entry.shortcut}</kbd>}
                  {entry.pressed !== undefined && <span aria-hidden="true" className={`ml-1 h-1.5 w-1.5 shrink-0 rounded-full ${entry.pressed ? 'bg-cyan-300' : 'bg-transparent'}`} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
