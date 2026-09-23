import { useEffect, useRef } from 'react';
import { useLanguage } from '../locales/LanguageContext';
import { DialogButton } from './DialogButton';

interface CloseWindowModalProps {
  isOpen: boolean;
  rememberChoice: boolean;
  isBusy: boolean;
  onRememberChoiceChange: (remember: boolean) => void;
  onCancel: () => void;
  onExit: () => void;
  onHideToTray: () => void;
}

export function CloseWindowModal({
  isOpen,
  rememberChoice,
  isBusy,
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

      if ((event.key === ' ' || event.code === 'Space') && event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05070c]/80 p-5 backdrop-blur-md">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-window-title"
        aria-describedby="close-window-description"
        className="w-full max-w-5xl rounded-xl border border-neutral-700/80 bg-[#0c101b] px-6 py-7 shadow-2xl sm:px-9 sm:py-9 md:px-10 md:py-10"
      >
        <h2 id="close-window-title" className="text-2xl font-semibold tracking-tight text-neutral-100 sm:text-[28px]">
          {t.closeWindow.title}
        </h2>
        <p id="close-window-description" className="mt-5 max-w-4xl text-base leading-8 text-neutral-400 sm:text-lg">
          {t.closeWindow.description}
        </p>

        <label className="mt-7 inline-flex cursor-pointer items-center gap-3 text-base font-semibold text-neutral-200 sm:mt-8 sm:text-lg">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={event => onRememberChoiceChange(event.target.checked)}
            className="h-6 w-6 rounded-md border-neutral-600 bg-neutral-950 text-cyan-400 accent-cyan-400 focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-[#0c101b]"
          />
          {t.closeWindow.remember}
        </label>

        <div className="mt-8 flex flex-col-reverse justify-end gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-3.5">
          <DialogButton size="regular" shortcut={t.closeWindow.keys.escape} onClick={onCancel} disabled={isBusy}>
            {t.closeWindow.cancel}
          </DialogButton>
          <DialogButton size="regular" shortcut={t.closeWindow.keys.space} onClick={onExit} disabled={isBusy}>
            {t.closeWindow.exit}
          </DialogButton>
          <DialogButton
            ref={hideButtonRef}
            size="regular"
            shortcut={t.closeWindow.keys.enter}
            variant="primary"
            onClick={onHideToTray}
            disabled={isBusy}
          >
            {t.closeWindow.hideToTray}
          </DialogButton>
        </div>
      </section>
    </div>
  );
}
