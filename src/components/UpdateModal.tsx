import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Resource } from '@tauri-apps/api/core';
import { ArrowRight, X } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLanguage } from '../locales/LanguageContext';
import { DialogButton } from './DialogButton';
import {
  applyUpdate, cancelUpdateDownload, downloadUpdate, extractLocalizedReleaseNotes,
  formatUpdaterError, releasePageUrl, type AvailableUpdate, type UpdateProgress,
} from '../utils/updates';

interface UpdateModalProps {
  isOpen: boolean;
  aboveAbout: boolean;
  update: AvailableUpdate | null;
  currentVersion: string;
  onClose: () => void;
  onShow: () => void;
  onSkipVersion: (version: string) => void;
  onActivityChange: (active: boolean) => void;
}

type Phase = 'available' | 'downloading' | 'ready';

function formatMegabytes(bytes: number, language: string): string {
  return (bytes / 1_000_000).toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
}

export function UpdateModal({
  isOpen, aboveAbout, update, currentVersion, onClose, onShow, onSkipVersion, onActivityChange,
}: UpdateModalProps) {
  const { t, language } = useLanguage();
  const [phase, setPhase] = useState<Phase>('available');
  const [progress, setProgress] = useState<UpdateProgress>({ downloaded: 0, total: null });
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [applying, setApplying] = useState(false);
  const actionInProgress = useRef(false);
  const verifiedPackage = useRef<Resource>(null);
  const panel = useRef<HTMLElement>(null);
  const notes = useMemo(() => extractLocalizedReleaseNotes(update?.body, language), [update?.body, language]);

  useEffect(() => {
    if (aboveAbout && isOpen) panel.current?.focus();
  }, [aboveAbout, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!aboveAbout && !panel.current?.contains(event.target as Node))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!applying) onClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, aboveAbout, applying, onClose]);

  if (!isOpen || !update) return null;

  async function beginDownload() {
    if (!update || actionInProgress.current) return;
    actionInProgress.current = true;
    onActivityChange(true);
    setPhase('downloading');
    setCanCancel(false);
    setProgress({ downloaded: 0, total: null });
    setError('');
    try {
      const resource = await downloadUpdate(update, value => {
        setCanCancel(true);
        if (value.downloaded > 0) setProgress(value);
      });
      if (resource) {
        verifiedPackage.current = resource;
        setPhase('ready');
        onShow();
        return;
      }
      setPhase('available');
      onActivityChange(false);
    } catch (failure) {
      setError(formatUpdaterError(failure));
      setPhase('available');
      onActivityChange(false);
      onShow();
    } finally {
      actionInProgress.current = false;
      setCancelling(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await cancelUpdateDownload();
    } catch (failure) {
      setError(formatUpdaterError(failure));
      setCancelling(false);
    }
  }

  async function apply() {
    if (!verifiedPackage.current || actionInProgress.current) return;
    actionInProgress.current = true;
    setApplying(true);
    setError('');
    try {
      await applyUpdate(verifiedPackage.current);
    } catch (failure) {
      setError(formatUpdaterError(failure));
    } finally {
      actionInProgress.current = false;
      setApplying(false);
    }
  }

  const dismiss = phase === 'downloading' ? t.updates.background : t.about.close;
  const hasTotal = progress.total !== null && progress.total > 0;
  const stageTitle = phase === 'ready' ? t.updates.ready : phase === 'downloading'
    ? (cancelling ? t.updates.cancelling : t.updates.downloading)
    : t.updates.title;

  return (
    <section
      ref={panel}
      role="dialog"
      tabIndex={-1}
      aria-labelledby="update-title"
      className="cyberfiles-update-panel fixed bottom-4 right-4 z-[100] flex max-h-[min(85vh,530px)] w-[460px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-2xl"
    >
      <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-4">
        <img src="/icon.png" alt="" className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="update-title" className="text-sm font-semibold" aria-live="polite">{stageTitle}</h2>
          <div className="cf-update-muted mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span>{'v' + currentVersion}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-semibold">{'v' + update.version.replace(/^v/i, '')}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label={dismiss}
          onClick={onClose}
          disabled={applying}
          className="cf-update-dismiss rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto px-4 pb-3">
        <div className="cf-update-notes rounded-lg border px-3 py-2.5 text-xs">
          <h3 className="mb-1 font-semibold">{t.updates.changelog}</h3>
          <div className="cf-update-muted max-h-28 select-text overflow-y-auto leading-relaxed" tabIndex={0}>
            {notes ? <ReleaseNotes body={notes} /> : <p>{t.updates.noNotes}</p>}
          </div>
        </div>
        {phase === 'downloading' && (
          <div className="mt-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-xs">
              <span>{t.updates.progress}</span>
              <span className="cf-update-muted tabular-nums">
                {formatMegabytes(progress.downloaded, language)}
                {hasTotal && (' / ' + formatMegabytes(progress.total!, language))}
              </span>
            </div>
            <progress
              className="cf-update-progress block h-2 w-full"
              aria-label={t.updates.progress}
              max={hasTotal ? progress.total! : 1}
              value={hasTotal ? progress.downloaded : undefined}
            />
          </div>
        )}
        {phase === 'ready' && update.portable && <p className="cf-update-muted mt-2 text-xs">{t.updates.portableReady}</p>}
        {error && <p className="cf-update-error mt-2 break-words text-xs" role="alert">{t.updates.failedTitle} {error}</p>}
      </div>

      <footer className="cf-update-footer flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3">
        {phase === 'available' && (
          <>
            <DialogButton size="compact" onClick={() => void openUrl(releasePageUrl(update.version)).catch(() => setError(t.about.linkFailed))}>
              {t.updates.viewOnGithub}
            </DialogButton>
            <DialogButton size="compact" onClick={() => onSkipVersion(update.version)}>{t.updates.skipVersion}</DialogButton>
            <DialogButton size="compact" onClick={onClose}>{t.updates.later}</DialogButton>
            <DialogButton size="compact" variant="primary" onClick={() => void beginDownload()}>{t.updates.updateNow}</DialogButton>
          </>
        )}
        {phase === 'downloading' && (
          <>
            <DialogButton size="compact" onClick={onClose}>{t.updates.background}</DialogButton>
            <DialogButton size="compact" disabled={!canCancel || cancelling} onClick={() => void cancel()}>{t.updates.cancelDownload}</DialogButton>
          </>
        )}
        {phase === 'ready' && (
          <>
            <DialogButton size="compact" disabled={applying} onClick={onClose}>{t.updates.later}</DialogButton>
            <DialogButton size="compact" variant="primary" disabled={applying} onClick={() => void apply()}>
              {applying ? t.updates.applying : update.portable ? t.updates.openFolder : t.updates.restart}
            </DialogButton>
          </>
        )}
      </footer>
    </section>
  );
}


