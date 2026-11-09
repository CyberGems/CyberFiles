import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyboardShortcutContent } from './KeyboardShortcut';

interface CommandBarDropdownProps {
  /** Nothing is rendered (or measured) while closed. */
  open: boolean;
  /** Invoked by outside pointerdown, Escape, window resize and item activation. */
  onClose: () => void;
  /** Control the menu hangs from; measured the moment it opens. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Accessible menu name. */
  label: string;
  /** Extra classes on the floating panel. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Floating command bar dropdown. The bar clips its own overflow, so menus hang
 * from `document.body` with fixed positioning instead of living inside it:
 * same approach as the toolbar overflow menu, shared by the terminal and
 * view menus.
 */
export const CommandBarDropdown: React.FC<CommandBarDropdownProps> = ({ open, onClose, anchorRef, label, className, children }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      onClose();
      return;
    }
    setPlacement({
      top: Math.min(rect.bottom + 6, window.innerHeight - 200),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open, anchorRef, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
    const onWindowResize = () => onClose();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onWindowResize);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !placement) return null;
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-command-bar-portal="true"
      style={{ position: 'fixed', top: placement.top, right: placement.right }}
      className={`z-[90] w-max min-w-56 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/95 py-1 text-xs shadow-2xl backdrop-blur-md ${className ?? ''}`}
    >
      {children}
    </div>,
    document.body,
  );
};

/** Shared row for command bar dropdown items. */
interface CommandBarDropdownItemProps {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export const CommandBarDropdownItem: React.FC<CommandBarDropdownItemProps> = ({ label, icon, shortcut, checked, disabled, onSelect }) => (
  <button
    type="button"
    role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onSelect}
    className="flex w-full min-w-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-left text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400">{icon}</span>}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {shortcut && <kbd className="keyboard-hint shrink-0"><KeyboardShortcutContent shortcut={shortcut} /></kbd>}
    {checked !== undefined && <span aria-hidden="true" className={`ml-1 h-1.5 w-1.5 shrink-0 rounded-full ${checked ? 'bg-cyan-300' : 'bg-transparent'}`} />}
  </button>
);

/** Small uppercase heading between dropdown sections. */
export const CommandBarDropdownHeading: React.FC<{ label: string }> = ({ label }) => (
  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
);
