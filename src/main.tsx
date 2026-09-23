import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './locales/LanguageContext';
import { revealDesktopWindow } from './utils/desktopWindow';
import { ThemeProvider } from './themes/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);

// Keep the dark shell visible until React has committed its first frame. The
// native window itself remains hidden until this point in Tauri mode.
window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    document.getElementById('root')?.classList.add('cyberfiles-ready');
    void revealDesktopWindow();
  });
});
