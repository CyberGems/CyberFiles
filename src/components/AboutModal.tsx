import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, Bug, Check, ClipboardCopy, Gem, Github, Heart, RefreshCw, Tag, X } from 'lucide-react';
import { getTauriVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLanguage } from '../locales/LanguageContext';
import { isTauriDesktop } from '../utils/nativeFileSystem';
import { CYBERGEMS_APPS, CYBERGEMS_SITE, SUITE_APPS } from '../tray/suiteApps';
import { Tooltip } from './Tooltip';
import { RELEASES_PAGE_URL, fetchLatestRelease, getAutoCheckUpdates, isNewerVersion, setAutoCheckUpdates } from '../utils/updates';

const REPOSITORY_URL = 'https://github.com/CyberGems/CyberFiles';
const WIKI_URL = `${REPOSITORY_URL}/wiki`;
const ISSUES_URL = `${REPOSITORY_URL}/issues`;
const DONATE_URL = `${REPOSITORY_URL}#%EF%B8%8F-donate`;
const DONATE_HEART = '#f43f5e';

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'latest' }
  | { state: 'available'; version: string; url: string }
  | { state: 'error'; message: string };

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Toast channel of the main window, so a failure is reported instead of silently ignored. */
  onNotify?: (message: string) => void;
}

/** Four of the other apps, drawn once per opening, like the CyberNotes About. */
function pickSuiteApps() {
  const pool = [...SUITE_APPS];
  const picks: typeof pool = [];
  while (picks.length < 4 && pool.length > 0) {
    const [app] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    if (app) picks.push(app);
  }
  return picks;
}

function collectDiagnostics(language: 'es' | 'en'): Promise<string> {
  const lines = [`CyberFiles ${__APP_VERSION__}`];
  return getTauriVersion()
    .then(version => { lines.push(`Tauri: ${version}`); })
    .catch(() => { /* The browser build has no Tauri runtime to report. */ })
    .then(() => {
      const chrome = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1];
      if (chrome) lines.push(`WebView: Chromium ${chrome}`);
      const windowsRelease = /Windows NT ([\d.]+)/.exec(navigator.userAgent)?.[1];
      lines.push(`OS: ${windowsRelease ? `Windows ${windowsRelease}` : navigator.platform || 'unknown'}`);
      lines.push(`Locale: ${language}`);
      return lines.join('\n');
    });
}

