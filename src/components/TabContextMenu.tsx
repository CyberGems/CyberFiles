import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Copy, FolderUp, LockKeyhole, Palette, Pencil, Plus, RotateCcw, Settings2, UnlockKeyhole, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import type { TabState } from '../types';
import type { TabStripPosition } from '../utils/workspaceProfiles';

export type TabMenuAction = 'new' | 'duplicate' | 'duplicateRight' | 'duplicateOpposite' | 'parent' | 'reopen' | 'rename' | 'color' | 'lock' | 'closeLeft' | 'closeRight' | 'closeOthers' | 'close' | 'top' | 'bottom' | 'left' | 'right' | 'settings';

interface TabContextMenuProps {
  x: number;
  y: number;
  tab: TabState;
  canOpenParent: boolean;
  canReopen: boolean;
  closableLeft: number;
  closableRight: number;
  closableOthers: number;
  canClose: boolean;
  position: TabStripPosition;
  onAction: (action: TabMenuAction, value?: string) => void;
  onClose: () => void;
}

const TAB_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fb7185', '#fbbf24', '#4ade80', '#60a5fa'];

export function TabContextMenu({ x, y, tab, canOpenParent, canReopen, closableLeft, closableRight, closableOthers, canClose, position, onAction, onClose }: TabContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [screenPosition, setScreenPosition] = useState({ left: x, top: y });
  const [section, setSection] = useState<'main' | 'rename' | 'color'>('main');
  const [name, setName] = useState(tab.customTitle ?? '');
  const vertical = position === 'left' || position === 'right';

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setScreenPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
  }, [x, y, section]);

  useEffect(() => {
    if (section === 'rename') nameRef.current?.focus();
    else if (section === 'color') menuRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed]')?.focus();
    else menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
  }, [section]);

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

  const run = (action: TabMenuAction, value?: string) => {
    onAction(action, value);
    onClose();
  };
  const item = (action: TabMenuAction, label: string, icon: ReactNode, disabled = false, selected = false) => (
    <button
      key={action}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => run(action)}
      className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs text-neutral-200 outline-none transition-colors hover:bg-cyan-950/50 hover:text-cyan-100 focus-visible:bg-cyan-950/50 focus-visible:text-cyan-100 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${disabled ? 'text-neutral-600' : 'text-cyan-400'}`}>{icon}</span>
      <span className="flex-1">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 text-cyan-300" />}
    </button>
  );
  const separator = <div className="my-1 border-t border-neutral-700/60" />;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t.tabMenu.label}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        event.stopPropagation();
        if (section !== 'main' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const enabled = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []);
        if (!enabled.length) return;
        event.preventDefault();
        const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowDown' ? (current + 1) % enabled.length : (current - 1 + enabled.length) % enabled.length;
        enabled[next].focus();
      }}
      style={screenPosition}
      className="fixed z-[100] w-[284px] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900/98 p-1.5 font-sans shadow-2xl shadow-black/60 backdrop-blur-xl select-none"
    >
      <div className="truncate border-b border-neutral-700/60 px-3 py-2 text-xs font-medium text-cyan-200">{tab.customTitle || tab.title || t.pane.noFolderOpen}</div>
      {section === 'rename' ? (
        <form className="p-2" onSubmit={event => { event.preventDefault(); run('rename', name.trim()); }}>
          <label htmlFor="tab-context-name" className="mb-2 block text-xs font-medium text-neutral-200">{t.tabMenu.rename}</label>
          <input
            ref={nameRef}
            id="tab-context-name"
            value={name}
            maxLength={80}
            onChange={event => setName(event.target.value)}
            className="w-full rounded-md border border-neutral-600 bg-neutral-950 px-2.5 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-500"
          />
          <p className="mt-2 text-[11px] text-neutral-400">{t.tabMenu.renameHint}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setSection('main')} className="rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">{t.tabMenu.cancel}</button>
            <button type="submit" className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-cyan-400">{t.tabMenu.save}</button>
          </div>
        </form>
      ) : section === 'color' ? (
        <div className="p-2">
          <div className="mb-3 text-xs font-medium text-neutral-200">{t.tabMenu.color}</div>
          <div className="grid grid-cols-7 gap-2">
            {TAB_COLORS.map(color => (
              <button key={color} type="button" aria-label={color} aria-pressed={tab.tabColor === color} onClick={() => run('color', color)} className={`h-7 w-7 rounded-full border-2 outline-offset-2 focus-visible:outline focus-visible:outline-cyan-300 ${tab.tabColor === color ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <button type="button" onClick={() => run('color', '')} className="rounded-md px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">{t.tabMenu.colorDefault}</button>
            <button type="button" onClick={() => setSection('main')} className="rounded-md px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">{t.tabMenu.cancel}</button>
          </div>
        </div>
      ) : (
        <>
          {item('new', t.tabMenu.newTab, <Plus className="h-4 w-4" />)}
          {item('duplicate', t.tabMenu.duplicate, <Copy className="h-4 w-4" />)}
          {item('duplicateRight', vertical ? t.tabMenu.duplicateBelow : t.tabMenu.duplicateRight, vertical ? <ArrowDown className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />)}
          {item('duplicateOpposite', t.tabMenu.duplicateOpposite, <Copy className="h-4 w-4" />)}
          {item('parent', t.tabMenu.openParent, <FolderUp className="h-4 w-4" />, !canOpenParent)}
          {item('reopen', t.tabMenu.reopen, <RotateCcw className="h-4 w-4" />, !canReopen)}
          {separator}
          <button type="button" role="menuitem" onClick={() => setSection('rename')} className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs text-neutral-200 hover:bg-cyan-950/50 focus-visible:bg-cyan-950/50"><span className="flex h-4 w-4 items-center justify-center text-cyan-400"><Pencil className="h-4 w-4" /></span>{t.tabMenu.rename}</button>
          <button type="button" role="menuitem" onClick={() => setSection('color')} className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs text-neutral-200 hover:bg-cyan-950/50 focus-visible:bg-cyan-950/50"><span className="flex h-4 w-4 items-center justify-center text-cyan-400"><Palette className="h-4 w-4" /></span>{t.tabMenu.color}</button>
          {item('lock', tab.lockClose ? t.tabMenu.unlock : t.tabMenu.lock, tab.lockClose ? <UnlockKeyhole className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />, false, Boolean(tab.lockClose))}
          {separator}
          {item('closeLeft', vertical ? t.tabMenu.closeAbove : t.tabMenu.closeLeft, vertical ? <ArrowUp className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />, closableLeft === 0)}
          {item('closeRight', vertical ? t.tabMenu.closeBelow : t.tabMenu.closeRight, vertical ? <ArrowDown className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />, closableRight === 0)}
          {item('closeOthers', t.tabMenu.closeOthers, <X className="h-4 w-4" />, closableOthers === 0)}
          {item('close', t.tabMenu.close, <X className="h-4 w-4" />, !canClose)}
          {separator}
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.tabMenu.position}</div>
          {item('top', t.tabMenu.top, <ArrowUp className="h-4 w-4" />, false, position === 'top')}
          {item('bottom', t.tabMenu.bottom, <ArrowDown className="h-4 w-4" />, false, position === 'bottom')}
          {item('left', t.tabMenu.left, <ArrowLeft className="h-4 w-4" />, false, position === 'left')}
          {item('right', t.tabMenu.right, <ArrowRight className="h-4 w-4" />, false, position === 'right')}
          {separator}
          {item('settings', t.tabMenu.settings, <Settings2 className="h-4 w-4" />)}
          {tab.lockClose && <div className="px-3 py-1 text-[10px] text-neutral-500">{t.tabMenu.protected}</div>}
        </>
      )}
    </div>,
    document.body,
  );
}
