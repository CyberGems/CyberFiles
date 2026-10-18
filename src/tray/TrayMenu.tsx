import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Eye, EyeOff, Info, Power, Settings } from 'lucide-react';
import { translations, type Language } from '../locales/translations';
import './tray.css';

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

  const reportSize = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const borderY = card.offsetHeight - card.clientHeight;
    const width = Math.ceil(card.offsetWidth + 40);
    const height = Math.ceil(card.scrollHeight + borderY + 44);
    if (width < 10 || height < 10) return;
    void invoke('tray_menu_ready', { width, height }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    document.documentElement.dataset.theme = readTheme();
    try {
      const next = await invoke<TrayMenuSnapshot>('get_tray_menu_state');
      setSnapshot(next);
      setLanguage(readLanguage(next.english));
    } catch {
      setLanguage(readLanguage(false));
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(reportSize));
  }, [reportSize]);

  const runAction = (action: string) => {
    void invoke('tray_menu_action', { action }).catch(error => {
      console.error('tray_menu_action failed:', error);
    });
  };

  useEffect(() => {
    void refresh();
    let cancelled = false;
    let stopListening: (() => void) | undefined;
    void listen('tray-menu-show', () => {
      void refresh();
    }).then(stop => {
      if (cancelled) stop();
      else stopListening = stop;
    });
    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

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
          <button type="button" role="menuitem" className="tray-item" onClick={() => runAction('about')}>
            <span className="tray-item-icon"><Info size={16} /></span>
            <span className="tray-item-label">{t.about}</span>
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
    </div>
  );
}
