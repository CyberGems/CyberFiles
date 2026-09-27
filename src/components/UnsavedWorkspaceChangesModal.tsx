import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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

  useEffect(() => {
    if (!isOpen) return;
    setLayoutName('');
    setSessionName('');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const firstInput = dialogRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)');
      if (firstInput) firstInput.focus();
      else dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const needsNames = (layoutChanged && layoutNeedsName) || (sessionChanged && sessionNeedsName);
  const canSave = (!layoutChanged || !layoutNeedsName || Boolean(layoutName.trim()))
    && (!sessionChanged || !sessionNeedsName || Boolean(sessionName.trim()));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="unsaved-workspace-title" className="w-full max-w-md overflow-hidden rounded-xl border border-amber-800/60 bg-neutral-900 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /><h2 id="unsaved-workspace-title" className="text-sm font-semibold text-neutral-100">{copy.saveChangesTitle}</h2></div>
          <Tooltip label={copy.continueEditing} placement="bottom"><button type="button" disabled={busy} aria-label={copy.continueEditing} onClick={onCancel} className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"><X className="h-4 w-4" /></button></Tooltip>
        </header>

        <div className="space-y-3 p-4 text-xs text-neutral-300">
          <p>{copy.saveChangesDescription}</p>
          {layoutChanged && <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="font-medium text-neutral-100">{copy.changedLayout}</div>
            {layoutNeedsName && <label className="mt-2 block text-[10px] text-neutral-500">{copy.saveAsLayout}
              <Tooltip label={copy.saveAsLayout} placement="top"><input value={layoutName} onChange={event => setLayoutName(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-600" /></Tooltip>
            </label>}
          </div>}
          {sessionChanged && <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="font-medium text-neutral-100">{copy.changedSession}</div>
            {sessionNeedsName && <label className="mt-2 block text-[10px] text-neutral-500">{copy.saveAsSession}
              <Tooltip label={copy.saveAsSession} placement="top"><input value={sessionName} onChange={event => setSessionName(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-600" /></Tooltip>
            </label>}
          </div>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-neutral-800 bg-neutral-950/50 px-4 py-3">
          <Tooltip label={copy.continueEditing} placement="top"><DialogButton size="compact" disabled={busy} onClick={onCancel}>{copy.continueEditing}</DialogButton></Tooltip>
          <Tooltip label={copy.discardAndContinue} placement="top"><DialogButton size="compact" disabled={busy} onClick={onDiscardAndContinue}>{copy.discardAndContinue}</DialogButton></Tooltip>
          <Tooltip label={copy.saveAndContinue} placement="top"><DialogButton size="compact" variant="primary" disabled={busy || (needsNames && !canSave)} onClick={() => onSaveAndContinue({ layoutName: layoutName.trim(), sessionName: sessionName.trim() })}>{copy.saveAndContinue}</DialogButton></Tooltip>
        </footer>
      </section>
    </div>
  );
}
