import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { FileDropOperation, RECYCLE_BIN_PATH, type TabSizePreferences } from '../types';
import { isTauriDesktop } from '../utils/nativeFileSystem';
import { isPortableDeviceRoot } from '../utils/fileSystem';
import {
  canDropExternalPathsOnDestination,
  getExternalDragLeafName,
  normalizeExternalDroppedPaths,
  resolveExternalDropOperation,
  type ExternalDropRejectionReason,
} from '../utils/externalDrop';
import { dismissAllTooltips } from '../components/Tooltip';

interface ExternalFileDragEventPayload {
  kind: 'enter' | 'over' | 'drop' | 'leave';
  paths: string[];
  x: number;
  y: number;
  scaleFactor: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type ExternalInvalidDropReason = ExternalDropRejectionReason | 'invalid-pane';

interface UseExternalFileDropOptions {
  enabled?: boolean;
  tabSizePreferences: TabSizePreferences;
  labels: {
    dragCopyTo: string;
    dragMoveTo: string;
    dragSendToRecycleBin: string;
    dragNotAllowed: string;
    dragModifierHint: string;
  };
  onDropExternalFiles: (
    paths: string[],
    targetFolderPath: string,
    operation: FileDropOperation,
    targetPane?: 'left' | 'right',
  ) => void;
  onInvalidDrop?: (reason: ExternalInvalidDropReason, operation: FileDropOperation) => void;
}

const EDGE_SCROLL_MARGIN_PX = 36;
const EDGE_SCROLL_MAX_STEP_PX = 14;

function buildGhostDocumentIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('cyberfiles-file-drag-ghost-icon');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', '14 2 14 8 20 8');
  svg.append(path, poly);
  return svg;
}

function computeEdgeScrollSpeed(offsetFromStart: number, offsetFromEnd: number): number {
  if (offsetFromStart < EDGE_SCROLL_MARGIN_PX) {
    const ratio = 1 - Math.max(0, offsetFromStart) / EDGE_SCROLL_MARGIN_PX;
    return -Math.max(2, Math.round(ratio * EDGE_SCROLL_MAX_STEP_PX));
  }
  if (offsetFromEnd < EDGE_SCROLL_MARGIN_PX) {
    const ratio = 1 - Math.max(0, offsetFromEnd) / EDGE_SCROLL_MARGIN_PX;
    return Math.max(2, Math.round(ratio * EDGE_SCROLL_MAX_STEP_PX));
  }
  return 0;
}

