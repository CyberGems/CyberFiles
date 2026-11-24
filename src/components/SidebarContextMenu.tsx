import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import type { NativeShellMenuEntry } from '../utils/nativeFileSystem';
import { ShellMenuFlyout } from './ShellMenuFlyout';

export interface SidebarContextMenuItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separator?: true;
  shellTargets?: string[];
  onSelect?: () => void;
}

export interface SidebarContextMenuState {
  x: number;
  y: number;
  title: string;
  targetKey?: string;
  items: SidebarContextMenuItem[];
}

interface SidebarContextMenuProps {
  menu: SidebarContextMenuState;
  shellMenuItems?: NativeShellMenuEntry[];
  onShellVerb?: (verbId: number) => void;
  onClose: () => void;
}

/** The styled right-click menu for sidebar rows: portalled, clamped to the
    window, keyboard navigable, following the tab context menu's shared look. */
export function SidebarContextMenu({ menu, shellMenuItems, onShellVerb, onClose }: SidebarContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [screenPosition, setScreenPosition] = useState({ left: menu.x, top: menu.y });
  const [shellFlyout, setShellFlyout] = useState<{ rect: DOMRect } | null>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null);
  const shellFlyoutRef = useRef<{ rect: DOMRect } | null>(null);
  shellFlyoutRef.current = shellFlyout;
  const flyoutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shellTriggerHoveredRef = useRef<HTMLButtonElement | null>(null);
  const focusFlyoutOnOpenRef = useRef(false);
  const flyoutTimersRef = useRef<{ open: number | null; close: number | null }>({ open: null, close: null });

  const cancelFlyoutTimers = () => {
    if (flyoutTimersRef.current.open !== null) window.clearTimeout(flyoutTimersRef.current.open);
    if (flyoutTimersRef.current.close !== null) window.clearTimeout(flyoutTimersRef.current.close);
    flyoutTimersRef.current = { open: null, close: null };
  };

  const openShellFlyout = (rect: DOMRect) => {
    cancelFlyoutTimers();
    setShellFlyout({ rect });
  };

  const scheduleFlyoutOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    flyoutTriggerRef.current = event.currentTarget;
    focusFlyoutOnOpenRef.current = false;
    cancelFlyoutTimers();
    flyoutTimersRef.current.open = window.setTimeout(() => openShellFlyout(rect), 150);
  };

  const scheduleFlyoutClose = () => {
    cancelFlyoutTimers();
    flyoutTimersRef.current.close = window.setTimeout(() => {
      if (flyoutRef.current?.matches(':hover') || document.querySelector('[data-shell-flyout]:hover')) return;
      setShellFlyout(null);
    }, 250);
  };

  const getFlyoutItems = () =>
    Array.from(flyoutRef.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)') ?? []);

  const moveFocusInFlyout = (key: string) => {
    const items = getFlyoutItems();
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

  useEffect(() => {
    setShellFlyout(null);
    cancelFlyoutTimers();
    shellTriggerHoveredRef.current = null;
  }, [menu]);

  useEffect(() => () => cancelFlyoutTimers(), []);

  useEffect(() => {
    if (!shellMenuItems?.length) return;
    const trigger = shellTriggerHoveredRef.current;
    if (!trigger?.matches(':hover') || shellFlyoutRef.current) return;
    flyoutTriggerRef.current = trigger;
    focusFlyoutOnOpenRef.current = false;
    openShellFlyout(trigger.getBoundingClientRect());
  }, [shellMenuItems]);

  useLayoutEffect(() => {
    const menuElement = menuRef.current;
    if (!menuElement) return;
    const bounds = menuElement.getBoundingClientRect();
    setScreenPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8)),
    });
  }, [menu.x, menu.y]);

  useLayoutEffect(() => {
    if (!shellFlyout || !flyoutRef.current) {
      setFlyoutPos(null);
      return;
    }
    const panel = flyoutRef.current.getBoundingClientRect();
    const anchor = shellFlyout.rect;
    const margin = 10;
    const gap = 2;
    let left = anchor.right + gap;
    if (left + panel.width + margin > window.innerWidth) left = anchor.left - panel.width - gap;
    left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin));
    const top = Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - panel.height - margin));
    setFlyoutPos(current => (current && current.left === left && current.top === top ? current : { left, top }));
  }, [shellFlyout]);

  useEffect(() => {
    if (!shellFlyout || !flyoutPos || !focusFlyoutOnOpenRef.current) return;
    focusFlyoutOnOpenRef.current = false;
    getFlyoutItems()[0]?.focus();
  }, [shellFlyout, flyoutPos]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    const isInsideMenuOrFlyout = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (menuRef.current?.contains(target) || flyoutRef.current?.contains(target)) return true;
      return target instanceof Element && Boolean(target.closest('[data-shell-flyout]'));
    };
    const outside = (event: PointerEvent) => {
      if (!isInsideMenuOrFlyout(event.target)) onClose();
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (shellFlyoutRef.current) {
          cancelFlyoutTimers();
          setShellFlyout(null);
          flyoutTriggerRef.current?.focus();
        } else {
          onClose();
        }
        return;
      }
      if (!shellFlyoutRef.current) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        cancelFlyoutTimers();
        setShellFlyout(null);
        flyoutTriggerRef.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        moveFocusInFlyout(event.shiftKey ? 'ArrowUp' : 'ArrowDown');
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        moveFocusInFlyout(event.key);
      }
    };
    const outsideScroll = (event: Event) => {
      if (!isInsideMenuOrFlyout(event.target)) onClose();
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
    <>
    <div
      ref={menuRef}
      role="menu"
      aria-label={t.sidebar.contextMenuLabel}
      onContextMenu={event => event.preventDefault()}
      onScroll={() => {
        cancelFlyoutTimers();
        setShellFlyout(null);
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          event.preventDefault();
          focusItem(event.shiftKey ? 'previous' : 'next');
          return;
        }
        if (event.key === 'ArrowRight') {
          const active = document.activeElement;
          if (active instanceof HTMLButtonElement && active.dataset.shellTrigger === 'true' && shellMenuItems?.length) {
            event.preventDefault();
            flyoutTriggerRef.current = active;
            focusFlyoutOnOpenRef.current = true;
            openShellFlyout(active.getBoundingClientRect());
          }
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        focusItem(event.key === 'ArrowDown' ? 'next' : event.key === 'ArrowUp' ? 'previous' : event.key === 'Home' ? 'first' : 'last');
      }}
      style={screenPosition}
      className="fixed z-[100] min-w-[232px] w-max max-w-[320px] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-900/95 p-1 font-sans text-xs shadow-2xl shadow-black/70 backdrop-blur-xl select-none"
    >
      <div className="truncate border-b border-neutral-800/90 px-2.5 py-1.5 text-xs font-medium text-cyan-200">{menu.title}</div>
      {menu.items.map(item => {
        if (item.separator) {
          return <div key={item.id} className="my-1 h-px bg-neutral-800/90" />;
        }
        const isShellTrigger = Boolean(item.shellTargets?.length);
        const hasShellMenu = isShellTrigger && Boolean(shellMenuItems?.length);
        const isFlyoutOpen = hasShellMenu && Boolean(shellFlyout);
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            aria-haspopup={hasShellMenu ? 'menu' : undefined}
            aria-expanded={hasShellMenu ? isFlyoutOpen : undefined}
            data-shell-trigger={isShellTrigger ? 'true' : undefined}
            onClick={event => {
              if (hasShellMenu) {
                const rect = event.currentTarget.getBoundingClientRect();
                flyoutTriggerRef.current = event.currentTarget;
                focusFlyoutOnOpenRef.current = event.detail === 0;
                if (shellFlyout) {
                  cancelFlyoutTimers();
                  setShellFlyout(null);
                } else {
                  openShellFlyout(rect);
                }
                return;
              }
              item.onSelect?.();
              onClose();
            }}
            onMouseEnter={isShellTrigger ? event => {
              shellTriggerHoveredRef.current = event.currentTarget;
              if (shellMenuItems?.length) scheduleFlyoutOpen(event);
            } : undefined}
            onMouseLeave={isShellTrigger ? () => {
              shellTriggerHoveredRef.current = null;
              if (shellMenuItems?.length) scheduleFlyoutClose();
            } : undefined}
            className={(item.danger
              ? 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs text-rose-300 outline-none transition-colors hover:bg-rose-950/45 focus-visible:bg-rose-950/45 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
              : `flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs text-neutral-100 outline-none transition-colors hover:bg-neutral-800/90 focus-visible:bg-neutral-800/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent${isFlyoutOpen ? ' bg-neutral-800/90 text-cyan-100' : ''}`)}
          >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${item.disabled ? 'text-neutral-500' : item.danger ? 'text-rose-400' : 'text-cyan-300'}`}>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {hasShellMenu && <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
          </button>
        );
      })}
    </div>
    {shellFlyout && shellMenuItems?.length ? (
      <div
        ref={flyoutRef}
        role="menu"
        aria-label={t.contextMenu.showMoreOptions}
        style={{
          left: flyoutPos?.left ?? 0,
          top: flyoutPos?.top ?? 0,
          visibility: flyoutPos ? 'visible' : 'hidden',
        }}
        onMouseEnter={cancelFlyoutTimers}
        onMouseLeave={scheduleFlyoutClose}
        onContextMenu={event => event.preventDefault()}
        className="fixed z-[110] min-w-[232px] w-max max-w-[340px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-xl border border-neutral-700/80 bg-neutral-900/95 p-1 text-xs shadow-2xl shadow-black/70 backdrop-blur-xl select-none"
      >
        <ShellMenuFlyout
          items={shellMenuItems}
          onVerb={verbId => {
            onShellVerb?.(verbId);
            onClose();
          }}
          onPortalMouseEnter={cancelFlyoutTimers}
          onPortalMouseLeave={scheduleFlyoutClose}
        />
      </div>
    ) : null}
    </>,
    document.body,
  );
}
