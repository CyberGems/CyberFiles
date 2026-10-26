import { invoke } from '@tauri-apps/api/core';
import { fetchLaunchContext, readStartMinimizedOnStartup } from './systemIntegration';

function isTauriDesktop() {
  return '__TAURI_INTERNALS__' in window;
}

/** Reveals the native window only after the first React frame is ready.
    A boot launch (the Windows Run entry passes --startup) stays hidden in
    the tray unless "start minimized" is turned off in Settings; a manual
    launch always shows the window. */
export async function revealDesktopWindow() {
  if (!isTauriDesktop()) return;

  try {
    const context = await fetchLaunchContext();
    if (context?.startup && readStartMinimizedOnStartup()) return;
    await invoke('show_main_window');
  } catch (error) {
    console.error('CyberFiles could not reveal its desktop window.', error);
  }
}
