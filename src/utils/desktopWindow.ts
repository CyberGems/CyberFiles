import { invoke } from '@tauri-apps/api/core';

function isTauriDesktop() {
  return '__TAURI_INTERNALS__' in window;
}

/** Reveals the native window only after the first React frame is ready. */
export async function revealDesktopWindow() {
  if (!isTauriDesktop()) return;

  try {
    await invoke('show_main_window');
  } catch (error) {
    console.error('CyberFiles could not reveal its desktop window.', error);
  }
}
