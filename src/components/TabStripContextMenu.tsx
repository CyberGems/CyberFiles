import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, MousePointerClick, Plus, RotateCcw, Settings2 } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import type { TabStripPosition } from '../utils/workspaceProfiles';

export type TabStripMenuAction = 'new' | 'reopen' | 'toggleNewButton' | 'toggleDoubleClick' | 'top' | 'bottom' | 'left' | 'right' | 'settings';

interface TabStripContextMenuProps {
  x: number;
  y: number;
  canReopen: boolean;
  position: TabStripPosition;
  showNewTabButton: boolean;
  doubleClickTabBar: boolean;
  onAction: (action: TabStripMenuAction) => void;
  onClose: () => void;
}

export function TabStripContextMenu({ x, y, canReopen, position, showNewTabButton, doubleClickTabBar, onAction, onClose }: TabStripContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const [screenPosition, setScreenPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const bounds = menuRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setScreenPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus();
  }, []);

  useEffect(() => {
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
    };
  }, [onClose]);

  const menuItem = (action: TabStripMenuAction, label: string, icon: ReactNode, options: { disabled?: boolean; checked?: boolean; role?: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' } = {}) => {
    const role = options.role ?? 'menuitem';
    return (
      <button
        key={action}
        type="button"
        role={role}
        aria-checked={role === 'menuitem' ? undefined : options.checked}
        disabled={options.disabled}
        onClick={() => { onAction(action); onClose(); }}
        className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs text-neutral-200 outline-none transition-colors hover:bg-cyan-950/50 hover:text-cyan-100 focus-visible:bg-cyan-950/50 focus-visible:text-cyan-100 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${options.disabled ? 'text-neutral-600' : 'text-cyan-400'}`}>{icon}</span>
        <span className="flex-1">{label}</span>
        {options.checked && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
      </button>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t.tabMenu.stripLabel}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        event.stopPropagation();
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const enabled = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)') ?? []);
        if (!enabled.length) return;
        event.preventDefault();
        const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowDown' ? (current + 1) % enabled.length : (current - 1 + enabled.length) % enabled.length;
        enabled[next].focus();
      }}
      style={screenPosition}
      className="fixed z-[100] w-[284px] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900/98 p-1.5 font-sans shadow-2xl shadow-black/60 backdrop-blur-xl select-none"
    >
      <div className="border-b border-neutral-700/60 px-3 py-2 text-xs font-medium text-cyan-200">{t.tabMenu.stripLabel}</div>
      {menuItem('new', t.tabMenu.newTab, <Plus className="h-4 w-4" />)}
      {menuItem('reopen', t.tabMenu.reopen, <RotateCcw className="h-4 w-4" />, { disabled: !canReopen })}
      <div className="my-1 border-t border-neutral-700/60" />
      {menuItem('toggleNewButton', t.tabMenu.showNewButton, <Plus className="h-4 w-4" />, { role: 'menuitemcheckbox', checked: showNewTabButton })}
      {menuItem('toggleDoubleClick', t.tabMenu.doubleClickToOpen, <MousePointerClick className="h-4 w-4" />, { role: 'menuitemcheckbox', checked: doubleClickTabBar })}
      <div className="my-1 border-t border-neutral-700/60" />
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.tabMenu.position}</div>
      {menuItem('top', t.tabMenu.top, <ArrowUp className="h-4 w-4" />, { role: 'menuitemradio', checked: position === 'top' })}
      {menuItem('bottom', t.tabMenu.bottom, <ArrowDown className="h-4 w-4" />, { role: 'menuitemradio', checked: position === 'bottom' })}
      {menuItem('left', t.tabMenu.left, <ArrowLeft className="h-4 w-4" />, { role: 'menuitemradio', checked: position === 'left' })}
      {menuItem('right', t.tabMenu.right, <ArrowRight className="h-4 w-4" />, { role: 'menuitemradio', checked: position === 'right' })}
      <div className="my-1 border-t border-neutral-700/60" />
      {menuItem('settings', t.tabMenu.settings, <Settings2 className="h-4 w-4" />)}
    </div>,
    document.body,
  );
}
