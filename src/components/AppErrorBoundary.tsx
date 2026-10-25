import { Component, Fragment, type ReactNode } from 'react';
import { Gem, RefreshCw, RotateCcw } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { DialogButton } from './DialogButton';
import { isChunkLoadError } from './LazyModule';

interface CrashCopy {
  title: string;
  description: string;
  chunkDescription: string;
  retry: string;
  reload: string;
  detailsLabel: string;
  devHint: string;
}

interface BoundaryProps {
  copy: CrashCopy;
  children: ReactNode;
}

interface BoundaryState {
  error: unknown;
  attempt: number;
}

/* Without this, a single failed render unmounts the tree and leaves the native window grey with
   no way back: the process is alive, so nothing else restarts it. */
class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error('CyberFiles could not render its window:', error);
  }

  private retry = () => {
    this.setState(state => ({ error: null, attempt: state.attempt + 1 }));
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <CrashScreen
          copy={this.props.copy}
          error={this.state.error}
          onRetry={this.retry}
          onReload={this.reload}
        />
      );
    }

    /* The key is what makes the retry real: a fresh subtree, and with it fresh lazy modules. */
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

function CrashScreen({ copy, error, onRetry, onReload }: {
  copy: CrashCopy;
  error: unknown;
  onRetry: () => void;
  onReload: () => void;
}) {
  const chunkFailure = isChunkLoadError(error);
  const message = error instanceof Error ? error.message : String(error ?? '');

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--cyberfiles-dialog-background)] p-6">
      <section role="alert" className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Gem className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-neutral-100">{copy.title}</h1>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
              {chunkFailure ? copy.chunkDescription : copy.description}
            </p>
          </div>
        </div>

        {message && (
          <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{copy.detailsLabel}</p>
            <p className="mt-1 max-h-24 overflow-y-auto break-words font-mono text-[11px] leading-relaxed text-neutral-400">{message}</p>
          </div>
        )}

        {chunkFailure && import.meta.env.DEV && (
          <p className="mt-3 text-[11px] leading-relaxed text-amber-300/80">{copy.devHint}</p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <DialogButton size="compact" variant="secondary" onClick={onReload}>
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.reload}
          </DialogButton>
          <DialogButton size="compact" variant="primary" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            {copy.retry}
          </DialogButton>
        </div>
      </section>
    </div>
  );
}

/** Last resort of the window: any render failure shows a way out instead of a grey page. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return <Boundary copy={t.loadFailure}>{children}</Boundary>;
}
