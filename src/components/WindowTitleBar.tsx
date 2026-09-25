import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Globe, Info, Keyboard, Minus, MoreHorizontal, Settings, Square, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface WindowTitleBarProps {
  showWindowControls: boolean;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenAbout: () => void;
}

export function WindowTitleBar({ showWindowControls, onOpenSettings, onOpenShortcuts, onOpenAbout }: WindowTitleBarProps) {
  const { t, language, toggleLanguage } = useLanguage();
  const [appWindow, setAppWindow] = useState<ReturnType<typeof getCurrentWindow> | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreRegionRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const shortcutsItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showWindowControls) {
      setAppWindow(null);
      return;
    }

    try {
      setAppWindow(getCurrentWindow());
    } catch {
      setAppWindow(null);
    }
  }, [showWindowControls]);

  useEffect(() => {
    if (!appWindow) return;
    let mounted = true;
    let stopListening: (() => void) | undefined;

    void appWindow.isMaximized().then(maximized => {
      if (mounted) setIsMaximized(maximized);
    }).catch(() => undefined);

    void appWindow.onResized(() => {
      void appWindow.isMaximized().then(maximized => {
        if (mounted) setIsMaximized(maximized);
      }).catch(() => undefined);
    }).then(unlisten => {
      if (mounted) stopListening = unlisten;
      else unlisten();
    }).catch(() => undefined);

    return () => {
      mounted = false;
      stopListening?.();
    };
  }, [appWindow]);

  useEffect(() => {
    if (!moreMenuOpen) return;

    shortcutsItemRef.current?.focus();
    const closeFromOutside = (event: PointerEvent) => {
      if (!moreRegionRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMoreMenuOpen(false);
      moreButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreMenuOpen]);

  const toggleMaximize = () => {
    if (!appWindow) return;
    void appWindow.toggleMaximize().then(() => appWindow.isMaximized()).then(setIsMaximized).catch(() => undefined);
  };

  const toggleFromTitlebarDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, [data-titlebar-no-drag]')) return;
    toggleMaximize();
  };

  const closeMenuAnd = (action: () => void) => {
    setMoreMenuOpen(false);
    action();
  };

  const tTitlebar = (es: string, en: string) => language === 'es' ? es : en;

  return (
    <header
      className="relative z-40 flex h-12 min-h-12 shrink-0 select-none items-center border-b border-neutral-800 bg-neutral-950 text-neutral-200"
      onDoubleClick={toggleFromTitlebarDoubleClick}
    >
      <Tooltip label={tTitlebar('Acerca de CyberFiles', 'About CyberFiles')} placement="bottom">
        <button
          type="button"
          data-titlebar-no-drag=""
          aria-label={tTitlebar('Acerca de CyberFiles', 'About CyberFiles')}
          onClick={onOpenAbout}
          className="ml-3 flex h-9 min-w-0 items-center gap-2 rounded-md px-1.5 text-neutral-300 transition-colors hover:bg-neutral-800/80 hover:text-white"
        >
          <img src="/icon.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0 rounded-md" />
          <span className="truncate text-[13px] font-semibold tracking-wide">{t.app.title}</span>
          <span className="hidden rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[9px] font-mono text-neutral-500 sm:inline">{t.app.stageBadge}</span>
        </button>
      </Tooltip>

      <div className="h-full min-w-8 flex-1" data-tauri-drag-region="" aria-hidden="true" />

      <div className="flex h-full shrink-0 items-center gap-1 pr-2" data-titlebar-no-drag="">
        <Tooltip label={t.settings.openTooltip} placement="bottom">
          <button
            type="button"
            aria-label={t.settings.openTooltip}
            onClick={onOpenSettings}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Settings className="h-4 w-4" />
          </button>
        </Tooltip>

        <div className="relative" ref={moreRegionRef} data-titlebar-no-drag="">
          <Tooltip label={tTitlebar('Más opciones', 'More options')} placement="bottom">
            <button
              ref={moreButtonRef}
              type="button"
              aria-label={tTitlebar('Más opciones', 'More options')}
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              onClick={() => setMoreMenuOpen(open => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </Tooltip>

          {moreMenuOpen && (
            <div
              role="menu"
              aria-label={tTitlebar('Más opciones', 'More options')}
              className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl"
            >
              <Tooltip label={t.header.shortcutsTooltip} placement="left">
                <button
                  ref={shortcutsItemRef}
                  type="button"
                  role="menuitem"
                  onClick={() => closeMenuAnd(onOpenShortcuts)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-200 transition-colors hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                >
                  <Keyboard className="h-4 w-4 text-cyan-400" />
                  <span className="flex-1">{tTitlebar('Atajos de teclado', 'Keyboard shortcuts')}</span>
                  <kbd className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">F1</kbd>
                </button>
              </Tooltip>
              <div className="mx-2 my-1 border-t border-neutral-800" />
              <Tooltip label={t.header.switchLanguage} placement="left">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => closeMenuAnd(toggleLanguage)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                >
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span className="flex-1">{t.header.switchLanguage}</span>
                  <span className="font-mono text-[10px] text-neutral-500">{language === 'es' ? 'EN' : 'ES'}</span>
                </button>
              </Tooltip>
              <Tooltip label={tTitlebar('Acerca de CyberFiles', 'About CyberFiles')} placement="left">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => closeMenuAnd(onOpenAbout)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                >
                  <Info className="h-4 w-4 text-neutral-400" />
                  <span className="flex-1">{tTitlebar('Acerca de CyberFiles', 'About CyberFiles')}</span>
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        {appWindow && (
          <>
          <div className="mx-1 h-6 w-px bg-neutral-800" />

          <Tooltip label={tTitlebar('Minimizar', 'Minimize')} placement="bottom">
            <button
              type="button"
              aria-label={tTitlebar('Minimizar', 'Minimize')}
              onClick={() => { void appWindow.minimize().catch(() => undefined); }}
              className="flex h-9 w-10 items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Minus className="h-4 w-4" />
            </button>
          </Tooltip>

          <Tooltip label={isMaximized ? tTitlebar('Restaurar', 'Restore') : tTitlebar('Maximizar', 'Maximize')} placement="bottom">
            <button
              type="button"
              aria-label={isMaximized ? tTitlebar('Restaurar', 'Restore') : tTitlebar('Maximizar', 'Maximize')}
              onClick={toggleMaximize}
              className="flex h-9 w-10 items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </button>
          </Tooltip>

          <Tooltip label={tTitlebar('Cerrar', 'Close')} placement="bottom">
            <button
              type="button"
              aria-label={tTitlebar('Cerrar', 'Close')}
              onClick={() => { void appWindow.close().catch(() => undefined); }}
              className="flex h-9 w-10 items-center justify-center text-neutral-400 transition-colors hover:bg-rose-600 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
          </>
        )}
      </div>
    </header>
  );
}
