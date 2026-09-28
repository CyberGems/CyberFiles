import type { GroupByField, SortField, SortOrder, TabState, ViewLayout, ViewMode } from '../types';

export const WORKSPACE_PROFILES_STORAGE_KEY = 'cyberfiles_workspace_profiles_v1';
export const DEFAULT_LAYOUT_PROFILE_ID = 'builtin-default-layout';
export const DEFAULT_SESSION_PROFILE_ID = 'builtin-default-session';

export type WorkspacePaneId = 'left' | 'right';
export type FileColumnId = 'extension' | 'name' | 'type' | 'size' | 'created' | 'modified';

export interface FileColumnLayoutSnapshot {
  order: FileColumnId[];
  visible: FileColumnId[];
}

export interface FileColumnWidthsSnapshot {
  extension: number;
  name: number | null;
  type: number;
  size: number;
  created: number;
  modified: number;
}

export interface PaneColumnsSnapshot {
  layout: FileColumnLayoutSnapshot;
  widths: FileColumnWidthsSnapshot;
}

export interface LayoutSnapshot {
  layout: ViewLayout;
  previewOpen: boolean;
  verticalSplitPercent: number;
  horizontalSplitPercent: number;
  previewSplitPercent: number;
  sidebarSplitPercent: number;
  columns: Record<WorkspacePaneId, PaneColumnsSnapshot>;
}

export type SavedTabState = Pick<
  TabState,
  'currentPath' | 'history' | 'historyIndex' | 'sortField' | 'sortOrder' | 'groupBy' | 'viewMode' | 'folderStyle'
> & { id: string; title: string };

export interface TabSessionSnapshot {
  leftTabs: SavedTabState[];
  rightTabs: SavedTabState[];
  activeLeftTabIndex: number;
  activeRightTabIndex: number;
  activePane: WorkspacePaneId;
}

export interface LayoutProfile {
  id: string;
  name: string;
  snapshot: LayoutSnapshot;
  updatedAt: number;
}

export interface TabSessionProfile {
  id: string;
  name: string;
  snapshot: TabSessionSnapshot;
  updatedAt: number;
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  layoutId: string;
  sessionId: string;
  updatedAt: number;
}

export interface WorkspaceProfileStore {
  layouts: LayoutProfile[];
  sessions: TabSessionProfile[];
  workspaces: WorkspaceProfile[];
  lastLayoutId: string;
  lastSessionId: string;
  lastWorkspaceId: string | null;
}

export const DEFAULT_LAYOUT_SNAPSHOT: LayoutSnapshot = {
  layout: 'dual-vertical',
  previewOpen: true,
  verticalSplitPercent: 50,
  horizontalSplitPercent: 50,
  previewSplitPercent: 72,
  sidebarSplitPercent: 22,
  columns: {
    left: {
      layout: { order: ['extension', 'name', 'type', 'size', 'created', 'modified'], visible: ['name', 'type', 'size', 'created', 'modified'] },
      widths: { extension: 58, name: null, type: 148, size: 84, created: 116, modified: 116 },
    },
    right: {
      layout: { order: ['extension', 'name', 'type', 'size', 'created', 'modified'], visible: ['name', 'type', 'size', 'created', 'modified'] },
      widths: { extension: 58, name: null, type: 148, size: 84, created: 116, modified: 116 },
    },
  },
};

const VALID_COLUMNS: FileColumnId[] = ['extension', 'name', 'type', 'size', 'created', 'modified'];

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function normalizeColumnLayout(value: unknown): FileColumnLayoutSnapshot {
  const raw = value && typeof value === 'object' ? value as Partial<FileColumnLayoutSnapshot> : {};
  const order = Array.isArray(raw.order) ? VALID_COLUMNS.filter(column => raw.order!.includes(column)) : [...VALID_COLUMNS];
  VALID_COLUMNS.forEach(column => { if (!order.includes(column)) order.push(column); });
  const savedHadTypeColumn = Array.isArray(raw.order) && raw.order.includes('type');
  const visible: FileColumnId[] = Array.isArray(raw.visible)
    ? order.filter(column => raw.visible!.includes(column) || (column === 'type' && !savedHadTypeColumn))
    : ['name', 'type', 'size', 'created', 'modified'];
  return { order, visible: visible.length > 0 ? visible : ['name'] };
}

