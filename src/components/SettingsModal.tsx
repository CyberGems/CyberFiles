import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Compass, FolderOpen, Info, Keyboard, Palette, RotateCcw, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLanguage } from '../locales/LanguageContext';
import { type AppTheme, useTheme } from '../themes/ThemeContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';
import { type GroupByField, type HiddenItemStyle, type NewTabActionMode, type NewTabActionPreference, type RecentItemStyle, type SortField, type SortOrder, type TabCloseButtonMode, type TabSizePreferences, type TabWidthMode, type ViewMode } from '../types';
import type { FolderStylePreference, SavedFolderStyles } from '../utils/folderStylePreferences';
import { formatDateTimeForDisplay, type DateFormatMode } from '../utils/dateTime';
import { DEFAULT_SESSION_PROFILE_ID, type StartupBehavior, type TabSessionProfile, type TabStripPosition } from '../utils/workspaceProfiles';
import { isTauriDesktop } from '../utils/nativeFileSystem';
import { ColorValueEditor } from './ColorValueEditor';

interface GlobalShortcutSettingsState {
  enabled: boolean;
  shortcut: string;
  registered: boolean;
}

interface InstancePreferencesState {
  allowMultipleInstances: boolean;
  supported?: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  focusTabSettingsRequest: number;
  onClose: () => void;
  onShowOnboarding?: () => void;
  onShowAbout?: () => void;
  globalShortcut?: GlobalShortcutSettingsState;
  globalShortcutLoaded?: boolean;
  globalShortcutSupported?: boolean;
  globalShortcutError?: string | null;
  onGlobalShortcutChange?: (settings: { enabled: boolean; shortcut: string }) => Promise<void>;
  instancePreferences?: { allowMultipleInstances: boolean };
  instancePreferencesLoaded?: boolean;
  instancePreferencesSupported?: boolean;
  instancePreferencesError?: string | null;
  onInstancePreferencesChange?: (allowMultipleInstances: boolean) => Promise<void>;
  emptyAreaDoubleClickNavigatesUp: boolean;
  onEmptyAreaDoubleClickNavigatesUpChange: (enabled: boolean) => void;
  mouseGesturesEnabled: boolean;
  onMouseGesturesEnabledChange: (enabled: boolean) => void;
  folderStyleLocked: boolean;
  onFolderStyleLockedChange: (enabled: boolean) => void;
  savedFolderStyles: SavedFolderStyles;
  onSavedFolderStyleChange: (path: string, style: FolderStylePreference) => boolean;
  onSavedFolderStyleRemove: (path: string) => boolean;
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
  newTabButtonAction: NewTabActionPreference;
  onNewTabButtonActionChange: (preference: NewTabActionPreference) => void;
  doubleClickTabBar: boolean;
  onDoubleClickTabBarChange: (enabled: boolean) => void;
  doubleClickTabAction: NewTabActionPreference;
  onDoubleClickTabActionChange: (preference: NewTabActionPreference) => void;
  defaultNewTabPath: string;
  onDefaultNewTabPathChange: (path: string) => void;
  onChooseNewTabFolder: () => Promise<string | null>;
  tabCloseButtonMode: TabCloseButtonMode;
  onTabCloseButtonModeChange: (mode: TabCloseButtonMode) => void;
  tabSizePreferences: TabSizePreferences;
  onTabSizePreferencesChange: (preferences: TabSizePreferences) => void;
}

