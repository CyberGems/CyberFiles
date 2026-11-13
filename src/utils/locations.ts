import { NETWORK_PATH, SYSTEM_HOME_PATH } from '../types';

/**
 * Locations that paint one dedicated layout instead of the file lister: This PC
 * aggregates the drives, Network its hosts and shares. View modes, zoom and the
 * folder actions have nothing to act on there, so every surface hides them and
 * the shortcuts stay inert. Keep this the single source of truth: another
 * virtual location that grows a fixed layout only has to be added here.
 */
export function isDedicatedLayoutPath(path?: string | null): boolean {
  return path === SYSTEM_HOME_PATH || path === NETWORK_PATH;
}
