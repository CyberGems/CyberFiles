import { useEffect, useRef, useState } from 'react';
import { Check, Info, Keyboard, Palette, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { type AppTheme, useTheme } from '../themes/ThemeContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';
import { type HiddenItemStyle, type NavigationTransitionStyle, type RecentItemStyle } from '../types';
import { formatDateTimeForDisplay, type DateFormatMode } from '../utils/dateTime';
import { DEFAULT_SESSION_PROFILE_ID, type StartupBehavior, type TabSessionProfile, type TabStripPosition } from '../utils/workspaceProfiles';
import { ColorValueEditor } from './ColorValueEditor';


interface SettingsModalProps {
  isOpen: boolean;
  focusTabSettingsRequest: number;
  onClose: () => void;
  onShowOnboarding: () => void;
  onShowAbout: () => void;
  globalShortcut: { enabled: boolean; shortcut: string; registered: boolean };
  globalShortcutLoaded: boolean;
  globalShortcutSupported: boolean;
  globalShortcutError: string | null;
  onGlobalShortcutChange: (settings: { enabled: boolean; shortcut: string }) => Promise<void>;
  instancePreferences: { allowMultipleInstances: boolean };
  instancePreferencesLoaded: boolean;
  instancePreferencesSupported: boolean;
  instancePreferencesError: string | null;
  onInstancePreferencesChange: (allowMultipleInstances: boolean) => Promise<void>;
  emptyAreaDoubleClickNavigatesUp: boolean;
  onEmptyAreaDoubleClickNavigatesUpChange: (enabled: boolean) => void;
  mouseGesturesEnabled: boolean;
  onMouseGesturesEnabledChange: (enabled: boolean) => void;
  folderStyleLocked: boolean;
  onFolderStyleLockedChange: (enabled: boolean) => void;
  recentItemStyle: RecentItemStyle;
  onRecentItemStyleChange: (style: RecentItemStyle) => void;
  onRecentItemStyleReset: () => void;
  hiddenItemStyle: HiddenItemStyle;
  onHiddenItemStyleChange: (style: HiddenItemStyle) => void;
  onHiddenItemStyleReset: () => void;
  imageTooltipThumbnailsEnabled: boolean;
  onImageTooltipThumbnailsEnabledChange: (enabled: boolean) => void;
  notificationBannersEnabled: boolean;
  onNotificationBannersEnabledChange: (enabled: boolean) => void;
  tooltipsEnabled: boolean;
  onTooltipsEnabledChange: (enabled: boolean) => void;
  navigationTransitionsEnabled: boolean;
  onNavigationTransitionsEnabledChange: (enabled: boolean) => void;
  navigationTransitionStyle: NavigationTransitionStyle;
  onNavigationTransitionStyleChange: (style: NavigationTransitionStyle) => void;
  dateFormat: DateFormatMode;
  onDateFormatChange: (format: DateFormatMode) => void;
  startupBehavior: StartupBehavior;
  onStartupBehaviorChange: (behavior: StartupBehavior) => void;
  startupSessionId: string;
  onStartupSessionIdChange: (sessionId: string) => void;
  sessions: TabSessionProfile[];
  autoFolderSizeEnabled: boolean;
  onAutoFolderSizeEnabledChange: (enabled: boolean) => void;
  singleClickOpen: boolean;
  onSingleClickOpenChange: (enabled: boolean) => void;
  sidebarLocationsOpenInNewTab: boolean;
  onSidebarLocationsOpenInNewTabChange: (enabled: boolean) => void;
  newTabsNextToCurrent: boolean;
  onNewTabsNextToCurrentChange: (enabled: boolean) => void;
  tabStripPosition: TabStripPosition;
  onTabStripPositionChange: (position: TabStripPosition) => void;
  showNewTabButton: boolean;
  onShowNewTabButtonChange: (enabled: boolean) => void;
  doubleClickTabBar: boolean;
  onDoubleClickTabBarChange: (enabled: boolean) => void;
}

const themes: AppTheme[] = ['cyberfiles', 'gray', 'light'];
const RECENT_ITEM_AUTO_COLORS: Record<AppTheme, string> = {
  cyberfiles: '#fef3c7',
  gray: '#e5e5e5',
  light: '#8a5b00',
};
const HIDDEN_ITEM_AUTO_COLORS: Record<AppTheme, string> = {
  cyberfiles: '#fb7185',
  gray: '#f87171',
  light: '#b91c1c',
};

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
  focusTabSettingsRequest,
  onClose,
  onShowOnboarding,
  onShowAbout,
  globalShortcut,
  globalShortcutLoaded,
  globalShortcutSupported,
  globalShortcutError,
  onGlobalShortcutChange,
  instancePreferences,
  instancePreferencesLoaded,
  instancePreferencesSupported,
  instancePreferencesError,
  onInstancePreferencesChange,
  emptyAreaDoubleClickNavigatesUp,
  onEmptyAreaDoubleClickNavigatesUpChange,
  mouseGesturesEnabled,
  onMouseGesturesEnabledChange,
  folderStyleLocked,
  onFolderStyleLockedChange,
  recentItemStyle,
  onRecentItemStyleChange,
  onRecentItemStyleReset,
  hiddenItemStyle,
  onHiddenItemStyleChange,
  onHiddenItemStyleReset,
  imageTooltipThumbnailsEnabled,
  onImageTooltipThumbnailsEnabledChange,
  notificationBannersEnabled,
  onNotificationBannersEnabledChange,
  tooltipsEnabled,
  onTooltipsEnabledChange,
  navigationTransitionsEnabled,
  onNavigationTransitionsEnabledChange,
  navigationTransitionStyle,
  onNavigationTransitionStyleChange,
  dateFormat,
  onDateFormatChange,
  startupBehavior,
  onStartupBehaviorChange,
  startupSessionId,
  onStartupSessionIdChange,
  sessions,
  autoFolderSizeEnabled,
  onAutoFolderSizeEnabledChange,
  singleClickOpen,
  onSingleClickOpenChange,
  sidebarLocationsOpenInNewTab,
  onSidebarLocationsOpenInNewTabChange,
  newTabsNextToCurrent,
  onNewTabsNextToCurrentChange,
  tabStripPosition,
  onTabStripPositionChange,
  showNewTabButton,
  onShowNewTabButtonChange,
  doubleClickTabBar,
  onDoubleClickTabBarChange,
}: SettingsModalProps) {
  const { t, language, setLanguage } = useLanguage();
  const tabSettingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen && focusTabSettingsRequest > 0) tabSettingsRef.current?.scrollIntoView({ block: 'start' });
  }, [isOpen, focusTabSettingsRequest]);
  const { theme, setTheme } = useTheme();
  const recentItemTextColor = recentItemStyle.textColor === 'auto'
    ? RECENT_ITEM_AUTO_COLORS[theme]
    : recentItemStyle.textColor;
  const hiddenItemTextColor = hiddenItemStyle.textColor === 'auto'
    ? HIDDEN_ITEM_AUTO_COLORS[theme]
    : hiddenItemStyle.textColor;
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
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
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

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
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

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3">
            <div className="mb-2">
              <div className="text-xs font-medium text-neutral-200">{t.settings.dateFormat}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{t.settings.dateFormatDescription}</p>
            </div>
            <div role="radiogroup" aria-label={t.settings.dateFormat} className="grid gap-2 sm:grid-cols-3">
              {([
                { id: 'application', label: t.settings.dateFormatApplication, description: t.settings.dateFormatApplicationDescription },
                { id: 'system', label: t.settings.dateFormatSystem, description: t.settings.dateFormatSystemDescription },
                { id: 'universal', label: t.settings.dateFormatUniversal, description: t.settings.dateFormatUniversalDescription },
              ] as const).map(option => (
                <Tooltip key={option.id} label={option.description} placement="top">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={dateFormat === option.id}
                    onClick={() => onDateFormatChange(option.id)}
                    className={`min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors ${dateFormat === option.id ? 'border-cyan-500/70 bg-cyan-950/30 text-cyan-100' : 'border-neutral-700 bg-neutral-900/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/70'}`}
                  >
                    <span className="block text-[11px] font-semibold">{option.label}</span>
                    <span className="mt-1 block truncate text-[9px] text-neutral-500">{t.settings.dateFormatRecentPreview}</span>
                    <span className="block truncate font-sans text-[10px] tabular-nums text-neutral-300">{formatDateTimeForDisplay(Date.now(), undefined, option.id, language)}</span>
                    <span className="mt-1 block truncate text-[9px] text-neutral-500">{t.settings.dateFormatOlderPreview}</span>
                    <span className="block truncate font-sans text-[10px] tabular-nums text-neutral-300">{formatDateTimeForDisplay(new Date(2021, 11, 31, 14, 30).getTime(), undefined, option.id, language)}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.startupSection}</div>
            <p className="mb-3 text-[11px] leading-relaxed text-neutral-400">{t.settings.startupDescription}</p>
            <div role="radiogroup" aria-label={t.settings.startupSection} className="space-y-2">
              {([
                { id: 'continue', label: t.settings.startupContinue, description: t.settings.startupContinueDescription },
                { id: 'home', label: t.settings.startupHome, description: t.settings.startupHomeDescription },
                { id: 'session', label: t.settings.startupSession, description: t.settings.startupSessionDescription },
              ] as const).map(option => (
                <label key={option.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition-colors ${startupBehavior === option.id ? 'border-cyan-700/70 bg-cyan-950/20 text-neutral-200' : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'}`}>
                    <input
                      type="radio"
                      name="startup-behavior"
                      value={option.id}
                      checked={startupBehavior === option.id}
                      onChange={() => onStartupBehaviorChange(option.id)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-200">{option.label}</span>
                      <span className="mt-1 block leading-relaxed">{option.description}</span>
                    </span>
                  </label>
              ))}
            </div>
            {startupBehavior === 'session' && (
              <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3">
                <label className="block text-xs font-medium text-neutral-200" htmlFor="startup-session-select">{t.settings.startupChooseSession}</label>
                <select
                    id="startup-session-select"
                    value={startupSessionId}
                    onChange={event => onStartupSessionIdChange(event.target.value)}
                    className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-200 outline-none focus:border-cyan-600"
                  >
                    <option value={DEFAULT_SESSION_PROFILE_ID}>{t.workspaceProfiles.defaultSession}</option>
                    {sessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}
                  </select>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">{t.settings.startupSessionHelp}</p>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.interfaceSection}</div>
            <div className="space-y-2">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={notificationBannersEnabled}
                      onChange={event => onNotificationBannersEnabledChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                    />
                    <span>
                      <span className="block font-medium text-neutral-200">{t.settings.showNotificationBanners}</span>
                      <span className="mt-1 block">{t.settings.showNotificationBannersDescription}</span>
                    </span>
                  </label>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={autoFolderSizeEnabled}
                      onChange={event => onAutoFolderSizeEnabledChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                    />
                    <span>
                      <span className="block font-medium text-neutral-200">{t.settings.autoFolderSize}</span>
                      <span className="mt-1 block">{t.settings.autoFolderSizeDescription}</span>
                    </span>
                  </label>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={tooltipsEnabled}
                      onChange={event => onTooltipsEnabledChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                    />
                    <span>
                      <span className="block font-medium text-neutral-200">{t.settings.showTooltips}</span>
                      <span className="mt-1 block">{t.settings.showTooltipsDescription}</span>
                    </span>
                  </label>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={navigationTransitionsEnabled}
                    onChange={event => onNavigationTransitionsEnabledChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                  />
                  <span>
                    <span className="block font-medium text-neutral-200">{t.settings.navigationTransitions}</span>
                    <span className="mt-1 block">{t.settings.navigationTransitionsDescription}</span>
                  </span>
                </label>
                {navigationTransitionsEnabled && (
                  <div className="mt-3 border-t border-neutral-800 pt-3">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.settings.navigationTransitionStyle}</div>
                    <div role="radiogroup" aria-label={t.settings.navigationTransitionStyle} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([
                        ['subtle', t.settings.navigationTransitionSubtle, t.settings.navigationTransitionSubtleDescription],
                        ['dynamic', t.settings.navigationTransitionDynamic, t.settings.navigationTransitionDynamicDescription],
                        ['fade', t.settings.navigationTransitionFade, t.settings.navigationTransitionFadeDescription],
                      ] as const).map(([style, label, description]) => (
                        <button
                          key={style}
                          type="button"
                          role="radio"
                          aria-checked={navigationTransitionStyle === style}
                          onClick={() => onNavigationTransitionStyleChange(style)}
                          className={`rounded-md border px-2.5 py-2 text-left transition-colors ${navigationTransitionStyle === style ? 'border-cyan-600/70 bg-cyan-950/35 text-cyan-100' : 'border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800'}`}
                        >
                          <span className="block text-[11px] font-medium">{label}</span>
                          <span className="mt-0.5 block text-[9px] leading-snug text-neutral-500">{description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
              <kbd className="keyboard-hint text-neutral-200">{globalShortcut.shortcut}</kbd>
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

          <div className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.instancesSection}</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
              <label className={`flex items-center gap-2 ${instancePreferencesSupported ? 'cursor-pointer text-neutral-200' : 'text-neutral-500'}`}>
                  <input
                    type="checkbox"
                    checked={instancePreferences.allowMultipleInstances}
                    disabled={!instancePreferencesLoaded || !instancePreferencesSupported}
                    onChange={event => void onInstancePreferencesChange(event.target.checked).catch(() => {})}
                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400 disabled:cursor-not-allowed"
                  />
                  {t.settings.multipleInstancesAllowed}
                </label>
              <p className="mt-1 pl-6">{t.settings.multipleInstancesDescription}</p>
              {instancePreferencesError && (
                <p className="mt-1 pl-6 text-rose-300">{instancePreferencesError}</p>
              )}
              {instancePreferencesLoaded && !instancePreferencesSupported && !instancePreferencesError && (
                <p className="mt-1 pl-6">{t.settings.instancePreferencesDesktopOnly}</p>
              )}
              {instancePreferencesSupported && !instancePreferencesLoaded && (
                <p className="mt-1 pl-6">{t.settings.instancePreferencesUnavailable}</p>
              )}
            </div>
          </div>

          <div ref={tabSettingsRef} className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.navigationSection}</div>
            <div className="space-y-2">
              <fieldset className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-xs text-neutral-400">
                <legend className="px-1 font-medium text-neutral-200">{t.settings.tabStripPosition}</legend>
                <p className="mb-2 leading-relaxed">{t.settings.tabStripPositionDescription}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['top', 'bottom', 'left', 'right'] as const).map(position => (
                    <label key={position} className={tabStripPosition === position ? 'flex cursor-pointer items-center gap-2 rounded-md border border-cyan-700 bg-cyan-950/45 px-3 py-2 text-cyan-100' : 'flex cursor-pointer items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-neutral-300 transition-colors hover:border-neutral-600'}>
                      <input type="radio" name="tab-strip-position" value={position} checked={tabStripPosition === position} onChange={() => onTabStripPositionChange(position)} className="h-4 w-4 accent-cyan-400" />
                      <span>{position === 'top' ? t.settings.tabStripTop : position === 'bottom' ? t.settings.tabStripBottom : position === 'left' ? t.settings.tabStripLeft : t.settings.tabStripRight}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={showNewTabButton} onChange={event => onShowNewTabButtonChange(event.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-400" />
                  <span>
                    <span className="block font-medium text-neutral-200">{t.settings.showNewTabButton}</span>
                    <span className="mt-1 block">{t.settings.showNewTabButtonDescription}</span>
                  </span>
                </label>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={doubleClickTabBar} onChange={event => onDoubleClickTabBarChange(event.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-400" />
                  <span>
                    <span className="block font-medium text-neutral-200">{t.settings.doubleClickTabBar}</span>
                    <span className="mt-1 block">{t.settings.doubleClickTabBarDescription}</span>
                  </span>
                </label>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={sidebarLocationsOpenInNewTab}
                    onChange={event => onSidebarLocationsOpenInNewTabChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                  />
                  <span>
                    <span className="block font-medium text-neutral-200">{t.settings.sidebarLocationsNewTab}</span>
                    <span className="mt-1 block">{t.settings.sidebarLocationsNewTabDescription}</span>
                  </span>
                </label>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={newTabsNextToCurrent}
                    onChange={event => onNewTabsNextToCurrentChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                  />
                  <span>
                    <span className="block font-medium text-neutral-200">{t.settings.newTabsNextToCurrent}</span>
                    <span className="mt-1 block">{t.settings.newTabsNextToCurrentDescription}</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={singleClickOpen}
                onChange={event => onSingleClickOpenChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
              />
              <span>
                <span className="block font-medium text-neutral-200">{t.settings.singleClickOpen}</span>
                <span className="mt-1 block">{t.settings.singleClickOpenDescription}</span>
              </span>
            </label>
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
                checked={mouseGesturesEnabled}
                onChange={event => onMouseGesturesEnabledChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
              />
              <span>
                <span className="block font-medium text-neutral-200">{t.settings.mouseGestures}</span>
                <span className="mt-1 block">{t.settings.mouseGesturesDescription}</span>
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={recentItemStyle.enabled}
                    onChange={event => onRecentItemStyleChange({ ...recentItemStyle, enabled: event.target.checked })}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                  />
                  <span>
                    <span className="block font-medium text-neutral-200">{t.settings.recentItemsTitle}</span>
                    <span className="mt-1 block">{t.settings.recentItemsDescription}</span>
                  </span>
                </label>
              <button
                  type="button"
                  onClick={onRecentItemStyleReset}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-200 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t.settings.recentItemsReset}
                </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-neutral-800 pt-3 sm:grid-cols-2">
              <ColorValueEditor
                label={t.settings.recentItemsTextColor}
                value={recentItemTextColor}
                onChange={textColor => onRecentItemStyleChange({ ...recentItemStyle, textColor })}
              />

              <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-300">
                  <input
                    type="checkbox"
                    checked={recentItemStyle.bold}
                    onChange={event => onRecentItemStyleChange({ ...recentItemStyle, bold: event.target.checked })}
                    className="h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                  />
                  {t.settings.recentItemsBold}
                </label>

              <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-300">
                  <input
                    type="checkbox"
                    checked={recentItemStyle.italic}
                    onChange={event => onRecentItemStyleChange({ ...recentItemStyle, italic: event.target.checked })}
                    className="h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                  />
                  {t.settings.recentItemsItalic}
                </label>

              <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-300">
                  <input
                    type="checkbox"
                    checked={recentItemStyle.backgroundEnabled}
                    onChange={event => onRecentItemStyleChange({ ...recentItemStyle, backgroundEnabled: event.target.checked })}
                    className="h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                  />
                  {t.settings.recentItemsBackgroundEnabled}
                </label>

              <ColorValueEditor
                label={t.settings.recentItemsBackgroundColor}
                disabled={!recentItemStyle.backgroundEnabled}
                value={recentItemStyle.backgroundColor}
                onChange={backgroundColor => onRecentItemStyleChange({ ...recentItemStyle, backgroundColor })}
              />

              <div className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-400 sm:col-span-2">
                <span>{t.settings.recentItemsPreview}:</span>
                <span
                  className="rounded px-1.5 py-0.5"
                  style={{
                    color: recentItemStyle.textColor === 'auto' ? 'var(--cyberfiles-recent-item-color)' : recentItemStyle.textColor,
                    fontWeight: recentItemStyle.bold ? 700 : 400,
                    fontStyle: recentItemStyle.italic ? 'italic' : 'normal',
                    backgroundColor: recentItemStyle.backgroundEnabled ? `color-mix(in srgb, ${recentItemStyle.backgroundColor} 18%, transparent)` : undefined,
                  }}
                >
                  {t.settings.recentItemsPreviewText}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={hiddenItemStyle.enabled}
                  onChange={event => onHiddenItemStyleChange({ ...hiddenItemStyle, enabled: event.target.checked })}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                />
                <span>
                  <span className="block font-medium text-neutral-200">{t.settings.hiddenItemsTitle}</span>
                  <span className="mt-1 block">{t.settings.hiddenItemsDescription}</span>
                </span>
              </label>
              <Tooltip label={t.settings.hiddenItemsReset} placement="top">
                <button
                  type="button"
                  onClick={onHiddenItemStyleReset}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-200 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t.settings.hiddenItemsReset}
                </button>
              </Tooltip>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-neutral-800 pt-3 sm:grid-cols-2">
              <ColorValueEditor
                label={t.settings.hiddenItemsTextColor}
                value={hiddenItemTextColor}
                onChange={textColor => onHiddenItemStyleChange({ ...hiddenItemStyle, textColor })}
              />

              <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-300">
                <input
                  type="checkbox"
                  checked={hiddenItemStyle.bold}
                  onChange={event => onHiddenItemStyleChange({ ...hiddenItemStyle, bold: event.target.checked })}
                  className="h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                />
                {t.settings.hiddenItemsBold}
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-300">
                <input
                  type="checkbox"
                  checked={hiddenItemStyle.italic}
                  onChange={event => onHiddenItemStyleChange({ ...hiddenItemStyle, italic: event.target.checked })}
                  className="h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                />
                {t.settings.hiddenItemsItalic}
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-300">
                <input
                  type="checkbox"
                  checked={hiddenItemStyle.backgroundEnabled}
                  onChange={event => onHiddenItemStyleChange({ ...hiddenItemStyle, backgroundEnabled: event.target.checked })}
                  className="h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                />
                {t.settings.hiddenItemsBackgroundEnabled}
              </label>

              <ColorValueEditor
                label={t.settings.hiddenItemsBackgroundColor}
                disabled={!hiddenItemStyle.backgroundEnabled}
                value={hiddenItemStyle.backgroundColor}
                onChange={backgroundColor => onHiddenItemStyleChange({ ...hiddenItemStyle, backgroundColor })}
              />

              <div className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1.5 text-neutral-400 sm:col-span-2">
                <span>{t.settings.hiddenItemsPreview}:</span>
                <span
                  className="rounded px-1.5 py-0.5"
                  style={{
                    color: hiddenItemTextColor,
                    fontWeight: hiddenItemStyle.bold ? 700 : 400,
                    fontStyle: hiddenItemStyle.italic ? 'italic' : 'normal',
                    backgroundColor: hiddenItemStyle.backgroundEnabled ? `color-mix(in srgb, ${hiddenItemStyle.backgroundColor} 18%, transparent)` : undefined,
                  }}
                >
                  {t.settings.hiddenItemsPreviewText}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={imageTooltipThumbnailsEnabled}
                  onChange={event => onImageTooltipThumbnailsEnabledChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
                />
                <span>
                  <span className="block font-medium text-neutral-200">{t.settings.imageTooltipThumbnails}</span>
                  <span className="mt-1 block">{t.settings.imageTooltipThumbnailsDescription}</span>
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
          <div className="flex min-w-0 items-center gap-3">
            <button
                type="button"
                onClick={onShowAbout}
                className="inline-flex items-center gap-1.5 text-xs text-neutral-300 transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
              >
                <Info className="h-3.5 w-3.5" />
                {t.about.title}
              </button>
            <button onClick={onShowOnboarding} className="text-xs text-neutral-400 underline-offset-4 transition-colors hover:text-cyan-300 hover:underline">
            {t.settings.showOnboarding}
            </button>
          </div>
          <DialogButton size="compact" onClick={onClose}>
            {t.settings.close}
          </DialogButton>
        </div>
      </section>
    </div>
  );
}