function normalizeColumnWidths(value: unknown): FileColumnWidthsSnapshot {
  const raw = value && typeof value === 'object' ? value as Partial<FileColumnWidthsSnapshot> : {};
  return {
    extension: clampNumber(raw.extension, 58, 42, 220),
    name: raw.name === null ? null : clampNumber(raw.name, 160, 100, 1600),
    type: clampNumber(raw.type, 148, 80, 500),
    size: clampNumber(raw.size, 84, 56, 320),
    created: clampNumber(raw.created, 116, 80, 480),
    modified: clampNumber(raw.modified, 116, 80, 480),
  };
}

export function normalizeLayoutSnapshot(value: unknown): LayoutSnapshot {
  const raw = value && typeof value === 'object' ? value as Partial<LayoutSnapshot> : {};
  const rawColumns = raw.columns as Partial<Record<WorkspacePaneId, PaneColumnsSnapshot>> | undefined;
  const pane = (id: WorkspacePaneId): PaneColumnsSnapshot => {
    const rawPane: Partial<PaneColumnsSnapshot> = rawColumns?.[id] ?? {};
    return {
      layout: normalizeColumnLayout(rawPane.layout),
      widths: normalizeColumnWidths(rawPane.widths),
    };
  };
  return {
    layout: raw.layout === 'dual-horizontal' || raw.layout === 'single' ? raw.layout : 'dual-vertical',
    previewOpen: typeof raw.previewOpen === 'boolean' ? raw.previewOpen : DEFAULT_LAYOUT_SNAPSHOT.previewOpen,
    verticalSplitPercent: clampNumber(raw.verticalSplitPercent, 50, 20, 80),
    horizontalSplitPercent: clampNumber(raw.horizontalSplitPercent, 50, 20, 80),
    previewSplitPercent: clampNumber(raw.previewSplitPercent, 72, 20, 80),
    sidebarSplitPercent: clampNumber(raw.sidebarSplitPercent, 22, 20, 42),
    columns: { left: pane('left'), right: pane('right') },
  };
}

function normalizeSortField(value: unknown): SortField {
  return value === 'size' || value === 'type' || value === 'createdDate' || value === 'modifiedDate' || value === 'extension'
    ? value
    : 'name';
}

function normalizeGroupBy(value: unknown): GroupByField {
  return value === 'name' || value === 'modifiedDate' || value === 'type' || value === 'size' ? value : 'none';
}

function normalizeViewMode(value: unknown): ViewMode {
  return value === 'compact' || value === 'icons' ? value : 'details';
}

function normalizeSavedTab(value: unknown, pane: WorkspacePaneId, index: number): SavedTabState {
  const raw = value && typeof value === 'object' ? value as Partial<SavedTabState> : {};
  const history = Array.isArray(raw.history) ? raw.history.filter(path => typeof path === 'string') : [];
  const sortField = normalizeSortField(raw.sortField);
  const sortOrder: SortOrder = raw.sortOrder === 'desc' ? 'desc' : 'asc';
  const viewMode = normalizeViewMode(raw.viewMode);
  const groupBy = normalizeGroupBy(raw.groupBy);
  const rawFolderStyle = raw.folderStyle && typeof raw.folderStyle === 'object' ? raw.folderStyle : undefined;
  const folderStyle = rawFolderStyle ? {
    sortField: normalizeSortField(rawFolderStyle.sortField),
    sortOrder: rawFolderStyle.sortOrder === 'desc' ? 'desc' as const : 'asc' as const,
    groupBy: normalizeGroupBy(rawFolderStyle.groupBy ?? raw.groupBy),
    viewMode: normalizeViewMode(rawFolderStyle.viewMode),
  } : { sortField, sortOrder, groupBy, viewMode };
  const currentPath = typeof raw.currentPath === 'string' ? raw.currentPath : '';
  const historyIndex = clampNumber(raw.historyIndex, history.length - 1, -1, Math.max(-1, history.length - 1));
  return {
    id: typeof raw.id === 'string' ? raw.id : `${pane}-session-tab-${index + 1}`,
    title: typeof raw.title === 'string' ? raw.title : '',
    currentPath,
    history,
    historyIndex,
    sortField,
    sortOrder,
    groupBy,
    viewMode,
    folderStyle,
  };
}

