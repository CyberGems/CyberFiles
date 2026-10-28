import { invoke } from '@tauri-apps/api/core';

/** Off means "show the window at boot" too: an absent value stays minimized. */
export const START_MINIMIZED_ON_STARTUP_STORAGE_KEY = 'cyberfiles_start_minimized_on_startup_v1';

export interface LaunchContext {
  startup: boolean;
  targetPath?: string | null;
  target_path?: string | null;
}

export function getLaunchTargetPath(context: LaunchContext | null | undefined): string | null {
  if (!context) return null;
  return context.targetPath || context.target_path || null;
}

function isTauriDesktop() {
  return '__TAURI_INTERNALS__' in window;
}

/** How this run was launched, or null outside the desktop app / on failure. */
export async function fetchLaunchContext(): Promise<LaunchContext | null> {
  if (!isTauriDesktop()) return null;
  try {
    return await invoke<LaunchContext>('get_launch_context');
  } catch {
    return null;
  }
}

/** Reads the Windows Run entry, so the toggle always mirrors the system. */
export async function fetchAutostartStatus(): Promise<boolean> {
  return await invoke<boolean>('get_autostart_status');
}

export async function setAutostart(enabled: boolean): Promise<boolean> {
  return await invoke<boolean>('set_autostart', { enabled });
}

/** Reads the Explorer context-menu registration back from the registry. */
export async function fetchExplorerIntegrationStatus(): Promise<boolean> {
  return await invoke<boolean>('get_explorer_integration_status');
}

export async function setExplorerIntegration(enabled: boolean): Promise<boolean> {
  return await invoke<boolean>('set_explorer_integration', { enabled });
}

export function readStartMinimizedOnStartup(): boolean {
  try {
    return window.localStorage.getItem(START_MINIMIZED_ON_STARTUP_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeStartMinimizedOnStartup(enabled: boolean): void {
  try {
    window.localStorage.setItem(START_MINIMIZED_ON_STARTUP_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Storage can be unavailable in restricted modes; the default stays minimized.
  }
}
