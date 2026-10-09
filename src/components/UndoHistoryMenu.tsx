import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Clock3, Undo2 } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

export type UndoHistoryKind = 'rename' | 'create' | 'copy' | 'move' | 'extract' | 'compress' | 'recycle' | 'restore' | 'permanent-delete';

export interface UndoHistoryItem {
  id: string;
  kind: UndoHistoryKind;
  name: string;
  count: number;
  timestamp: number;
  canUndo: boolean;
  blockedReason?: string;
}

interface UndoHistoryMenuProps {
  items: UndoHistoryItem[];
  disabled?: boolean;
  onUndo: (id: string) => void;
}

function actionLabel(item: UndoHistoryItem, language: 'en' | 'es', translations: ReturnType<typeof useLanguage>['t']['toolbar']): string {
  const name = item.name || (language === 'es' ? 'elementos' : 'items');
  const count = item.count;
  const labels = translations.undoActions;
  switch (item.kind) {
    case 'rename': return item.count > 1
      ? labels.renameMany.replace('{count}', String(count))
      : labels.rename.replace('{name}', name);
    case 'create': return labels.create.replace('{name}', name);
    case 'copy': return (count === 1 ? labels.copyOne : labels.copy).replace('{count}', String(count));
    case 'move': return (count === 1 ? labels.moveOne : labels.move).replace('{count}', String(count));
    case 'extract': return labels.extract.replace('{name}', name);
    case 'compress': return labels.compress.replace('{name}', name);
    case 'recycle': return (count === 1 ? labels.recycleOne : labels.recycle).replace('{count}', String(count));
    case 'restore': return (count === 1 ? labels.restoreOne : labels.restore).replace('{count}', String(count));
    case 'permanent-delete': return (count === 1 ? labels.permanentDeleteOne : labels.permanentDelete).replace('{count}', String(count));
  }
}

export const UndoHistoryMenu: React.FC<UndoHistoryMenuProps> = ({ items, disabled = false, onUndo }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const latest = items[0];
  const locale = language === 'es' ? 'es' : 'en';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(384, Math.max(240, window.innerWidth - 32));
      setMenuPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 360)),
      });
    };
    updatePosition();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const timeLabel = (timestamp: number) => new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);

  return (
    <div ref={rootRef} className="relative flex flex-shrink-0 items-center">
      <Tooltip label={t.toolbar.undoTooltip} shortcut="Ctrl+Z" placement="bottom">
        <button
          type="button"
          onClick={() => latest?.canUndo && !disabled && onUndo(latest.id)}
          disabled={disabled || !latest?.canUndo}
          className="header-action rounded-r-none border-r border-neutral-800/80 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t.toolbar.undo}
        >
          <Undo2 className="h-3.5 w-3.5 text-cyan-400" />
          <span className="core-action-label">{t.toolbar.undo}</span>
          <kbd className="keyboard-hint">Ctrl+Z</kbd>
        </button>
      </Tooltip>
      <Tooltip label={t.toolbar.undoHistory} placement="bottom">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-label={t.toolbar.undoHistory}
          aria-expanded={open}
          className="header-action -ml-1 rounded-l-none px-1.5 disabled:opacity-50"
          disabled={disabled && items.length === 0}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </Tooltip>

      {open && createPortal(
        <div ref={menuRef} style={{ left: menuPosition.left, top: menuPosition.top }} className="fixed z-[200] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2.5">
            <span className="text-xs font-semibold text-neutral-200">{t.toolbar.undoHistory}</span>
            <span className="text-[11px] text-neutral-500">{t.toolbar.undoRecentCount.replace('{count}', String(items.length))}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-neutral-500">{t.toolbar.undoEmpty}</div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-1.5">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.canUndo || disabled) return;
                    setOpen(false);
                    onUndo(item.id);
                  }}
                  disabled={!item.canUndo || disabled}
                  className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md ${item.canUndo ? 'bg-cyan-950/70 text-cyan-300' : 'bg-neutral-800 text-neutral-500'}`}>
                    {item.canUndo ? <Undo2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-neutral-200">{actionLabel(item, language, t.toolbar)}</span>
                    {item.blockedReason && <span className="mt-0.5 block text-[11px] leading-snug text-amber-300/80">{item.blockedReason}</span>}
                    {!item.blockedReason && index > 0 && <span className="mt-0.5 block text-[11px] text-neutral-500">{t.toolbar.undoAvailable}</span>}
                  </span>
                  <span className="pt-0.5 text-[10px] tabular-nums text-neutral-500">{timeLabel(item.timestamp)}</span>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
