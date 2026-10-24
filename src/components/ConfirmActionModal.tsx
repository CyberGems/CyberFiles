import React, { useState } from 'react';
import { AlertTriangle, File, Folder, X } from 'lucide-react';
import { FileItem } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

interface ConfirmActionModalProps {
  items: FileItem[];
  onCancel: () => void;
  onConfirm: (permanentlyDelete?: boolean, rememberChoice?: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  busyLabel?: string;
  isBusy?: boolean;
  allowPermanentDelete?: boolean;
  confirmVariant?: 'primary' | 'secondary' | 'danger';
  /* Shift+Del: the permanent checkbox starts ticked instead of asking for a second click. */
  initialPermanentlyDelete?: boolean;
  /* Only the delete confirmation can be suppressed: the other dialogs guard operations that
     have no remembered answer. */
  showRememberOption?: boolean;
  /* A failure that belongs to the confirmation itself (the reset could not be written), shown
     under the description instead of closing the dialog and losing the reason. */
  errorMessage?: string;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  items,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  busyLabel,
  isBusy = false,
  allowPermanentDelete = false,
  confirmVariant = 'danger',
  initialPermanentlyDelete = false,
  showRememberOption = false,
  errorMessage,
}) => {
  const { t, language } = useLanguage();
  const [permanentlyDelete, setPermanentlyDelete] = useState(initialPermanentlyDelete);
  const [rememberChoice, setRememberChoice] = useState(false);
  if (items.length === 0 && !title) return null;

  const resolvedTitle = title ?? (allowPermanentDelete ? t.core.deleteItemsTitle : permanentlyDelete ? t.core.deletePermanentlyTitle : t.core.deleteTitle);
  const resolvedDescription = description ?? (permanentlyDelete ? t.core.deletePermanentlyMessage : t.core.deleteMessage);
  const resolvedConfirmLabel = confirmLabel ?? (permanentlyDelete ? t.core.deleteNow : t.core.delete);

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={event => { if (!isBusy && event.target === event.currentTarget) onCancel(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 id="confirm-delete-title" className="font-semibold text-neutral-100 text-sm">{resolvedTitle}</h2>
          </div>
          <Tooltip label={t.core.cancel} placement="bottom"><button type="button" disabled={isBusy} onClick={onCancel} aria-label={t.core.cancel} className="p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded disabled:opacity-40"><X className="w-4 h-4" /></button></Tooltip>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {/* What is about to go comes first: the checks underneath read as options on it, and
              the dialog no longer opens with a paragraph that names nothing. */}
          {items.length > 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="mb-2 text-[11px] font-medium text-neutral-500">
                {items.length === 1 ? t.core.deleteItemOne : t.core.deleteItems.replace('{count}', String(items.length))}
              </div>
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {items.slice(0, 20).map(item => (
                  <li key={item.id} className="flex min-w-0 items-start gap-2.5">
                    {item.isFolder ? <Folder className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <File className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-100">{item.name}</div>
                      <div className="truncate text-[11px] text-neutral-500">{item.path}</div>
                    </div>
                  </li>
                ))}
                {items.length > 20 && <li className="text-xs text-neutral-500">{language === 'es' ? `y ${items.length - 20} más...` : `and ${items.length - 20} more...`}</li>}
              </ul>
            </div>
          )}
          {/* Two lines are reserved: the sentence swaps for a shorter one when the permanent
              check is ticked, and a dialog that resizes under the pointer looks like it jumped. */}
          <p className={`min-h-10 ${permanentlyDelete ? 'text-rose-200' : 'text-neutral-300'}`}>{resolvedDescription}</p>
          {errorMessage && <p className="text-xs text-rose-300">{errorMessage}</p>}
          {allowPermanentDelete && (
            <Tooltip label={t.core.permanentDeleteCheckboxTooltip} placement="top">
              <label className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${permanentlyDelete ? 'border-rose-800/70 bg-rose-950/30 text-rose-200' : 'border-neutral-800 bg-neutral-950/40 text-neutral-300 hover:border-neutral-700'}`}>
                <input
                  type="checkbox"
                  checked={permanentlyDelete}
                  disabled={isBusy}
                  onChange={event => setPermanentlyDelete(event.target.checked)}
                  className="h-4 w-4 accent-rose-500"
                />
                <span className="font-medium">{t.core.deletePermanently}</span>
              </label>
            </Tooltip>
          )}
          {showRememberOption && (
            <>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2.5">
                <label className="flex cursor-pointer items-start gap-3 text-[12px] text-neutral-300">
                  <input
                    type="checkbox"
                    checked={rememberChoice}
                    disabled={isBusy}
                    onChange={event => setRememberChoice(event.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-500"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{t.core.rememberDeleteChoice}</span>
                    {/* States the exact outcome, so ticking the box is never a guess. The slot
                        holds two lines either way, so switching modes never resizes the card. */}
                    <span className={`mt-0.5 block min-h-[30px] text-[11px] leading-snug ${rememberChoice ? (permanentlyDelete ? 'text-rose-300' : 'text-cyan-300') : 'text-neutral-500'}`}>
                      {permanentlyDelete ? t.core.rememberDeletePermanentHint : t.core.rememberDeleteRecycleHint}
                    </span>
                  </span>
                </label>
              </div>
              {/* The way back, stated before it is needed and always in the same place. */}
              <p className="px-1 text-[11px] leading-snug text-neutral-500">{t.core.deleteConfirmSettingsHint}</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-950/50">
          <Tooltip label={t.core.cancel} placement="top"><span><DialogButton size="compact" disabled={isBusy} onClick={onCancel}>{t.core.cancel}</DialogButton></span></Tooltip>
          <Tooltip label={permanentlyDelete ? t.core.permanentDeleteConfirmTooltip : allowPermanentDelete ? t.core.recycleBinDeleteConfirmTooltip : resolvedDescription} placement="top">
            <span><DialogButton size="compact" variant={permanentlyDelete ? 'danger' : confirmVariant} disabled={isBusy} onClick={() => onConfirm(permanentlyDelete, rememberChoice)}>{isBusy ? busyLabel ?? t.core.operationInProgress : resolvedConfirmLabel}</DialogButton></span>
          </Tooltip>
        </div>
      </section>
    </div>
  );
};
