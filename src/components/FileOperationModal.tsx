import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Gauge,
  ListChecks,
  MoveRight,
  Pause,
  Pencil,
  Pin,
  Play,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { formatFileSize } from '../utils/fileSystem';
import { Tooltip } from './Tooltip';
import type { NativeTransferProgress } from '../utils/nativeFileSystem';
import type { ArchiveExtractionMode } from '../types';

export type TransferKind = 'copy' | 'move' | 'extract' | 'compress' | 'delete' | 'recycle' | 'restore' | 'create' | 'rename';
export type TransferStatus = 'queued' | 'awaiting-password' | 'running' | 'paused' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export interface TransferOperationView extends NativeTransferProgress {
  kind: TransferKind;
  sourcePaths: string[];
  targetPath: string;
  status: TransferStatus;
  startedAt: number | null;
  finishedAt?: number | null;
  sourcePane?: 'left' | 'right';
  selectionPane?: 'left' | 'right';
  clipboardSequence?: number;
  extractionMode?: ArchiveExtractionMode;
  archiveName?: string;
  undoActionId?: string;
  preserveNames?: boolean;
  resultPath?: string;
  error?: string;
  completedPaths?: string[];
  failures?: Array<{ path: string; error: string }>;
}

export interface FileOperationModalProps {
  operations: TransferOperationView[];
  hidden?: boolean;
  isOpen?: boolean;
  language: 'en' | 'es';
  onClose?: () => void;
  onOpen?: () => void;
  onTogglePause: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onCancelAll?: () => void;
  onRetry?: (operation: TransferOperationView) => void;
  onNavigateTo?: (path: string) => void;
  onSubmitPassword: (jobId: string, password: string) => void;
  onClearHistory: () => void;
}

const PANEL_OPEN_DELAY_MS = 450;
const PANEL_HOLD_AFTER_FINISH_MS = 3200;

function elapsedLabel(seconds: number, language: 'en' | 'es'): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  return hours > 0
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0')
    : minutes + ':' + String(secs).padStart(2, '0');
}

export function displayPath(path: string, language: 'en' | 'es' = 'es'): string {
  if (!path) return '';
  if (path === '::recycle-bin::') return language === 'es' ? 'Papelera de reciclaje' : 'Recycle Bin';
  return path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
}

export function statusLabel(operation: TransferOperationView, language: 'en' | 'es'): string {
  const spanish = language === 'es';
  switch (operation.status) {
    case 'queued': return spanish ? 'En cola' : 'Queued';
    case 'awaiting-password': return spanish ? 'Contraseña requerida' : 'Password required';
    case 'running': return spanish ? 'En curso' : 'In progress';
    case 'paused': return spanish ? 'En pausa' : 'Paused';
    case 'cancelling': return spanish ? 'Cancelando…' : 'Cancelling…';
    case 'completed': return spanish ? 'Completada' : 'Completed';
    case 'failed': return spanish ? 'Con errores' : 'Failed';
    case 'cancelled': return spanish ? 'Cancelada' : 'Cancelled';
  }
}

export function operationActionLabel(operation: TransferOperationView, language: 'en' | 'es'): string {
  const spanish = language === 'es';
  const count = operation.sourcePaths.length;
  if (operation.kind === 'extract') return spanish ? 'Extrayendo archivo' : 'Extracting archive';
  if (operation.kind === 'compress') return spanish ? 'Creando archivo ZIP' : 'Creating ZIP archive';
  if (operation.kind === 'delete') {
    if (count === 0 || operation.sourcePaths[0] === '::recycle-bin::') {
      return spanish ? 'Vaciando papelera de reciclaje' : 'Emptying Recycle Bin';
    }
    return spanish
      ? `Eliminando permanentemente ${count} ${count === 1 ? 'elemento' : 'elementos'}`
      : `Permanently deleting ${count} ${count === 1 ? 'item' : 'items'}`;
  }
  if (operation.kind === 'recycle') {
    return spanish
      ? `Enviando a papelera ${count} ${count === 1 ? 'elemento' : 'elementos'}`
      : `Moving ${count} ${count === 1 ? 'item' : 'items'} to Recycle Bin`;
  }
  if (operation.kind === 'restore') {
    return spanish
      ? `Restaurando ${count} ${count === 1 ? 'elemento' : 'elementos'}`
      : `Restoring ${count} ${count === 1 ? 'item' : 'items'}`;
  }
  if (operation.kind === 'create') {
    if (operation.archiveName === 'folder') {
      return spanish ? 'Carpeta creada' : 'Created folder';
    }
    if (operation.archiveName === 'shortcut') {
      return spanish ? 'Acceso directo creado' : 'Created shortcut';
    }
    if (operation.archiveName === 'image') {
      return spanish ? 'Imagen pegada' : 'Pasted image';
    }
    return spanish ? 'Archivo creado' : 'Created file';
  }
  if (operation.kind === 'rename') {
    return spanish
      ? `Renombrando ${count} ${count === 1 ? 'elemento' : 'elementos'}`
      : `Renaming ${count} ${count === 1 ? 'item' : 'items'}`;
  }
  if (operation.kind === 'copy') return spanish
    ? `Copiando ${count} ${count === 1 ? 'elemento' : 'elementos'}`
    : `Copying ${count} ${count === 1 ? 'item' : 'items'}`;
  return spanish
    ? `Moviendo ${count} ${count === 1 ? 'elemento' : 'elementos'}`
    : `Moving ${count} ${count === 1 ? 'item' : 'items'}`;
}

