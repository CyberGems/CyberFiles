import { githubStarLabels } from '../useGitHubStar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowRight,
  BookOpen,
  Bug,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FolderOpen,
  Gem,
  Globe,
  HardDrive,
  Heart,
  HelpCircle,
  Info,
  Network,
  Power,
  ScrollText,
  Settings,
  Star,
} from 'lucide-react';
import { translations, type Language } from '../locales/translations';
import { NETWORK_PATH, RECENT_PATH, SYSTEM_HOME_PATH } from '../types';
import { CYBERFILES_REPO, CYBERGEMS_APPS, CYBERGEMS_SITE, SUITE_APPS } from './suiteApps';
import './tray.css';

type TrayFlyoutId = 'quick' | 'help' | 'suite';
type TrayWindowState = 'visible' | 'minimized' | 'hidden';
type TrayFlyoutSide = 'left' | 'right';
type TrayVerticalAlign = 'bottom' | 'top';

interface TrayMenuSnapshot {
  windowState: TrayWindowState;
  hotkey: string | null;
  english: boolean;
  version: string;
  flyoutSide?: TrayFlyoutSide;
  verticalAlign?: TrayVerticalAlign;
}

interface TrayFolderShortcut {
  name: string;
  path: string;
}

const FLYOUT_EXTRA_LOGICAL_WIDTH = 264; // 260px flyout card + 4px gap
const CUSTOM_QUICK_ACCESS_KEY = 'cyberfiles_custom_quick_access_v1';
const RECENT_FOLDER_PATHS_KEY = 'cyberfiles_recent_folder_paths_v1';

const INITIAL_SNAPSHOT: TrayMenuSnapshot = {
  windowState: 'hidden',
  hotkey: null,
  english: false,
  version: __APP_VERSION__,
  flyoutSide: 'left',
  verticalAlign: 'bottom',
};

const HELP_URLS = {
  docs: `${CYBERFILES_REPO}/wiki`,
  faq: `${CYBERFILES_REPO}/wiki#faq`,
  changelog: `${CYBERFILES_REPO}/releases`,
  website: CYBERGEMS_SITE,
  donate: `${CYBERFILES_REPO}#%EF%B8%8F-donate`,
  issues: `${CYBERFILES_REPO}/issues`,
};

function folderLeafName(rawPath: string): string {
  const trimmed = rawPath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || rawPath;
}

function readPinnedQuickAccess(): TrayFolderShortcut[] {
  try {
    const raw = localStorage.getItem(CUSTOM_QUICK_ACCESS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: TrayFolderShortcut[] = [];
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string') {
        const path = (item as { path: string }).path.trim();
        if (!path || path.startsWith('::')) continue;
        const name = typeof (item as { name?: unknown }).name === 'string' && (item as { name: string }).name.trim()
          ? (item as { name: string }).name.trim()
          : folderLeafName(path);
        result.push({ name, path });
      }
    }
    return result.slice(0, 8);
  } catch {
    return [];
  }
}

