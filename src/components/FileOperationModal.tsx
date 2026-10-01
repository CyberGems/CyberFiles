import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Check, ChevronDown, Copy, Gauge, ListChecks, Maximize2, Minimize2, MoveRight, Pause, Pin, Play, Trash2, X } from 'lucide-react';
import { formatFileSize } from '../utils/fileSystem';
import { Tooltip } from './Tooltip';
import type { NativeTransferProgress } from '../utils/nativeFileSystem';
import type { ArchiveExtractionMode } from '../types';

export type TransferKind = 'copy' | 'move' | 'extract' | 'compress';
export type TransferStatus = 'queued' | 'awaiting-password' | 'running' | 'paused' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export interface TransferOperationView extends NativeTransferProgress {
  kind: TransferKind;
  sourcePaths: string[];
  targetPath: string;
  status: TransferStatus;
  startedAt: number | null;
  sourcePane?: 'left' | 'right';
  selectionPane?: 'left' | 'right';
  clipboardSequence?: number;
  extractionMode?: ArchiveExtractionMode;
  archiveName?: string;
  undoActionId?: string;
  preserveNames?: boolean;
  resultPath?: string;
  error?: string;
}

interface FileOperationModalProps {
  operations: TransferOperationView[];
  hidden?: boolean;
  language: 'en' | 'es';
  onTogglePause: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onSubmitPassword: (jobId: string, password: string) => void;
  onClearHistory: () => void;
}

function elapsedLabel(seconds: number, language: 'en' | 'es'): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  return hours > 0
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0')
    : minutes + ':' + String(secs).padStart(2, '0');
}

function displayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
}