const themes: AppTheme[] = ['cyberfiles', 'gray', 'light'];
type SettingsTab = 'general' | 'appearance' | 'navigation' | 'folders' | 'shortcuts';
const settingsTabs: SettingsTab[] = ['general', 'appearance', 'navigation', 'folders', 'shortcuts'];
function normalizeSettingsSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

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
  onShowOnboarding = () => {},
  onShowAbout = () => {},
  globalShortcut: propGlobalShortcut,
  globalShortcutLoaded: propGlobalShortcutLoaded,
  globalShortcutSupported: propGlobalShortcutSupported,
  globalShortcutError: propGlobalShortcutError,
  onGlobalShortcutChange: propOnGlobalShortcutChange,
  instancePreferences: propInstancePreferences,
  instancePreferencesLoaded: propInstancePreferencesLoaded,
  instancePreferencesSupported: propInstancePreferencesSupported,
  instancePreferencesError: propInstancePreferencesError,
  onInstancePreferencesChange: propOnInstancePreferencesChange,
  emptyAreaDoubleClickNavigatesUp,
  onEmptyAreaDoubleClickNavigatesUpChange,
  mouseGesturesEnabled,
  onMouseGesturesEnabledChange,
  folderStyleLocked,
  onFolderStyleLockedChange,
  savedFolderStyles,
  onSavedFolderStyleChange,
  onSavedFolderStyleRemove,
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
  newTabButtonAction,
  onNewTabButtonActionChange,
  doubleClickTabBar,
  onDoubleClickTabBarChange,
  doubleClickTabAction,
  onDoubleClickTabActionChange,
  defaultNewTabPath,
  onDefaultNewTabPathChange,
  onChooseNewTabFolder,
  tabCloseButtonMode,
  onTabCloseButtonModeChange,
  tabSizePreferences,
  onTabSizePreferencesChange,
}: SettingsModalProps) {
  const { t, language, setLanguage } = useLanguage();
  const displayScale = Math.max(1, window.devicePixelRatio || 1);
  const [tab, setTab] = useState<SettingsTab>('general');
  const [folderStyleDrafts, setFolderStyleDrafts] = useState<Record<string, FolderStylePreference>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const tabSettingsRef = useRef<HTMLDivElement>(null);
  const lastFocusTabSettingsRequest = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [searchResultCount, setSearchResultCount] = useState(0);
  const searchActive = settingsSearch.trim().length > 0;
  const settingsTabLabels: Record<SettingsTab, string> = {
    general: t.settings.generalTab,
    appearance: t.settings.appearance,
    navigation: t.settings.navigationTab,
    folders: t.settings.foldersTab,
    shortcuts: t.settings.shortcutsTab,
  };
  useEffect(() => {
    if (!isOpen || focusTabSettingsRequest <= lastFocusTabSettingsRequest.current) return;
    lastFocusTabSettingsRequest.current = focusTabSettingsRequest;
    setSettingsSearch('');
    setTab('navigation');
    const frame = window.requestAnimationFrame(() => tabSettingsRef.current?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, focusTabSettingsRequest]);
  const selectTab = (nextTab: SettingsTab) => {
    setTab(nextTab);
    setIsRecordingShortcut(false);
    setShortcutCaptureError(null);
    contentRef.current?.scrollTo({ top: 0 });
  };
  const savedStyleEntries = Object.entries(savedFolderStyles).sort(([first], [second]) => first.localeCompare(second));
  const updateFolderStyleDraft = (key: string, changes: Partial<FolderStylePreference>) => {
    setFolderStyleDrafts(previous => ({ ...previous, [key]: { ...(previous[key] ?? savedFolderStyles[key]), ...changes } }));
  };
  const clearFolderStyleDraft = (key: string) => {
    setFolderStyleDrafts(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };
  const newTabActionOptions: Array<{ value: NewTabActionMode; label: string }> = [
    { value: 'current-folder', label: t.settings.newTabActionCurrentFolder },
    { value: 'duplicate', label: t.settings.newTabActionDuplicate },
    { value: 'default-folder', label: t.settings.newTabActionDefaultFolder },
    { value: 'home-folder', label: t.settings.newTabActionHomeFolder },
    { value: 'empty-tab', label: t.settings.newTabActionEmptyTab },
    { value: 'location', label: t.settings.newTabActionLocation },
  ];
  const newTabActionDescriptions: Record<NewTabActionMode, string> = {
    'current-folder': t.settings.newTabActionCurrentFolderDescription,
    duplicate: t.settings.newTabActionDuplicateDescription,
    'default-folder': t.settings.newTabActionDefaultFolderDescription,
    'home-folder': t.settings.newTabActionHomeFolderDescription,
    'empty-tab': t.settings.newTabActionEmptyTabDescription,
    location: t.settings.newTabActionLocationDescription,
  };
  const chooseNewTabPath = async (onChange: (path: string) => void) => {
    const path = await onChooseNewTabFolder();
    if (path) onChange(path);
  };
  const renderNewTabPathPicker = (path: string, onChange: (path: string) => void, placeholder: string) => (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        readOnly
        aria-label={t.settings.newTabFolderPath}
        value={path}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-cyan-600 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void chooseNewTabPath(onChange)}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-800/80 bg-cyan-950/35 px-3 py-2 text-xs font-medium text-cyan-200 transition-colors hover:border-cyan-600 hover:bg-cyan-950/60"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {t.settings.newTabChooseFolder}
      </button>
    </div>
  );
  const renderNewTabActionSetting = (
    checkboxLabel: string,
    checkboxDescription: string,
    enabled: boolean,
    onEnabledChange: (enabled: boolean) => void,
    preference: NewTabActionPreference,
    onPreferenceChange: (preference: NewTabActionPreference) => void,
  ) => (
    <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-xs leading-relaxed text-neutral-400">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={enabled} onChange={event => onEnabledChange(event.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-400" />
          <span>
            <span className="block font-medium text-neutral-200">{checkboxLabel}</span>
            <span className="mt-1 block">{checkboxDescription}</span>
          </span>
        </label>
        <label className="min-w-[14rem] lg:max-w-[18rem]">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.settings.newTabAction}</span>
          <select
            value={preference.mode}
            onChange={event => onPreferenceChange({ ...preference, mode: event.target.value as NewTabActionMode })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-cyan-600 focus:outline-none"
          >
            {newTabActionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-2 border-t border-neutral-800/80 pt-2 text-neutral-500">{newTabActionDescriptions[preference.mode]}</p>
      {preference.mode === 'location' && renderNewTabPathPicker(
        preference.path,
        path => onPreferenceChange({ ...preference, path }),
        t.settings.newTabLocationNotSet,
      )}
    </div>
  );
  const { theme, setTheme } = useTheme();
  const recentItemTextColor = recentItemStyle.textColor === 'auto'
    ? RECENT_ITEM_AUTO_COLORS[theme]
    : recentItemStyle.textColor;
  const hiddenItemTextColor = hiddenItemStyle.textColor === 'auto'
    ? HIDDEN_ITEM_AUTO_COLORS[theme]
    : hiddenItemStyle.textColor;
  const [internalGlobalShortcut, setInternalGlobalShortcut] = useState<GlobalShortcutSettingsState>({
    enabled: true,
    shortcut: 'Alt+Shift+F',
    registered: false,
  });
  const [internalGlobalShortcutLoaded, setInternalGlobalShortcutLoaded] = useState(false);
  const [internalGlobalShortcutSupported, setInternalGlobalShortcutSupported] = useState(false);
  const [internalGlobalShortcutError, setInternalGlobalShortcutError] = useState<string | null>(null);

  const [internalInstancePreferences, setInternalInstancePreferences] = useState<InstancePreferencesState>({
    allowMultipleInstances: true,
    supported: false,
  });
  const [internalInstancePreferencesLoaded, setInternalInstancePreferencesLoaded] = useState(false);
  const [internalInstancePreferencesSupported, setInternalInstancePreferencesSupported] = useState(false);
  const [internalInstancePreferencesError, setInternalInstancePreferencesError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (propGlobalShortcut === undefined) {
      if (!isTauriDesktop()) {
        setInternalGlobalShortcutLoaded(true);
      } else {
        setInternalGlobalShortcutSupported(true);
        void invoke<GlobalShortcutSettingsState>('get_global_shortcut_settings')
          .then(settings => setInternalGlobalShortcut(settings))
          .catch(() => setInternalGlobalShortcutError(t.settings.shortcutUnavailable))
          .finally(() => setInternalGlobalShortcutLoaded(true));
      }
    }
    if (propInstancePreferences === undefined) {
      if (!isTauriDesktop()) {
        setInternalInstancePreferencesLoaded(true);
      } else {
        void invoke<InstancePreferencesState>('get_instance_preferences')
          .then(saved => {
            setInternalInstancePreferences(saved);
            setInternalInstancePreferencesSupported(saved.supported ?? true);
          })
          .catch(() => setInternalInstancePreferencesError(t.settings.instancePreferencesUnavailable))
          .finally(() => setInternalInstancePreferencesLoaded(true));
      }
    }
  }, [isOpen, propGlobalShortcut, propInstancePreferences, t.settings.shortcutUnavailable, t.settings.instancePreferencesUnavailable]);

  const globalShortcut = propGlobalShortcut ?? internalGlobalShortcut;
  const globalShortcutLoaded = propGlobalShortcutLoaded ?? internalGlobalShortcutLoaded;
  const globalShortcutSupported = propGlobalShortcutSupported ?? internalGlobalShortcutSupported;
  const globalShortcutError = propGlobalShortcutError ?? internalGlobalShortcutError;

  const instancePreferences = propInstancePreferences ?? internalInstancePreferences;
  const instancePreferencesLoaded = propInstancePreferencesLoaded ?? internalInstancePreferencesLoaded;
  const instancePreferencesSupported = propInstancePreferencesSupported ?? internalInstancePreferencesSupported;
  const instancePreferencesError = propInstancePreferencesError ?? internalInstancePreferencesError;

  const handleGlobalShortcutChange = async (settings: Pick<GlobalShortcutSettingsState, 'enabled' | 'shortcut'>) => {
    if (propOnGlobalShortcutChange) {
      await propOnGlobalShortcutChange(settings);
      return;
    }
    if (!isTauriDesktop()) {
      setInternalGlobalShortcutError(t.settings.shortcutDesktopOnly);
      return;
    }
    setInternalGlobalShortcutError(null);
    try {
      const saved = await invoke<GlobalShortcutSettingsState>('set_global_shortcut_settings', settings);
      setInternalGlobalShortcut(saved);
    } catch {
      setInternalGlobalShortcutError(t.settings.shortcutRegisterError);
      throw new Error(t.settings.shortcutRegisterError);
    }
  };

  const handleInstancePreferencesChange = async (allowMultipleInstances: boolean) => {
    if (propOnInstancePreferencesChange) {
      await propOnInstancePreferencesChange(allowMultipleInstances);
      return;
    }
    if (!isTauriDesktop()) {
      setInternalInstancePreferencesError(t.settings.instancePreferencesDesktopOnly);
      return;
    }
    setInternalInstancePreferencesError(null);
    try {
      const saved = await invoke<InstancePreferencesState>('set_instance_preferences', { allowMultipleInstances });
      setInternalInstancePreferences(saved);
      setInternalInstancePreferencesSupported(saved.supported ?? true);
    } catch {
      setInternalInstancePreferencesError(t.settings.instancePreferencesSaveError);
      throw new Error(t.settings.instancePreferencesSaveError);
    }
  };

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
      void handleGlobalShortcutChange({ enabled: globalShortcut.enabled, shortcut }).catch(() => {});
    };

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', handleShortcutKeyDown, true);
  }, [isOpen, isRecordingShortcut, globalShortcut.enabled, handleGlobalShortcutChange, t.settings.shortcutNeedsModifier]);

  useEffect(() => {
    if (!isOpen) {
      setIsRecordingShortcut(false);
      setSettingsSearch('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const focusSettingsSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'f') return;
      const activeElement = document.activeElement;
      if ((activeElement instanceof HTMLInputElement && activeElement.type !== 'search' && activeElement !== searchInputRef.current) || activeElement instanceof HTMLTextAreaElement || (activeElement instanceof HTMLElement && activeElement.isContentEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', focusSettingsSearch, true);
    return () => window.removeEventListener('keydown', focusSettingsSearch, true);
  }, [isOpen]);

  useLayoutEffect(() => {
    const panel = contentRef.current;
    if (!isOpen || !panel) return;
    const sections = Array.from(panel.querySelectorAll<HTMLElement>('[data-settings-tab-content]'));
    const tokens = normalizeSettingsSearch(settingsSearch).split(' ').filter(Boolean);
    const visibleSections: Array<{ element: HTMLElement; tab: SettingsTab; hasMatches: boolean }> = [];
    let count = 0;

    sections.forEach(section => {
      const tabName = section.dataset.settingsTabContent as SettingsTab | undefined;
      if (!tabName || !settingsTabs.includes(tabName)) return;
      const marked = Array.from(section.querySelectorAll<HTMLElement>('[data-settings-search-unit]'));
      marked.forEach(unit => unit.removeAttribute('data-settings-search-hidden'));
      const units = marked.filter(unit => !marked.some(other => other !== unit && other.contains(unit)));
      const matchingUnits = new Set<HTMLElement>();

      units.forEach(unit => {
        let group = unit;
        while (group.parentElement && group.parentElement !== section) group = group.parentElement;
        const heading = group === unit ? '' : group.querySelector<HTMLElement>('[class*="uppercase"]')?.textContent ?? '';
        const accessibleLabels = Array.from(unit.querySelectorAll<HTMLElement>('[aria-label]'), control => control.getAttribute('aria-label') ?? '');
        const corpus = normalizeSettingsSearch([settingsTabLabels[tabName], heading, unit.textContent, ...accessibleLabels].join(' '));
        const matches = searchActive && tokens.length > 0 && tokens.every(token => corpus.includes(token));
        unit.toggleAttribute('data-settings-search-hidden', searchActive && !matches);
        if (matches) {
          matchingUnits.add(unit);
          count += 1;
        }
      });

      Array.from(section.children).forEach(child => {
        if (child instanceof HTMLElement) {
          child.toggleAttribute('data-settings-search-hidden', searchActive && !units.some(unit => matchingUnits.has(unit) && child.contains(unit)));
        }
      });
      const hasMatches = matchingUnits.size > 0;
      section.toggleAttribute('data-settings-search-hidden', searchActive && !hasMatches);
      section.setAttribute('data-settings-search-category', settingsTabLabels[tabName]);
      section.removeAttribute('data-settings-search-show-category');
      visibleSections.push({ element: section, tab: tabName, hasMatches });
    });

    const shownTabs = new Set<SettingsTab>();
    visibleSections.forEach(({ element, tab: tabName, hasMatches }) => {
      if (searchActive && hasMatches && !shownTabs.has(tabName)) {
        element.setAttribute('data-settings-search-show-category', '');
        shownTabs.add(tabName);
      }
    });
    setSearchResultCount(previous => previous === count ? previous : count);
  });

  if (!isOpen) return null;

  const themeCopy = {
    cyberfiles: t.settings.cyberfiles,
    gray: t.settings.gray,
    light: t.settings.light,
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-end bg-black/70 backdrop-blur-sm" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="cyberfiles-settings-panel flex h-full w-full max-w-[720px] flex-col overflow-hidden border-l border-neutral-700 bg-neutral-900 shadow-2xl"
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

        <div className="border-b border-neutral-800 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
            <input
              ref={searchInputRef}
              id="settings-search"
              type="search"
              aria-label={t.settings.searchPlaceholder}
              aria-controls="settings-tab-panel"
              autoComplete="off"
              spellCheck={false}
              value={settingsSearch}
              onChange={event => {
                setSettingsSearch(event.target.value);
                contentRef.current?.scrollTo({ top: 0 });
              }}
              onKeyDown={event => {
                if (event.key === 'Escape' && settingsSearch.trim()) {
                  event.preventDefault();
                  event.stopPropagation();
                  setSettingsSearch('');
                  contentRef.current?.scrollTo({ top: 0 });
                }
              }}
              placeholder={t.settings.searchPlaceholder}
              className="cyberfiles-settings-search h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950/80 py-2 pl-10 pr-36 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition-colors focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/40"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {searchActive && (
                <button type="button" aria-label={t.settings.searchClear} onClick={() => { setSettingsSearch(''); contentRef.current?.scrollTo({ top: 0 }); searchInputRef.current?.focus(); }} className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {searchActive ? (
                <span role="status" aria-live="polite" className="whitespace-nowrap text-[10px] font-medium text-neutral-400">
                  {searchResultCount === 1 ? t.settings.searchResultCount : t.settings.searchResultsCount.replace('{count}', String(searchResultCount))}
                </span>
              ) : <kbd className="keyboard-hint text-neutral-500">Ctrl+F</kbd>}
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className={searchActive ? 'hidden' : 'shrink-0 border-b border-neutral-800 bg-neutral-950/55 p-2.5 sm:flex sm:w-40 sm:flex-col sm:border-b-0 sm:border-r'}>
            <div role="tablist" aria-label={t.settings.title} className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-y-auto">
              {([
                { id: 'general', label: t.settings.generalTab, icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
                { id: 'appearance', label: t.settings.appearance, icon: <Palette className="h-3.5 w-3.5" /> },
                { id: 'navigation', label: t.settings.navigationTab, icon: <Compass className="h-3.5 w-3.5" /> },
                { id: 'folders', label: t.settings.foldersTab, icon: <FolderOpen className="h-3.5 w-3.5" /> },
                { id: 'shortcuts', label: t.settings.shortcutsTab, icon: <Keyboard className="h-3.5 w-3.5" /> },
              ] as const).map(item => (
                <button
                  key={item.id}
                  id={'settings-tab-' + item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls="settings-tab-panel"
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => selectTab(item.id)}
                  onKeyDown={event => {
                    const currentIndex = settingsTabs.indexOf(item.id);
                    const nextIndex = event.key === 'Home' ? 0
                      : event.key === 'End' ? settingsTabs.length - 1
                        : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (currentIndex + 1) % settingsTabs.length
                          : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (currentIndex - 1 + settingsTabs.length) % settingsTabs.length
                            : -1;
                    if (nextIndex < 0) return;
                    event.preventDefault();
                    selectTab(settingsTabs[nextIndex]);
                    document.getElementById('settings-tab-' + settingsTabs[nextIndex])?.focus();
                  }}
                  className={'flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors sm:w-full ' + (tab === item.id ? 'border-cyan-600/60 bg-cyan-950/45 text-cyan-200' : 'border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100')}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </aside>
          <div id="settings-tab-panel" ref={contentRef} role={searchActive ? 'region' : 'tabpanel'} aria-label={searchActive ? t.settings.searchPlaceholder : undefined} aria-labelledby={searchActive ? undefined : 'settings-tab-' + tab} tabIndex={0} className={'min-h-0 min-w-0 flex-1 overflow-y-auto p-5 ' + (searchActive ? 'cyberfiles-settings-search-mode flex flex-col gap-4' : 'space-y-3')}>
            {searchActive && searchResultCount === 0 && (
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-8 text-center text-sm text-neutral-400">{t.settings.searchNoResults}</div>
            )}
          <div data-settings-tab-content="appearance" hidden={!searchActive && tab !== 'appearance'} className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t.settings.appearance}</div>
          <div data-settings-search-unit role="radiogroup" aria-label={t.settings.appearance} className="grid gap-2.5 sm:grid-cols-3">
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

          </div>
          <div data-settings-tab-content="general" hidden={!searchActive && tab !== 'general'} className="space-y-3">
          <div data-settings-search-unit className="border-t border-neutral-800 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t.settings.language}</div>
            <div className="mt-2 inline-flex rounded-lg border border-neutral-700 bg-neutral-950/60 p-1">
              <button onClick={() => setLanguage('es')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${language === 'es' ? 'bg-cyan-950 text-cyan-200' : 'text-neutral-400 hover:text-neutral-100'}`}>{t.settings.spanish}</button>
              <button onClick={() => setLanguage('en')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${language === 'en' ? 'bg-cyan-950 text-cyan-200' : 'text-neutral-400 hover:text-neutral-100'}`}>{t.settings.english}</button>
            </div>
          </div>

          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3">
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

          <div data-settings-search-unit className="border-t border-neutral-800 pt-4">
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

          </div>
          <div data-settings-tab-content="appearance" hidden={!searchActive && tab !== 'appearance'} className="space-y-3">
          <div className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.interfaceSection}</div>
            <div className="space-y-2">
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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
            </div>
          </div>
          </div>
          <div data-settings-tab-content="shortcuts" hidden={!searchActive && tab !== 'shortcuts'} className="space-y-3">
          <div data-settings-search-unit className="border-t border-neutral-800 pt-4">
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
                onChange={event => void handleGlobalShortcutChange({ enabled: event.target.checked, shortcut: globalShortcut.shortcut }).catch(() => {})}
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
                  void handleGlobalShortcutChange({ enabled: true, shortcut: 'Alt+Shift+F' }).catch(() => {});
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

          </div>
          <div data-settings-tab-content="general" hidden={!searchActive && tab !== 'general'} className="space-y-3">
          <div data-settings-search-unit className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.instancesSection}</div>
            <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
              <label className={`flex items-center gap-2 ${instancePreferencesSupported ? 'cursor-pointer text-neutral-200' : 'text-neutral-500'}`}>
                  <input
                    type="checkbox"
                    checked={instancePreferences.allowMultipleInstances}
                    disabled={!instancePreferencesLoaded || !instancePreferencesSupported}
                    onChange={event => void handleInstancePreferencesChange(event.target.checked).catch(() => {})}
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

          </div>
          <div data-settings-tab-content="navigation" hidden={!searchActive && tab !== 'navigation'} className="space-y-3">
          <div ref={tabSettingsRef} className="border-t border-neutral-800 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{t.settings.navigationSection}</div>
            <div className="space-y-2">
              <fieldset data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-xs text-neutral-400">
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
              <fieldset data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-xs text-neutral-400">
                <legend className="px-1 font-medium text-neutral-200">{t.settings.tabDragHoverTitle}</legend>
                <label className="flex cursor-pointer items-center gap-2 text-neutral-200">
                  <input
                    type="checkbox"
                    checked={tabSizePreferences.dragHoverActivationEnabled}
                    onChange={event => onTabSizePreferencesChange({ ...tabSizePreferences, dragHoverActivationEnabled: event.target.checked })}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  <span>{t.settings.tabDragHoverEnabled}</span>
                </label>
                <p className="mt-1 pl-6 leading-relaxed">{t.settings.tabDragHoverDescription}</p>
                <label className={`mt-3 flex flex-wrap items-center gap-2 pl-6 ${tabSizePreferences.dragHoverActivationEnabled ? 'text-neutral-300' : 'text-neutral-500'}`}>
                  <span>{t.settings.tabDragHoverDelay}</span>
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    step={20}
                    disabled={!tabSizePreferences.dragHoverActivationEnabled}
                    value={tabSizePreferences.dragHoverActivationDelay}
                    onChange={event => onTabSizePreferencesChange({
                      ...tabSizePreferences,
                      dragHoverActivationDelay: Math.min(3000, Math.max(100, event.currentTarget.valueAsNumber || 100)),
                    })}
                    className="w-24 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 focus:border-cyan-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span>{t.settings.milliseconds}</span>
                </label>
              </fieldset>
              <fieldset data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-xs text-neutral-400">
                <legend className="px-1 font-medium text-neutral-200">{t.settings.tabSizing}</legend>
                <p className="mb-3 leading-relaxed">{t.settings.tabSizingDescription}</p>

                <div className="font-medium text-cyan-200">{t.settings.horizontalTabs}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['automatic', 'fixed'] as TabWidthMode[]).map(mode => (
                    <label key={mode} className={tabSizePreferences.horizontalMode === mode ? 'flex cursor-pointer items-center gap-2 rounded-md border border-cyan-700 bg-cyan-950/45 px-3 py-2 text-cyan-100' : 'flex cursor-pointer items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-neutral-300'}>
                      <input type="radio" name="horizontal-tab-width-mode" checked={tabSizePreferences.horizontalMode === mode} onChange={() => onTabSizePreferencesChange({ ...tabSizePreferences, horizontalMode: mode })} className="h-4 w-4 accent-cyan-400" />
                      <span>{mode === 'automatic' ? t.settings.tabWidthAutomatic : t.settings.tabWidthFixed}</span>
                    </label>
                  ))}
                </div>

                {tabSizePreferences.horizontalMode === 'automatic' && (
                  <div className="mt-3 space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-neutral-300">
                      <input type="checkbox" checked={tabSizePreferences.horizontalEqualWidth} onChange={event => onTabSizePreferencesChange({ ...tabSizePreferences, horizontalEqualWidth: event.target.checked })} className="h-4 w-4 accent-cyan-400" />
                      <span>{t.settings.tabEqualWidth}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-neutral-300">
                      <input type="checkbox" checked={tabSizePreferences.horizontalShrinkToFit} onChange={event => onTabSizePreferencesChange({ ...tabSizePreferences, horizontalShrinkToFit: event.target.checked })} className="h-4 w-4 accent-cyan-400" />
                      <span>{t.settings.tabShrinkToFit}</span>
                    </label>
                  </div>
                )}

                <div className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 ${tabSizePreferences.horizontalMode === 'automatic' && !tabSizePreferences.horizontalShrinkToFit ? 'opacity-45' : ''}`}>
                  {tabSizePreferences.horizontalMode === 'fixed' ? (
                    <label className="text-neutral-300">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.settings.tabFixedWidth}</span>
                      <span className="flex items-center gap-2">
                        <input type="number" min={80} max={360} value={tabSizePreferences.horizontalFixedWidth} onChange={event => onTabSizePreferencesChange({ ...tabSizePreferences, horizontalFixedWidth: Math.min(360, Math.max(80, event.currentTarget.valueAsNumber || 80)) })} className="w-24 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 focus:border-cyan-600 focus:outline-none" />
                        <span>{t.settings.pixels}</span>
                      </span>
                    </label>
                  ) : (
                    <>
                      <label className="text-neutral-300">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.settings.tabMinimumWidth}</span>
                        <span className="flex items-center gap-2">
                          <input type="number" min={80} max={240} disabled={!tabSizePreferences.horizontalShrinkToFit} value={tabSizePreferences.horizontalMinWidth} onChange={event => { const value = Math.min(240, Math.max(80, event.currentTarget.valueAsNumber || 80)); onTabSizePreferencesChange({ ...tabSizePreferences, horizontalMinWidth: value, horizontalMaxWidth: Math.max(value, tabSizePreferences.horizontalMaxWidth) }); }} className="w-24 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 focus:border-cyan-600 focus:outline-none disabled:cursor-not-allowed" />
                          <span>{t.settings.pixels}</span>
                        </span>
                      </label>
                      <label className="text-neutral-300">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.settings.tabMaximumWidth}</span>
                        <span className="flex items-center gap-2">
                          <input type="number" min={80} max={360} disabled={!tabSizePreferences.horizontalShrinkToFit} value={tabSizePreferences.horizontalMaxWidth} onChange={event => { const value = Math.min(360, Math.max(80, event.currentTarget.valueAsNumber || 80)); onTabSizePreferencesChange({ ...tabSizePreferences, horizontalMaxWidth: value, horizontalMinWidth: Math.min(value, tabSizePreferences.horizontalMinWidth) }); }} className="w-24 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 focus:border-cyan-600 focus:outline-none disabled:cursor-not-allowed" />
                          <span>{t.settings.pixels}</span>
                        </span>
                      </label>
                    </>
                  )}
                </div>

                {displayScale !== 1 && (
                  <p className={`mt-2 text-[10px] leading-relaxed text-neutral-500 ${tabSizePreferences.horizontalMode === 'automatic' && !tabSizePreferences.horizontalShrinkToFit ? 'opacity-45' : ''}`}>
                    {t.settings.tabPixelScaleNote
                      .replace('{scale}', String(Math.round(displayScale * 100)))
                      .replace('{value}', String(tabSizePreferences.horizontalMode === 'fixed' ? tabSizePreferences.horizontalFixedWidth : tabSizePreferences.horizontalMaxWidth))
                      .replace('{physical}', String(Math.round((tabSizePreferences.horizontalMode === 'fixed' ? tabSizePreferences.horizontalFixedWidth : tabSizePreferences.horizontalMaxWidth) * displayScale)))}
                  </p>
                )}

                <div className="mt-4 border-t border-neutral-800 pt-3">
                  <div className="font-medium text-cyan-200">{t.settings.verticalTabs}</div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    {(['automatic', 'fixed'] as TabWidthMode[]).map(mode => (
                      <label key={mode} className={tabSizePreferences.verticalMode === mode ? 'flex cursor-pointer items-center gap-2 rounded-md border border-cyan-700 bg-cyan-950/45 px-3 py-2 text-cyan-100' : 'flex cursor-pointer items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-neutral-300'}>
                        <input type="radio" name="vertical-tab-width-mode" checked={tabSizePreferences.verticalMode === mode} onChange={() => onTabSizePreferencesChange({ ...tabSizePreferences, verticalMode: mode })} className="h-4 w-4 accent-cyan-400" />
                        <span>{mode === 'automatic' ? t.settings.tabWidthAutomatic : t.settings.tabWidthFixed}</span>
                      </label>
                    ))}
                    {tabSizePreferences.verticalMode === 'fixed' && (
                      <label className="ml-1 text-neutral-300">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.settings.tabVerticalWidth}</span>
                        <span className="flex items-center gap-2">
                          <input type="number" min={100} max={360} value={tabSizePreferences.verticalWidth} onChange={event => onTabSizePreferencesChange({ ...tabSizePreferences, verticalWidth: Math.min(360, Math.max(100, event.currentTarget.valueAsNumber || 100)) })} className="w-24 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 focus:border-cyan-600 focus:outline-none" />
                          <span>{t.settings.pixels}</span>
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </fieldset>
              <fieldset data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
                <legend className="px-1 font-medium text-neutral-200">{t.settings.tabCloseButtonMode}</legend>
                <p className="mb-2 leading-relaxed">{t.settings.tabCloseButtonModeDescription}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(['hover', 'active', 'always'] as TabCloseButtonMode[]).map(mode => (
                    <label
                      key={mode}
                      className={tabCloseButtonMode === mode
                        ? 'flex cursor-pointer items-center gap-2 rounded-md border border-cyan-700 bg-cyan-950/45 px-3 py-2 text-cyan-100 text-xs'
                        : 'flex cursor-pointer items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-neutral-300 text-xs transition-colors hover:border-neutral-600'}
                    >
                      <input
                        type="radio"
                        name="tab-close-button-mode"
                        value={mode}
                        checked={tabCloseButtonMode === mode}
                        onChange={() => onTabCloseButtonModeChange(mode)}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      <span>
                        {mode === 'hover' ? t.settings.tabCloseButtonHover : mode === 'active' ? t.settings.tabCloseButtonActive : t.settings.tabCloseButtonAlways}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {renderNewTabActionSetting(
                t.settings.showNewTabButton,
                t.settings.showNewTabButtonDescription,
                showNewTabButton,
                onShowNewTabButtonChange,
                newTabButtonAction,
                onNewTabButtonActionChange,
              )}
              {renderNewTabActionSetting(
                t.settings.doubleClickTabBar,
                t.settings.doubleClickTabBarDescription,
                doubleClickTabBar,
                onDoubleClickTabBarChange,
                doubleClickTabAction,
                onDoubleClickTabActionChange,
              )}
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-xs leading-relaxed text-neutral-400">
                <div className="font-medium text-neutral-200">{t.settings.defaultNewTabFolder}</div>
                <p className="mt-1 text-neutral-500">{t.settings.defaultNewTabFolderDescription}</p>
                {renderNewTabPathPicker(defaultNewTabPath, onDefaultNewTabPathChange, t.settings.defaultNewTabFolderThisPc)}
                {defaultNewTabPath && (
                  <button
                    type="button"
                    onClick={() => onDefaultNewTabPathChange('')}
                    className="mt-2 text-[11px] font-medium text-cyan-300 transition-colors hover:text-cyan-100"
                  >
                    {t.settings.defaultNewTabFolderReset}
                  </button>
                )}
              </div>
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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
              <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          </div>
          <div data-settings-tab-content="shortcuts" hidden={!searchActive && tab !== 'shortcuts'} className="space-y-3">
          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          </div>
          <div data-settings-tab-content="appearance" hidden={!searchActive && tab !== 'appearance'} className="space-y-3">
          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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
          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          </div>
          <div data-settings-tab-content="folders" hidden={!searchActive && tab !== 'folders'} className="space-y-3">
          <div data-settings-search-unit className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
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

          <section data-settings-search-unit aria-labelledby="saved-folder-styles-heading" className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 id="saved-folder-styles-heading" className="text-xs font-semibold text-neutral-100">{t.settings.savedFolderStylesTitle}</h3>
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400">{savedStyleEntries.length}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{t.settings.savedFolderStylesDescription}</p>
            {savedStyleEntries.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-neutral-700 px-3 py-4 text-xs leading-relaxed text-neutral-400">{t.settings.savedFolderStylesEmpty}</p>
            ) : (
              <div className="mt-3 space-y-3">
                {savedStyleEntries.map(([key, savedStyle]) => {
                  const draft = folderStyleDrafts[key] ?? savedStyle;
                  const displayPath = savedStyle.displayPath ?? key;
                  const folderName = displayPath.split(/[\\/]/).filter(Boolean).at(-1) ?? displayPath;
                  const isDirty = draft.viewMode !== savedStyle.viewMode || draft.sortField !== savedStyle.sortField
                    || draft.sortOrder !== savedStyle.sortOrder || draft.groupBy !== savedStyle.groupBy;
                  return (
                    <div key={key} className="rounded-lg border border-neutral-700/70 bg-neutral-900/70 p-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-100">{folderName}</div>
                          <div className="mt-0.5 break-all font-mono text-[10px] text-neutral-400">{displayPath}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="text-[10px] font-medium text-neutral-400">
                          {t.settings.savedFolderStyleView}
                          <select value={draft.viewMode} onChange={event => updateFolderStyleDraft(key, { viewMode: event.target.value as ViewMode })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200">
                            <option value="details">{t.toolbar.viewDetails}</option>
                            <option value="compact">{t.toolbar.viewCompact}</option>
                            <option value="icons">{t.toolbar.viewIcons}</option>
                          </select>
                        </label>
                        <label className="text-[10px] font-medium text-neutral-400">
                          {t.settings.savedFolderStyleSort}
                          <select value={draft.sortField} onChange={event => updateFolderStyleDraft(key, { sortField: event.target.value as SortField })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200">
                            {([
                              ['name', t.pane.columns.name],
                              ['modifiedDate', t.pane.columns.modified],
                              ['createdDate', t.pane.columns.created],
                              ['type', t.pane.columns.type],
                              ['size', t.pane.columns.size],
                              ['extension', t.pane.columns.extension],
                            ] as const).map(([field, label]) => <option key={field} value={field}>{label}</option>)}
                          </select>
                        </label>
                        <label className="text-[10px] font-medium text-neutral-400">
                          {t.settings.savedFolderStyleOrder}
                          <select value={draft.sortOrder} onChange={event => updateFolderStyleDraft(key, { sortOrder: event.target.value as SortOrder })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200">
                            <option value="asc">{t.contextMenu.ascending}</option>
                            <option value="desc">{t.contextMenu.descending}</option>
                          </select>
                        </label>
                        <label className="text-[10px] font-medium text-neutral-400">
                          {t.settings.savedFolderStyleGroup}
                          <select value={draft.groupBy} onChange={event => updateFolderStyleDraft(key, { groupBy: event.target.value as GroupByField })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200">
                            <option value="none">{t.contextMenu.groupNone}</option>
                            <option value="name">{t.pane.columns.name}</option>
                            <option value="modifiedDate">{t.pane.columns.modified}</option>
                            <option value="type">{t.pane.columns.type}</option>
                            <option value="size">{t.pane.columns.size}</option>
                          </select>
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-3">
                        {isDirty && <button type="button" onClick={() => clearFolderStyleDraft(key)} className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800">{t.settings.savedFolderStyleDiscard}</button>}
                        <button type="button" disabled={!isDirty} onClick={() => { if (onSavedFolderStyleChange(displayPath, draft)) clearFolderStyleDraft(key); }} className="rounded-md border border-cyan-700/70 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] text-cyan-200 hover:bg-cyan-950/70 disabled:cursor-not-allowed disabled:opacity-40">{t.settings.savedFolderStyleSave}</button>
                        <button type="button" onClick={() => { if (onSavedFolderStyleRemove(displayPath)) clearFolderStyleDraft(key); }} className="inline-flex items-center gap-1 rounded-md border border-rose-900/70 px-2.5 py-1.5 text-[11px] text-rose-300 hover:bg-rose-950/40"><Trash2 className="h-3 w-3" />{t.settings.savedFolderStyleRemove}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          </div>
          <div data-settings-tab-content="general" hidden={!searchActive && tab !== 'general'} className="space-y-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs leading-relaxed text-neutral-400">
            {t.settings.persistenceNote}
          </div>
          </div>
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
