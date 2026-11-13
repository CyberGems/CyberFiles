import { invoke } from '@tauri-apps/api/core';
import type { SavedTabState, TabSessionSnapshot } from './workspaceProfiles';

/* Crash recovery keeps a continuously updated snapshot of the open tabs in a file written
   atomically by the Rust side. A clean quit deletes it, so finding the file at boot means the
   previous run died without saving, and the recovery modal can offer exactly what was in
   flight compared against the session that would boot normally.

   Known limitation: with multiple instances allowed (opt-in setting) the file is shared and
   the last writer wins, so recovery offers whichever instance wrote last. Browser (non-Tauri)
   mode has no recovery at all. */
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

/// Claims the webview boot for this process run: true on the first call (fresh process), false
/// afterwards (a reload inside the same process). The flag lives in Rust because sessionStorage
/// would be the natural home, but WebView2 backs it to disk and it can survive an unclean kill,
/// which silences the recovery dialog exactly when it matters.
export async function claimWebviewBoot(): Promise<boolean> {
  if (!isTauriDesktop()) return true;
  try {
    return await invoke<boolean>('claim_webview_boot');
  } catch {
    return true;
  }
}

/* The boot check runs exactly once per webview load, from this module-scope promise. StrictMode
   mounts, unmounts and remounts every effect in development, so a claim made inside an effect
   would be consumed by the phantom mount and the real one would see false — which silenced the
   recovery dialog in dev forever. Awaiting one shared promise keeps both mounts consistent. */
const bootRecoveryPromise: Promise<RecoverySnapshot | null> = (async () => {
  const isFreshProcess = await claimWebviewBoot();
  if (!isFreshProcess) return null;
  return readRecoverySnapshot();
})();

export function bootRecoveryResult(): Promise<RecoverySnapshot | null> {
  return bootRecoveryPromise;
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