export function AboutModal({ isOpen, onClose, onNotify }: AboutModalProps) {
  const { language, t } = useLanguage();
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [autoUpdate, setAutoUpdate] = useState(() => getAutoCheckUpdates());
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const [suiteApps] = useState(pickSuiteApps);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      // Enter closes too, unless a control owns the key.
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  useEffect(() => () => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
  }, []);

  const openExternal = useCallback((url: string) => {
    if (isTauriDesktop()) {
      void openUrl(url).catch(() => onNotify?.(t.about.linkFailed));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [onNotify, t.about.linkFailed]);

  const handleCheck = useCallback(async () => {
    setStatus({ state: 'checking' });
    setShowDetails(false);
    try {
      const release = await fetchLatestRelease();
      setStatus(isNewerVersion(release.version, __APP_VERSION__)
        ? { state: 'available', version: release.version, url: release.url }
        : { state: 'latest' });
    } catch (error) {
      setStatus({ state: 'error', message: String((error as Error)?.message || error) });
    }
  }, []);

  const handleToggleAutoUpdate = () => {
    const next = !autoUpdate;
    setAutoUpdate(next);
    setAutoCheckUpdates(next);
  };

  const handleCopyDiagnostics = useCallback(async () => {
    try {
      const text = await collectDiagnostics(language);
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify?.(t.about.copyFailed);
    }
  }, [language, onNotify, t.about.copyFailed]);

  if (!isOpen) return null;

  const checking = status.state === 'checking';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="cyberfiles-about-panel relative flex max-h-[min(90vh,640px)] w-[440px] max-w-full flex-col overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-neutral-950 to-neutral-900 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_32px_rgba(34,211,238,0.08)]"
        onMouseDown={event => event.stopPropagation()}
      >
        {/* Glass decorativo: brillos tras el contenido, sin tocar la legibilidad. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="absolute -left-[70px] -top-20 h-[210px] w-[210px] rounded-full bg-cyan-400 opacity-[0.13] blur-[60px]" />
          <div className="absolute -right-20 -top-[50px] h-[180px] w-[180px] rounded-full bg-violet-600 opacity-[0.11] blur-[60px]" />
          <div className="absolute left-[8%] right-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>

        <header className="flex shrink-0 items-center px-4 pt-4">
          <span className="flex-1" />
          <Tooltip label={t.about.close} placement="left">
            <button
              type="button"
              aria-label={t.about.close}
              onClick={onClose}
              className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-4 text-center">
          <img src="/icon.png" alt="CyberFiles" className="mx-auto mb-4 block h-[72px] w-[72px]" />

          <h1 id="about-title" className="m-0 text-[26px] font-extrabold leading-none tracking-[-0.02em] text-neutral-100">
            Cyber<span className="text-cyan-400">Files</span>
          </h1>
          <div className="mb-3.5 mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500">
            {t.about.version.replace('{version}', __APP_VERSION__)}
          </div>

          <p className="mx-auto mb-6 max-w-[320px] text-[13px] leading-[1.55] text-neutral-400">{t.about.description}</p>

          <div className="text-left">
            <SectionTitle label={t.about.systemAndUpdates} />

            <div className="mb-1 flex flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
              {status.state !== 'idle' && (
                <div data-about-update-status>
                  <UpdateStatusLine status={status} showDetails={showDetails} onToggleDetails={() => setShowDetails(value => !value)} />
                </div>
              )}

              {status.state === 'available' ? (
                <button
                  type="button"
                  onClick={() => openExternal(status.url)}
                  className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 text-xs font-medium text-white transition hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>{t.about.viewRelease}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCheck()}
                  disabled={checking}
                  className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? t.about.checkingForUpdates : t.about.checkUpdates}</span>
                </button>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={autoUpdate}
                aria-label={t.about.autoUpdates}
                onClick={handleToggleAutoUpdate}
                className="mx-auto flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 pt-0.5 text-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-cyan-400"
                style={{ font: 'inherit' }}
              >
                <span aria-hidden="true" className={`cyberfiles-about-switch ${autoUpdate ? 'is-on' : ''}`} />
                <span className="text-xs text-neutral-400">{t.about.autoUpdates}</span>
              </button>

              <p className="px-1 text-center text-[10px] leading-[1.4] text-neutral-500">{t.about.autoUpdatesHint}</p>
            </div>
          </div>

          <div className="mt-3.5 text-left">
            <SectionTitle label={t.about.suiteTitle} />

            <div className="flex items-center justify-center gap-2">
              {suiteApps.map(app => (
                <Tooltip key={app.slug} label={app.short[language]} placement="top">
                  <button
                    type="button"
                    aria-label={`${app.name}: ${app.short[language]}`}
                    onClick={() => openExternal(app.site)}
                    className="cyberfiles-about-suite-btn grid h-10 w-10 place-items-center rounded-[10px] border-0 bg-transparent p-0 transition hover:bg-neutral-800/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                  >
                    <img src={`/suite/${app.slug}.png`} alt="" className="block h-[26px] w-[26px] rounded-md" />
                  </button>
                </Tooltip>
              ))}
            </div>

            <div className="mt-1 flex justify-center">
              <button
                type="button"
                onClick={() => openExternal(CYBERGEMS_APPS)}
                className="rounded-md px-2.5 py-1 text-[11px] text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
              >
                {t.about.suiteMore}
              </button>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-neutral-800 bg-black/15 px-4 py-2.5 text-[10px] text-neutral-500">
          <Tooltip label={t.about.websiteTooltip} placement="top">
            <button
              type="button"
              onClick={() => openExternal(CYBERGEMS_SITE)}
              aria-label={t.about.websiteTooltip}
              className="border-0 bg-transparent p-0 text-[10px] font-semibold tracking-[0.04em] text-inherit cursor-pointer transition-colors hover:text-neutral-200"
              style={{ font: 'inherit' }}
            >
              {t.about.copyright.replace('{year}', String(new Date().getFullYear()))}
            </button>
          </Tooltip>
          <div className="flex items-center gap-0.5">
            <FooterIcon label={t.about.websiteTooltip} onClick={() => openExternal(CYBERGEMS_SITE)}><Gem className="h-3.5 w-3.5" /></FooterIcon>
            <FooterIcon label={t.about.docsTooltip} onClick={() => openExternal(WIKI_URL)}><BookOpen className="h-3.5 w-3.5" /></FooterIcon>
            <FooterIcon label={t.about.githubTooltip} onClick={() => openExternal(REPOSITORY_URL)}><Github className="h-3.5 w-3.5" /></FooterIcon>
            <FooterIcon label={t.about.issuesTooltip} onClick={() => openExternal(ISSUES_URL)}><Bug className="h-3.5 w-3.5" /></FooterIcon>
            <FooterIcon label={copied ? t.about.diagnosticsCopied : t.about.copyDiagnostics} onClick={() => void handleCopyDiagnostics()}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            </FooterIcon>
            <FooterIcon label={t.about.releasesTooltip} onClick={() => openExternal(RELEASES_PAGE_URL)}><Tag className="h-3.5 w-3.5" /></FooterIcon>
            <FooterIcon label={t.about.donateTooltip} onClick={() => openExternal(DONATE_URL)}>
              <Heart className="h-3.5 w-3.5" style={{ color: DONATE_HEART, fill: DONATE_HEART, stroke: 'none' }} />
            </FooterIcon>
          </div>
        </footer>
      </section>
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase text-cyan-400">
      <span aria-hidden="true" className="h-px flex-1 bg-cyan-500/25" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-cyan-500/25" />
    </div>
  );
}

function FooterIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label} placement="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function UpdateStatusLine({ status, showDetails, onToggleDetails }: { status: UpdateStatus; showDetails: boolean; onToggleDetails: () => void }) {
  const { t } = useLanguage();
  if (status.state === 'idle') return null;
  if (status.state === 'checking') {
    return <p className="text-center text-xs text-neutral-400">{t.about.statusChecking}</p>;
  }

  const copy = status.state === 'latest'
    ? { text: t.about.statusLatest, className: 'text-emerald-400' }
    : status.state === 'available'
      ? { text: t.about.statusAvailable.replace('{version}', status.version), className: 'text-cyan-300' }
      : { text: t.about.statusError, className: 'text-neutral-400' };

  return (
    <div className={`text-center text-xs ${copy.className}`}>
      <p>{copy.text}</p>
      {status.state === 'error' && status.message && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={onToggleDetails}
            className="mx-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-300"
          >
            {showDetails ? t.about.hideDetails : t.about.details}
          </button>
          {showDetails && (
            <div className="mt-1.5 max-h-20 overflow-y-auto break-words rounded-md border border-neutral-800 bg-black/25 px-2 py-1.5 text-left font-mono text-[10px] text-neutral-500">
              {status.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
