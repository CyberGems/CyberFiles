import { useEffect, useRef } from 'react';
import { ArrowLeft, Download, Power, Save, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface CloseWindowModalProps {
  isOpen: boolean;
  rememberChoice: boolean;
  isBusy: boolean;
  sessionHasChanges: boolean;
  layoutHasChanges: boolean;
  onRememberChoiceChange: (remember: boolean) => void;
  onCancel: () => void;
  onExit: () => void;
  onHideToTray: () => void;
}

export function CloseWindowModal({
  isOpen,
  rememberChoice,
  isBusy,
  sessionHasChanges,
  layoutHasChanges,
  onRememberChoiceChange,
  onCancel,
  onExit,
  onHideToTray,
}: CloseWindowModalProps) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLElement>(null);
  const hideButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    hideButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
        return;
      }

      if ((event.key === ' ' || event.code === 'Space') && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        onExit();
        return;
      }

      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        onHideToTray();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)',
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onCancel, onExit, onHideToTray]);

  if (!isOpen) return null;

  const hasWorkspaceChanges = sessionHasChanges || layoutHasChanges;
  const changesDescription = sessionHasChanges && layoutHasChanges
    ? t.closeWindow.sessionAndLayoutChanges
    : sessionHasChanges
      ? t.closeWindow.sessionChanges
      : t.closeWindow.layoutChanges;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05070c]/80 p-4 backdrop-blur-md sm:p-6"
      onMouseDown={event => {
        if (!isBusy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-window-title"
        aria-describedby="close-window-description"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-700/80 bg-[#0c1018] shadow-2xl shadow-black/50"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-800/60 bg-cyan-950/50 text-cyan-300">
              <Power className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="close-window-title" className="text-xl font-semibold tracking-tight text-neutral-100 sm:text-2xl">
                {t.closeWindow.title}
              </h2>
              <p id="close-window-description" className="mt-1 text-sm leading-6 text-neutral-400">
                {t.closeWindow.description}
              </p>
            </div>
          </div>
          <Tooltip label={t.closeWindow.cancel} placement="bottom">
            <button
              type="button"
              aria-label={t.closeWindow.cancel}
              disabled={isBusy}
              onClick={onCancel}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </Tooltip>
        </header>

        <div className="space-y-3 px-5 py-5 sm:px-7 sm:py-6">
          {hasWorkspaceChanges && (
            <div className="flex items-start gap-3 rounded-xl border border-cyan-900/70 bg-cyan-950/25 px-4 py-3">
              <Save className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <div className="text-sm font-semibold text-cyan-100">{t.closeWindow.changesPending}</div>
                <p className="mt-1 text-xs leading-5 text-neutral-300">{changesDescription}</p>
              </div>
            </div>
          )}

          <button
              type="button"
              disabled={isBusy || rememberChoice}
              onClick={onCancel}
              className="flex w-full items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/70 px-4 py-3.5 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50 sm:px-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-600 bg-neutral-800 text-neutral-200">
                <ArrowLeft className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-100">{t.closeWindow.continueWorking}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-400">{rememberChoice ? t.closeWindow.continueDisabledDescription : t.closeWindow.continueDescription}</span>
              </span>
              <kbd className="shrink-0 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs font-semibold text-neutral-400">{t.closeWindow.keys.escape}</kbd>
            </button>
            <button
              ref={hideButtonRef}
              type="button"
              disabled={isBusy}
              onClick={onHideToTray}
              className="flex w-full items-center gap-4 rounded-xl border border-cyan-900/70 bg-neutral-900/70 px-4 py-3.5 text-left transition-colors hover:border-cyan-700 hover:bg-cyan-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50 sm:px-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-800/70 bg-cyan-950/60 text-cyan-300">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-100">{t.closeWindow.hideToTray}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-400">{t.closeWindow.hideToTrayDescription}</span>
              </span>
              <kbd className="shrink-0 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs font-semibold text-neutral-400">{t.closeWindow.keys.enter}</kbd>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={onExit}
              className="flex w-full items-center gap-4 rounded-xl border border-rose-950/80 bg-neutral-900/70 px-4 py-3.5 text-left transition-colors hover:border-rose-800 hover:bg-rose-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:pointer-events-none disabled:opacity-50 sm:px-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-900/70 bg-rose-950/40 text-rose-300">
                <Power className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-100">{t.closeWindow.exit}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-400">{t.closeWindow.exitDescription}</span>
              </span>
              <kbd className="shrink-0 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs font-semibold text-neutral-400">{t.closeWindow.keys.space}</kbd>
            </button>
        </div>

        <footer className="border-t border-neutral-800/90 px-5 py-4 sm:px-7">
          <Tooltip label={t.closeWindow.rememberDescription} placement="top">
            <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold text-neutral-200">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={event => onRememberChoiceChange(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]"
              />
              {t.closeWindow.remember}
            </label>
          </Tooltip>
        </footer>
      </section>
    </div>
  );
}