function statusLabel(operation: TransferOperationView, language: 'en' | 'es'): string {
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

function operationActionLabel(operation: TransferOperationView, language: 'en' | 'es'): string {
  const spanish = language === 'es';
  const count = operation.sourcePaths.length;
  if (operation.kind === 'extract') return spanish ? 'Extrayendo archivo' : 'Extracting archive';
  if (operation.kind === 'compress') return spanish ? 'Creando archivo ZIP' : 'Creating ZIP archive';
  if (operation.kind === 'copy') return spanish
    ? `Copiando ${count} ${count === 1 ? 'elemento' : 'elementos'}`
    : `Copying ${count} ${count === 1 ? 'item' : 'items'}`;
  return spanish
    ? `Moviendo ${count} ${count === 1 ? 'elemento' : 'elementos'}`
    : `Moving ${count} ${count === 1 ? 'item' : 'items'}`;
}

function sourceLabel(operation: TransferOperationView, language: 'en' | 'es'): string {
  if (operation.kind === 'extract') {
    return operation.sourcePaths[0]?.split(/[\\/]/).pop() || (language === 'es' ? 'Archivo comprimido' : 'Archive');
  }
  if (operation.kind === 'compress') return operation.archiveName || (language === 'es' ? 'Archivo ZIP' : 'ZIP archive');
  return operation.sourcePaths.length === 1
    ? operation.sourcePaths[0].split(/[\\/]/).pop() || operation.sourcePaths[0]
    : (language === 'es' ? `${operation.sourcePaths.length} elementos seleccionados` : `${operation.sourcePaths.length} selected items`);
}

export const FileOperationModal: React.FC<FileOperationModalProps> = ({ operations, hidden = false, language, onTogglePause, onCancel, onSubmitPassword, onClearHistory }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [passwordValues, setPasswordValues] = useState<Record<string, string>>({});
  const lastSample = useRef<{ time: number; bytes: number } | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const activeOperation = operations.find(operation => ['running', 'paused', 'cancelling'].includes(operation.status));
  const activeRef = useRef(activeOperation);
  activeRef.current = activeOperation;
  const isSpanish = language === 'es';
  const pendingCount = operations.filter(operation => ['queued', 'awaiting-password', 'running', 'paused', 'cancelling'].includes(operation.status)).length;
  const queuedOperations = operations.filter(operation => operation.status === 'queued');
  const passwordOperations = operations.filter(operation => operation.status === 'awaiting-password');
  const recentOperations = operations.filter(operation => ['completed', 'failed', 'cancelled'].includes(operation.status)).slice(-5).reverse();
  const latestRecentOperation = recentOperations[0];
  const firstPasswordOperation = passwordOperations[0];
  const previousPendingCount = useRef(pendingCount);
  const title = isSpanish ? 'Operaciones de archivos' : 'File operations';

  useEffect(() => {
    if (!firstPasswordOperation) return;
    setIsExpanded(true);
  }, [firstPasswordOperation?.jobId]);

  useEffect(() => {
    if (!firstPasswordOperation || !isExpanded) return;
    const frame = window.requestAnimationFrame(() => passwordInputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [firstPasswordOperation?.jobId, firstPasswordOperation?.error, isExpanded]);

  useEffect(() => {
    if (previousPendingCount.current === 0 && pendingCount > 0) setIsExpanded(true);
    if (previousPendingCount.current > 0 && pendingCount === 0 && !isPinned) setIsExpanded(false);
    previousPendingCount.current = pendingCount;
  }, [pendingCount, isPinned]);

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

  if (hidden) return null;

  if (operations.length === 0 && !isExpanded) {
    return createPortal(
      <aside className="pointer-events-none fixed bottom-4 right-4 z-[120]" aria-label={title}>
        <Tooltip label={isSpanish ? 'Abrir centro de operaciones' : 'Open activity center'} placement="left">
          <button type="button" onClick={() => setIsExpanded(true)} aria-label={isSpanish ? 'Abrir centro de operaciones' : 'Open activity center'} className="pointer-events-auto grid h-11 w-11 place-items-center rounded-xl border border-neutral-700 bg-neutral-900 text-cyan-300 shadow-xl shadow-black/40 transition hover:border-cyan-700 hover:bg-neutral-800">
            <ListChecks className="h-5 w-5" />
          </button>
        </Tooltip>
      </aside>,
      document.body,
    );
  }

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
    <aside className="pointer-events-none fixed bottom-4 right-4 z-[120] flex max-h-[min(80vh,800px)] w-[min(760px,calc(100vw-2rem))] flex-col items-end" aria-label={title}>
      <section className="pointer-events-auto flex max-h-[80vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-2xl shadow-black/50">
        <header className="flex items-center gap-3 border-b border-neutral-700 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-950/70 text-cyan-300"><ListChecks className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-neutral-400">{pendingCount > 0 ? (isSpanish ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}` : `${pendingCount} pending`) : (isSpanish ? 'Sin operaciones pendientes' : 'No pending operations')}</p>
          </div>
          {activeOperation && <span className="rounded-md border border-neutral-700 px-2 py-1 font-mono text-xs text-cyan-200">{percent}%</span>}
          <Tooltip label={isPinned ? (isSpanish ? 'Desfijar panel' : 'Unpin panel') : (isSpanish ? 'Fijar panel abierto' : 'Keep panel open')} placement="top">
            <button type="button" aria-label={isPinned ? (isSpanish ? 'Desfijar panel' : 'Unpin panel') : (isSpanish ? 'Fijar panel abierto' : 'Keep panel open')} aria-pressed={isPinned} onClick={() => { setIsPinned(value => !value); if (!isPinned) setIsExpanded(true); }} className={`grid h-8 w-8 place-items-center rounded-md transition ${isPinned ? 'bg-cyan-950/70 text-cyan-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'}`}><Pin className="h-4 w-4" /></button>
          </Tooltip>
          {recentOperations.length > 0 && <Tooltip label={isSpanish ? 'Limpiar historial' : 'Clear history'} placement="top"><button type="button" aria-label={isSpanish ? 'Limpiar historial' : 'Clear history'} onClick={onClearHistory} className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"><Trash2 className="h-4 w-4" /></button></Tooltip>}
          <Tooltip label={isExpanded ? (isSpanish ? 'Minimizar' : 'Minimize') : (isSpanish ? 'Expandir' : 'Expand')} placement="top">
            <button type="button" aria-label={isExpanded ? (isSpanish ? 'Minimizar' : 'Minimize') : (isSpanish ? 'Expandir' : 'Expand')} onClick={() => setIsExpanded(value => !value)} className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100">
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </Tooltip>
        </header>

        {isExpanded && <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          {activeOperation && <>
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-cyan-900/50 bg-cyan-950/20 px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan-950/70 text-cyan-300">{activeOperation.kind === 'extract' || activeOperation.kind === 'compress' ? <Archive className="h-4 w-4" /> : activeOperation.kind === 'copy' ? <Copy className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-neutral-100">{operationActionLabel(activeOperation, language)}</div>
                <div className="truncate text-xs text-neutral-300">{sourceLabel(activeOperation, language)}</div>
              </div>
              <span className="shrink-0 text-xs text-neutral-400">{statusLabel(activeOperation, language)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{isSpanish ? 'Desde' : 'From'}</div>
                <Tooltip label={activeOperation.sourcePaths.map(displayPath).join(String.fromCharCode(10))} placement="top"><div className="truncate text-xs text-neutral-300">{activeOperation.sourcePaths.length > 1 ? displayPath(activeOperation.sourcePaths[0]) + ` (+${activeOperation.sourcePaths.length - 1})` : displayPath(activeOperation.sourcePaths[0])}</div></Tooltip>
              </div>
              <div className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{isSpanish ? 'Hacia' : 'To'}</div>
                <Tooltip label={displayPath(activeOperation.targetPath)} placement="top"><div className="truncate text-xs text-neutral-300">{displayPath(activeOperation.targetPath)}</div></Tooltip>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-neutral-300"><span className="mr-2 text-neutral-500">{activeOperation.phase === 'scanning' ? (isSpanish ? 'Analizando' : 'Scanning') : (isSpanish ? 'Elemento actual' : 'Current item')}</span>{currentItemLabel}</span>
                <span className="shrink-0 font-mono text-neutral-400">{activeOperation.phase === 'scanning' ? (activeOperation.totalItems.toLocaleString() + (isSpanish ? ' elementos detectados' : ' items found')) : activeOperation.totalItems ? activeOperation.itemsCompleted.toLocaleString() + ' / ' + activeOperation.totalItems.toLocaleString() : '…'}</span>
              </div>
              {activeOperation.currentFileTotal > 0 && <div className="mb-2">
                <div className="mb-1 flex justify-between font-mono text-[10px] text-neutral-500"><span>{isSpanish ? 'Archivo actual' : 'Current file'}</span><span>{formatFileSize(activeOperation.currentFileBytes)} / {formatFileSize(activeOperation.currentFileTotal)}</span></div>
                <div className="h-1 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-sky-400 transition-[width] duration-150" style={{ width: Math.min(100, activeOperation.currentFileBytes / activeOperation.currentFileTotal * 100) + '%' }} /></div>
              </div>}
              <div className="h-2.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-300 transition-[width] duration-200" style={{ width: percent + '%' }} /></div>
              <div className="mt-1 flex justify-end font-mono text-[11px] text-neutral-400">{activeOperation.phase === 'scanning' ? (isSpanish ? 'Tamaño detectado: ' : 'Size found: ') + formatFileSize(activeOperation.totalBytes) : (activeOperation.kind === 'compress' ? (isSpanish ? 'Datos procesados: ' : 'Data processed: ') : '') + formatFileSize(activeOperation.bytesCopied) + ' / ' + formatFileSize(activeOperation.totalBytes)}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5"><div className="text-neutral-500">{isSpanish ? 'Tiempo' : 'Time'}</div><div className="mt-1 font-mono text-neutral-200">{elapsedLabel(elapsed, language)}{isSpanish ? ' transcurridos' : ' elapsed'}</div></div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5"><div className="text-neutral-500">{isSpanish ? 'Velocidad' : 'Speed'}</div><div className="mt-1 flex items-center gap-1.5 font-mono text-neutral-200"><Gauge className="h-3.5 w-3.5 text-cyan-300" />{formatFileSize(speed)}/s</div></div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5"><div className="text-neutral-500">{isSpanish ? 'Restante aprox.' : 'Approx. remaining'}</div><div className="mt-1 font-mono text-neutral-200">{remainingLabel}</div></div>
            </div>

            <div className="relative h-16 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/80 px-2">
              <div className="absolute inset-x-2 top-1/2 border-t border-neutral-800" />
              <div className="absolute bottom-1.5 left-3 text-[10px] text-neutral-500">{isSpanish ? 'Ritmo de operación' : 'Operation throughput'}</div>
              <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="h-full w-full">{graphPoints && <polyline points={graphPoints} fill="none" stroke="rgb(34 197 94)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}</svg>
            </div>
            <footer className="flex items-center justify-between border-t border-neutral-800 pt-3">
              <span className="text-xs text-neutral-500">{statusLabel(activeOperation, language)}</span>
              <div className="flex gap-2">
                <Tooltip label={activeOperation.status === 'paused' ? (isSpanish ? 'Reanudar' : 'Resume') : (isSpanish ? 'Pausar' : 'Pause')} placement="top">
                  <button type="button" disabled={activeOperation.status === 'cancelling'} onClick={() => onTogglePause(activeOperation.jobId)} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50">
                    {activeOperation.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{activeOperation.status === 'paused' ? (isSpanish ? 'Continuar' : 'Resume') : (isSpanish ? 'Pausar' : 'Pause')}
                  </button>
                </Tooltip>
                <Tooltip label={isSpanish ? 'Cancelar operación y limpiar el elemento parcial' : 'Cancel operation and remove the partial item'} placement="top">
                  <button type="button" disabled={activeOperation.status === 'cancelling'} onClick={() => onCancel(activeOperation.jobId)} className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-800/80 bg-rose-950/50 px-3 text-sm text-rose-200 transition hover:bg-rose-900/70 disabled:opacity-50">
                    <X className="h-4 w-4" />{isSpanish ? 'Cancelar' : 'Cancel'}
                  </button>
                </Tooltip>
              </div>
            </footer>
          </>}

          {passwordOperations.map((operation, index) => <section key={operation.jobId} className="space-y-2 rounded-lg border border-amber-800/70 bg-amber-950/20 p-3" aria-label={isSpanish ? 'Contraseña requerida' : 'Password required'}>
            <div className="text-sm font-medium text-neutral-100">{isSpanish ? 'Introduce la contraseña del archivo' : 'Enter the archive password'}</div>
            <div className="truncate text-xs text-neutral-400">{displayPath(operation.sourcePaths[0] ?? '')}</div>
            <p className="text-xs text-amber-200">{operation.error ?? (isSpanish ? 'El archivo está protegido con contraseña.' : 'This archive is password protected.')}</p>
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); const password = passwordValues[operation.jobId] ?? ''; if (!password) return; onSubmitPassword(operation.jobId, password); setPasswordValues(previous => ({ ...previous, [operation.jobId]: '' })); }}>
              <input ref={index === 0 ? passwordInputRef : undefined} type="password" autoComplete="new-password" value={passwordValues[operation.jobId] ?? ''} onChange={event => setPasswordValues(previous => ({ ...previous, [operation.jobId]: event.target.value }))} placeholder={isSpanish ? 'Contraseña' : 'Password'} aria-label={isSpanish ? 'Contraseña del archivo' : 'Archive password'} className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-500" />
              <button type="submit" disabled={!(passwordValues[operation.jobId] ?? '')} className="rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50">{isSpanish ? 'Reintentar' : 'Retry'}</button>
              <button type="button" onClick={() => { setPasswordValues(previous => ({ ...previous, [operation.jobId]: '' })); onCancel(operation.jobId); }} className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800">{isSpanish ? 'Cancelar' : 'Cancel'}</button>
            </form>
          </section>)}

          {queuedOperations.length > 0 && <section className="space-y-2" aria-label={isSpanish ? 'Operaciones en cola' : 'Queued operations'}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{isSpanish ? 'En cola' : 'Queue'} ({queuedOperations.length})</h3>
            {queuedOperations.map(operation => <div key={operation.jobId} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
              <span className="text-cyan-300">{operation.kind === 'extract' || operation.kind === 'compress' ? <Archive className="h-4 w-4" /> : operation.kind === 'copy' ? <Copy className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-neutral-200">{operation.kind === 'compress' ? sourceLabel(operation, language) : operation.sourcePaths.length > 1 ? `${operation.sourcePaths.length} ${isSpanish ? 'elementos' : 'items'}` : displayPath(operation.sourcePaths[0])}</div>
                <div className="truncate text-xs text-neutral-500">{(isSpanish ? 'Hacia ' : 'To ') + displayPath(operation.targetPath)}</div>
              </div>
              <span className="shrink-0 text-xs text-neutral-500">{statusLabel(operation, language)}</span>
              <Tooltip label={isSpanish ? 'Quitar de la cola' : 'Remove from queue'} placement="top"><button type="button" aria-label={isSpanish ? 'Quitar de la cola' : 'Remove from queue'} onClick={() => onCancel(operation.jobId)} className="grid h-7 w-7 place-items-center rounded text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"><X className="h-4 w-4" /></button></Tooltip>
            </div>)}
          </section>}

          {recentOperations.length > 0 && <section className="space-y-2" aria-label={isSpanish ? 'Operaciones recientes' : 'Recent operations'}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{isSpanish ? 'Recientes' : 'Recent'}</h3>
            {recentOperations.map(operation => <div key={operation.jobId} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
              <span className={operation.status === 'completed' ? 'text-emerald-400' : operation.status === 'failed' ? 'text-rose-400' : 'text-neutral-500'}>{operation.status === 'completed' ? <Check className="h-4 w-4" /> : operation.kind === 'extract' || operation.kind === 'compress' ? <Archive className="h-4 w-4" /> : operation.kind === 'copy' ? <Copy className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-neutral-300">{operation.kind === 'compress' ? operation.resultPath ?? sourceLabel(operation, language) : operation.sourcePaths.length > 1 ? `${operation.sourcePaths.length} ${isSpanish ? 'elementos' : 'items'}` : displayPath(operation.sourcePaths[0])}</div>
                <div className="truncate text-xs text-neutral-500">{statusLabel(operation, language)}{operation.error ? ': ' + operation.error : ''}</div>
              </div>
              <span className="shrink-0 font-mono text-xs text-neutral-500">{operation.totalBytes ? formatFileSize(operation.totalBytes) : ''}</span>
            </div>)}
          </section>}

          {!activeOperation && passwordOperations.length === 0 && queuedOperations.length === 0 && recentOperations.length === 0 && <div className="py-3 text-center text-sm text-neutral-500">{isSpanish ? 'El historial de operaciones está vacío.' : 'Operation history is empty.'}</div>}
        </div>}

        {!isExpanded && <button type="button" onClick={() => setIsExpanded(true)} className="flex w-full items-center gap-3 border-t border-neutral-800 px-4 py-3 text-left text-sm text-neutral-300 transition hover:bg-neutral-800/70">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cyan-950/60 text-cyan-300">{activeOperation ? activeOperation.kind === 'extract' || activeOperation.kind === 'compress' ? <Archive className="h-4 w-4" /> : activeOperation.kind === 'copy' ? <Copy className="h-4 w-4" /> : <MoveRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{activeOperation ? operationActionLabel(activeOperation, language) : passwordOperations.length ? (isSpanish ? 'Contraseña requerida' : 'Password required') : queuedOperations.length ? (isSpanish ? `${queuedOperations.length} en cola` : `${queuedOperations.length} queued`) : latestRecentOperation?.kind === 'compress' ? sourceLabel(latestRecentOperation, language) : (isSpanish ? 'Ver actividad reciente' : 'View recent activity')}</span>
            {activeOperation && <span className="block truncate text-xs text-neutral-500">{sourceLabel(activeOperation, language)} · {displayPath(activeOperation.targetPath)}</span>}
            {!activeOperation && latestRecentOperation?.kind === 'compress' && latestRecentOperation.resultPath && <span className="block truncate text-xs text-neutral-500">{displayPath(latestRecentOperation.resultPath)}</span>}
          </span>
          {activeOperation && <span className="shrink-0 font-mono text-xs text-cyan-200">{percent}%</span>}
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>}
      </section>
    </aside>,
    document.body,
  );
};
