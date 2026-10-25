import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { relaunch } from '@tauri-apps/plugin-process';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';
import { formatUpdaterError, releasePageUrl, sanitizeReleaseNotes, type AvailableUpdate } from '../utils/updates';

type UpdateStatus = 'prompt' | 'downloading' | 'error';

interface UpdateModalProps {
  isOpen: boolean;
  update: AvailableUpdate | null;
  /** The version this copy is running, shown beside the one being offered. */
  currentVersion: string;
  onClose: () => void;
  onSkipVersion: (version: string) => void;
  /** Toast channel of the main window: a failed relaunch has nowhere else to go. */
  onNotify?: (message: string) => void;
}

function formatMegabytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateModal({ isOpen, update, currentVersion, onClose, onSkipVersion, onNotify }: UpdateModalProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<UpdateStatus>('prompt');
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const notesRef = useRef<HTMLDivElement>(null);

  const notes = useMemo(() => sanitizeReleaseNotes(update?.body), [update?.body]);
  const downloading = status === 'downloading';

  useEffect(() => {
    if (!isOpen) return;
    setStatus('prompt');
    setProgress(0);
    setDownloaded(0);
    setTotalBytes(0);
    setErrorMessage('');
    notesRef.current?.scrollTo({ top: 0 });
  }, [isOpen, update?.version]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Closing mid-install would hide the only progress the user has, and the download
      // cannot be cancelled from here anyway.
      if (downloading) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, downloading, onClose]);

  const install = useCallback(async () => {
    if (!update) return;
    setStatus('downloading');
    setProgress(0);
    setDownloaded(0);
    setTotalBytes(0);
    setErrorMessage('');

    let received = 0;
    let expected = 0;
    try {
      await update.downloadAndInstall(event => {
        switch (event.event) {
          case 'Started':
            expected = event.data.contentLength ?? 0;
            setTotalBytes(expected);
            break;
          case 'Progress':
            received += event.data.chunkLength;
            setDownloaded(received);
            setProgress(current => {
              if (expected > 0) return Math.min(99, Math.round((received / expected) * 100));
              return Math.min(95, current + 5);
            });
            break;
          case 'Finished':
            setProgress(100);
            break;
          default:
            break;
        }
      });
      // Windows ends the process while the installer runs, so reaching this line usually
      // means the install finished with the app still alive.
      await relaunch();
    } catch (error) {
      setErrorMessage(formatUpdaterError(error));
      setStatus('error');
    }
  }, [update]);

  const openReleasePage = useCallback(() => {
    if (!update) return;
    void openUrl(releasePageUrl(update.version)).catch(() => onNotify?.(t.about.linkFailed));
  }, [onNotify, t.about.linkFailed, update]);

  if (!isOpen || !update) return null;

  const percent = Math.max(0, Math.min(100, progress));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={event => {
        if (!downloading && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        className="cyberfiles-update-panel relative flex max-h-[min(90vh,620px)] w-[520px] max-w-full flex-col overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-neutral-950 to-neutral-900 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_32px_rgba(34,211,238,0.08)]"
        onMouseDown={event => event.stopPropagation()}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="absolute -left-[70px] -top-20 h-[210px] w-[210px] rounded-full bg-cyan-400 opacity-[0.13] blur-[60px]" />
          <div className="absolute -right-20 -top-[50px] h-[180px] w-[180px] rounded-full bg-violet-600 opacity-[0.11] blur-[60px]" />
          <div className="absolute left-[8%] right-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>

        <header className="relative flex shrink-0 items-center gap-2 px-5 pb-3 pt-4">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <h2 id="update-title" className="flex-1 text-sm font-semibold text-neutral-100">{t.updates.title}</h2>
          {!downloading && (
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
          )}
        </header>

        <div ref={notesRef} className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
            <p className="truncate text-[11.5px] font-medium text-neutral-300">{t.updates.newVersion}</p>
            <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
              <span className="rounded bg-white/5 px-2 py-0.5 text-neutral-400">v{currentVersion}</span>
              <ArrowRight className="h-3 w-3 text-neutral-600" />
              <span className="rounded border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 font-bold text-cyan-300">v{update.version.replace(/^v/i, '')}</span>
            </div>
          </div>

          {status === 'error' ? (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-500/25 bg-rose-950/25 p-3.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-rose-200">{t.updates.failedTitle}</h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-400">{t.updates.failedHint}</p>
                {errorMessage && (
                  <p className="mt-2 max-h-20 select-text overflow-y-auto break-words rounded bg-rose-950/40 px-2 py-1.5 font-mono text-[10px] text-rose-300/90">
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90">
                <FileText className="h-3.5 w-3.5" />
                <span>{t.updates.changelog}</span>
              </div>
              <div className="min-h-[150px] select-text rounded-lg border border-neutral-800 bg-black/25 px-3.5 py-3 text-[12.5px] leading-relaxed text-neutral-300">
                {notes ? <ReleaseNotes body={notes} /> : <p className="text-neutral-500">{t.updates.noNotes}</p>}
              </div>
            </div>
          )}

          {status === 'downloading' && (
            <div className="mt-4" aria-live="polite">
              <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                <span className="text-neutral-300">{percent < 100 ? t.updates.downloading : t.updates.installing}</span>
                <span className="font-mono text-neutral-500">
                  {totalBytes > 0 ? `${formatMegabytes(downloaded)} / ${formatMegabytes(totalBytes)}` : `${percent}%`}
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)] transition-all duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-neutral-500">{t.updates.restartHint}</p>
            </div>
          )}
        </div>

        <footer className="relative flex shrink-0 flex-wrap items-center gap-2 border-t border-neutral-800 bg-black/25 px-5 py-3">
          {status === 'prompt' && (
            <>
              <button
                type="button"
                onClick={openReleasePage}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-500 transition-colors hover:text-cyan-300"
              >
                <ExternalLink className="h-3 w-3" />
                <span>{t.updates.viewOnGithub}</span>
              </button>
              <span className="flex-1" />
              <Tooltip label={t.updates.skipHint} placement="top">
                <span>
                  <DialogButton size="compact" onClick={() => onSkipVersion(update.version)}>
                    {t.updates.skipVersion}
                  </DialogButton>
                </span>
              </Tooltip>
              <DialogButton size="compact" onClick={onClose}>{t.updates.later}</DialogButton>
              <DialogButton size="compact" variant="primary" onClick={() => void install()}>
                <Download className="h-3.5 w-3.5" />
                {t.updates.updateNow}
              </DialogButton>
            </>
          )}

          {status === 'downloading' && (
            <>
              <span className="flex-1 text-[11px] text-neutral-500">{t.updates.keepOpen}</span>
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            </>
          )}

          {status === 'error' && (
            <>
              <span className="flex-1" />
              <DialogButton size="compact" onClick={onClose}>{t.about.close}</DialogButton>
              <DialogButton size="compact" onClick={openReleasePage}>{t.updates.openReleasePage}</DialogButton>
              <DialogButton size="compact" variant="primary" onClick={() => void install()}>{t.updates.retry}</DialogButton>
            </>
          )}
        </footer>
      </section>
    </div>
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
