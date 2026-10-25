import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from 'react';

/* Vite turns every `import()` into a request for a hashed chunk. That request fails for two
   reasons in practice: the development server stopped while the window stayed open, or an
   update replaced the files under a running window. The browser rejects with one of these
   messages, and an unhandled rejection unmounts the tree, leaving a grey window. */
const CHUNK_ERROR_FRAGMENTS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
  'unable to preload css',
];

export function isChunkLoadError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return CHUNK_ERROR_FRAGMENTS.some(fragment => message.includes(fragment));
}

/** Fired when a module fails to load and the caller offered no inline recovery. */
export const MODULE_LOAD_FAILED_EVENT = 'cyberfiles:module-load-failed';

/* A restarting Vite server answers again in a moment, so one silent retry hides the blip. */
const RETRY_DELAY_MS = 300;

/* A window that is already mounted keeps its failed module: reopening it would render the same
   dead state. These quiet attempts let it heal on its own once the server is back. */
const BACKGROUND_RETRY_DELAYS_MS = [3_000, 9_000];

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export interface LazyModuleProps {
  /** Shown until the module arrives. Defaults to nothing, as the lazy windows did before. */
  loadingFallback?: ReactNode;
  /** Renders in place of the module. Receives the retry that fetches it again. */
  renderError?: (retry: () => void) => ReactNode;
  /** Reports the failure so the window can explain why nothing opened. */
  onLoadError?: (error: unknown) => void;
}

/**
 * A deferred module that survives its own import failing.
 *
 * This deliberately does not use `React.lazy`: a component that suspends on its first render is
 * never committed, so React discards its hooks and any `useMemo` that held the lazy payload —
 * which re-runs the import on every attempt, forever. Loading in an effect keeps the state that
 * decides between the module, its fallback and the error, so a failure happens once.
 */
export function lazyWithRetry<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  const load = async (): Promise<T> => {
    try {
      return (await loader()).default;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;
      await delay(RETRY_DELAY_MS);
      return (await loader()).default;
    }
  };

  function LazyModule(props: ComponentProps<T> & LazyModuleProps) {
    const { loadingFallback = null, renderError, onLoadError, ...rest } = props;
    const [Module, setModule] = useState<T | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    /* The callbacks are recreated by the caller on every render; reading them through a ref
       keeps them out of the effect's dependencies, so the module loads once per attempt. */
    const callbacks = useRef({ onLoadError, renderError });
    callbacks.current = { onLoadError, renderError };

    useEffect(() => {
      let cancelled = false;
      let timer: number | undefined;
      let backgroundAttempts = 0;

      const run = () => {
        load()
          .then(loaded => {
            if (cancelled) return;
            setModule(() => loaded);
            setFailed(false);
          })
          .catch(error => {
            if (cancelled) return;
            setFailed(true);
            /* Reported once, so a quiet retry cannot repeat the same toast three times. */
            if (backgroundAttempts === 0) {
              callbacks.current.onLoadError?.(error);
              if (!callbacks.current.renderError) {
                window.dispatchEvent(new CustomEvent(MODULE_LOAD_FAILED_EVENT, { detail: error }));
              }
            }
            const delayMs = BACKGROUND_RETRY_DELAYS_MS[backgroundAttempts];
            backgroundAttempts += 1;
            if (delayMs !== undefined) timer = window.setTimeout(run, delayMs);
          });
      };

      run();
      return () => {
        cancelled = true;
        if (timer !== undefined) window.clearTimeout(timer);
      };
    }, [attempt]);

    if (failed) {
      return renderError?.(() => {
        setModule(null);
        setFailed(false);
        setAttempt(value => value + 1);
      }) ?? null;
    }
    if (!Module) return loadingFallback;
    return <Module {...(rest as ComponentProps<T>)} />;
  }

  return LazyModule;
}
