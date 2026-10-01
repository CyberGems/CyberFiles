import type {
  FileColumnId,
  FileColumnLayoutSnapshot,
  FileColumnWidthsSnapshot,
  PaneColumnsSnapshot,
  WorkspacePaneId,
} from './workspaceProfiles';

export const FILE_COLUMN_WIDTHS_STORAGE_KEY = 'cyberfiles_file_column_widths_v1';
export const FILE_COLUMN_LAYOUT_STORAGE_KEY = 'cyberfiles_file_column_layout_v1';

export const DEFAULT_FILE_COLUMN_WIDTHS: FileColumnWidthsSnapshot = {
  extension: 58,
  name: null,
  type: 148,
  size: 84,
  created: 116,
  modified: 116,
};

const COLUMNS: FileColumnId[] = ['extension', 'name', 'type', 'size', 'created', 'modified'];
export const DEFAULT_FILE_COLUMN_LAYOUT: FileColumnLayoutSnapshot = {
  order: COLUMNS,
  visible: ['name', 'type', 'size', 'created', 'modified'],
};

function readLayout(paneId: WorkspacePaneId): FileColumnLayoutSnapshot {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${FILE_COLUMN_LAYOUT_STORAGE_KEY}_${paneId}`) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_FILE_COLUMN_LAYOUT;
    const savedHadTypeColumn = Array.isArray(saved.order) && saved.order.includes('type');
    const order: FileColumnId[] = Array.isArray(saved.order)
      ? COLUMNS.filter(column => saved.order.includes(column))
      : [...DEFAULT_FILE_COLUMN_LAYOUT.order];
    COLUMNS.forEach(column => {
      if (!order.includes(column)) order.push(column);
    });
    const visible = Array.isArray(saved.visible)
      ? order.filter(column => saved.visible.includes(column) || (column === 'type' && !savedHadTypeColumn))
      : DEFAULT_FILE_COLUMN_LAYOUT.visible;
    return { order, visible: visible.length > 0 ? visible : ['name'] };
  } catch {
    return DEFAULT_FILE_COLUMN_LAYOUT;
  }
}

function readWidths(paneId: WorkspacePaneId): FileColumnWidthsSnapshot {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${FILE_COLUMN_WIDTHS_STORAGE_KEY}_${paneId}`) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_FILE_COLUMN_WIDTHS;
    return {
      extension: typeof saved.extension === 'number' ? Math.min(220, Math.max(42, saved.extension)) : DEFAULT_FILE_COLUMN_WIDTHS.extension,
      name: typeof saved.name === 'number' ? Math.min(1600, Math.max(100, saved.name)) : DEFAULT_FILE_COLUMN_WIDTHS.name,
      type: typeof saved.type === 'number' ? Math.min(500, Math.max(80, saved.type)) : DEFAULT_FILE_COLUMN_WIDTHS.type,
      size: typeof saved.size === 'number' ? Math.min(320, Math.max(56, saved.size)) : DEFAULT_FILE_COLUMN_WIDTHS.size,
      created: typeof saved.created === 'number' ? Math.min(480, Math.max(80, saved.created)) : DEFAULT_FILE_COLUMN_WIDTHS.created,
      modified: typeof saved.modified === 'number' ? Math.min(480, Math.max(80, saved.modified)) : DEFAULT_FILE_COLUMN_WIDTHS.modified,
    };
  } catch {
    return DEFAULT_FILE_COLUMN_WIDTHS;
  }
}

export function readPaneColumnPreferences(paneId: WorkspacePaneId): PaneColumnsSnapshot {
  return { layout: readLayout(paneId), widths: readWidths(paneId) };
}

export function writePaneColumnPreferences(paneId: WorkspacePaneId, preferences: PaneColumnsSnapshot) {
  try {
    window.localStorage.setItem(`${FILE_COLUMN_LAYOUT_STORAGE_KEY}_${paneId}`, JSON.stringify(preferences.layout));
    window.localStorage.setItem(`${FILE_COLUMN_WIDTHS_STORAGE_KEY}_${paneId}`, JSON.stringify(preferences.widths));
  } catch {
    // Preferences remain in component state for this session if storage is unavailable.
  }
}