function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-neutral-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-white/10 px-1 py-px font-mono text-[11px] text-cyan-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/** Headings, bullets, quotes and inline emphasis: enough for a release summary, no parser. */
function ReleaseNotes({ body }: { body: string }) {
  const nodes = useMemo(() => {
    const result: ReactNode[] = [];
    let bullets: string[] = [];

    const flush = () => {
      if (bullets.length === 0) return;
      const items = bullets;
      bullets = [];
      result.push(
        <ul key={`list-${result.length}`} className="my-1.5 list-disc space-y-1 pl-4 marker:text-cyan-500/70">
          {items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
        </ul>,
      );
    };

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trimEnd();
      const heading = /^#{1,4}\s+(.*)$/.exec(line);
      const bullet = /^[-*]\s+(.*)$/.exec(line);
      const quote = /^>\s*(.*)$/.exec(line);

      if (heading) {
        flush();
        result.push(
          <h3 key={`h-${result.length}`} className="mb-1 mt-2.5 text-[12.5px] font-semibold text-neutral-100 first:mt-0">
            {renderInline(heading[1])}
          </h3>,
        );
      } else if (bullet) {
        bullets.push(bullet[1]);
      } else if (quote) {
        flush();
        result.push(
          <blockquote key={`q-${result.length}`} className="my-1.5 border-l-2 border-cyan-500/40 pl-2.5 text-[12px] italic text-neutral-400">
            {renderInline(quote[1])}
          </blockquote>,
        );
      } else if (!line.trim() || /^-{3,}$/.test(line.trim())) {
        flush();
      } else {
        flush();
        result.push(<p key={`p-${result.length}`} className="text-[12.5px] leading-relaxed">{renderInline(line)}</p>);
      }
    }
    flush();
    return result;
  }, [body]);

  return <div className="space-y-0.5">{nodes}</div>;
}
