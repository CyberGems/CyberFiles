import { folderStylePathKey } from './folderStylePreferences';

export type FolderIconStyle = 'folder-badge' | 'symbol';
export type FolderIconCategory = 'color' | 'neutral';

export interface CustomFolderIconConfig {
  iconId: string;
  style: FolderIconStyle;
  category: FolderIconCategory;
  colorPreset?: string;
}

export type SavedFolderIcons = Record<string, CustomFolderIconConfig>;

export const CUSTOM_FOLDER_ICONS_STORAGE_KEY = 'cyberfiles_custom_folder_icons_v1';

export function normalizeFolderIconKey(path: string): string {
  return folderStylePathKey(path);
}

export function readCustomFolderIcons(): SavedFolderIcons {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_FOLDER_ICONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: SavedFolderIcons = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === 'object' && typeof (value as CustomFolderIconConfig).iconId === 'string') {
        const item = value as CustomFolderIconConfig;
        result[normalizeFolderIconKey(key)] = {
          iconId: item.iconId,
          style: item.style === 'symbol' ? 'symbol' : 'folder-badge',
          category: item.category === 'neutral' ? 'neutral' : 'color',
          colorPreset: typeof item.colorPreset === 'string' ? item.colorPreset : undefined,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeCustomFolderIcons(icons: SavedFolderIcons): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CUSTOM_FOLDER_ICONS_STORAGE_KEY, JSON.stringify(icons));
  } catch {
    // Local storage unavailable or full
  }
}

export function getCustomFolderIcon(
  path: string | undefined | null,
  icons: SavedFolderIcons,
): CustomFolderIconConfig | undefined {
  if (!path) return undefined;
  const key = normalizeFolderIconKey(path);
  return icons[key];
}

export function setCustomFolderIcon(
  path: string,
  config: CustomFolderIconConfig | null,
  currentIcons: SavedFolderIcons,
): SavedFolderIcons {
  const key = normalizeFolderIconKey(path);
  const next = { ...currentIcons };
  if (!config) {
    delete next[key];
  } else {
    next[key] = config;
  }
  writeCustomFolderIcons(next);
  return next;
}
