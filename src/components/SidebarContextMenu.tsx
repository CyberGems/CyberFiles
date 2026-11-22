import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../locales/LanguageContext';

export interface SidebarContextMenuItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separator?: true;
  onSelect?: () => void;
}

export interface SidebarContextMenuState {
  x: number;
  y: number;
  title: string;
  items: SidebarContextMenuItem[];
}

interface SidebarContextMenuProps {
  menu: SidebarContextMenuState;
  onClose: () => void;
}

/** The styled right-click menu for sidebar rows: portalled, clamped to the
    window, keyboard navigable, following the tab context menu's shared look. */
export function SidebarContextMenu({ menu, onClose }: SidebarContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const [screenPosition, setScreenPosition] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const menuElement = menuRef.current;
    if (!menuElement) return;
    const bounds = menuElement.getBoundingClientRect();
    setScreenPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8)),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const outsideScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', outsideScroll, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', outsideScroll, true);
      /* The menu hands focus back to the element that had it before opening. */
      previousFocus?.focus();
    };
  }, [onClose]);

  const focusItem = (mode: 'first' | 'last' | 'next' | 'previous') => {
    const enabled = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []);
    if (!enabled.length) return;
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = mode === 'first'
      ? 0
      : mode === 'last'
        ? enabled.length - 1
        : current === -1
          ? (mode === 'previous' ? enabled.length - 1 : 0)
          : (current + (mode === 'next' ? 1 : -1) + enabled.length) % enabled.length;
    enabled[next].focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t.sidebar.contextMenuLabel}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          event.preventDefault();
          focusItem(event.shiftKey ? 'previous' : 'next');
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        focusItem(event.key === 'ArrowDown' ? 'next' : event.key === 'ArrowUp' ? 'previous' : event.key === 'Home' ? 'first' : 'last');
      }}
      style={screenPosition}
      className="fixed z-[100] w-56 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900/98 p-1.5 font-sans shadow-2xl shadow-black/60 backdrop-blur-xl select-none"
    >
      <div className="truncate border-b border-neutral-700/60 px-3 py-2 text-xs font-medium text-cyan-200">{menu.title}</div>
      {menu.items.map(item => item.separator ? (
        <div key={item.id} className="my-1 border-t border-neutral-700/60" />
      ) : (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect?.();
            onClose();
          }}
          className={(item.danger
            ? 'flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs text-neutral-200 outline-none transition-colors hover:bg-rose-950/50 hover:text-rose-200 focus-visible:bg-rose-950/50 focus-visible:text-rose-200 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent'
            : 'flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs text-neutral-200 outline-none transition-colors hover:bg-cyan-950/50 hover:text-cyan-100 focus-visible:bg-cyan-950/50 focus-visible:text-cyan-100 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent')}
        >
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${item.disabled ? 'text-neutral-600' : item.danger ? 'text-rose-400' : 'text-cyan-400'}`}>{item.icon}</span>
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