export function useExternalFileDrop({
  enabled = true,
  tabSizePreferences,
  labels,
  onDropExternalFiles,
  onInvalidDrop,
}: UseExternalFileDropOptions) {
  const optionsRef = useRef({ tabSizePreferences, labels, onDropExternalFiles, onInvalidDrop });
  optionsRef.current = { tabSizePreferences, labels, onDropExternalFiles, onInvalidDrop };

  useEffect(() => {
    if (!enabled || !isTauriDesktop()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let activePaths: string[] = [];
    let highlightedTarget: HTMLElement | null = null;
    let dragGhost: HTMLDivElement | null = null;
    let tabActivationTimer: number | null = null;
    let hoveredTabKey: string | null = null;
    let scrollRafId: number | null = null;
    let scrollState: { viewport: HTMLElement; dx: number; dy: number } | null = null;

    const clearTabActivationTimer = () => {
      if (tabActivationTimer !== null) {
        window.clearTimeout(tabActivationTimer);
        tabActivationTimer = null;
      }
      hoveredTabKey = null;
    };

    const stopEdgeScroll = () => {
      scrollState = null;
      if (scrollRafId !== null) {
        window.cancelAnimationFrame(scrollRafId);
        scrollRafId = null;
      }
    };

    const runEdgeScrollFrame = () => {
      if (!scrollState || !scrollState.viewport.isConnected) {
        stopEdgeScroll();
        return;
      }
      const { viewport, dx, dy } = scrollState;
      if (dx === 0 && dy === 0) {
        stopEdgeScroll();
        return;
      }
      viewport.scrollBy(dx, dy);
      scrollRafId = window.requestAnimationFrame(runEdgeScrollFrame);
    };

    const updateEdgeScroll = (hit: Element | null, clientX: number, clientY: number) => {
      if (!hit || hit.closest('[role="dialog"], [aria-modal="true"]')) {
        stopEdgeScroll();
        return;
      }
      const viewport = hit.closest<HTMLElement>('.cyberfiles-file-viewport');
      if (!viewport) {
        stopEdgeScroll();
        return;
      }
      const bounds = viewport.getBoundingClientRect();
      const canScrollY = viewport.scrollHeight > viewport.clientHeight + 2;
      const canScrollX = viewport.scrollWidth > viewport.clientWidth + 2;
      const dy = canScrollY
        ? computeEdgeScrollSpeed(clientY - bounds.top, bounds.bottom - clientY)
        : 0;
      const dx = canScrollX
        ? computeEdgeScrollSpeed(clientX - bounds.left, bounds.right - clientX)
        : 0;
      if (dx === 0 && dy === 0) {
        stopEdgeScroll();
        return;
      }
      scrollState = { viewport, dx, dy };
      if (scrollRafId === null) {
        scrollRafId = window.requestAnimationFrame(runEdgeScrollFrame);
      }
    };

    const setHighlightedTarget = (target: HTMLElement | null) => {
      if (highlightedTarget === target) return;
      highlightedTarget?.classList.remove('cyberfiles-file-drop-target');
      highlightedTarget = target;
      highlightedTarget?.classList.add('cyberfiles-file-drop-target');
    };

    const ensureDragGhost = (paths: string[]) => {
      if (dragGhost && dragGhost.dataset.signature === `${paths[0] ?? ''}\u0000${paths.length}`) {
        return dragGhost;
      }
      dragGhost?.remove();

      const ghost = document.createElement('div');
      ghost.className = 'cyberfiles-file-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.dataset.signature = `${paths[0] ?? ''}\u0000${paths.length}`;

      const summary = document.createElement('div');
      summary.className = 'cyberfiles-file-drag-ghost-summary';
      const icon = buildGhostDocumentIcon();
      const name = document.createElement('span');
      name.className = 'cyberfiles-file-drag-ghost-name';
      name.textContent = paths[0] ? getExternalDragLeafName(paths[0]) : '';
      summary.append(icon, name);

      if (paths.length > 1) {
        const count = document.createElement('span');
        count.className = 'cyberfiles-file-drag-ghost-count';
        count.textContent = String(paths.length);
        summary.append(count);
      }

      const action = document.createElement('div');
      action.className = 'cyberfiles-file-drag-ghost-action';
      const hint = document.createElement('div');
      hint.className = 'cyberfiles-file-drag-ghost-hint';
      ghost.append(summary, action, hint);
      document.body.append(ghost);
      dragGhost = ghost;
      return ghost;
    };

    const updateDragGhost = (
      clientX: number,
      clientY: number,
      paths: string[],
      destinationPath: string | null,
      allowed: boolean,
      operation: FileDropOperation,
    ) => {
      const { labels: currentLabels } = optionsRef.current;
      const ghost = ensureDragGhost(paths);
      ghost.dataset.allowed = allowed ? 'true' : 'false';
      ghost.dataset.operation = operation;

      const action = ghost.querySelector<HTMLElement>('.cyberfiles-file-drag-ghost-action');
      if (action) {
        action.textContent = allowed && destinationPath
          ? destinationPath === RECYCLE_BIN_PATH
            ? currentLabels.dragSendToRecycleBin
            : (operation === 'copy' ? currentLabels.dragCopyTo : currentLabels.dragMoveTo).replace('{target}', destinationPath)
          : currentLabels.dragNotAllowed;
      }
      const hint = ghost.querySelector<HTMLElement>('.cyberfiles-file-drag-ghost-hint');
      if (hint) {
        const showModifierHint = allowed && destinationPath !== RECYCLE_BIN_PATH;
        hint.textContent = showModifierHint ? currentLabels.dragModifierHint : '';
        hint.style.display = showModifierHint ? '' : 'none';
      }

      const maxLeft = Math.max(8, window.innerWidth - ghost.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - ghost.offsetHeight - 8);
      ghost.style.left = `${Math.min(Math.max(8, clientX + 18), maxLeft)}px`;
      ghost.style.top = `${Math.min(Math.max(8, clientY + 20), maxTop)}px`;
    };

    const updateTabHoverActivation = (hit: Element | null) => {
      const tabTarget = hit && !hit.closest('[role="dialog"], [aria-modal="true"]')
        ? hit.closest<HTMLElement>('[data-file-drop-tab-id]')
        : null;
      const { tabSizePreferences: prefs } = optionsRef.current;
      const tabKey = tabTarget?.dataset.fileDropTabId || null;
      if (
        !tabTarget
        || !tabKey
        || tabTarget.dataset.activeFolderTab === 'true'
        || !prefs.dragHoverActivationEnabled
      ) {
        clearTabActivationTimer();
        return;
      }
      if (hoveredTabKey === tabKey) return;
      clearTabActivationTimer();
      hoveredTabKey = tabKey;
      const targetEl = tabTarget;
      tabActivationTimer = window.setTimeout(() => {
        tabActivationTimer = null;
        if (hoveredTabKey === tabKey && targetEl.isConnected) {
          targetEl.click();
        }
      }, prefs.dragHoverActivationDelay);
    };

    const resolveExternalTarget = (
      clientX: number,
      clientY: number,
      paths: string[],
      payload: ExternalFileDragEventPayload,
    ) => {
      const hit = document.elementFromPoint(clientX, clientY);
      updateEdgeScroll(hit, clientX, clientY);
      updateTabHoverActivation(hit);

      if (!hit || hit.closest('[role="dialog"], [aria-modal="true"]')) {
        return {
          element: null as HTMLElement | null,
          destinationPath: null as string | null,
          targetPane: undefined as 'left' | 'right' | undefined,
          operation: 'copy' as FileDropOperation,
          allowed: false,
          invalidReason: undefined as ExternalInvalidDropReason | undefined,
        };
      }

      /* The Recycle Bin row is a virtual location without a real path, so it carries its own
         marker attribute and is resolved before the folder-based drop destinations. Drive and
         device roots cannot be recycled, so the row rejects them like any other destination. */
      const recycleElement = hit.closest<HTMLElement>('[data-file-drop-recycle-bin]');
      if (recycleElement) {
        const canRecycle = paths.every(path =>
          !isPortableDeviceRoot(path) && !/^[a-zA-Z]:\\$/i.test(path));
        return {
          element: canRecycle ? recycleElement : null,
          destinationPath: RECYCLE_BIN_PATH,
          targetPane: undefined as 'left' | 'right' | undefined,
          operation: 'move' as FileDropOperation,
          allowed: canRecycle,
          invalidReason: undefined as ExternalInvalidDropReason | undefined,
        };
      }

      const element = hit.closest<HTMLElement>('[data-file-drop-path], [data-file-drop-raw-path]');
      const paneAttr = (element ?? hit).closest<HTMLElement>('[data-file-drop-pane]')?.dataset.fileDropPane;
      const targetPane: 'left' | 'right' | undefined =
        paneAttr === 'left' ? 'left' : paneAttr === 'right' ? 'right' : undefined;
      const destinationPath = element?.dataset.fileDropPath || null;
      const rawPath = element?.dataset.fileDropRawPath || destinationPath;

      if (!destinationPath) {
        const invalidReason: ExternalInvalidDropReason | undefined = rawPath
          ? (isPortableDeviceRoot(rawPath) ? 'portable-root' : 'invalid-pane')
          : undefined;
        return {
          element: null,
          destinationPath: null,
          targetPane,
          operation: 'copy' as FileDropOperation,
          allowed: false,
          invalidReason,
        };
      }

      const operation = resolveExternalDropOperation(paths, destinationPath, {
        ctrlKey: payload.ctrlKey,
        shiftKey: payload.shiftKey,
      });
      const validation = canDropExternalPathsOnDestination(paths, destinationPath, operation);
      return {
        element: validation.allowed ? element : null,
        destinationPath,
        targetPane,
        operation,
        allowed: validation.allowed,
        invalidReason: validation.allowed ? undefined : validation.reason,
      };
    };

    const cleanup = () => {
      activePaths = [];
      clearTabActivationTimer();
      stopEdgeScroll();
      setHighlightedTarget(null);
      dragGhost?.remove();
      dragGhost = null;
    };

    const handleNativePointerDown = () => {
      if (dragGhost || highlightedTarget || activePaths.length > 0) {
        cleanup();
      }
    };
    document.addEventListener('pointerdown', handleNativePointerDown, true);

    void listen<ExternalFileDragEventPayload>('external-file-drag', event => {
      if (cancelled) return;
      const payload = event.payload;
      if (payload.kind === 'leave') {
        cleanup();
        return;
      }

      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : (payload.scaleFactor || 1);
      const clientX = payload.x / dpr;
      const clientY = payload.y / dpr;

      if (payload.kind === 'enter') {
        dismissAllTooltips();
        activePaths = normalizeExternalDroppedPaths(payload.paths);
      }

      const pathsForOperation = payload.kind === 'drop' && payload.paths.length > 0
        ? normalizeExternalDroppedPaths(payload.paths)
        : activePaths;

      if (pathsForOperation.length === 0) {
        if (payload.kind === 'drop') cleanup();
        else {
          setHighlightedTarget(null);
          dragGhost?.remove();
          dragGhost = null;
        }
        return;
      }

      const resolution = resolveExternalTarget(clientX, clientY, pathsForOperation, payload);

      if (payload.kind === 'drop') {
        cleanup();
        if (resolution.allowed && resolution.destinationPath) {
          optionsRef.current.onDropExternalFiles(
            pathsForOperation,
            resolution.destinationPath,
            resolution.operation,
            resolution.targetPane,
          );
        } else if (resolution.invalidReason) {
          optionsRef.current.onInvalidDrop?.(resolution.invalidReason, resolution.operation);
        }
        return;
      }

      setHighlightedTarget(resolution.element);
      updateDragGhost(
        clientX,
        clientY,
        pathsForOperation,
        resolution.destinationPath,
        resolution.allowed,
        resolution.operation,
      );
    }).then(stop => {
      if (cancelled) stop();
      else unlisten = stop;
    }).catch(() => {
      // Event listener unavailable outside Tauri
    });

    return () => {
      cancelled = true;
      unlisten?.();
      document.removeEventListener('pointerdown', handleNativePointerDown, true);
      cleanup();
    };
  }, [enabled]);
}