export function sourceLabel(operation: TransferOperationView, language: 'en' | 'es'): string {
  if (operation.kind === 'extract') {
    return operation.sourcePaths[0]?.split(/[\\/]/).pop() || (language === 'es' ? 'Archivo comprimido' : 'Archive');
  }
  if (operation.kind === 'compress') return operation.archiveName || (language === 'es' ? 'Archivo ZIP' : 'ZIP archive');
  if (operation.sourcePaths[0] === '::recycle-bin::') {
    return language === 'es' ? 'Papelera de reciclaje' : 'Recycle Bin';
  }
  return operation.sourcePaths.length === 1
    ? operation.sourcePaths[0].split(/[\\/]/).pop() || operation.sourcePaths[0]
    : (language === 'es' ? `${operation.sourcePaths.length} elementos seleccionados` : `${operation.sourcePaths.length} selected items`);
}

function formatRelativeTime(timestamp: number | null | undefined, language: 'en' | 'es'): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  const isSpanish = language === 'es';
  if (diffSec < 45) return isSpanish ? 'Hace un momento' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isSpanish ? `Hace ${diffMin} min` : `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return isSpanish ? `Hace ${diffHours} h` : `${diffHours}h ago`;
  const date = new Date(timestamp);
  return date.toLocaleTimeString(isSpanish ? 'es-CR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(startedAt: number | null | undefined, finishedAt: number | null | undefined, language: 'en' | 'es'): string {
  if (!startedAt || !finishedAt || finishedAt < startedAt) return '';
  const seconds = (finishedAt - startedAt) / 1000;
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = Math.round(seconds % 60);
  return `${mins}m ${remSecs}s`;
}

export const FileOperationModal: React.FC<FileOperationModalProps> = ({
  operations,
  hidden = false,
  isOpen = false,
  language,
  onClose = () => {},
  onOpen,
  onTogglePause,
  onCancel,
  onCancelAll,
  onRetry,
  onNavigateTo,
  onSubmitPassword,
  onClearHistory,
}) => {
  const [isPinned, setIsPinned] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [passwordValues, setPasswordValues] = useState<Record<string, string>>({});
  const [copiedErrorJobId, setCopiedErrorJobId] = useState<string | null>(null);
  const [expandedFailuresJobId, setExpandedFailuresJobId] = useState<string | null>(null);

  const panelRef = useRef<HTMLElement>(null);
  const lastSample = useRef<{ time: number; bytes: number } | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const wasAutoOpenedRef = useRef(false);

  const activeOperation = operations.find(operation => ['running', 'paused', 'cancelling'].includes(operation.status));
  const activeRef = useRef(activeOperation);
  activeRef.current = activeOperation;

  const isSpanish = language === 'es';
  const pendingCount = operations.filter(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status)).length;
  const queuedOperations = operations.filter(operation => operation.status === 'queued');
  const passwordOperations = operations.filter(operation => operation.status === 'awaiting-password');
  const recentOperations = operations.filter(operation => ['completed', 'failed', 'cancelled'].includes(operation.status)).slice(-30).reverse();
  const firstPasswordOperation = passwordOperations[0];

  const previousPendingCount = useRef(pendingCount);
  const openDelayTimer = useRef<number | null>(null);
  const closeDelayTimer = useRef<number | null>(null);
  const title = isSpanish ? 'Centro de operaciones' : 'Operations center';

  useEffect(() => {
    if (!firstPasswordOperation) return;
    wasAutoOpenedRef.current = true;
    onOpen?.();
  }, [firstPasswordOperation?.jobId, onOpen]);

  useEffect(() => {
    if (!firstPasswordOperation || !isOpen) return;
    const frame = window.requestAnimationFrame(() => passwordInputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [firstPasswordOperation?.jobId, firstPasswordOperation?.error, isOpen]);

  useEffect(() => {
    const wasIdle = previousPendingCount.current === 0;
    previousPendingCount.current = pendingCount;

    if (pendingCount > 0) {
      if (closeDelayTimer.current !== null) {
        window.clearTimeout(closeDelayTimer.current);
        closeDelayTimer.current = null;
      }
      if (wasIdle && openDelayTimer.current === null) {
        openDelayTimer.current = window.setTimeout(() => {
          openDelayTimer.current = null;
          wasAutoOpenedRef.current = true;
          onOpen?.();
        }, PANEL_OPEN_DELAY_MS);
      }
      return;
    }

    if (openDelayTimer.current !== null) {
      window.clearTimeout(openDelayTimer.current);
      openDelayTimer.current = null;
    }
    if (isPinned) {
      if (closeDelayTimer.current !== null) {
        window.clearTimeout(closeDelayTimer.current);
        closeDelayTimer.current = null;
      }
      return;
    }
    if (!isOpen || !wasAutoOpenedRef.current || closeDelayTimer.current !== null) return;
    closeDelayTimer.current = window.setTimeout(() => {
      closeDelayTimer.current = null;
      wasAutoOpenedRef.current = false;
      onClose();
    }, PANEL_HOLD_AFTER_FINISH_MS);
  }, [pendingCount, isPinned, isOpen, onClose, onOpen]);

  useEffect(() => () => {
    if (openDelayTimer.current !== null) window.clearTimeout(openDelayTimer.current);
    if (closeDelayTimer.current !== null) window.clearTimeout(closeDelayTimer.current);
  }, []);

  useEffect(() => {
    if (!activeOperation) return;
    setElapsed(0);
    setSpeed(0);
    setSpeedHistory([]);
    lastSample.current = { time: Date.now(), bytes: activeOperation.bytesCopied };
    const timer = window.setInterval(() => {
      const latest = activeRef.current;
      if (!latest) return;
      setElapsed(latest.startedAt ? (Date.now() - latest.startedAt) / 1000 : 0);
      if (!lastSample.current) return;
      const now = Date.now();
      const deltaMs = now - lastSample.current.time;
      if (deltaMs < 850) return;
      const nextSpeed = latest.status === 'paused' ? 0 : Math.max(0, (latest.bytesCopied - lastSample.current.bytes) * 1000 / deltaMs);
      lastSample.current = { time: now, bytes: latest.bytesCopied };
      setSpeed(nextSpeed);
      setSpeedHistory(previous => [...previous.slice(-39), nextSpeed]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeOperation?.jobId]);

  useEffect(() => {
    if (activeOperation?.status === 'paused' && lastSample.current) {
      lastSample.current = { time: Date.now(), bytes: activeOperation.bytesCopied };
    }
  }, [activeOperation?.status, activeOperation?.bytesCopied]);

  useEffect(() => {
    if (!isOpen || hidden) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hidden, onClose]);

  useEffect(() => {
    if (!isOpen || hidden) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const statusTrigger = document.getElementById('operations-center-status-trigger');
      if (statusTrigger?.contains(event.target as Node)) return;
      if (!panelRef.current?.contains(event.target as Node)) {
        if (!isPinned) onClose();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick, true);
  }, [isOpen, hidden, isPinned, onClose]);

  const copyErrorDetails = async (operation: TransferOperationView) => {
    const errorText = [
      `Operation: ${operation.kind} (${operation.status})`,
      `From: ${operation.sourcePaths.join(', ')}`,
      `To: ${operation.targetPath}`,
      operation.error ? `Error: ${operation.error}` : '',
      operation.failures && operation.failures.length > 0
        ? `Failures:\n${operation.failures.map(f => `  - ${f.path}: ${f.error}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      setCopiedErrorJobId(operation.jobId);
      window.setTimeout(() => setCopiedErrorJobId(null), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  if (hidden || !isOpen) return null;

  const progress = activeOperation?.totalBytes
    ? Math.min(1, activeOperation.bytesCopied / activeOperation.totalBytes)
    : activeOperation?.totalItems ? Math.min(1, activeOperation.itemsCompleted / activeOperation.totalItems) : 0;
  const percent = Math.round(progress * 100);
  const remaining = activeOperation && speed > 0 && activeOperation.totalBytes > activeOperation.bytesCopied
    ? (activeOperation.totalBytes - activeOperation.bytesCopied) / speed : null;
  const graphMax = Math.max(1, ...speedHistory);
  const graphPoints = speedHistory.map((sample, index) => {
    const x = speedHistory.length <= 1 ? 0 : index / (speedHistory.length - 1) * 100;
    const y = 42 - sample / graphMax * 36;
    return x + ',' + y;
  }).join(' ');
  const currentItemLabel = activeOperation?.currentItem || activeOperation?.sourcePaths[0] || (isSpanish ? 'Preparando…' : 'Preparing…');
  const remainingLabel = remaining === null ? '—' : elapsedLabel(remaining, language);

  return createPortal(
    <aside
      ref={panelRef}
      className="pointer-events-none fixed bottom-9 right-3 z-[120] flex max-h-[min(82vh,780px)] w-[min(720px,calc(100vw-1.5rem))] flex-col items-end"
      aria-label={title}
    >
      <section className="cyberfiles-transfer-panel pointer-events-auto flex max-h-[min(82vh,780px)] w-full flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/98 text-neutral-100 shadow-2xl shadow-black/80 backdrop-blur-md">
        <header className="flex items-center gap-3 border-b border-neutral-700/80 bg-neutral-900/90 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-800/40 bg-cyan-950/70 text-cyan-300">
            <ListChecks className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-semibold text-neutral-100">
              {title}
              {activeOperation && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-700/50 bg-cyan-950/80 px-2 py-0.5 font-mono text-[11px] font-medium text-cyan-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                  {percent}%
                </span>
              )}
            </h2>
            <p className="text-xs text-neutral-400">
              {pendingCount > 0
                ? (isSpanish ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}` : `${pendingCount} pending`)
                : (isSpanish ? 'Sin operaciones pendientes' : 'No pending operations')}
            </p>
          </div>

          <Tooltip label={isPinned ? (isSpanish ? 'Desanclar (permitir auto-cierre)' : 'Unpin (allow auto-close)') : (isSpanish ? 'Mantener abierto' : 'Keep open')} placement="top">
            <button
              type="button"
              aria-label={isPinned ? (isSpanish ? 'Desanclar' : 'Unpin') : (isSpanish ? 'Fijar panel' : 'Pin panel')}
              aria-pressed={isPinned}
              onClick={() => setIsPinned(value => !value)}
              className={`grid h-8 w-8 place-items-center rounded-md transition ${isPinned ? 'border border-cyan-700/50 bg-cyan-950/80 text-cyan-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'}`}
            >
              <Pin className="h-4 w-4" />
            </button>
          </Tooltip>

          {recentOperations.length > 0 && (
            <Tooltip label={isSpanish ? 'Limpiar historial de operaciones' : 'Clear operation history'} placement="top">
              <button
                type="button"
                aria-label={isSpanish ? 'Limpiar historial' : 'Clear history'}
                onClick={onClearHistory}
                className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Tooltip>
          )}

          <Tooltip label={isSpanish ? 'Cerrar (Esc)' : 'Close (Esc)'} placement="top">
            <button
              type="button"
              aria-label={isSpanish ? 'Cerrar' : 'Close'}
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          {activeOperation && (
            <div className="space-y-3 rounded-lg border border-cyan-800/40 bg-neutral-950/60 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan-800/40 bg-cyan-950/80 text-cyan-300">
                  {activeOperation.kind === 'extract' || activeOperation.kind === 'compress' ? (
                    <Archive className="h-4 w-4" />
                  ) : activeOperation.kind === 'delete' || activeOperation.kind === 'recycle' ? (
                    <Trash2 className="h-4 w-4" />
                  ) : activeOperation.kind === 'restore' ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : activeOperation.kind === 'create' ? (
                    activeOperation.archiveName === 'folder' ? <FolderPlus className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" />
                  ) : activeOperation.kind === 'rename' ? (
                    <Pencil className="h-4 w-4" />
                  ) : activeOperation.kind === 'copy' ? (
                    <Copy className="h-4 w-4" />
                  ) : (
                    <MoveRight className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-neutral-100">{operationActionLabel(activeOperation, language)}</div>
                  <div className="truncate text-xs text-neutral-300">{sourceLabel(activeOperation, language)}</div>
                </div>
                <span className="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-300">
                  {statusLabel(activeOperation, language)}
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {isSpanish ? 'Desde' : 'From'}
                    </span>
                    {onNavigateTo && activeOperation.sourcePaths[0] && (
                      <Tooltip label={isSpanish ? 'Abrir carpeta de origen' : 'Open source folder'} placement="top">
                        <button
                          type="button"
                          onClick={() => onNavigateTo(activeOperation.sourcePaths[0])}
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-400 transition-colors hover:text-cyan-300"
                        >
                          <FolderOpen className="h-3 w-3" />
                          <span className="text-[10px]">{isSpanish ? 'Abrir' : 'Open'}</span>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <Tooltip label={activeOperation.sourcePaths.map(p => displayPath(p, language)).join('\n')} placement="top">
                    <div className="truncate font-mono text-xs text-neutral-300">
                      {activeOperation.sourcePaths.length > 1
                        ? displayPath(activeOperation.sourcePaths[0], language) + ` (+${activeOperation.sourcePaths.length - 1})`
                        : displayPath(activeOperation.sourcePaths[0], language)}
                    </div>
                  </Tooltip>
                </div>

                <div className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {activeOperation.kind === 'delete' ? (isSpanish ? 'Destino' : 'Destination') : (isSpanish ? 'Hacia' : 'To')}
                    </span>
                    {onNavigateTo && activeOperation.targetPath && (
                      <Tooltip label={isSpanish ? 'Abrir carpeta de destino' : 'Open destination folder'} placement="top">
                        <button
                          type="button"
                          onClick={() => onNavigateTo(activeOperation.targetPath)}
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-400 transition-colors hover:text-cyan-300"
                        >
                          <FolderOpen className="h-3 w-3" />
                          <span className="text-[10px]">{isSpanish ? 'Abrir' : 'Open'}</span>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <Tooltip label={activeOperation.targetPath ? displayPath(activeOperation.targetPath, language) : (isSpanish ? 'Eliminación permanente' : 'Permanent removal')} placement="top">
                    <div className="truncate font-mono text-xs text-neutral-300">
                      {activeOperation.targetPath ? displayPath(activeOperation.targetPath, language) : (isSpanish ? 'Eliminación permanente' : 'Permanent removal')}
                    </div>
                  </Tooltip>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-neutral-300">
                    <span className="mr-2 text-neutral-500">
                      {activeOperation.phase === 'scanning'
                        ? (isSpanish ? 'Analizando:' : 'Scanning:')
                        : (isSpanish ? 'Elemento actual:' : 'Current item:')}
                    </span>
                    {currentItemLabel}
                  </span>
                  <span className="shrink-0 font-mono text-neutral-400">
                    {activeOperation.phase === 'scanning'
                      ? activeOperation.totalItems.toLocaleString() + (isSpanish ? ' elementos detectados' : ' items found')
                      : activeOperation.totalItems
                        ? `${activeOperation.itemsCompleted.toLocaleString()} / ${activeOperation.totalItems.toLocaleString()}`
                        : '…'}
                  </span>
                </div>

                {activeOperation.currentFileTotal > 0 && (
                  <div className="mb-2">
                    <div className="mb-1 flex justify-between font-mono text-[10px] text-neutral-400">
                      <span>{isSpanish ? 'Archivo actual' : 'Current file'}</span>
                      <span>{formatFileSize(activeOperation.currentFileBytes)} / {formatFileSize(activeOperation.currentFileTotal)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full bg-sky-400 transition-[width] duration-150"
                        style={{ width: `${Math.min(100, (activeOperation.currentFileBytes / activeOperation.currentFileTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="h-2.5 overflow-hidden rounded-full border border-neutral-700/50 bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-cyan-300 transition-[width] duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[11px] text-neutral-400">
                  <span>{percent}%</span>
                  <span>
                    {activeOperation.phase === 'scanning'
                      ? (isSpanish ? 'Detectado: ' : 'Found: ') + formatFileSize(activeOperation.totalBytes)
                      : `${formatFileSize(activeOperation.bytesCopied)} / ${formatFileSize(activeOperation.totalBytes)}`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-2.5">
                  <div className="text-[11px] text-neutral-500">{isSpanish ? 'Tiempo' : 'Time'}</div>
                  <div className="mt-1 font-mono text-neutral-200">{elapsedLabel(elapsed, language)}</div>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-2.5">
                  <div className="text-[11px] text-neutral-500">{isSpanish ? 'Velocidad' : 'Speed'}</div>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-neutral-200">
                    <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                    {formatFileSize(speed)}/s
                  </div>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-2.5">
                  <div className="text-[11px] text-neutral-500">{isSpanish ? 'Restante aprox.' : 'Approx. remaining'}</div>
                  <div className="mt-1 font-mono text-neutral-200">{remainingLabel}</div>
                </div>
              </div>

              <div className="relative h-14 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/80 px-2">
                <div className="absolute inset-x-2 top-1/2 border-t border-neutral-800/60" />
                <div className="absolute bottom-1 left-2 font-mono text-[9px] text-neutral-500">
                  {isSpanish ? 'Rendimiento en tiempo real' : 'Real-time throughput'}
                </div>
                <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="h-full w-full">
                  {graphPoints && (
                    <polyline points={graphPoints} fill="none" stroke="rgb(34 211 238)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
              </div>

              <footer className="flex items-center justify-between border-t border-neutral-800 pt-2.5">
                <span className="text-xs font-medium text-neutral-400">
                  {statusLabel(activeOperation, language)}
                </span>
                <div className="flex gap-2">
                  <Tooltip label={activeOperation.status === 'paused' ? (isSpanish ? 'Continuar la transferencia' : 'Resume transfer') : (isSpanish ? 'Pausar la transferencia' : 'Pause transfer')} placement="top">
                    <button
                      type="button"
                      disabled={activeOperation.status === 'cancelling'}
                      onClick={() => onTogglePause(activeOperation.jobId)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 text-xs font-medium text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {activeOperation.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {activeOperation.status === 'paused' ? (isSpanish ? 'Continuar' : 'Resume') : (isSpanish ? 'Pausar' : 'Pause')}
                    </button>
                  </Tooltip>
                  <Tooltip label={isSpanish ? 'Cancelar la operación actual' : 'Cancel current operation'} placement="top">
                    <button
                      type="button"
                      disabled={activeOperation.status === 'cancelling'}
                      onClick={() => onCancel(activeOperation.jobId)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-800/80 bg-rose-950/50 px-3 text-xs font-medium text-rose-200 transition hover:bg-rose-950/80 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {isSpanish ? 'Cancelar' : 'Cancel'}
                    </button>
                  </Tooltip>
                </div>
              </footer>
            </div>
          )}

          {passwordOperations.map((operation, index) => (
            <section key={operation.jobId} className="space-y-2 rounded-lg border border-amber-800/70 bg-amber-950/20 p-3" aria-label={isSpanish ? 'Contraseña requerida' : 'Password required'}>
              <div className="text-sm font-medium text-neutral-100">{isSpanish ? 'Introduce la contraseña del archivo' : 'Enter the archive password'}</div>
              <div className="truncate font-mono text-xs text-neutral-400">{displayPath(operation.sourcePaths[0] ?? '')}</div>
              <p className="text-xs text-amber-200">{operation.error ?? (isSpanish ? 'El archivo está protegido con contraseña.' : 'This archive is password protected.')}</p>
              <form
                className="flex gap-2"
                onSubmit={event => {
                  event.preventDefault();
                  const password = passwordValues[operation.jobId] ?? '';
                  if (!password) return;
                  onSubmitPassword(operation.jobId, password);
                  setPasswordValues(previous => ({ ...previous, [operation.jobId]: '' }));
                }}
              >
                <input
                  ref={index === 0 ? passwordInputRef : undefined}
                  type="password"
                  autoComplete="new-password"
                  value={passwordValues[operation.jobId] ?? ''}
                  onChange={event => setPasswordValues(previous => ({ ...previous, [operation.jobId]: event.target.value }))}
                  placeholder={isSpanish ? 'Contraseña' : 'Password'}
                  aria-label={isSpanish ? 'Contraseña del archivo' : 'Archive password'}
                  className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={!(passwordValues[operation.jobId] ?? '')}
                  className="rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSpanish ? 'Reintentar' : 'Retry'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordValues(previous => ({ ...previous, [operation.jobId]: '' }));
                    onCancel(operation.jobId);
                  }}
                  className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800"
                >
                  {isSpanish ? 'Cancelar' : 'Cancel'}
                </button>
              </form>
            </section>
          ))}

          {queuedOperations.length > 0 && (
            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3" aria-label={isSpanish ? 'Operaciones en cola' : 'Queued operations'}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {isSpanish ? 'En cola' : 'Queue'} ({queuedOperations.length})
                </h3>
                {onCancelAll && queuedOperations.length > 0 && (
                  <Tooltip label={isSpanish ? 'Cancelar todas las operaciones en cola' : 'Cancel all queued operations'} placement="top">
                    <button
                      type="button"
                      onClick={onCancelAll}
                      className="inline-flex items-center gap-1 text-[11px] text-rose-400 transition-colors hover:text-rose-300"
                    >
                      <XCircle className="h-3 w-3" />
                      {isSpanish ? 'Cancelar todas' : 'Cancel all'}
                    </button>
                  </Tooltip>
                )}
              </div>
              <div className="space-y-1.5">
                {queuedOperations.map(operation => (
                  <div key={operation.jobId} className="flex items-center gap-2.5 rounded-lg border border-neutral-800/90 bg-neutral-900/60 px-3 py-2">
                    <span className="text-cyan-400">
                      {operation.kind === 'extract' || operation.kind === 'compress' ? (
                        <Archive className="h-4 w-4" />
                      ) : operation.kind === 'delete' || operation.kind === 'recycle' ? (
                        <Trash2 className="h-4 w-4" />
                      ) : operation.kind === 'restore' ? (
                        <RotateCcw className="h-4 w-4" />
                      ) : operation.kind === 'create' ? (
                        operation.archiveName === 'folder' ? <FolderPlus className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" />
                      ) : operation.kind === 'rename' ? (
                        <Pencil className="h-4 w-4" />
                      ) : operation.kind === 'copy' ? (
                        <Copy className="h-4 w-4" />
                      ) : (
                        <MoveRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-neutral-200">
                        {operation.kind === 'compress'
                          ? sourceLabel(operation, language)
                          : operation.sourcePaths.length > 1
                            ? `${operation.sourcePaths.length} ${isSpanish ? 'elementos' : 'items'}`
                            : displayPath(operation.sourcePaths[0], language)}
                      </div>
                      <div className="truncate font-mono text-[11px] text-neutral-500">
                        {operation.targetPath
                          ? (isSpanish ? 'Hacia ' : 'To ') + displayPath(operation.targetPath, language)
                          : (isSpanish ? 'Eliminación permanente' : 'Permanent removal')}
                      </div>
                    </div>
                    {onNavigateTo && operation.targetPath && (
                      <Tooltip label={isSpanish ? 'Abrir carpeta de destino' : 'Open destination folder'} placement="top">
                        <button
                          type="button"
                          onClick={() => onNavigateTo(operation.targetPath)}
                          className="grid h-7 w-7 place-items-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-cyan-300"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip label={isSpanish ? 'Quitar de la cola' : 'Remove from queue'} placement="top">
                      <button
                        type="button"
                        aria-label={isSpanish ? 'Quitar de la cola' : 'Remove from queue'}
                        onClick={() => onCancel(operation.jobId)}
                        className="grid h-7 w-7 place-items-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-rose-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recentOperations.length > 0 && (
            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3" aria-label={isSpanish ? 'Operaciones recientes' : 'Recent operations'}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {isSpanish ? 'Historial de actividad' : 'Activity history'} ({recentOperations.length})
                </h3>
              </div>
              <div className="space-y-1.5">
                {recentOperations.map(operation => {
                  const isCompleted = operation.status === 'completed';
                  const isFailed = operation.status === 'failed';
                  const isCancelled = operation.status === 'cancelled';
                  const targetToNavigate = operation.kind === 'recycle'
                    ? '::recycle-bin::'
                    : operation.kind === 'compress' || operation.kind === 'create' || operation.kind === 'rename'
                      ? (operation.resultPath || operation.targetPath)
                      : operation.kind === 'restore'
                        ? (operation.completedPaths?.[0] || operation.targetPath)
                        : operation.targetPath;
                  const relativeTime = formatRelativeTime(operation.finishedAt, language);
                  const duration = formatDuration(operation.startedAt, operation.finishedAt, language);
                  const isExpandedFailures = expandedFailuresJobId === operation.jobId;

                  return (
                    <div
                      key={operation.jobId}
                      className={`rounded-lg border px-3 py-2 transition ${
                        isFailed
                          ? 'border-rose-900/50 bg-rose-950/15'
                          : 'border-neutral-800/80 bg-neutral-900/50 hover:bg-neutral-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`shrink-0 ${isCompleted ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-neutral-500'}`}>
                          {isCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : isFailed ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-neutral-200">
                              {operation.kind === 'compress'
                                ? operation.resultPath ?? sourceLabel(operation, language)
                                : operation.kind === 'rename' && operation.sourcePaths.length === 1 && operation.resultPath
                                  ? `${isSpanish ? 'Renombrado' : 'Renamed'}: ${operation.sourcePaths[0].split(/[\\/]/).pop() ?? operation.sourcePaths[0]} → ${operation.resultPath.split(/[\\/]/).pop() ?? operation.resultPath}`
                                  : operation.kind === 'delete' || operation.kind === 'recycle' || operation.kind === 'restore' || operation.kind === 'create' || operation.kind === 'rename'
                                    ? `${operationActionLabel(operation, language)}${operation.sourcePaths.length === 1 && operation.sourcePaths[0] && operation.sourcePaths[0] !== '::recycle-bin::' ? `: ${displayPath(operation.sourcePaths[0], language)}` : ''}`
                                    : operation.sourcePaths.length > 1
                                      ? `${operationActionLabel(operation, language)} (${operation.sourcePaths.length})`
                                      : `${operationActionLabel(operation, language)}: ${displayPath(operation.sourcePaths[0], language)}`}
                            </span>
                            {operation.totalBytes > 0 && (
                              <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                                ({formatFileSize(operation.totalBytes)})
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400">
                            <span className={isFailed ? 'font-medium text-rose-300' : ''}>
                              {statusLabel(operation, language)}
                            </span>
                            {relativeTime && <span>· {relativeTime}</span>}
                            {duration && <span>· {isSpanish ? `Duración: ${duration}` : `Duration: ${duration}`}</span>}
                            {operation.error && (
                              <span className="max-w-[280px] truncate font-mono text-[10px] text-rose-300/90">
                                : {operation.error}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {onNavigateTo && targetToNavigate && (
                            <Tooltip label={isSpanish ? 'Abrir destino en el panel activo' : 'Open destination in active pane'} placement="top">
                              <button
                                type="button"
                                onClick={() => onNavigateTo(targetToNavigate)}
                                className="grid h-7 w-7 place-items-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-cyan-300"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                              </button>
                            </Tooltip>
                          )}

                          {(isFailed || isCancelled) && onRetry && (
                            <Tooltip label={isSpanish ? 'Reintentar esta operación' : 'Retry this operation'} placement="top">
                              <button
                                type="button"
                                onClick={() => onRetry(operation)}
                                className="grid h-7 w-7 place-items-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-amber-300"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </Tooltip>
                          )}

                          {operation.error && (
                            <Tooltip label={copiedErrorJobId === operation.jobId ? (isSpanish ? '¡Copiado!' : 'Copied!') : (isSpanish ? 'Copiar detalle del error' : 'Copy error details')} placement="top">
                              <button
                                type="button"
                                onClick={() => void copyErrorDetails(operation)}
                                className="grid h-7 w-7 place-items-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
                              >
                                {copiedErrorJobId === operation.jobId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </Tooltip>
                          )}

                          {operation.failures && operation.failures.length > 0 && (
                            <Tooltip label={isExpandedFailures ? (isSpanish ? 'Ocultar fallos' : 'Hide failures') : (isSpanish ? 'Ver fallos detallados' : 'View detailed failures')} placement="top">
                              <button
                                type="button"
                                onClick={() => setExpandedFailuresJobId(prev => prev === operation.jobId ? null : operation.jobId)}
                                className="grid h-7 w-7 place-items-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-rose-300"
                              >
                                {isExpandedFailures ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>

                      {isExpandedFailures && operation.failures && operation.failures.length > 0 && (
                        <div className="mt-2.5 space-y-1 border-t border-rose-900/40 pl-6 pt-2 font-mono text-[11px]">
                          <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                            {isSpanish ? 'Elementos con error:' : 'Failed items:'}
                          </div>
                          <div className="max-h-32 space-y-1 overflow-y-auto">
                            {operation.failures.map((failure, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2 text-neutral-300">
                                <span className="truncate">{displayPath(failure.path)}</span>
                                <span className="shrink-0 font-sans text-[10px] text-rose-400">{failure.error}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!activeOperation && passwordOperations.length === 0 && queuedOperations.length === 0 && recentOperations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-neutral-500">
              <ListChecks className="mb-2 h-8 w-8 text-neutral-700" />
              <p className="text-sm">{isSpanish ? 'El historial de operaciones está vacío.' : 'Operation history is empty.'}</p>
              <p className="mt-1 text-xs text-neutral-600">
                {isSpanish ? 'Las operaciones de copia, movimiento y compresión aparecerán aquí.' : 'Copy, move, and archive operations will appear here.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </aside>,
    document.body,
  );
};