export function normalizeSessionSnapshot(value: unknown): TabSessionSnapshot {
  const raw = value && typeof value === 'object' ? value as Partial<TabSessionSnapshot> : {};
  const leftTabs = Array.isArray(raw.leftTabs) ? raw.leftTabs.map((tab, index) => normalizeSavedTab(tab, 'left', index)) : [];
  const rightTabs = Array.isArray(raw.rightTabs) ? raw.rightTabs.map((tab, index) => normalizeSavedTab(tab, 'right', index)) : [];
  return {
    leftTabs: leftTabs.length ? leftTabs : [normalizeSavedTab(null, 'left', 0)],
    rightTabs: rightTabs.length ? rightTabs : [normalizeSavedTab(null, 'right', 0)],
    activeLeftTabIndex: Math.floor(clampNumber(raw.activeLeftTabIndex, 0, 0, Math.max(0, leftTabs.length - 1))),
    activeRightTabIndex: Math.floor(clampNumber(raw.activeRightTabIndex, 0, 0, Math.max(0, rightTabs.length - 1))),
    activePane: raw.activePane === 'right' ? 'right' : 'left',
  };
}

export function readWorkspaceProfileStore(): WorkspaceProfileStore {
  const fallback: WorkspaceProfileStore = {
    layouts: [],
    sessions: [],
    workspaces: [],
    lastLayoutId: DEFAULT_LAYOUT_PROFILE_ID,
    lastSessionId: DEFAULT_SESSION_PROFILE_ID,
    lastWorkspaceId: null,
  };
  try {
    const raw = JSON.parse(window.localStorage.getItem(WORKSPACE_PROFILES_STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    const layouts: LayoutProfile[] = Array.isArray(raw.layouts) ? raw.layouts.filter((profile: any) => profile && typeof profile.id === 'string' && typeof profile.name === 'string').map((profile: any) => ({
      id: profile.id,
      name: profile.name,
      snapshot: normalizeLayoutSnapshot(profile.snapshot),
      updatedAt: clampNumber(profile.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    })) : [];
    const sessions: TabSessionProfile[] = Array.isArray(raw.sessions) ? raw.sessions.filter((profile: any) => profile && typeof profile.id === 'string' && typeof profile.name === 'string').map((profile: any) => ({
      id: profile.id,
      name: profile.name,
      snapshot: normalizeSessionSnapshot(profile.snapshot),
      updatedAt: clampNumber(profile.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    })) : [];
    const sessionIds = new Set<string>([DEFAULT_SESSION_PROFILE_ID, ...sessions.map(profile => profile.id)]);
    const layoutIds = new Set<string>([DEFAULT_LAYOUT_PROFILE_ID, ...layouts.map(profile => profile.id)]);
    const workspaces: WorkspaceProfile[] = Array.isArray(raw.workspaces) ? raw.workspaces.filter((profile: any) => profile && typeof profile.id === 'string' && typeof profile.name === 'string' && layoutIds.has(profile.layoutId) && sessionIds.has(profile.sessionId)).map((profile: any) => ({
      id: profile.id,
      name: profile.name,
      layoutId: profile.layoutId,
      sessionId: profile.sessionId,
      updatedAt: clampNumber(profile.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    })) : [];
    return {
      layouts,
      sessions,
      workspaces,
      lastLayoutId: layoutIds.has(raw.lastLayoutId) ? raw.lastLayoutId : DEFAULT_LAYOUT_PROFILE_ID,
      lastSessionId: sessionIds.has(raw.lastSessionId) ? raw.lastSessionId : DEFAULT_SESSION_PROFILE_ID,
      lastWorkspaceId: typeof raw.lastWorkspaceId === 'string' && workspaces.some(profile => profile.id === raw.lastWorkspaceId) ? raw.lastWorkspaceId : null,
    };
  } catch {
    return fallback;
  }
}

export function writeWorkspaceProfileStore(store: WorkspaceProfileStore) {
  window.localStorage.setItem(WORKSPACE_PROFILES_STORAGE_KEY, JSON.stringify(store));
}

export function createProfileId(type: 'layout' | 'session' | 'workspace') {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${type}-${random}`;
}

export function defaultSessionSnapshot(systemHomePath: string, _systemHomeTitle: string): TabSessionSnapshot {
  const makeTab = (pane: WorkspacePaneId): SavedTabState => ({
    id: `${pane}-default-tab`,
    title: systemHomePath || '',
    currentPath: systemHomePath,
    history: [systemHomePath],
    historyIndex: 0,
    sortField: 'name',
    sortOrder: 'asc',
    groupBy: 'none',
    viewMode: 'details',
    folderStyle: { sortField: 'name', sortOrder: 'asc', groupBy: 'none', viewMode: 'details' },
  });
  return {
    leftTabs: [makeTab('left')],
    rightTabs: [makeTab('right')],
    activeLeftTabIndex: 0,
    activeRightTabIndex: 0,
    activePane: 'left',
  };
}
