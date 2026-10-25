import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './locales/LanguageContext';
import { revealDesktopWindow } from './utils/desktopWindow';
import { ThemeProvider } from './themes/ThemeContext';
import { DesktopOnlyNotice } from './components/DesktopOnlyNotice';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const isTauriDesktop = '__TAURI_INTERNALS__' in window;

/* A production build loads hashed chunks, so a window left open across an update can still ask
   for a file that no longer exists. Vite reports that here and one reload picks up the new
   names. In development the server itself is usually gone by then, and reloading would only land
   on a refused connection, so the error boundary explains it instead. */
const CHUNK_RELOAD_KEY = 'cyberfiles_chunk_reload_at_v1';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

window.addEventListener('vite:preloadError', event => {
  if (import.meta.env.DEV) return;
  try {
    const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < CHUNK_RELOAD_COOLDOWN_MS) return;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// Keep the dark shell visible until React has committed its first frame. The
// native window itself remains hidden until this point in Tauri mode.
// Scheduled before the first render: a synchronous failure there would otherwise leave the
// native window hidden behind a shell that never fades in.
window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    document.getElementById('root')?.classList.add('cyberfiles-ready');
    void revealDesktopWindow();
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <AppErrorBoundary>{isTauriDesktop ? <App /> : <DesktopOnlyNotice />}</AppErrorBoundary>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);
