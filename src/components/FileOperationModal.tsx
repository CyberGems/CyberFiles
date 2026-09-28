import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Gauge, Pause, Play, X } from 'lucide-react';
import { formatFileSize } from '../utils/fileSystem';
import { Tooltip } from './Tooltip';
import type { NativeCopyProgress } from '../utils/nativeFileSystem';

export interface CopyOperationView extends NativeCopyProgress {
  sourcePaths: string[];
  targetPath: string;
  isPaused: boolean;
  isCancelling: boolean;
  startedAt: number;
  selectionPane?: 'left' | 'right';
}

interface FileOperationModalProps {
  operation: CopyOperationView | null;
  language: 'en' | 'es';
  onTogglePause: () => void;
  onCancel: () => void;
}

function elapsedLabel(seconds: number, language: 'en' | 'es'): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  const value = hours > 0
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0')
    : minutes + ':' + String(secs).padStart(2, '0');
  return language === 'es' ? value + ' transcurridos' : value + ' elapsed';
}

export const FileOperationModal: React.FC<FileOperationModalProps> = ({ operation, language, onTogglePause, onCancel }) => {
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const lastSample = useRef<{ time: number; bytes: number } | null>(null);
  const operationRef = useRef(operation);
  operationRef.current = operation;
  const isSpanish = language === 'es';

  useEffect(() => {
    if (!operation) return;
    setElapsed(0);
    setSpeed(0);
    setSpeedHistory([]);
    lastSample.current = { time: Date.now(), bytes: operation.bytesCopied };
    const timer = window.setInterval(() => {
      const latest = operationRef.current;
      if (!latest) return;
      setElapsed((Date.now() - latest.startedAt) / 1000);
      if (!lastSample.current) return;
      const now = Date.now();
      const deltaMs = now - lastSample.current.time;
      if (deltaMs < 850) return;
      const nextSpeed = latest.isPaused ? 0 : Math.max(0, (latest.bytesCopied - lastSample.current.bytes) * 1000 / deltaMs);
      lastSample.current = { time: now, bytes: latest.bytesCopied };
      setSpeed(nextSpeed);
      setSpeedHistory(previous => [...previous.slice(-39), nextSpeed]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [operation?.jobId]);

  useEffect(() => {
    if (operation?.isPaused && lastSample.current) lastSample.current = { time: Date.now(), bytes: operation.bytesCopied };
  }, [operation?.isPaused, operation?.bytesCopied]);

  if (!operation) return null;
  const progress = operation.totalBytes > 0
    ? Math.min(1, operation.bytesCopied / operation.totalBytes)
    : operation.totalItems > 0 ? Math.min(1, operation.itemsCompleted / operation.totalItems) : 0;
  const percent = Math.round(progress * 100);
  const remaining = speed > 0 && operation.totalBytes > operation.bytesCopied
    ? (operation.totalBytes - operation.bytesCopied) / speed : null;
  const graphMax = Math.max(1, ...speedHistory);
  const graphPoints = speedHistory.map((sample, index) => {
    const x = speedHistory.length <= 1 ? 0 : index / (speedHistory.length - 1) * 100;
    const y = 42 - sample / graphMax * 36;
    return x + ',' + y;
  }).join(' ');
  const currentItemLabel = operation.currentItem || operation.sourcePaths[0] || (isSpanish ? 'Preparando…' : 'Preparing…');
  const remainingLabel = remaining === null ? '—' : elapsedLabel(remaining, language).replace(isSpanish ? ' transcurridos' : ' elapsed', '');

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="file-operation-title" className="w-full max-w-[min(760px,96vw)] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-2xl shadow-black/50">
        <header className="flex items-center gap-3 border-b border-neutral-700 px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-950/70 text-cyan-300"><Copy className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="file-operation-title" className="font-semibold">{isSpanish ? (operation.isCancelling ? 'Cancelando copia' : 'Copiando archivos') : (operation.isCancelling ? 'Cancelling copy' : 'Copying files')}</h2>
            <p className="text-xs text-neutral-400">{operation.phase === 'scanning' ? (isSpanish ? 'Midiendo contenido para estimar el progreso' : 'Measuring contents to estimate progress') : (isSpanish ? 'Transferencia en curso' : 'Transfer in progress')}</p>
          </div>
          <span className="rounded-md border border-neutral-700 px-2 py-1 font-mono text-xs text-cyan-200">{percent}%</span>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{isSpanish ? 'Desde' : 'From'}</div>
              <Tooltip label={operation.sourcePaths.join(String.fromCharCode(10))} placement="top"><div className="truncate text-xs text-neutral-300">{operation.sourcePaths.length > 1 ? operation.sourcePaths[0] + ' (+' + (operation.sourcePaths.length - 1) + ')' : operation.sourcePaths[0]}</div></Tooltip>
            </div>
            <div className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{isSpanish ? 'Hacia' : 'To'}</div>
              <Tooltip label={operation.targetPath} placement="top"><div className="truncate text-xs text-neutral-300">{operation.targetPath}</div></Tooltip>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-neutral-300"><span className="mr-2 text-neutral-500">{operation.phase === 'scanning' ? (isSpanish ? 'Analizando' : 'Scanning') : (isSpanish ? 'Elemento actual' : 'Current item')}</span>{currentItemLabel}</span>
              <span className="shrink-0 font-mono text-neutral-400">{operation.phase === 'scanning' ? (operation.totalItems.toLocaleString() + (isSpanish ? ' elementos detectados' : ' items found')) : operation.totalItems ? operation.itemsCompleted.toLocaleString() + ' / ' + operation.totalItems.toLocaleString() : '…'}</span>
            </div>
            {operation.currentFileTotal > 0 && <div className="mb-2">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-neutral-500"><span>{isSpanish ? 'Archivo actual' : 'Current file'}</span><span>{formatFileSize(operation.currentFileBytes)} / {formatFileSize(operation.currentFileTotal)}</span></div>
              <div className="h-1 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-sky-400 transition-[width] duration-150" style={{ width: Math.min(100, operation.currentFileBytes / operation.currentFileTotal * 100) + '%' }} /></div>
            </div>}
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-300 transition-[width] duration-200" style={{ width: percent + '%' }} />
            </div>
            <div className="mt-1 flex justify-end font-mono text-[11px] text-neutral-400">{operation.phase === 'scanning' ? (isSpanish ? 'Tamaño detectado: ' : 'Size found: ') + formatFileSize(operation.totalBytes) : formatFileSize(operation.bytesCopied) + ' / ' + formatFileSize(operation.totalBytes)}</div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5"><div className="text-neutral-500">{isSpanish ? 'Tiempo' : 'Time'}</div><div className="mt-1 font-mono text-neutral-200">{elapsedLabel(elapsed, language)}</div></div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5"><div className="text-neutral-500">{isSpanish ? 'Velocidad' : 'Speed'}</div><div className="mt-1 flex items-center gap-1.5 font-mono text-neutral-200"><Gauge className="h-3.5 w-3.5 text-cyan-300" />{formatFileSize(speed)}/s</div></div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5"><div className="text-neutral-500">{isSpanish ? 'Restante aprox.' : 'Approx. remaining'}</div><div className="mt-1 font-mono text-neutral-200">{remainingLabel}</div></div>
          </div>

          <div className="relative h-20 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/80 px-2">
            <div className="absolute inset-x-2 top-1/2 border-t border-neutral-800" />
            <div className="absolute bottom-1.5 left-3 text-[10px] text-neutral-500">{isSpanish ? 'Ritmo de copia' : 'Copy throughput'}</div>
            <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="h-full w-full">
              {graphPoints && <polyline points={graphPoints} fill="none" stroke="rgb(34 197 94)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
            </svg>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-700 bg-neutral-950/40 px-5 py-3">
          <span className="text-xs text-neutral-500">{operation.isPaused ? (isSpanish ? 'En pausa' : 'Paused') : operation.isCancelling ? (isSpanish ? 'Deteniendo después del bloque actual…' : 'Stopping after current chunk…') : (isSpanish ? 'Transferencia en curso' : 'Transfer in progress')}</span>
          <div className="flex gap-2">
            <Tooltip label={operation.isPaused ? (isSpanish ? 'Reanudar copia' : 'Resume copy') : (isSpanish ? 'Pausar copia' : 'Pause copy')} placement="top">
              <button type="button" disabled={operation.isCancelling} onClick={onTogglePause} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50">
                {operation.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{operation.isPaused ? (isSpanish ? 'Continuar' : 'Resume') : (isSpanish ? 'Pausar' : 'Pause')}
              </button>
            </Tooltip>
            <Tooltip label={isSpanish ? 'Cancelar y limpiar la copia parcial' : 'Cancel and remove the partial copy'} placement="top">
              <button type="button" disabled={operation.isCancelling} onClick={onCancel} className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-800/80 bg-rose-950/50 px-3 text-sm text-rose-200 transition hover:bg-rose-900/70 disabled:opacity-50">
                <X className="h-4 w-4" />{isSpanish ? (operation.isCancelling ? 'Cancelando…' : 'Cancelar') : (operation.isCancelling ? 'Cancelling…' : 'Abort')}
              </button>
            </Tooltip>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
