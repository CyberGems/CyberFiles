import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, ArrowLeft, FolderOpen, LayoutGrid, Save, Trash2, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

export interface WorkspaceChangesSaveNames {
  layoutName: string;
  sessionName: string;
}

interface UnsavedWorkspaceChangesModalProps {
  isOpen: boolean;
  layoutChanged: boolean;
  sessionChanged: boolean;
  layoutNeedsName: boolean;
  sessionNeedsName: boolean;
  suggestedLayoutName: string;
  suggestedSessionName: string;
  busy?: boolean;
  onSaveAndContinue: (names: WorkspaceChangesSaveNames) => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

export function UnsavedWorkspaceChangesModal({
  isOpen,
  layoutChanged,
  sessionChanged,
  layoutNeedsName,
  sessionNeedsName,
  suggestedLayoutName,
  suggestedSessionName,
  busy = false,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}: UnsavedWorkspaceChangesModalProps) {
  const { t } = useLanguage();
  const copy = t.workspaceProfiles;
  const dialogRef = useRef<HTMLElement>(null);
  const [layoutName, setLayoutName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const needsNames = (layoutChanged && layoutNeedsName) || (sessionChanged && sessionNeedsName);
  const canSave = (!layoutChanged || !layoutNeedsName || Boolean(layoutName.trim()))
    && (!sessionChanged || !sessionNeedsName || Boolean(sessionName.trim()));

  const submitSave = () => {
    if (busy || !canSave) return;
    onSaveAndContinue({ layoutName: layoutName.trim(), sessionName: sessionName.trim() });
  };

  useEffect(() => {
    if (!isOpen) return;
    setLayoutName(suggestedLayoutName);
    setSessionName(suggestedSessionName);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const firstInput = dialogRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)');
      if (firstInput) firstInput.focus();
      else dialogRef.current?.querySelector<HTMLButtonElement>('[data-save-default]')?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
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
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [isOpen, suggestedLayoutName, suggestedSessionName]);

  if (!isOpen) return null;

  const nameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    submitSave();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#05070c]/80 p-4 backdrop-blur-md sm:p-6"
      onMouseDown={event => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-workspace-title"
        aria-describedby="unsaved-workspace-description"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-amber-900/60 bg-[var(--cyberfiles-dialog-background)] shadow-2xl shadow-black/50"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-800/90 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-700/60 bg-amber-950/40 text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 id="unsaved-workspace-title" className="text-base font-semibold tracking-tight text-neutral-100 sm:text-lg">
                {copy.saveChangesTitle}
              </h2>
              <p id="unsaved-workspace-description" className="mt-1 text-xs leading-5 text-neutral-400 sm:text-sm">
                {copy.saveChangesDescription}
              </p>
            </div>
          </div>
          <Tooltip label={copy.continueEditing} placement="bottom">
            <button
              type="button"
              disabled={busy}
              aria-label={copy.continueEditing}
              onClick={onCancel}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="space-y-3 p-5 sm:p-6">
          {layoutChanged && (
            <section className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-3.5 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-900/70 bg-cyan-950/40 text-cyan-300">
                  <LayoutGrid className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-100">{copy.changedLayout}</h3>
                    <span className="rounded-full border border-amber-800/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-200">{copy.modified}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">{copy.layoutDescription}</p>
                </div>
              </div>
              {layoutNeedsName && (
                <label className="mt-3 block text-xs font-medium text-neutral-300">
                  {copy.saveAsLayout}
                    <input
                      value={layoutName}
                      onChange={event => setLayoutName(event.target.value)}
                      onKeyDown={nameKeyDown}
                      placeholder={copy.namePlaceholder}
                      autoComplete="off"
                      aria-keyshortcuts="Enter"
                      className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
                    />
                </label>
              )}
            </section>
          )}

          {sessionChanged && (
            <section className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-3.5 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-900/70 bg-cyan-950/40 text-cyan-300">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-100">{copy.changedSession}</h3>
                    <span className="rounded-full border border-amber-800/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-200">{copy.modified}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">{copy.sessionDescription}</p>
                </div>
              </div>
              {sessionNeedsName && (
                <label className="mt-3 block text-xs font-medium text-neutral-300">
                  {copy.saveAsSession}
                    <input
                      value={sessionName}
                      onChange={event => setSessionName(event.target.value)}
                      onKeyDown={nameKeyDown}
                      placeholder={copy.namePlaceholder}
                      autoComplete="off"
                      aria-keyshortcuts="Enter"
                      className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
                    />
                </label>
              )}
            </section>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-neutral-800/90 bg-neutral-950/35 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Tooltip label={copy.continueEditing} placement="top">
            <DialogButton size="compact" disabled={busy} onClick={onCancel} className="w-full sm:w-auto">
              <span className="inline-flex items-center gap-2"><ArrowLeft className="h-3.5 w-3.5" />{copy.continueEditing}</span>
            </DialogButton>
          </Tooltip>
          <Tooltip label={copy.discardAndContinue} placement="top">
            <DialogButton size="compact" disabled={busy} onClick={onDiscardAndContinue} className="w-full sm:w-auto">
              <span className="inline-flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" />{copy.discardAndContinue}</span>
            </DialogButton>
          </Tooltip>
          <Tooltip label={copy.saveAndContinue} placement="top">
            <DialogButton
              size="compact"
              variant="primary"
              shortcut={copy.saveAndContinueShortcut}
              data-save-default
              aria-keyshortcuts="Enter"
              disabled={busy || (needsNames && !canSave)}
              onClick={submitSave}
              className="w-full sm:w-auto"
            >
              <span className="inline-flex items-center gap-2"><Save className="h-3.5 w-3.5" />{copy.saveAndContinue}</span>
            </DialogButton>
          </Tooltip>
        </footer>
      </section>
    </div>
  );
}
