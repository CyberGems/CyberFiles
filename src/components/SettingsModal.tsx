import { useEffect, useState } from 'react';
import { Check, Keyboard, Palette, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { type AppTheme, useTheme } from '../themes/ThemeContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowOnboarding: () => void;
  globalShortcut: { enabled: boolean; shortcut: string; registered: boolean };
  globalShortcutLoaded: boolean;
  globalShortcutSupported: boolean;
  globalShortcutError: string | null;
  onGlobalShortcutChange: (settings: { enabled: boolean; shortcut: string }) => Promise<void>;
  emptyAreaDoubleClickNavigatesUp: boolean;
  onEmptyAreaDoubleClickNavigatesUpChange: (enabled: boolean) => void;
  folderStyleLocked: boolean;
  onFolderStyleLockedChange: (enabled: boolean) => void;
}

const themes: AppTheme[] = ['cyberfiles', 'gray', 'light'];

function keyFromEvent(event: KeyboardEvent): string | null {
  const { code } = event;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const keys: Record<string, string> = {
    Space: 'Space', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace',
    Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/',
    Backquote: '`', Backslash: '\\', Semicolon: ';', Quote: "'",
  };
  return keys[code] ?? null;
}

export function SettingsModal({
  isOpen,
  onClose,
  onShowOnboarding,
  globalShortcut,
  globalShortcutLoaded,
  globalShortcutSupported,
  globalShortcutError,
  onGlobalShortcutChange,
  emptyAreaDoubleClickNavigatesUp,
  onEmptyAreaDoubleClickNavigatesUpChange,
  folderStyleLocked,
  onFolderStyleLockedChange,
}: SettingsModalProps) {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcutCaptureError, setShortcutCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !isRecordingShortcut) return;
    const handleShortcutKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === 'Escape') {
        setIsRecordingShortcut(false);
        setShortcutCaptureError(null);
        return;
      }

      const key = keyFromEvent(event);
      if (!key) return;
      const modifiers = [
        event.ctrlKey ? 'Ctrl' : '',
        event.altKey ? 'Alt' : '',
        event.shiftKey ? 'Shift' : '',
        event.metaKey ? 'Super' : '',
      ].filter(Boolean);
      if (modifiers.length === 0) {
        setShortcutCaptureError(t.settings.shortcutNeedsModifier);
        return;
      }

      const shortcut = [...modifiers, key].join('+');
      setIsRecordingShortcut(false);
      setShortcutCaptureError(null);
      void onGlobalShortcutChange({ enabled: globalShortcut.enabled, shortcut }).catch(() => {});
    };

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', handleShortcutKeyDown, true);
  }, [isOpen, isRecordingShortcut, globalShortcut.enabled, onGlobalShortcutChange, t.settings.shortcutNeedsModifier]);

  useEffect(() => {
    if (!isOpen) setIsRecordingShortcut(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const themeCopy = {
    cyberfiles: t.settings.cyberfiles,
    gray: t.settings.gray,
    light: t.settings.light,
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950 text-cyan-300">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h2 id="settings-title" className="text-sm font-semibold text-neutral-100">{t.settings.title}</h2>
              <p className="mt-0.5 text-xs text-neutral-400">{t.settings.subtitle}</p>
            </div>
          </div>
          <Tooltip label={t.settings.close} placement="bottom">
            <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100" aria-label={t.settings.close}>
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-3 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t.settings.appearance}</div>
          <div role="radiogroup" aria-label={t.settings.appearance} className="grid gap-2.5 sm:grid-cols-3">
            {themes.map(option => {
              const copy = themeCopy[option];
              const selected = theme === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(option)}
                  className={`relative rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]'
                      : 'border-neutral-700 bg-neutral-950/50 hover:border-neutral-500 hover:bg-neutral-800/70'
                  }`}
                >
                  <div className={`theme-preview theme-preview-${option} mb-3 h-12 overflow-hidden rounded-md border border-black/20`} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-100">{copy.name}</span>
                    {selected && <Check className="h-4 w-4 flex-shrink-0 text-cyan-300" />}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-neutral-400">{copy.description}</p>
                </button>
              );
            })}
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t.settings.language}</div>
            <div className="mt-2 inline-flex rounded-lg border border-neutral-700 bg-neutral-950/60 p-1">
              <button onClick={() => setLanguage('es')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${language === 'es' ? 'bg-cyan-950 text-cyan-200' : 'text-neutral-400 hover:text-neutral-100'}`}>{t.settings.spanish}</button>
              <button onClick={() => setLanguage('en')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${language === 'en' ? 'bg-cyan-950 text-cyan-200' : 'text-neutral-400 hover:text-neutral-100'}`}>{t.settings.english}</button>
            </div>
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-start gap-2">
              <Keyboard className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.hotkeySection}</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">{t.settings.hotkeyDescription}</p>
              </div>
            </div>

            <label className={`mt-3 flex items-center gap-2 text-xs ${globalShortcutSupported ? 'text-neutral-200' : 'text-neutral-500'}`}>
              <input
                type="checkbox"
                checked={globalShortcut.enabled}
                disabled={!globalShortcutLoaded || !globalShortcutSupported}
                onChange={event => void onGlobalShortcutChange({ enabled: event.target.checked, shortcut: globalShortcut.shortcut }).catch(() => {})}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
              />
              {t.settings.hotkeyEnabled}
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="min-w-20 text-xs text-neutral-400">{t.settings.hotkeyShortcut}</span>
              <kbd className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-200">{globalShortcut.shortcut}</kbd>
              <button
                type="button"
                disabled={!globalShortcutLoaded || !globalShortcutSupported}
                onClick={() => {
                  setShortcutCaptureError(null);
                  setIsRecordingShortcut(true);
                }}
                className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRecordingShortcut ? t.settings.hotkeyRecording : t.settings.hotkeyChange}
              </button>
              <button
                type="button"
                disabled={!globalShortcutLoaded || !globalShortcutSupported}
                onClick={() => {
                  setIsRecordingShortcut(false);
                  setShortcutCaptureError(null);
                  void onGlobalShortcutChange({ enabled: true, shortcut: 'Alt+Shift+F' }).catch(() => {});
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" />
                {t.settings.hotkeyRestore}
              </button>
            </div>

            <p className={`mt-2 text-[11px] ${globalShortcutError || shortcutCaptureError ? 'text-rose-300' : 'text-neutral-500'}`}>
              {shortcutCaptureError || globalShortcutError || (!globalShortcutSupported
                ? t.settings.shortcutDesktopOnly
                : !globalShortcutLoaded
                  ? t.settings.shortcutUnavailable
                  : globalShortcut.enabled
                    ? globalShortcut.registered ? t.settings.hotkeyActive : t.settings.hotkeyNotRegistered
                    : t.settings.hotkeyDisabled)}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={emptyAreaDoubleClickNavigatesUp}
                onChange={event => onEmptyAreaDoubleClickNavigatesUpChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
              />
              <span>
                <span className="block font-medium text-neutral-200">{t.settings.emptyAreaDoubleClickUp}</span>
                <span className="mt-1 block">{t.settings.emptyAreaDoubleClickDescription}</span>
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={folderStyleLocked}
                onChange={event => onFolderStyleLockedChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
              />
              <span>
                <span className="block font-medium text-neutral-200">{t.settings.keepFolderStyle}</span>
                <span className="mt-1 block">{t.settings.keepFolderStyleDescription}</span>
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            {t.settings.persistenceNote}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-950/40 px-5 py-3">
          <button onClick={onShowOnboarding} className="text-xs text-neutral-400 underline-offset-4 transition-colors hover:text-cyan-300 hover:underline">
            {t.settings.showOnboarding}
          </button>
          <DialogButton size="compact" onClick={onClose}>
            {t.settings.close}
          </DialogButton>
        </div>
      </section>
    </div>
  );
}