function readRecentFolderShortcuts(pinnedPaths: Set<string>): TrayFolderShortcut[] {
  try {
    const raw = localStorage.getItem(RECENT_FOLDER_PATHS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: TrayFolderShortcut[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const path = entry.trim();
      if (!path || path.startsWith('::')) continue;
      const key = path.replace(/[\\/]+$/, '').toLowerCase();
      if (pinnedPaths.has(key)) continue;
      result.push({ name: folderLeafName(path), path });
      if (result.length >= 6) break;
    }
    return result;
  } catch {
    return [];
  }
}

/** The tray window shares localStorage with the main window, so the language
 * and theme stored there are always current when the menu opens. */
function readLanguage(fallbackEnglish: boolean): Language {
  try {
    const saved = localStorage.getItem('cyberfiles_lang');
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // Ignore storage failures and fall back to the backend value.
  }
  return fallbackEnglish ? 'en' : 'es';
}

function readTheme() {
  try {
    const saved = localStorage.getItem('cyberfiles_theme');
    if (saved === 'cyberfiles' || saved === 'gray' || saved === 'light') return saved;
  } catch {
    // Ignore storage failures and use the default theme.
  }
  return 'cyberfiles';
}

export function TrayMenu() {
  const [snapshot, setSnapshot] = useState<TrayMenuSnapshot>(INITIAL_SNAPSHOT);
  const [stageVisible, setStageVisible] = useState(false);
  const [language, setLanguage] = useState<Language>('es');
  const [activeFlyout, setActiveFlyout] = useState<TrayFlyoutId | null>(null);
  const [pinnedFolders, setPinnedFolders] = useState<TrayFolderShortcut[]>([]);
  const [recentFolders, setRecentFolders] = useState<TrayFolderShortcut[]>([]);
  const activeFlyoutRef = useRef<TrayFlyoutId | null>(null);
  activeFlyoutRef.current = activeFlyout;
  const stageVisibleRef = useRef(false);
  stageVisibleRef.current = stageVisible;

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const quickFlyoutRef = useRef<HTMLDivElement>(null);
  const helpFlyoutRef = useRef<HTMLDivElement>(null);
  const suiteFlyoutRef = useRef<HTMLDivElement>(null);
  const quickTriggerRef = useRef<HTMLButtonElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const suiteTriggerRef = useRef<HTMLButtonElement>(null);
  const lastReportedSizesRef = useRef<{ mainW: number; mainH: number; canvasH: number } | null>(null);
  const flyoutTimersRef = useRef<{ open: number | null; close: number | null }>({ open: null, close: null });
  const reportSeqRef = useRef(0);
  const reportTimersRef = useRef<{ raf1: number | null; raf2: number | null; fallback: number | null }>({
    raf1: null,
    raf2: null,
    fallback: null,
  });

  const t = translations[language].trayMenu;
  const isVisible = snapshot.windowState === 'visible';
  const flyoutSide: TrayFlyoutSide = snapshot.flyoutSide === 'right' ? 'right' : 'left';
  const verticalAlign: TrayVerticalAlign = snapshot.verticalAlign === 'top' ? 'top' : 'bottom';
  const statusLabel = snapshot.windowState === 'visible'
    ? t.statusVisible
    : snapshot.windowState === 'minimized'
      ? t.statusMinimized
      : t.statusHidden;
  const statusTone = snapshot.windowState === 'visible'
    ? ''
    : snapshot.windowState === 'minimized'
      ? 'is-minimized'
      : 'is-hidden';

  const cancelFlyoutTimers = useCallback(() => {
    if (flyoutTimersRef.current.open !== null) window.clearTimeout(flyoutTimersRef.current.open);
    if (flyoutTimersRef.current.close !== null) window.clearTimeout(flyoutTimersRef.current.close);
    flyoutTimersRef.current = { open: null, close: null };
  }, []);

  const scheduleFlyoutOpen = useCallback((target: TrayFlyoutId) => {
    cancelFlyoutTimers();
    if (activeFlyoutRef.current === target) return;
    const delay = activeFlyoutRef.current !== null ? 60 : 120;
    flyoutTimersRef.current.open = window.setTimeout(() => {
      flyoutTimersRef.current.open = null;
      setActiveFlyout(target);
    }, delay);
  }, [cancelFlyoutTimers]);

  const scheduleFlyoutClose = useCallback(() => {
    cancelFlyoutTimers();
    if (activeFlyoutRef.current === null) return;
    flyoutTimersRef.current.close = window.setTimeout(() => {
      flyoutTimersRef.current.close = null;
      setActiveFlyout(null);
    }, 220);
  }, [cancelFlyoutTimers]);

  const getFlyoutElement = (target: TrayFlyoutId | null) => {
    if (target === 'quick') return quickFlyoutRef.current;
    if (target === 'help') return helpFlyoutRef.current;
    if (target === 'suite') return suiteFlyoutRef.current;
    return null;
  };

  const openFlyoutAndFocusFirst = useCallback((target: TrayFlyoutId) => {
    cancelFlyoutTimers();
    setActiveFlyout(target);
    window.requestAnimationFrame(() => {
      getFlyoutElement(target)?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    });
  }, [cancelFlyoutTimers]);

  const closeFlyoutAndReturnFocus = useCallback(() => {
    const previous = activeFlyoutRef.current;
    cancelFlyoutTimers();
    setActiveFlyout(null);
    if (previous === 'quick') quickTriggerRef.current?.focus();
    else if (previous === 'help') helpTriggerRef.current?.focus();
    else if (previous === 'suite') suiteTriggerRef.current?.focus();
  }, [cancelFlyoutTimers]);

  const measureElementLogicalBox = (element: HTMLElement | null) => {
    if (!element) return null;
    const borderY = element.offsetHeight - element.clientHeight;
    const width = Math.ceil(element.offsetWidth + 40);
    const height = Math.ceil(element.scrollHeight + borderY + 44);
    if (width < 10 || height < 10) return null;
    return { width, height };
  };

  const reportSizes = useCallback((force = false) => {
    const mainBox = measureElementLogicalBox(cardRef.current);
    if (!mainBox) return;
    const quickBox = measureElementLogicalBox(quickFlyoutRef.current);
    const helpBox = measureElementLogicalBox(helpFlyoutRef.current);
    const suiteBox = measureElementLogicalBox(suiteFlyoutRef.current);
    const canvasH = Math.max(mainBox.height, quickBox?.height ?? 0, helpBox?.height ?? 0, suiteBox?.height ?? 0);

    const prev = lastReportedSizesRef.current;
    if (!force && prev && prev.mainW === mainBox.width && prev.mainH === mainBox.height && prev.canvasH === canvasH) {
      return;
    }
    lastReportedSizesRef.current = { mainW: mainBox.width, mainH: mainBox.height, canvasH };
    void invoke('tray_menu_ready', { width: mainBox.width, height: mainBox.height, view: 'main' }).catch(() => {});
    void invoke('tray_menu_ready', { width: FLYOUT_EXTRA_LOGICAL_WIDTH, height: canvasH, view: 'canvas' }).catch(() => {});
  }, []);

  const cancelPendingReport = useCallback(() => {
    const timers = reportTimersRef.current;
    if (timers.raf1 !== null) window.cancelAnimationFrame(timers.raf1);
    if (timers.raf2 !== null) window.cancelAnimationFrame(timers.raf2);
    if (timers.fallback !== null) window.clearTimeout(timers.fallback);
    reportTimersRef.current = { raf1: null, raf2: null, fallback: null };
  }, []);

  const schedulePaintedReport = useCallback((force = false) => {
    cancelPendingReport();
    const seq = ++reportSeqRef.current;
    let sent = false;
    const fire = () => {
      if (sent || seq !== reportSeqRef.current) return;
      sent = true;
      cancelPendingReport();
      reportSizes(force);
    };
    if (stageRef.current) void stageRef.current.offsetWidth;
    reportTimersRef.current.fallback = window.setTimeout(fire, 60);
    reportTimersRef.current.raf1 = window.requestAnimationFrame(() => {
      reportTimersRef.current.raf1 = null;
      reportTimersRef.current.raf2 = window.requestAnimationFrame(() => {
        reportTimersRef.current.raf2 = null;
        fire();
      });
    });
  }, [cancelPendingReport, reportSizes]);

  const syncQuickFolders = useCallback(() => {
    const pinned = readPinnedQuickAccess();
    const pinnedSet = new Set(pinned.map(item => item.path.replace(/[\\/]+$/, '').toLowerCase()));
    setPinnedFolders(pinned);
    setRecentFolders(readRecentFolderShortcuts(pinnedSet));
    schedulePaintedReport(false);
  }, [schedulePaintedReport]);

  const refresh = useCallback(async (reveal = false) => {
    document.documentElement.dataset.theme = readTheme();
    cancelFlyoutTimers();
    setActiveFlyout(null);
    const pinned = readPinnedQuickAccess();
    const pinnedSet = new Set(pinned.map(item => item.path.replace(/[\\/]+$/, '').toLowerCase()));
    setPinnedFolders(pinned);
    setRecentFolders(readRecentFolderShortcuts(pinnedSet));
    try {
      const next = await invoke<TrayMenuSnapshot>('get_tray_menu_state');
      setSnapshot(next);
      setLanguage(readLanguage(next.english));
    } catch {
      setLanguage(readLanguage(false));
    }
    if (reveal) {
      setStageVisible(true);
    }
    schedulePaintedReport(reveal);
  }, [cancelFlyoutTimers, schedulePaintedReport]);

  const runAction = (action: string) => {
    cancelFlyoutTimers();
    setActiveFlyout(null);
    void invoke('tray_menu_action', { action }).catch(error => {
      console.error('tray_menu_action failed:', error);
    });
  };

  const openExternal = (url: string) => {
    cancelFlyoutTimers();
    void openUrl(url).catch(error => {
      console.error('openUrl failed:', error);
    });
    window.setTimeout(() => {
      void invoke('hide_tray_menu').catch(() => {});
    }, 250);
  };

  useEffect(() => {
    void refresh(false);
    let cancelled = false;
    let stopListening: (() => void) | undefined;
    let stopHideListening: (() => void) | undefined;
    let stopQuickFoldersListening: (() => void) | undefined;
    let dprMedia: MediaQueryList | null = null;
    const onDprChange = () => {
      if (stageVisibleRef.current) schedulePaintedReport(true);
      watchDpr();
    };
    const watchDpr = () => {
      if (dprMedia) dprMedia.removeEventListener('change', onDprChange);
      dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprMedia.addEventListener('change', onDprChange, { once: true });
    };
    watchDpr();
    void listen('tray-menu-show', () => {
      void refresh(true);
    }).then(stop => {
      if (cancelled) stop();
      else stopListening = stop;
    });
    void listen('tray-menu-hide', () => {
      reportSeqRef.current += 1;
      cancelPendingReport();
      cancelFlyoutTimers();
      setActiveFlyout(null);
      setStageVisible(false);
    }).then(stop => {
      if (cancelled) stop();
      else stopHideListening = stop;
    });
    void listen('tray-quick-folders-updated', () => {
      syncQuickFolders();
    }).then(stop => {
      if (cancelled) stop();
      else stopQuickFoldersListening = stop;
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === CUSTOM_QUICK_ACCESS_KEY || event.key === RECENT_FOLDER_PATHS_KEY) {
        syncQuickFolders();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      cancelPendingReport();
      cancelFlyoutTimers();
      if (dprMedia) dprMedia.removeEventListener('change', onDprChange);
      stopListening?.();
      stopHideListening?.();
      stopQuickFoldersListening?.();
      window.removeEventListener('storage', onStorage);
    };
  }, [cancelFlyoutTimers, cancelPendingReport, refresh, schedulePaintedReport, syncQuickFolders]);

  useEffect(() => {
    if (!stageVisible) return;
    schedulePaintedReport(false);
  }, [language, pinnedFolders.length, recentFolders.length, stageVisible, schedulePaintedReport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const inFlyout = Boolean(activeElement?.closest('.tray-flyout.is-open'));

      if (event.key === 'Escape') {
        event.preventDefault();
        if (activeFlyoutRef.current !== null) {
          closeFlyoutAndReturnFocus();
        } else {
          void invoke('hide_tray_menu').catch(() => {});
        }
        return;
      }

      if (inFlyout) {
        const closeKey = flyoutSide === 'left' ? 'ArrowRight' : 'ArrowLeft';
        if (event.key === closeKey || event.key === 'Backspace') {
          event.preventDefault();
          closeFlyoutAndReturnFocus();
          return;
        }
      } else {
        const openKey = flyoutSide === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (event.key === openKey || event.key === 'ArrowRight') {
          if (activeElement === quickTriggerRef.current) {
            event.preventDefault();
            openFlyoutAndFocusFirst('quick');
            return;
          }
          if (activeElement === helpTriggerRef.current) {
            event.preventDefault();
            openFlyoutAndFocusFirst('help');
            return;
          }
          if (activeElement === suiteTriggerRef.current) {
            event.preventDefault();
            openFlyoutAndFocusFirst('suite');
            return;
          }
        }
      }

      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const container = inFlyout ? getFlyoutElement(activeFlyoutRef.current) : cardRef.current;
        const items = Array.from(
          container?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [],
        );
        if (items.length === 0) return;
        const currentIndex = items.indexOf(activeElement as HTMLButtonElement);
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : currentIndex === -1
              ? (event.key === 'ArrowUp' ? items.length - 1 : 0)
              : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    };
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('contextmenu', blockContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('contextmenu', blockContextMenu);
    };
  }, [closeFlyoutAndReturnFocus, flyoutSide, openFlyoutAndFocusFirst]);

  return (
    <div
      className="tray-root"
      onPointerDown={event => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('.tray-card, .tray-flyout.is-open')) {
          cancelFlyoutTimers();
          setActiveFlyout(null);
          void invoke('hide_tray_menu').catch(() => {});
        }
      }}
    >
      <div
        ref={stageRef}
        className={stageVisible ? 'tray-stage' : 'tray-stage is-offscreen'}
        data-flyout-side={flyoutSide}
        data-vertical-align={verticalAlign}
        onMouseLeave={scheduleFlyoutClose}
      >
        {/* ── Main tray card (always anchored in place) ── */}
        <div className="tray-card" role="menu" aria-label="CyberFiles" ref={cardRef}>
          <button
            type="button"
            className="tray-header"
            title={t.headerTooltip}
            onMouseEnter={scheduleFlyoutClose}
            onClick={() => runAction('about')}
          >
            <img className="tray-header-icon" src="/icon.png" alt="" />
            <span className="tray-header-name">
              Cyber<span className="tray-header-accent">Files</span>
            </span>
            <span className="tray-header-version">v{snapshot.version}</span>
          </button>

          <div className="tray-divider" />

          <div className="tray-group" onMouseEnter={scheduleFlyoutClose}>
            <div className={`tray-status ${statusTone}`} role="status">
              <span className="tray-status-dot" aria-hidden="true" />
              <span className="tray-status-text">{statusLabel}</span>
            </div>
            <button type="button" role="menuitem" className="tray-item" onClick={() => runAction('toggle')}>
              <span className="tray-item-icon">
                {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </span>
              <span className="tray-item-label">{isVisible ? t.hide : t.show}</span>
              {snapshot.hotkey && <span className="tray-item-hotkey">{snapshot.hotkey}</span>}
            </button>
          </div>

          <div className="tray-divider" />

          <div className="tray-group">
            <button
              ref={quickTriggerRef}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeFlyout === 'quick'}
              className={`tray-item tray-nav-item ${activeFlyout === 'quick' ? 'is-open' : ''}`}
              onMouseEnter={() => scheduleFlyoutOpen('quick')}
              onClick={event => {
                cancelFlyoutTimers();
                if (event.detail === 0) {
                  openFlyoutAndFocusFirst('quick');
                } else {
                  setActiveFlyout(current => (current === 'quick' ? null : 'quick'));
                }
              }}
            >
              <span className="tray-item-icon"><Star size={16} /></span>
              <span className="tray-item-label">{t.quickAccess}</span>
              <span className="tray-nav-arrow"><ChevronRight size={14} /></span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="tray-item"
              onMouseEnter={scheduleFlyoutClose}
              onClick={() => runAction('settings')}
            >
              <span className="tray-item-icon"><Settings size={16} /></span>
              <span className="tray-item-label">{t.settings}</span>
            </button>
            <button
              ref={helpTriggerRef}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeFlyout === 'help'}
              className={`tray-item tray-nav-item ${activeFlyout === 'help' ? 'is-open' : ''}`}
              onMouseEnter={() => scheduleFlyoutOpen('help')}
              onClick={event => {
                cancelFlyoutTimers();
                if (event.detail === 0) {
                  openFlyoutAndFocusFirst('help');
                } else {
                  setActiveFlyout(current => (current === 'help' ? null : 'help'));
                }
              }}
            >
              <span className="tray-item-icon"><HelpCircle size={16} /></span>
              <span className="tray-item-label">{t.help}</span>
              <span className="tray-nav-arrow"><ChevronRight size={14} /></span>
            </button>
            <button
              ref={suiteTriggerRef}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeFlyout === 'suite'}
              className={`tray-item tray-nav-item ${activeFlyout === 'suite' ? 'is-open' : ''}`}
              onMouseEnter={() => scheduleFlyoutOpen('suite')}
              onClick={event => {
                cancelFlyoutTimers();
                if (event.detail === 0) {
                  openFlyoutAndFocusFirst('suite');
                } else {
                  setActiveFlyout(current => (current === 'suite' ? null : 'suite'));
                }
              }}
            >
              <span className="tray-item-icon"><Gem size={16} /></span>
              <span className="tray-item-label">{t.suite}</span>
              <span className="tray-nav-arrow"><ChevronRight size={14} /></span>
            </button>
          </div>

          <div className="tray-divider" />

          <div className="tray-group tray-group-exit" onMouseEnter={scheduleFlyoutClose}>
            <button type="button" role="menuitem" className="tray-item tray-item-exit" onClick={() => runAction('quit')}>
              <span className="tray-item-icon"><Power size={16} /></span>
              <span className="tray-item-label">{t.quit}</span>
            </button>
          </div>
        </div>

        {/* ── Side-by-side flyout slot (Quick Access, Help & Suite submenus) ── */}
        <div className="tray-flyout-slot">
          {/* Quick Access flyout */}
          <div
            ref={quickFlyoutRef}
            id="flyout-quick"
            role="menu"
            aria-label={t.quickAccess}
            aria-hidden={activeFlyout !== 'quick'}
            onMouseEnter={cancelFlyoutTimers}
            className={`tray-flyout ${activeFlyout === 'quick' ? 'is-open' : ''}`}
          >
            <div className="tray-flyout-header">
              <span className="tray-flyout-header-icon"><Star size={14} /></span>
              <span className="tray-sub-title">{t.quickAccess}</span>
            </div>

            <div className="tray-divider" />

            <div className="tray-group tray-quick-list">
              <button
                type="button"
                role="menuitem"
                className="tray-item tray-sub-item"
                onClick={() => runAction(`open:${SYSTEM_HOME_PATH}`)}
              >
                <span className="tray-item-icon"><HardDrive size={14} /></span>
                <span className="tray-item-label">{t.thisPc}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="tray-item tray-sub-item"
                onClick={() => runAction(`open:${NETWORK_PATH}`)}
              >
                <span className="tray-item-icon"><Network size={14} /></span>
                <span className="tray-item-label">{t.network}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="tray-item tray-sub-item"
                onClick={() => runAction(`open:${RECENT_PATH}`)}
              >
                <span className="tray-item-icon"><Clock size={14} /></span>
                <span className="tray-item-label">{t.recents}</span>
              </button>

              {pinnedFolders.length > 0 && (
                <>
                  <div className="tray-sub-sep" />
                  <div className="tray-section-caption">{t.pinnedFolders}</div>
                  {pinnedFolders.map(folder => (
                    <button
                      key={`pinned:${folder.path}`}
                      type="button"
                      role="menuitem"
                      title={folder.path}
                      className="tray-item tray-sub-item tray-folder-shortcut"
                      onClick={() => runAction(`open:${folder.path}`)}
                    >
                      <span className="tray-item-icon"><Star size={14} /></span>
                      <span className="tray-suite-copy">
                        <span className="tray-suite-name">{folder.name}</span>
                        <span className="tray-suite-short">{folder.path}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}

              {recentFolders.length > 0 && (
                <>
                  <div className="tray-sub-sep" />
                  <div className="tray-section-caption">{t.recentFolders}</div>
                  {recentFolders.map(folder => (
                    <button
                      key={`recent:${folder.path}`}
                      type="button"
                      role="menuitem"
                      title={folder.path}
                      className="tray-item tray-sub-item tray-folder-shortcut"
                      onClick={() => runAction(`open:${folder.path}`)}
                    >
                      <span className="tray-item-icon"><FolderOpen size={14} /></span>
                      <span className="tray-suite-copy">
                        <span className="tray-suite-name">{folder.name}</span>
                        <span className="tray-suite-short">{folder.path}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Help flyout */}
          <div
            ref={helpFlyoutRef}
            id="flyout-help"
            role="menu"
            aria-label={t.help}
            aria-hidden={activeFlyout !== 'help'}
            onMouseEnter={cancelFlyoutTimers}
            className={`tray-flyout ${activeFlyout === 'help' ? 'is-open' : ''}`}
          >
            <div className="tray-flyout-header">
              <span className="tray-flyout-header-icon"><HelpCircle size={14} /></span>
              <span className="tray-sub-title">{t.help}</span>
            </div>

            <div className="tray-divider" />

            <div className="tray-group">
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => void invoke('hide_tray_menu').then(() => invoke('star_repository')).catch(console.error)}>
                <span className="tray-item-icon"><Star size={14} /></span>
                <span className="tray-item-label">{githubStarLabels[language === 'es' ? 'es' : 'en'].idle}</span>
              </button>
              <div role="separator" className="tray-sub-sep" />
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => openExternal(HELP_URLS.docs)}>
                <span className="tray-item-icon"><BookOpen size={14} /></span>
                <span className="tray-item-label">{t.docs}</span>
              </button>
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => openExternal(HELP_URLS.faq)}>
                <span className="tray-item-icon"><HelpCircle size={14} /></span>
                <span className="tray-item-label">{t.faq}</span>
              </button>
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => openExternal(HELP_URLS.changelog)}>
                <span className="tray-item-icon"><ScrollText size={14} /></span>
                <span className="tray-item-label">{t.changelog}</span>
              </button>
              <div className="tray-sub-sep" />
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => openExternal(HELP_URLS.website)}>
                <span className="tray-item-icon"><Globe size={14} /></span>
                <span className="tray-item-label">{t.website}</span>
              </button>
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => openExternal(HELP_URLS.donate)}>
                <span className="tray-item-icon tray-item-icon-heart"><Heart size={14} /></span>
                <span className="tray-item-label">{t.donate}</span>
              </button>
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => openExternal(HELP_URLS.issues)}>
                <span className="tray-item-icon"><Bug size={14} /></span>
                <span className="tray-item-label">{t.issues}</span>
              </button>
              <div className="tray-sub-sep" />
              <button type="button" role="menuitem" className="tray-item tray-sub-item" onClick={() => runAction('about')}>
                <span className="tray-item-icon"><Info size={14} /></span>
                <span className="tray-item-label">{t.about}</span>
              </button>
            </div>
          </div>

          {/* Suite flyout */}
          <div
            ref={suiteFlyoutRef}
            id="flyout-suite"
            role="menu"
            aria-label={t.suite}
            aria-hidden={activeFlyout !== 'suite'}
            onMouseEnter={cancelFlyoutTimers}
            className={`tray-flyout ${activeFlyout === 'suite' ? 'is-open' : ''}`}
          >
            <div className="tray-flyout-header">
              <button
                type="button"
                className="tray-brand-link"
                aria-label="CyberGems"
                onClick={() => openExternal(CYBERGEMS_SITE)}
              >
                <img className="tray-brand-mark" src="/cybergems-logo.svg" alt="" />
                <span className="tray-brand-name">CyberGems</span>
              </button>
              <span className="tray-flyout-badge">{SUITE_APPS.length}</span>
            </div>

            <div className="tray-divider" />

            <div className="tray-group tray-suite-list">
              {SUITE_APPS.map(app => (
                <button
                  key={app.slug}
                  type="button"
                  role="menuitem"
                  className="tray-item tray-suite-item"
                  onClick={() => openExternal(app.site)}
                >
                  <span className="tray-suite-icon">
                    <img src={`/suite/${app.slug}.png`} alt="" />
                  </span>
                  <span className="tray-suite-copy">
                    <span className="tray-suite-name">{app.name}</span>
                    <span className="tray-suite-short">{app.short[language]}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="tray-divider" />

            <div className="tray-group">
              <button
                type="button"
                role="menuitem"
                className="tray-item tray-suite-all-btn"
                onClick={() => openExternal(CYBERGEMS_APPS)}
              >
                <span className="tray-item-icon"><ArrowRight size={13} /></span>
                <span className="tray-item-label">{t.suiteAll}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
