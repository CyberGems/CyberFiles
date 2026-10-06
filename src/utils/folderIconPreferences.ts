import { folderStylePathKey } from './folderStylePreferences';

export type FolderIconStyle = 'folder-badge' | 'symbol';
export type FolderIconCategory = 'color' | 'neutral';

export type FolderBadgeType = 'none' | 'in-progress' | 'done' | 'important' | 'urgent' | 'archived' | 'custom';

export interface FolderBadgeConfig {
  type: FolderBadgeType;
  label?: string;
  color?: string; // Hex color e.g. '#06b6d4'
}

export interface CustomFolderIconConfig {
  iconId: string;
  style: FolderIconStyle;
  category: FolderIconCategory;
  colorPreset?: string;
  customColor?: string; // Optional custom hex color
  badge?: FolderBadgeConfig;
}

export type SavedFolderIcons = Record<string, CustomFolderIconConfig>;

export const CUSTOM_FOLDER_ICONS_STORAGE_KEY = 'cyberfiles_custom_folder_icons_v1';

export function normalizeFolderIconKey(path: string): string {
  if (path.startsWith('name:')) {
    return 'name:' + path.slice(5).trim().toLowerCase();
  }
  return folderStylePathKey(path);
}

function parseFolderIconConfig(value: unknown): CustomFolderIconConfig | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.iconId !== 'string') return null;

  const style: FolderIconStyle = item.style === 'folder-badge' ? 'folder-badge' : 'symbol';
  const category: FolderIconCategory = item.category === 'neutral' ? 'neutral' : 'color';
  const colorPreset = typeof item.colorPreset === 'string' ? item.colorPreset : undefined;
  const customColor = typeof item.customColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(item.customColor)
    ? item.customColor
    : undefined;

  let badge: FolderBadgeConfig | undefined;
  if (item.badge && typeof item.badge === 'object') {
    const rawBadge = item.badge as Record<string, unknown>;
    const type = typeof rawBadge.type === 'string' ? (rawBadge.type as FolderBadgeType) : 'none';
    const label = typeof rawBadge.label === 'string' ? rawBadge.label.slice(0, 12) : undefined;
    const color = typeof rawBadge.color === 'string' ? rawBadge.color : undefined;
    badge = { type, label, color };
  }

  const result: CustomFolderIconConfig = {
    iconId: item.iconId,
    style,
    category,
  };
  if (colorPreset) result.colorPreset = colorPreset;
  if (customColor) result.customColor = customColor;
  if (badge) result.badge = badge;

  return result;
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
      const config = parseFolderIconConfig(value);
      if (config) {
        result[normalizeFolderIconKey(key)] = config;
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
  const exactKey = normalizeFolderIconKey(path);
  if (icons[exactKey]) return icons[exactKey];

  // Check fallback name rule if defined
  const parts = path.split(/[\\/]/).filter(Boolean);
  const baseName = parts.length > 0 ? parts[parts.length - 1].trim().toLowerCase() : '';
  if (baseName && icons['name:' + baseName]) {
    return icons['name:' + baseName];
  }

  return undefined;
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

export function exportFolderIconsJson(icons: SavedFolderIcons): string {
  return JSON.stringify(icons, null, 2);
}

export function importFolderIconsJson(
  jsonString: string,
  currentIcons: SavedFolderIcons,
): { success: boolean; icons: SavedFolderIcons; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, icons: currentIcons, count: 0, error: 'Invalid object format' };
    }
    const next = { ...currentIcons };
    let count = 0;
    for (const [key, value] of Object.entries(parsed)) {
      const config = parseFolderIconConfig(value);
      if (config) {
        next[normalizeFolderIconKey(key)] = config;
        count++;
      }
    }
    if (count > 0) {
      writeCustomFolderIcons(next);
    }
    return { success: true, icons: next, count };
  } catch (err) {
    return { success: false, icons: currentIcons, count: 0, error: String(err) };
  }
}
