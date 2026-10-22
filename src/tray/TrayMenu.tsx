import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bug,
  ChevronRight,
  Eye,
  EyeOff,
  Gem,
  Globe,
  Heart,
  HelpCircle,
  Info,
  Power,
  ScrollText,
  Settings,
} from 'lucide-react';
import { translations, type Language } from '../locales/translations';
import { CYBERFILES_REPO, CYBERGEMS_APPS, CYBERGEMS_SITE, SUITE_APPS } from './suiteApps';
import './tray.css';

type TrayView = 'main' | 'help' | 'suite';
type TrayWindowState = 'visible' | 'minimized' | 'hidden';

interface TrayMenuSnapshot {
  windowState: TrayWindowState;
  hotkey: string | null;
  english: boolean;
  version: string;
}

const INITIAL_SNAPSHOT: TrayMenuSnapshot = {
  windowState: 'hidden',
  hotkey: null,
  english: false,
  version: __APP_VERSION__,
};

const HELP_URLS = {
  docs: `${CYBERFILES_REPO}/wiki`,
  faq: `${CYBERFILES_REPO}/wiki#faq`,
  changelog: `${CYBERFILES_REPO}/releases`,
  website: CYBERGEMS_SITE,
  donate: `${CYBERFILES_REPO}#%EF%B8%8F-donate`,
  issues: `${CYBERFILES_REPO}/issues`,
};

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
  const [language, setLanguage] = useState<Language>('es');
  const [view, setView] = useState<TrayView>('main');
  const cardRef = useRef<HTMLDivElement>(null);
  const t = translations[language].trayMenu;
  const isVisible = snapshot.windowState === 'visible';
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

  const reportSize = useCallback((view: TrayView) => {
    const card = cardRef.current;
    if (!card) return;
    const borderY = card.offsetHeight - card.clientHeight;
    const width = Math.ceil(card.offsetWidth + 40);
    const height = Math.ceil(card.scrollHeight + borderY + 44);
    if (width < 10 || height < 10) return;
    void invoke('tray_menu_ready', { width, height, view }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    document.documentElement.dataset.theme = readTheme();
    setView('main');
    try {
      const next = await invoke<TrayMenuSnapshot>('get_tray_menu_state');
      setSnapshot(next);
      setLanguage(readLanguage(next.english));
    } catch {
      setLanguage(readLanguage(false));
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => reportSize('main')));
  }, [reportSize]);

  const runAction = (action: string) => {
    void invoke('tray_menu_action', { action }).catch(error => {
      console.error('tray_menu_action failed:', error);
    });
  };

  const openExternal = (url: string) => {
    void openUrl(url).catch(error => {
      console.error('openUrl failed:', error);
    });
    window.setTimeout(() => {
      void invoke('hide_tray_menu').catch(() => {});
    }, 250);
  };

  useEffect(() => {
    void refresh();
    // Seed the size cache synchronously while the window is still hidden, so
    // the very first opening already uses the real geometry. requestAnimationFrame
    // is not relied upon here because it may not fire for an invisible window.
    reportSize('main');
    let cancelled = false;
    let stopListening: (() => void) | undefined;
    let stopHideListening: (() => void) | undefined;
    void listen('tray-menu-show', () => {
      void refresh();
    }).then(stop => {
      if (cancelled) stop();
      else stopListening = stop;
    });
    // Reset the deck while the menu is invisible: the next opening then shows
    // the main view at the size cached for it, with no visible reflow.
    void listen('tray-menu-hide', () => {
      setView('main');
    }).then(stop => {
      if (cancelled) stop();
      else stopHideListening = stop;
    });
    return () => {
      cancelled = true;
      stopListening?.();
      stopHideListening?.();
    };
  }, [refresh, reportSize]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => reportSize(view)));
  }, [view, reportSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void invoke('hide_tray_menu').catch(() => {});
      }
    };
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('contextmenu', blockContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('contextmenu', blockContextMenu);
    };
  }, []);

  return (
    <div className="tray-root">
      <div className="tray-card" role="menu" aria-label="CyberFiles" ref={cardRef}>
        <div className="tray-deck" data-view={view}>
          {/* ── Main view ── */}
          <div className="tray-view" id="view-main">
            <button
              type="button"
              className="tray-header"
              title={t.headerTooltip}
              onClick={() => runAction('about')}
            >
              <img className="tray-header-icon" src="/icon.png" alt="" />
              <span className="tray-header-name">
                Cyber<span className="tray-header-accent">Files</span>
              </span>
              <span className="tray-header-version">v{snapshot.version}</span>
            </button>

            <div className="tray-divider" />

            <div className="tray-group">
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
              <button type="button" role="menuitem" className="tray-item" onClick={() => runAction('settings')}>
                <span className="tray-item-icon"><Settings size={16} /></span>
                <span className="tray-item-label">{t.settings}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="tray-item tray-nav-item"
                onClick={() => setView('help')}
              >
                <span className="tray-item-icon"><HelpCircle size={16} /></span>
                <span className="tray-item-label">{t.help}</span>
                <span className="tray-nav-arrow"><ChevronRight size={14} /></span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="tray-item tray-nav-item"
                onClick={() => setView('suite')}
              >
                <span className="tray-item-icon"><Gem size={16} /></span>
                <span className="tray-item-label">{t.suite}</span>
                <span className="tray-nav-arrow"><ChevronRight size={14} /></span>
              </button>
            </div>

            <div className="tray-divider" />

            <div className="tray-group tray-group-exit">
              <button type="button" role="menuitem" className="tray-item tray-item-exit" onClick={() => runAction('quit')}>
                <span className="tray-item-icon"><Power size={16} /></span>
                <span className="tray-item-label">{t.quit}</span>
              </button>
            </div>
          </div>

          {/* ── Help view ── */}
          <div className="tray-view" id="view-help">
            <div className="tray-sub-header">
              <button type="button" className="tray-back-btn" onClick={() => setView('main')}>
                <span className="tray-back-icon"><ArrowLeft size={13} /></span>
                <span>{t.back}</span>
              </button>
              <span className="tray-sub-title">{t.help}</span>
            </div>

            <div className="tray-divider" />

            <div className="tray-group">
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

          {/* ── Suite view ── */}
          <div className="tray-view" id="view-suite">
            <div className="tray-sub-header">
              <button type="button" className="tray-back-btn" onClick={() => setView('main')}>
                <span className="tray-back-icon"><ArrowLeft size={13} /></span>
                <span>{t.back}</span>
              </button>
              <button
                type="button"
                className="tray-brand-link"
                aria-label="CyberGems"
                onClick={() => openExternal(CYBERGEMS_SITE)}
              >
                <img className="tray-brand-mark" src="/cybergems-logo.svg" alt="" />
                <span className="tray-brand-name">CyberGems</span>
              </button>
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
