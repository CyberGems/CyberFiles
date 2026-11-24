import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import type { NativeShellMenuEntry } from '../utils/nativeFileSystem';

export interface ShellMenuFlyoutProps {
  items: NativeShellMenuEntry[];
  onVerb: (verbId: number) => void;
  onPortalMouseEnter?: () => void;
  onPortalMouseLeave?: () => void;
}

/* Renders one level of the enumerated Shell menu as a styled panel. Submenu
   entries chain further panels, so the whole Shell menu lives inside the app's
   own flyout styling instead of a native OS popup. */
export function ShellMenuFlyout({
  items,
  onVerb,
  onPortalMouseEnter,
  onPortalMouseLeave,
}: ShellMenuFlyoutProps) {
  const [openSubmenu, setOpenSubmenu] = useState<{ entry: NativeShellMenuEntry; anchor: DOMRect } | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<{ open: number | null; close: number | null }>({ open: null, close: null });
  const panelRef = useRef<HTMLDivElement>(null);

  const cancelTimers = () => {
    if (timersRef.current.open !== null) window.clearTimeout(timersRef.current.open);
    if (timersRef.current.close !== null) window.clearTimeout(timersRef.current.close);
    timersRef.current = { open: null, close: null };
  };

  useEffect(() => () => cancelTimers(), []);

  useLayoutEffect(() => {
    if (!openSubmenu || !submenuRef.current) return;
    const panel = submenuRef.current.getBoundingClientRect();
    const anchor = openSubmenu.anchor;
    const margin = 8;
    let left = anchor.right + 2;
    if (left + panel.width + margin > window.innerWidth) left = anchor.left - panel.width - 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin));
    const top = Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - panel.height - margin));
    submenuRef.current.style.left = `${left}px`;
    submenuRef.current.style.top = `${top}px`;
  }, [openSubmenu]);

  const openSubmenuFor = (entry: NativeShellMenuEntry, rect: DOMRect) => {
    cancelTimers();
    setOpenSubmenu({ entry, anchor: rect });
  };

  const scheduleCloseSubmenu = () => {
    cancelTimers();
    timersRef.current.close = window.setTimeout(() => {
      timersRef.current.close = null;
      if (submenuRef.current?.matches(':hover') || document.querySelector('[data-shell-flyout]:hover')) return;
      setOpenSubmenu(null);
    }, 250);
  };

  const toggleOrOpenSubmenu = (entry: NativeShellMenuEntry, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (openSubmenu?.entry === entry) {
      cancelTimers();
      setOpenSubmenu(null);
    } else {
      openSubmenuFor(entry, rect);
    }
  };

  const row = (entry: NativeShellMenuEntry, index: number) => {
    if (entry.kind === 'separator') {
      return <div key={`sep-${index}`} className="my-1 h-px bg-neutral-800/90" />;
    }
    const isSubmenu = entry.kind === 'submenu' && (entry.items?.length ?? 0) > 0;
    const isOpen = openSubmenu?.entry === entry;
    return (
      <button
        key={`${index}-${entry.label ?? ''}-${entry.verbId ?? 'sub'}`}
        type="button"
        role="menuitem"
        disabled={entry.disabled}
        onClick={event => {
          if (isSubmenu) {
            toggleOrOpenSubmenu(entry, event);
            return;
          }
          if (entry.verbId !== undefined) {
            onVerb(entry.verbId);
          }
        }}
        onMouseEnter={event => {
          if (isSubmenu) {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            cancelTimers();
            timersRef.current.open = window.setTimeout(() => {
              timersRef.current.open = null;
              setOpenSubmenu({ entry, anchor: rect });
            }, 150);
          } else {
            cancelTimers();
            setOpenSubmenu(null);
          }
        }}
        onMouseLeave={() => {
          /* Closing is deferred so crossing into the chained panel keeps it. */
          if (isOpen) {
            scheduleCloseSubmenu();
          } else if (timersRef.current.open !== null) {
            window.clearTimeout(timersRef.current.open);
            timersRef.current.open = null;
          }
        }}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs text-neutral-100 outline-none transition-colors hover:bg-neutral-800/90 focus-visible:bg-neutral-800/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${isOpen ? 'bg-neutral-800/90 text-cyan-100' : ''}`}
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${entry.disabled ? 'text-neutral-500' : 'text-cyan-300'}`}>
          {entry.icon ? (
            <img
              src={entry.icon}
              alt=""
              draggable={false}
              className={`h-4 w-4 object-contain${entry.disabled ? ' opacity-45 grayscale' : ''}`}
            />
          ) : entry.checked ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <span />
          )}
        </span>
        <span className="flex-1 truncate">{entry.label}</span>
        {isSubmenu && <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
      </button>
    );
  };

  return (
    <div
      ref={panelRef}
      data-shell-flyout="true"
      className="min-w-[220px]"
    >
      {items.map((entry, index) => row(entry, index))}
      {openSubmenu && openSubmenu.entry.items && createPortal(
        <div
          ref={submenuRef}
          data-shell-flyout="true"
          role="menu"
          onContextMenu={event => event.preventDefault()}
          onMouseEnter={() => {
            cancelTimers();
            onPortalMouseEnter?.();
          }}
          onMouseLeave={() => {
            scheduleCloseSubmenu();
            onPortalMouseLeave?.();
          }}
          style={{ left: -10000, top: -10000 }}
          className="fixed z-[110] min-w-[220px] w-max max-w-[340px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-900/95 p-1 text-xs shadow-2xl shadow-black/70 backdrop-blur-xl select-none"
        >
          <ShellMenuFlyout
            items={openSubmenu.entry.items}
            onVerb={onVerb}
            onPortalMouseEnter={() => {
              cancelTimers();
              onPortalMouseEnter?.();
            }}
            onPortalMouseLeave={() => {
              scheduleCloseSubmenu();
              onPortalMouseLeave?.();
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
