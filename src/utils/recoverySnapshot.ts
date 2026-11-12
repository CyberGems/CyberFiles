import { invoke } from '@tauri-apps/api/core';
import type { SavedTabState, TabSessionSnapshot } from './workspaceProfiles';

/* Crash recovery keeps a continuously updated snapshot of the open tabs in a file written
   atomically by the Rust side. A clean quit deletes it, so finding the file at boot means the
   previous run died without saving, and the recovery modal can offer exactly what was in
   flight compared against the session that would boot normally. */

export interface RecoveryTab extends SavedTabState {
  filterQuery?: string;
}

export interface RecoverySnapshot {
  savedAt: number;
  activePane: 'left' | 'right';
  activeLeftTabIndex: number;
  activeRightTabIndex: number;
  leftTabs: RecoveryTab[];
  rightTabs: RecoveryTab[];
}

const BOOT_SESSION_MARKER_KEY = 'cyberfiles_boot_session_v1';

/// sessionStorage survives a webview reload but dies with the process, so its presence
/// distinguishes a reload (F5, error-boundary retry) from a real fresh boot.
export function hasBootSessionMarker(): boolean {
  try {
    return window.sessionStorage.getItem(BOOT_SESSION_MARKER_KEY) === 'true';
  } catch {
    // Without sessionStorage we cannot tell a reload from a fresh boot; staying quiet
    // avoids nagging the user with a recovery dialog after every reload.
    return true;
  }
}

export function markBootSession(): void {
  try {
    window.sessionStorage.setItem(BOOT_SESSION_MARKER_KEY, 'true');
  } catch {
    // Storage unavailable: reload detection degrades and the modal may reappear after a
    // reload, which still shows accurate data.
  }
}

function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function isRecoverySnapshot(value: unknown): value is RecoverySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<RecoverySnapshot>;
  return typeof snapshot.savedAt === 'number'
    && (snapshot.activePane === 'left' || snapshot.activePane === 'right')
    && typeof snapshot.activeLeftTabIndex === 'number'
    && typeof snapshot.activeRightTabIndex === 'number'
    && Array.isArray(snapshot.leftTabs)
    && Array.isArray(snapshot.rightTabs);
}

export async function writeRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await invoke('write_recovery_snapshot', { data: JSON.stringify(snapshot) });
  } catch {
    // Recovery is best-effort by design; a failed write must never disturb the session.
  }
}

export async function readRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  if (!isTauriDesktop()) return null;
  try {
    const raw = await invoke<string | null>('read_recovery_snapshot');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecoverySnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearRecoverySnapshot(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await invoke('clear_recovery_snapshot');
  } catch {
    // If cleanup fails, the next boot still compares contents rather than trusting existence.
  }
}

/* A stable per-tab fingerprint for the saved-versus-recovered comparison. Everything the
   recovery restores participates; the fields boot restore rewrites are compared too so the
   modal can tell "same" from "changed" exactly as restoring would reproduce it. */
function tabSignature(tab: SavedTabState | RecoveryTab): string {
  return [
    tab.currentPath ?? '',
    tab.title ?? '',
    tab.customTitle ?? '',
    tab.tabColor ?? '',
    tab.lockClose ? '1' : '0',
    tab.sortField ?? 'name',
    tab.sortOrder ?? 'asc',
    tab.groupBy ?? 'none',
    tab.viewMode ?? 'details',
    JSON.stringify(tab.folderStyle ?? null),
    String(tab.historyIndex ?? -1),
    (tab.history ?? []).join('|'),
    tab.flatView ? '1' : '0',
    (('filterQuery' in tab ? tab.filterQuery : undefined) ?? ''),
  ].join('\u0000');
}

function paneSnapshot(pane: 'left' | 'right', snapshot: TabSessionSnapshot | null): { tabs: RecoveryTab[]; activeIndex: number } {
  const source = snapshot ?? { leftTabs: [], rightTabs: [], activeLeftTabIndex: 0, activeRightTabIndex: 0, activePane: 'left' as const };
  return pane === 'left'
    ? { tabs: source.leftTabs, activeIndex: source.activeLeftTabIndex }
    : { tabs: source.rightTabs, activeIndex: source.activeRightTabIndex };
}

export type RecoveryTabStatus = 'new' | 'changed' | 'same';

export interface RecoveryTabComparison {
  tab: RecoveryTab;
  status: RecoveryTabStatus;
}

export interface RecoveryPaneComparison {
  savedCount: number;
  recoveredCount: number;
  savedActiveTitle: string | null;
  recoveredActiveTitle: string | null;
  tabs: RecoveryTabComparison[];
  removed: SavedTabState[];
}

export interface RecoveryComparison {
  left: RecoveryPaneComparison;
  right: RecoveryPaneComparison;
  identical: boolean;
}

function comparePane(pane: 'left' | 'right', recovered: RecoverySnapshot, baseline: TabSessionSnapshot | null): RecoveryPaneComparison {
  const savedPane = paneSnapshot(pane, baseline);
  const recoveredPane = paneSnapshot(pane, { ...recovered, activePane: recovered.activePane });
  const savedById = new Map(savedPane.tabs.map(tab => [tab.id, tab]));
  const recoveredIds = new Set(recoveredPane.tabs.map(tab => tab.id));
  const tabs = recoveredPane.tabs.map(tab => {
    const savedTab = savedById.get(tab.id);
    if (!savedTab) return { tab, status: 'new' as const };
    return { tab, status: tabSignature(savedTab) === tabSignature(tab) ? ('same' as const) : ('changed' as const) };
  });
  const removed = savedPane.tabs.filter(tab => !recoveredIds.has(tab.id));
  const savedActive = savedPane.tabs[savedPane.activeIndex] ?? null;
  const recoveredActive = recoveredPane.tabs[recoveredPane.activeIndex] ?? null;
  return {
    savedCount: savedPane.tabs.length,
    recoveredCount: recoveredPane.tabs.length,
    savedActiveTitle: savedActive?.customTitle || savedActive?.title || savedActive?.currentPath || null,
    recoveredActiveTitle: recoveredActive?.customTitle || recoveredActive?.title || recoveredActive?.currentPath || null,
    tabs,
    removed,
  };
}

export function compareSnapshots(recovered: RecoverySnapshot, baseline: TabSessionSnapshot | null): RecoveryComparison {
  const left = comparePane('left', recovered, baseline);
  const right = comparePane('right', recovered, baseline);
  const baselinePane = (pane: 'left' | 'right') => paneSnapshot(pane, baseline);
  const recoveredPane = (pane: 'left' | 'right') => paneSnapshot(pane, { ...recovered, activePane: recovered.activePane });
  const identical = recovered.activePane === (baseline?.activePane ?? 'left')
    && recovered.activeLeftTabIndex === (baseline?.activeLeftTabIndex ?? 0)
    && recovered.activeRightTabIndex === (baseline?.activeRightTabIndex ?? 0)
    && left.savedCount === left.recoveredCount
    && right.savedCount === right.recoveredCount
    && left.removed.length === 0
    && right.removed.length === 0
    && left.tabs.every(entry => entry.status === 'same')
    && right.tabs.every(entry => entry.status === 'same')
    && baselinePane('left').tabs.length === recoveredPane('left').tabs.length
    && baselinePane('right').tabs.length === recoveredPane('right').tabs.length;
  return { left, right, identical };
}
