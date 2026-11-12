import { useEffect, useRef } from 'react';
import { AlertTriangle, RotateCcw, Trash2, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';
import { compareSnapshots, type RecoverySnapshot, type RecoveryTabStatus } from '../utils/recoverySnapshot';
import type { TabSessionSnapshot } from '../utils/workspaceProfiles';

interface RecoveryModalProps {
  isOpen: boolean;
  recovered: RecoverySnapshot;
  baseline: TabSessionSnapshot | null;
  onRecover: () => void;
  onDiscard: () => void;
}

const TAB_STATUS_BADGE_CLASSES: Record<RecoveryTabStatus, string> = {
  new: 'border-cyan-800/60 bg-cyan-950/40 text-cyan-200',
  changed: 'border-amber-800/60 bg-amber-950/30 text-amber-200',
  same: 'border-neutral-700 bg-neutral-900 text-neutral-400',
};

export function RecoveryModal({ isOpen, recovered, baseline, onRecover, onDiscard }: RecoveryModalProps) {
  const { t, language } = useLanguage();
  const copy = t.recovery;
  const dialogRef = useRef<HTMLElement>(null);
  const comparison = compareSnapshots(recovered, baseline);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('[data-recover-default]')?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onDiscard();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled)',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [isOpen, onDiscard]);

  if (!isOpen) return null;

  const savedAtLabel = new Date(recovered.savedAt).toLocaleString(language === 'es' ? 'es-CR' : 'en-US');
  const panes: Array<{ key: 'left' | 'right'; label: string; pane: typeof comparison.left }> = [
    { key: 'left', label: copy.leftPane, pane: comparison.left },
    { key: 'right', label: copy.rightPane, pane: comparison.right },
  ];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#05070c]/80 p-4 backdrop-blur-md sm:p-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onDiscard();
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-900/60 bg-[var(--cyberfiles-dialog-background)] shadow-2xl shadow-black/50"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-800/90 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <AlertTriangle className="h-8 w-8 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <h2 id="recovery-title" className="text-base font-semibold tracking-tight text-neutral-100 sm:text-lg">
                {copy.title}
              </h2>
              <p id="recovery-description" className="mt-1 text-xs leading-5 text-neutral-400 sm:text-sm">
                {copy.description}
              </p>
            </div>
          </div>
          <Tooltip label={copy.discard} shortcut="Esc" placement="bottom">
            <button
              type="button"
              aria-label={copy.discard}
              onClick={onDiscard}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 sm:p-6">
          <p className="text-xs text-neutral-400">
            {copy.lastSnapshot} <span className="font-medium text-neutral-200">{savedAtLabel}</span>
          </p>
          {panes.map(({ key, label, pane }) => {
            const addedCount = pane.tabs.filter(entry => entry.status === 'new').length;
            const removedCount = pane.removed.length;
            const hasDifferences = pane.savedCount !== pane.recoveredCount || addedCount > 0 || removedCount > 0 || pane.tabs.some(entry => entry.status !== 'same');
            return (
              <section key={key} className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-neutral-100">{label}</h3>
                  {hasDifferences && (
                    <span className="rounded-full border border-amber-800/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                      {copy.savedLabel}: {pane.savedCount} · {copy.recoveredLabel}: {pane.recoveredCount}
                    </span>
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-neutral-400 sm:grid-cols-2">
                  <div className="flex min-w-0 gap-1.5">
                    <dt className="shrink-0 font-medium text-neutral-500">{copy.savedLabel}:</dt>
                    <dd className="min-w-0 truncate text-neutral-300">
                      {pane.savedCount === 0 ? copy.noTabs : `${copy.paneTabsLabel}: ${pane.savedCount} · ${copy.activeTabLabel}: ${pane.savedActiveTitle ?? '—'}`}
                    </dd>
                  </div>
                  <div className="flex min-w-0 gap-1.5">
                    <dt className="shrink-0 font-medium text-neutral-500">{copy.recoveredLabel}:</dt>
                    <dd className="min-w-0 truncate text-neutral-100">
                      {pane.recoveredCount === 0 ? copy.noTabs : `${copy.paneTabsLabel}: ${pane.recoveredCount} · ${copy.activeTabLabel}: ${pane.recoveredActiveTitle ?? '—'}`}
                    </dd>
                  </div>
                </dl>
                {(pane.tabs.length > 0 || pane.removed.length > 0) && (
                  <ul className="mt-3 space-y-1">
                    {pane.tabs.map(({ tab, status }) => (
                      <li key={tab.id} className="flex min-w-0 items-center gap-2 rounded-md border border-neutral-800/70 bg-neutral-900/50 px-2.5 py-1.5 text-xs">
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${TAB_STATUS_BADGE_CLASSES[status]}`}>
                          {status === 'new' ? copy.badgeNew : status === 'changed' ? copy.badgeChanged : copy.badgeSame}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-neutral-200">{tab.customTitle || tab.title || tab.currentPath}</span>
                        {tab.filterQuery && (
                          <span className="shrink-0 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-400">{copy.filterActive}</span>
                        )}
                      </li>
                    ))}
                    {pane.removed.map(tab => (
                      <li key={tab.id} className="flex min-w-0 items-center gap-2 rounded-md border border-rose-900/50 bg-rose-950/20 px-2.5 py-1.5 text-xs">
                        <span className="shrink-0 rounded-full border border-rose-800/60 bg-rose-950/40 px-1.5 py-0.5 text-[10px] font-medium text-rose-200">{copy.badgeRemoved}</span>
                        <span className="min-w-0 flex-1 truncate text-neutral-400">{tab.customTitle || tab.title || tab.currentPath}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-neutral-800/90 bg-neutral-950/35 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <DialogButton size="compact" onClick={onDiscard} className="w-full sm:w-auto">
            <span className="inline-flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" />{copy.discard}</span>
          </DialogButton>
          <DialogButton
            size="compact"
            variant="primary"
            data-recover-default
            aria-keyshortcuts="Enter"
            onClick={onRecover}
            className="w-full sm:w-auto"
          >
            <span className="inline-flex items-center gap-2"><RotateCcw className="h-3.5 w-3.5" />{copy.recover}</span>
          </DialogButton>
        </footer>
      </section>
    </div>
  );
}
