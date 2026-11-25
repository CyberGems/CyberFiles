import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  FolderTree,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { FileItem } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { DialogButton } from './DialogButton';
import { Tooltip } from './Tooltip';
import {
  AttributeChangeAction,
  FileMetadataCopyTimeSpec,
  FileMetadataUpdateRequest,
  NativeFileMetadataSnapshot,
  inspectNativeFileMetadataBatch,
} from '../utils/nativeFileSystem';

export interface FileAttributesApplyOutcome {
  applied: boolean;
  errorMessage?: string;
}

interface FileAttributesModalProps {
  isOpen: boolean;
  items: FileItem[];
  onClose: () => void;
  onApply: (request: FileMetadataUpdateRequest) => Promise<FileAttributesApplyOutcome>;
}

type TimestampKind = 'created' | 'modified' | 'accessed';

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

function toLocalDateInputValue(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function toLocalTimeInputValue(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`;
}

function parseLocalDateTimeInputs(dateStr: string, timeStr: string): number | null {
  const dateTrimmed = dateStr.trim();
  const timeTrimmed = timeStr.trim();
  if (!dateTrimmed || !timeTrimmed) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateTrimmed);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeTrimmed);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? '0');

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }
  return date.getTime();
}

function summarizeAttribute(
  snapshots: NativeFileMetadataSnapshot[],
  key: 'readOnly' | 'hidden' | 'system',
): { kind: 'unknown' | 'on' | 'off' | 'mixed'; onCount: number; total: number } {
  const total = snapshots.length;
  if (total === 0) return { kind: 'unknown', onCount: 0, total: 0 };
  let onCount = 0;
  for (const snap of snapshots) {
    if (snap[key]) onCount += 1;
  }
  if (onCount === 0) return { kind: 'off', onCount, total };
  if (onCount === total) return { kind: 'on', onCount, total };
  return { kind: 'mixed', onCount, total };
}

export const FileAttributesModal: React.FC<FileAttributesModalProps> = ({
  isOpen,
  items,
  onClose,
  onApply,
}) => {
  const { t } = useLanguage();
  const applyButtonRef = useRef<HTMLButtonElement>(null);

  const [snapshots, setSnapshots] = useState<NativeFileMetadataSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [applyError, setApplyError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [applyCreated, setApplyCreated] = useState(false);
  const [createdDate, setCreatedDate] = useState('');
  const [createdTime, setCreatedTime] = useState('');

  const [applyModified, setApplyModified] = useState(false);
  const [modifiedDate, setModifiedDate] = useState('');
  const [modifiedTime, setModifiedTime] = useState('');

  const [applyAccessed, setApplyAccessed] = useState(false);
  const [accessedDate, setAccessedDate] = useState('');
  const [accessedTime, setAccessedTime] = useState('');

  const [copyEnabled, setCopyEnabled] = useState(false);
  const [copyFrom, setCopyFrom] = useState<TimestampKind>('created');
  const [copyToCreated, setCopyToCreated] = useState(false);
  const [copyToModified, setCopyToModified] = useState(true);
  const [copyToAccessed, setCopyToAccessed] = useState(false);

  const [readOnlyAction, setReadOnlyAction] = useState<AttributeChangeAction>('unchanged');
  const [hiddenAction, setHiddenAction] = useState<AttributeChangeAction>('unchanged');
  const [systemAction, setSystemAction] = useState<AttributeChangeAction>('unchanged');

  const [subfolderDepthOption, setSubfolderDepthOption] = useState<string>('none');
  const [includeFiles, setIncludeFiles] = useState(true);
  const [includeFolders, setIncludeFolders] = useState(true);

  const itemPathsKey = useMemo(() => items.map(item => item.path).join('\0'), [items]);
  const hasAnyFolder = useMemo(() => items.some(item => item.isFolder), [items]);

  const applySnapshotsToFields = useCallback((first: NativeFileMetadataSnapshot | undefined) => {
    setCreatedDate(toLocalDateInputValue(first?.createdMs));
    setCreatedTime(toLocalTimeInputValue(first?.createdMs));
    setModifiedDate(toLocalDateInputValue(first?.modifiedMs));
    setModifiedTime(toLocalTimeInputValue(first?.modifiedMs));
    setAccessedDate(toLocalDateInputValue(first?.accessedMs));
    setAccessedTime(toLocalTimeInputValue(first?.accessedMs));
  }, []);

  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    setApplyCreated(false);
    setApplyModified(false);
    setApplyAccessed(false);
    setCopyEnabled(false);
    setCopyFrom('created');
    setCopyToCreated(false);
    setCopyToModified(true);
    setCopyToAccessed(false);
    setReadOnlyAction('unchanged');
    setHiddenAction('unchanged');
    setSystemAction('unchanged');
    setSubfolderDepthOption('none');
    setIncludeFiles(true);
    setIncludeFolders(true);
    setApplyError('');
    setLoadError('');

    const fallbackItem = items[0];
    const fallbackModifiedMs = fallbackItem?.modifiedAtMs ?? Date.now();
    const initialDate = toLocalDateInputValue(fallbackModifiedMs);
    const initialTime = toLocalTimeInputValue(fallbackModifiedMs);
    setCreatedDate(initialDate);
    setCreatedTime(initialTime);
    setModifiedDate(initialDate);
    setModifiedTime(initialTime);
    setAccessedDate(initialDate);
    setAccessedTime(initialTime);

    let cancelled = false;
    setIsLoading(true);
    void inspectNativeFileMetadataBatch(items.map(item => item.path))
      .then(result => {
        if (cancelled) return;
        setSnapshots(result);
        if (result.length === 0) {
          setLoadError(t.fileAttributes.loadError);
        } else {
          applySnapshotsToFields(result[0]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshots([]);
        setLoadError(t.fileAttributes.loadError);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applySnapshotsToFields, isOpen, itemPathsKey, items, t.fileAttributes.loadError]);

  const parsedCreatedMs = useMemo(
    () => (applyCreated ? parseLocalDateTimeInputs(createdDate, createdTime) : null),
    [applyCreated, createdDate, createdTime],
  );
  const parsedModifiedMs = useMemo(
    () => (applyModified ? parseLocalDateTimeInputs(modifiedDate, modifiedTime) : null),
    [applyModified, modifiedDate, modifiedTime],
  );
  const parsedAccessedMs = useMemo(
    () => (applyAccessed ? parseLocalDateTimeInputs(accessedDate, accessedTime) : null),
    [applyAccessed, accessedDate, accessedTime],
  );

  const hasAttributeChange =
    readOnlyAction !== 'unchanged' ||
    hiddenAction !== 'unchanged' ||
    systemAction !== 'unchanged';

  const hasAnyChange =
    applyCreated ||
    applyModified ||
    applyAccessed ||
    copyEnabled ||
    hasAttributeChange;

  const validation = useMemo(() => {
    if (applyCreated && parsedCreatedMs === null) {
      return {
        valid: false,
        message: t.fileAttributes.invalidTimestamp.replace('{field}', t.fileAttributes.created),
      };
    }
    if (applyModified && parsedModifiedMs === null) {
      return {
        valid: false,
        message: t.fileAttributes.invalidTimestamp.replace('{field}', t.fileAttributes.modified),
      };
    }
    if (applyAccessed && parsedAccessedMs === null) {
      return {
        valid: false,
        message: t.fileAttributes.invalidTimestamp.replace('{field}', t.fileAttributes.accessed),
      };
    }
    if (copyEnabled && !copyToCreated && !copyToModified && !copyToAccessed) {
      return {
        valid: false,
        message: t.fileAttributes.copyNoTarget,
      };
    }
    if (hasAnyFolder && subfolderDepthOption !== 'none' && !includeFiles && !includeFolders) {
      return {
        valid: false,
        message: t.fileAttributes.nothingMatched,
      };
    }
    return { valid: true, message: '' };
  }, [
    applyAccessed,
    applyCreated,
    applyModified,
    copyEnabled,
    copyToAccessed,
    copyToCreated,
    copyToModified,
    hasAnyFolder,
    includeFiles,
    includeFolders,
    parsedAccessedMs,
    parsedCreatedMs,
    parsedModifiedMs,
    subfolderDepthOption,
    t.fileAttributes.accessed,
    t.fileAttributes.copyNoTarget,
    t.fileAttributes.created,
    t.fileAttributes.invalidTimestamp,
    t.fileAttributes.modified,
    t.fileAttributes.nothingMatched,
  ]);

  const canApply = validation.valid && hasAnyChange && !isLoading && !isSubmitting && items.length > 0;

  const handleFillCurrentTime = useCallback(() => {
    const now = Date.now();
    const d = toLocalDateInputValue(now);
    const time = toLocalTimeInputValue(now);
    setCreatedDate(d);
    setCreatedTime(time);
    setModifiedDate(d);
    setModifiedTime(time);
    setAccessedDate(d);
    setAccessedTime(time);
    setApplyError('');
  }, []);

  const handleFillFromFirstItem = useCallback(() => {
    if (snapshots.length === 0) return;
    applySnapshotsToFields(snapshots[0]);
    setApplyError('');
  }, [applySnapshotsToFields, snapshots]);

  const handleApply = useCallback(async () => {
    if (!canApply) return;
    setApplyError('');
    setIsSubmitting(true);

    const parsedDepth: number | null =
      !hasAnyFolder || subfolderDepthOption === 'none'
        ? null
        : subfolderDepthOption === 'infinite'
          ? 0
          : Number(subfolderDepthOption);

    const copyTime: FileMetadataCopyTimeSpec | null = copyEnabled
      ? {
          from: copyFrom,
          toCreated: copyToCreated,
          toModified: copyToModified,
          toAccessed: copyToAccessed,
        }
      : null;

    try {
      const outcome = await onApply({
        paths: items.map(item => item.path),
        subfolderDepth: parsedDepth,
        includeFiles,
        includeFolders,
        createdMs: applyCreated ? parsedCreatedMs : null,
        modifiedMs: applyModified ? parsedModifiedMs : null,
        accessedMs: applyAccessed ? parsedAccessedMs : null,
        copyTime,
        readOnly: readOnlyAction,
        hidden: hiddenAction,
        system: systemAction,
      });
      if (outcome.applied) {
        onClose();
      } else {
        setApplyError(outcome.errorMessage || t.fileAttributes.applyFailed);
      }
    } catch {
      setApplyError(t.fileAttributes.applyFailed);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    applyAccessed,
    applyCreated,
    applyModified,
    canApply,
    copyEnabled,
    copyFrom,
    copyToAccessed,
    copyToCreated,
    copyToModified,
    hasAnyFolder,
    hiddenAction,
    includeFiles,
    includeFolders,
    items,
    onApply,
    onClose,
    parsedAccessedMs,
    parsedCreatedMs,
    parsedModifiedMs,
    readOnlyAction,
    subfolderDepthOption,
    systemAction,
    t.fileAttributes.applyFailed,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!isSubmitting) onClose();
        return;
      }
      if (event.key === 'Enter' && !event.repeat && !event.isComposing && canApply) {
        if (
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement
        ) {
          return;
        }
        if (event.target instanceof HTMLButtonElement && event.target !== applyButtonRef.current) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void handleApply();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [canApply, handleApply, isOpen, isSubmitting, onClose]);

  const readOnlySummary = useMemo(() => summarizeAttribute(snapshots, 'readOnly'), [snapshots]);
  const hiddenSummary = useMemo(() => summarizeAttribute(snapshots, 'hidden'), [snapshots]);
  const systemSummary = useMemo(() => summarizeAttribute(snapshots, 'system'), [snapshots]);

  const showVisibilityWarning =
    hiddenAction === 'on' ||
    hiddenAction === 'toggle' ||
    systemAction === 'on' ||
    systemAction === 'toggle';

  if (!isOpen) return null;

  const renderStatePill = (summary: ReturnType<typeof summarizeAttribute>) => {
    if (summary.kind === 'unknown') return null;
    if (summary.kind === 'on') {
      return (
        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
          {t.fileAttributes.stateOn}
        </span>
      );
    }
    if (summary.kind === 'off') {
      return (
        <span className="rounded border border-neutral-700/80 bg-neutral-950/70 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
          {t.fileAttributes.stateOff}
        </span>
      );
    }
    return (
      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
        {t.fileAttributes.stateMixed
          .replace('{on}', String(summary.onCount))
          .replace('{total}', String(summary.total))}
      </span>
    );
  };

  const renderTimestampRow = (
    id: string,
    label: string,
    checked: boolean,
    setChecked: (value: boolean) => void,
    dateValue: string,
    setDateValue: (value: string) => void,
    timeValue: string,
    setTimeValue: (value: string) => void,
  ) => (
    <div className="grid grid-cols-[minmax(130px,155px)_minmax(145px,1fr)_minmax(125px,145px)] items-center gap-2.5">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-xs font-medium text-neutral-200 cursor-pointer select-none"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => {
            setChecked(e.target.checked);
            setApplyError('');
          }}
          className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400 focus:ring-cyan-500/40"
        />
        <span>{label}</span>
      </label>
      <input
        type="date"
        aria-label={`${label} date`}
        value={dateValue}
        onChange={e => {
          setDateValue(e.target.value);
          setChecked(true);
          setApplyError('');
        }}
        className={`w-full rounded-md border bg-neutral-950 px-2.5 py-1.5 font-mono text-xs transition focus:outline-none focus:border-cyan-500/60 ${
          checked ? 'border-cyan-500/50 text-neutral-100' : 'border-neutral-800 text-neutral-400'
        }`}
      />
      <input
        type="time"
        step={1}
        aria-label={`${label} time`}
        value={timeValue}
        onChange={e => {
          setTimeValue(e.target.value);
          setChecked(true);
          setApplyError('');
        }}
        className={`w-full rounded-md border bg-neutral-950 px-2.5 py-1.5 font-mono text-xs transition focus:outline-none focus:border-cyan-500/60 ${
          checked ? 'border-cyan-500/50 text-neutral-100' : 'border-neutral-800 text-neutral-400'
        }`}
      />
    </div>
  );

  const renderAttributeRow = (
    id: string,
    label: string,
    summary: ReturnType<typeof summarizeAttribute>,
    value: AttributeChangeAction,
    onChange: (next: AttributeChangeAction) => void,
  ) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800/80 bg-neutral-950/60 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <label htmlFor={id} className="text-xs font-medium text-neutral-200 truncate">
          {label}
        </label>
        <span className="text-[10px] text-neutral-500 shrink-0">{t.fileAttributes.currentState}</span>
        {renderStatePill(summary)}
      </div>
      <select
        id={id}
        value={value}
        onChange={e => {
          onChange(e.target.value as AttributeChangeAction);
          setApplyError('');
        }}
        className={`w-36 rounded-md border bg-neutral-900 px-2.5 py-1 text-xs transition focus:outline-none focus:border-cyan-500/60 ${
          value !== 'unchanged'
            ? 'border-cyan-500/50 text-cyan-200 font-medium'
            : 'border-neutral-700 text-neutral-300'
        }`}
      >
        <option value="unchanged">{t.fileAttributes.actionUnchanged}</option>
        <option value="on">{t.fileAttributes.actionOn}</option>
        <option value="off">{t.fileAttributes.actionOff}</option>
        <option value="toggle">{t.fileAttributes.actionToggle}</option>
      </select>
    </div>
  );

  const subtitle = items.length === 1
    ? t.fileAttributes.subtitleOne.replace('{name}', items[0].name)
    : t.fileAttributes.subtitleMany.replace('{count}', String(items.length));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-attributes-title"
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        onMouseDown={event => event.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="file-attributes-title" className="font-semibold text-neutral-100 text-sm">
                {t.fileAttributes.title}
              </h3>
              <p className="text-[11px] text-neutral-400 truncate">{subtitle}</p>
            </div>
          </div>
          <Tooltip label={t.fileAttributes.cancel} shortcut="Esc" placement="bottom">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label={t.fileAttributes.cancel}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {isLoading && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-[11px] text-neutral-400">
              {t.fileAttributes.loading}
            </div>
          )}

          {loadError && !isLoading && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              {loadError}
            </div>
          )}

          {/* File Date / Time section */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.fileAttributes.timestampsSection}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFillFromFirstItem}
                  disabled={snapshots.length === 0 || isLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-45"
                >
                  <RotateCcw className="w-3 h-3 text-neutral-400" />
                  <span>{t.fileAttributes.fillFromItem}</span>
                </button>
                <button
                  type="button"
                  onClick={handleFillCurrentTime}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
                >
                  <Clock className="w-3 h-3" />
                  <span>{t.fileAttributes.fillCurrentTime}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {renderTimestampRow(
                'attr-created-toggle',
                t.fileAttributes.created,
                applyCreated,
                setApplyCreated,
                createdDate,
                setCreatedDate,
                createdTime,
                setCreatedTime,
              )}
              {renderTimestampRow(
                'attr-modified-toggle',
                t.fileAttributes.modified,
                applyModified,
                setApplyModified,
                modifiedDate,
                setModifiedDate,
                modifiedTime,
                setModifiedTime,
              )}
              {renderTimestampRow(
                'attr-accessed-toggle',
                t.fileAttributes.accessed,
                applyAccessed,
                setApplyAccessed,
                accessedDate,
                setAccessedDate,
                accessedTime,
                setAccessedTime,
              )}
            </div>

            {/* Copy Time From */}
            <div className="pt-2.5 border-t border-neutral-800/80 flex flex-wrap items-center gap-x-3 gap-y-2">
              <label
                htmlFor="attr-copy-time-toggle"
                className="flex items-center gap-2 text-xs font-medium text-neutral-200 cursor-pointer select-none"
              >
                <input
                  id="attr-copy-time-toggle"
                  type="checkbox"
                  checked={copyEnabled}
                  onChange={e => {
                    setCopyEnabled(e.target.checked);
                    setApplyError('');
                  }}
                  className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400 focus:ring-cyan-500/40"
                />
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.fileAttributes.copyTimeFrom}</span>
              </label>

              <select
                aria-label={t.fileAttributes.copyTimeFrom}
                value={copyFrom}
                onChange={e => {
                  setCopyFrom(e.target.value as TimestampKind);
                  setCopyEnabled(true);
                  setApplyError('');
                }}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500/60"
              >
                <option value="created">{t.fileAttributes.created}</option>
                <option value="modified">{t.fileAttributes.modified}</option>
                <option value="accessed">{t.fileAttributes.accessed}</option>
              </select>

              <span className="text-[11px] font-medium text-neutral-400">{t.fileAttributes.copyTimeTo}</span>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={copyToCreated}
                    onChange={e => {
                      setCopyToCreated(e.target.checked);
                      setCopyEnabled(true);
                      setApplyError('');
                    }}
                    className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400"
                  />
                  <span>{t.fileAttributes.created}</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={copyToModified}
                    onChange={e => {
                      setCopyToModified(e.target.checked);
                      setCopyEnabled(true);
                      setApplyError('');
                    }}
                    className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400"
                  />
                  <span>{t.fileAttributes.modified}</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={copyToAccessed}
                    onChange={e => {
                      setCopyToAccessed(e.target.checked);
                      setCopyEnabled(true);
                      setApplyError('');
                    }}
                    className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400"
                  />
                  <span>{t.fileAttributes.accessed}</span>
                </label>
              </div>
            </div>
          </section>

          {/* Windows Attributes section */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.fileAttributes.attributesSection}</span>
            </div>

            <div className="space-y-2">
              {renderAttributeRow(
                'attr-readonly-select',
                t.fileAttributes.readOnly,
                readOnlySummary,
                readOnlyAction,
                setReadOnlyAction,
              )}
              {renderAttributeRow(
                'attr-hidden-select',
                t.fileAttributes.hidden,
                hiddenSummary,
                hiddenAction,
                setHiddenAction,
              )}
              {renderAttributeRow(
                'attr-system-select',
                t.fileAttributes.system,
                systemSummary,
                systemAction,
                setSystemAction,
              )}
            </div>

            {showVisibilityWarning && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{t.fileAttributes.systemHiddenWarning}</span>
              </div>
            )}
          </section>

          {/* Folder Scope section */}
          {hasAnyFolder && (
            <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.fileAttributes.scopeSection}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <label htmlFor="attr-subfolder-depth" className="text-xs font-medium text-neutral-200">
                    {t.fileAttributes.subfolderDepth}
                  </label>
                  <select
                    id="attr-subfolder-depth"
                    value={subfolderDepthOption}
                    onChange={e => {
                      setSubfolderDepthOption(e.target.value);
                      setApplyError('');
                    }}
                    className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500/60"
                  >
                    <option value="none">{t.fileAttributes.depthNone}</option>
                    <option value="infinite">{t.fileAttributes.depthInfinite}</option>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(level => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                {subfolderDepthOption !== 'none' && (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeFiles}
                        onChange={e => {
                          setIncludeFiles(e.target.checked);
                          setApplyError('');
                        }}
                        className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400"
                      />
                      <span>{t.fileAttributes.includeFiles}</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeFolders}
                        onChange={e => {
                          setIncludeFolders(e.target.checked);
                          setApplyError('');
                        }}
                        className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400"
                      />
                      <span>{t.fileAttributes.includeFolders}</span>
                    </label>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-4">
          <div className="text-[11px] text-neutral-400 min-w-0">
            {applyError ? (
              <span className="text-rose-300">{applyError}</span>
            ) : !validation.valid ? (
              <span className="text-rose-300">{validation.message}</span>
            ) : !hasAnyChange ? (
              <span>{t.fileAttributes.noChangesHint}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <DialogButton
              size="compact"
              shortcut="Esc"
              aria-keyshortcuts="Escape"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t.fileAttributes.cancel}
            </DialogButton>
            <DialogButton
              ref={applyButtonRef}
              size="compact"
              variant="primary"
              shortcut="Enter"
              aria-keyshortcuts="Enter"
              onClick={() => void handleApply()}
              disabled={!canApply}
            >
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isSubmitting ? t.fileAttributes.applying : t.fileAttributes.apply}</span>
              </span>
            </DialogButton>
          </div>
        </div>
      </div>
    </div>
  );
};
