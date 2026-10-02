import React, { useState, useEffect } from 'react';
import { Clock, Eye, EyeOff, File, Folder, HardDrive, Keyboard, Link2, List, Network, PanelLeft, PanelRight } from 'lucide-react';
import { DriveInfo, FileItem, TabState, ViewLayout, SYSTEM_HOME_PATH } from '../types';
import { formatFileSize } from '../utils/fileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface BottomStatusBarProps {
  layout: ViewLayout;
  activePane: 'left' | 'right';
  currentTab: TabState;
  activeFiles: FileItem[];
  hasMoreItems: boolean;
  totalFileCount?: number;
  totalFolderCount?: number;
  hiddenItemsCount: number | null;
  showHiddenFiles: boolean;
  drives: DriveInfo[];
  onOpenShortcuts: () => void;
}

interface StatusTooltipRow {
  label: string;
  value: string;
  tone?: 'default' | 'cyan' | 'amber' | 'rose';
}

interface StatusTooltipCardProps {
  icon: React.ReactNode;
  title: string;
  primary?: string;
  description?: string;
  rows?: StatusTooltipRow[];
  progress?: {
    value: number;
    color: string;
    label: string;
  };
}

const tooltipToneClasses: Record<NonNullable<StatusTooltipRow['tone']>, string> = {
  default: 'text-neutral-100',
  cyan: 'text-cyan-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
};

const StatusTooltipCard: React.FC<StatusTooltipCardProps> = ({
  icon,
  title,
  primary,
  description,
  rows = [],
  progress,
}) => (
  <div className="min-w-[15rem] max-w-[20rem] p-1 text-left">
    <div className="flex items-center gap-2 text-cyan-300">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10">
        {icon}
      </span>
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-200">{title}</span>
    </div>

    {primary && <div className="mt-2 text-[22px] font-bold leading-none text-neutral-50">{primary}</div>}
    {description && <div className="mt-1.5 break-words text-[12px] font-normal leading-relaxed text-neutral-300">{description}</div>}

    {progress && (
      <div className="mt-3">
        <div
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.value}
          className="h-2.5 overflow-hidden rounded-full border border-neutral-600/60 bg-neutral-800"
        >
          <div className={`h-full rounded-full ${progress.color}`} style={{ width: `${progress.value}%` }} />
        </div>
      </div>
    )}

    {rows.length > 0 && (
      <div className="mt-3 grid gap-1.5 border-t border-neutral-600/40 pt-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-start justify-between gap-4 text-[12px] leading-snug">
            <span className="text-neutral-400">{row.label}</span>
            <span className={`text-right font-bold ${tooltipToneClasses[row.tone ?? 'default']}`}>{row.value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

function formatStorageSize(bytes: number, language: 'es' | 'en') {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  const maximumFractionDigits = unitIndex >= 4 ? 2 : value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(language === 'es' ? 'es-CR' : 'en-US', {
    maximumFractionDigits,
  }).format(value)} ${units[unitIndex]}`;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  layout,
  activePane,
  currentTab,
  activeFiles,
  hasMoreItems,
  totalFileCount,
  totalFolderCount,
  hiddenItemsCount,
  showHiddenFiles,
  drives,
  onOpenShortcuts,
}) => {
  const { language, t } = useLanguage();
  // Live clock updating every second.
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const locale = language === 'es' ? 'es-CR' : 'en-US';
  const compactDateTime = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime);
  const fullDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(currentTime);
  const clockTime = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime);
  const timeZoneName = new Intl.DateTimeFormat(locale, { timeZoneName: 'long' })
    .formatToParts(currentTime)
    .find(part => part.type === 'timeZoneName')?.value
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Current path and length calculation (Windows MAX_PATH is 260 characters)
  const currentPath = currentTab.currentPath;
  const isSystemHome = currentPath === SYSTEM_HOME_PATH;
  const displayPath = isSystemHome ? t.sidebar.thisPc : currentPath;
  const pathLength = displayPath.length;
  const MAX_PATH_WINDOWS = 260;
  const isNearMaxPath = pathLength >= 200;
  const isExceedingMaxPath = pathLength > MAX_PATH_WINDOWS;

  // Selected files metrics
  const selectedIds = currentTab.selectedIds;
  const fileItems = activeFiles.filter(f => !f.isFolder);
  const folderItems = activeFiles.filter(f => f.isFolder);

  const selectedFileItems = fileItems.filter(f => selectedIds.includes(f.id));
  const selectedFolderItems = folderItems.filter(f => selectedIds.includes(f.id));

  const selectedTotalBytes = selectedFileItems.reduce((acc, f) => acc + (f.size || 0), 0);
  const folderTotalBytes = fileItems.reduce((acc, f) => acc + (f.size || 0), 0);

  // Active drive information (e.g. C:)
  const driveLetter = currentPath.match(/^[a-zA-Z]:/)?.[0]?.toUpperCase() ?? '';
  const currentDrive = isSystemHome || !driveLetter
    ? undefined
    : drives.find(drive => drive.letter.toUpperCase() === driveLetter);
  const capacityDrive = currentDrive && currentDrive.totalBytes > 0 ? currentDrive : null;
  const freeDriveBytes = capacityDrive ? Math.max(0, capacityDrive.totalBytes - capacityDrive.usedBytes) : 0;
  const driveUsedPct = currentDrive?.totalBytes
    ? Math.min(100, Math.max(0, Math.round((currentDrive.usedBytes / currentDrive.totalBytes) * 100)))
    : 0;
  const driveUsageColor = driveUsedPct >= 90
    ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
    : driveUsedPct >= 75
      ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]'
      : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.45)]';
  const driveUsageTextColor = driveUsedPct >= 90
    ? 'text-rose-300'
    : driveUsedPct >= 75
      ? 'text-amber-300'
      : 'text-cyan-300';

  const nonNetworkDrives = drives.filter(drive => drive.type !== 'network');
  const networkDrives = drives.filter(drive => drive.type === 'network');
  const localCapacityDrives = nonNetworkDrives.filter(drive => drive.totalBytes > 0);
  const localTotalBytes = localCapacityDrives.reduce((total, drive) => total + drive.totalBytes, 0);
  const localUsedBytes = localCapacityDrives.reduce((total, drive) => total + Math.min(drive.usedBytes, drive.totalBytes), 0);
  const localFreeBytes = Math.max(0, localTotalBytes - localUsedBytes);
  const localUsedPct = localTotalBytes > 0 ? Math.round((localUsedBytes / localTotalBytes) * 100) : 0;
  const localUsageColor = localUsedPct >= 90 ? 'bg-rose-500' : localUsedPct >= 75 ? 'bg-amber-400' : 'bg-cyan-400';
  const remainingPathCharacters = MAX_PATH_WINDOWS - pathLength;
  const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
  const loadedCount = (value: number, knownCount?: number) => knownCount === undefined
    ? `${formatCount(value)}${hasMoreItems ? '+' : ''}`
    : formatCount(knownCount);
  const displayFileCount = loadedCount(fileItems.length, totalFileCount);
  const displayFolderCount = loadedCount(folderItems.length, totalFolderCount);
  const displayTotalCount = loadedCount(activeFiles.length, totalFileCount === undefined || totalFolderCount === undefined ? undefined : totalFileCount + totalFolderCount);
  const selectedItemCount = selectedFileItems.length + selectedFolderItems.length;
  const shortcutsTooltip = (
    <StatusTooltipCard
      icon={<Keyboard className="h-4 w-4" />}
      title={t.statusBar.quickShortcuts}
      primary="F1"
      description={t.statusBar.openShortcutsDescription}
    />
  );

  if (!currentPath) {
    return (
      <footer id="app-bottom-status-bar" className="h-7 bg-black border-t border-neutral-800 px-2 text-[11px] font-sans text-neutral-400 flex items-center justify-between select-none z-30 flex-shrink-0">
        <span>{t.pane.noFolderOpen}</span>
        <Tooltip label={shortcutsTooltip} placement="top"><button onClick={onOpenShortcuts} className="rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"><kbd className="keyboard-hint">F1</kbd></button></Tooltip>
      </footer>
    );
  }

  return (
    <footer 
      id="app-bottom-status-bar"
      className="h-7 bg-black border-t border-neutral-800 text-neutral-300 px-2 flex items-center justify-between text-[11px] font-sans select-none z-30 flex-shrink-0 gap-1.5 overflow-x-auto no-scrollbar"
    >
      {/* Left section: selection and capacity summary */}
      <div className="flex items-center gap-1 min-w-0">
        {/* Active Pane Indicator */}
        {layout !== 'single' && (
          <Tooltip
            label={(
              <StatusTooltipCard
                icon={activePane === 'left' ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
                title={t.statusBar.activePaneTitle}
                primary={activePane === 'left' ? t.statusBar.leftPane : t.statusBar.rightPane}
                description={t.statusBar.activePaneDescription}
                rows={[{ label: t.statusBar.currentLocation, value: displayPath }]}
              />
            )}
            placement="top"
          >
            <div
              role="img"
              aria-label={activePane === 'left' ? t.statusBar.leftPane : t.statusBar.rightPane}
              tabIndex={0}
              className="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-200 mr-1 flex-shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              <span className={`w-2 h-2 rounded-full ${activePane === 'left' ? 'bg-cyan-400' : 'bg-amber-400'}`} />
              <span className="font-bold">{activePane === 'left' ? (language === 'es' ? 'I' : 'L') : (language === 'es' ? 'D' : 'R')}</span>
            </div>
          </Tooltip>
        )}

        {isSystemHome ? (
          <>
            <Tooltip
              label={(
                <StatusTooltipCard
                  icon={<HardDrive className="h-4 w-4" />}
                  title={t.statusBar.localDrives}
                  primary={formatCount(nonNetworkDrives.length)}
                  description={t.statusBar.localDrivesDescription}
                  rows={localTotalBytes > 0 ? [
                    { label: t.statusBar.free, value: formatStorageSize(localFreeBytes, language), tone: 'cyan' },
                    { label: t.statusBar.total, value: formatStorageSize(localTotalBytes, language) },
                  ] : []}
                />
              )}
              placement="top"
            >
              <div className="flex items-center gap-1.5 border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] whitespace-nowrap">
                <HardDrive className="h-3 w-3 text-cyan-400" />
                <span className="font-semibold text-neutral-200">{t.statusBar.drivesCount.replace('{count}', String(nonNetworkDrives.length))}</span>
              </div>
            </Tooltip>
            <Tooltip
              label={(
                <StatusTooltipCard
                  icon={<Network className="h-4 w-4" />}
                  title={t.statusBar.networkLocations}
                  primary={formatCount(networkDrives.length)}
                  description={t.statusBar.networkLocationsDescription}
                />
              )}
              placement="top"
            >
              <div className="flex items-center gap-1.5 border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] whitespace-nowrap">
                <Network className="h-3 w-3 text-violet-300" />
                <span className="font-semibold text-neutral-200">{t.statusBar.networkLocationsCount.replace('{count}', String(networkDrives.length))}</span>
              </div>
            </Tooltip>
            {localTotalBytes > 0 && (
              <Tooltip
                label={(
                  <StatusTooltipCard
                    icon={<HardDrive className="h-4 w-4" />}
                    title={t.statusBar.localStorage}
                    primary={`${localUsedPct}%`}
                    description={t.statusBar.localStorageUsage.replace('{used}', String(localUsedPct))}
                    progress={{
                      value: localUsedPct,
                      color: localUsageColor,
                      label: t.statusBar.localStorageUsage.replace('{used}', String(localUsedPct)),
                    }}
                    rows={[
                      { label: t.statusBar.used, value: formatStorageSize(localUsedBytes, language), tone: localUsedPct >= 90 ? 'rose' : localUsedPct >= 75 ? 'amber' : 'default' },
                      { label: t.statusBar.free, value: formatStorageSize(localFreeBytes, language), tone: 'cyan' },
                      { label: t.statusBar.total, value: formatStorageSize(localTotalBytes, language) },
                    ]}
                  />
                )}
                placement="top"
              >
                <div className="hidden items-center gap-2 border border-neutral-700 bg-neutral-900/90 px-2 py-0.5 text-[10px] whitespace-nowrap sm:flex">
                  <div
                    role="progressbar"
                    aria-label={t.statusBar.localStorageUsage.replace('{used}', String(localUsedPct))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={localUsedPct}
                    className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-700"
                  >
                    <div className={`h-full rounded-full ${localUsageColor}`} style={{ width: `${localUsedPct}%` }} />
                  </div>
                  <span className="font-semibold text-neutral-200">
                    {t.statusBar.localStorageFree
                      .replace('{free}', formatStorageSize(localFreeBytes, language))
                      .replace('{total}', formatStorageSize(localTotalBytes, language))}
                  </span>
                </div>
              </Tooltip>
            )}
          </>
        ) : (
          <>
            <Tooltip label={<StatusTooltipCard icon={<File className="h-4 w-4" />} title={t.statusBar.files} primary={`${formatCount(selectedFileItems.length)} / ${displayFileCount}`} rows={[{ label: t.statusBar.selected, value: formatCount(selectedFileItems.length), tone: 'cyan' }, { label: t.statusBar.inFolder, value: displayFileCount }]} />} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">{language === 'es' ? 'Archivos:' : 'Files:'}</span><span className="text-yellow-300 font-bold">{selectedFileItems.length}/{displayFileCount}</span></div></Tooltip>

            <Tooltip label={<StatusTooltipCard icon={<Folder className="h-4 w-4" />} title={t.statusBar.folders} primary={`${formatCount(selectedFolderItems.length)} / ${displayFolderCount}`} rows={[{ label: t.statusBar.selected, value: formatCount(selectedFolderItems.length), tone: 'cyan' }, { label: t.statusBar.inFolder, value: displayFolderCount }]} />} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">{language === 'es' ? 'Carpetas:' : 'Folders:'}</span><span className="text-yellow-300 font-bold">{selectedFolderItems.length}/{displayFolderCount}</span></div></Tooltip>

            <Tooltip label={<StatusTooltipCard icon={<List className="h-4 w-4" />} title={t.statusBar.folderContents} primary={displayTotalCount} description={hasMoreItems ? t.pane.moreItemsAvailable : undefined} rows={[{ label: t.statusBar.files, value: displayFileCount }, { label: t.statusBar.folders, value: displayFolderCount }, { label: t.statusBar.selected, value: formatCount(selectedItemCount), tone: 'cyan' }]} />} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">Total:</span><span className="text-yellow-300 font-bold">{displayTotalCount}</span></div></Tooltip>
            {hiddenItemsCount !== null && hiddenItemsCount > 0 && (
              <Tooltip
                label={(
                  <StatusTooltipCard
                    icon={showHiddenFiles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    title={t.statusBar.hiddenItems}
                    primary={formatCount(hiddenItemsCount)}
                    description={showHiddenFiles ? t.statusBar.hiddenItemsShown : t.statusBar.hiddenItemsNotShown}
                    rows={[{ label: t.statusBar.currentLocation, value: displayPath }]}
                  />
                )}
                placement="top"
              >
                <div
                  role="img"
                  aria-label={`${t.statusBar.hiddenItems}: ${formatCount(hiddenItemsCount)}. ${showHiddenFiles ? t.statusBar.hiddenItemsShown : t.statusBar.hiddenItemsNotShown}`}
                  tabIndex={0}
                  className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-rose-400/80 ${showHiddenFiles ? 'border-rose-900/70 bg-rose-950/35 text-rose-300' : 'border-rose-500/90 bg-rose-950/90 text-rose-100 shadow-[0_0_8px_rgba(244,63,94,0.3)]'}`}
                >
                  {showHiddenFiles ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  <span>{t.statusBar.hiddenItems}: {formatCount(hiddenItemsCount)}</span>
                </div>
              </Tooltip>
            )}

            <Tooltip label={<StatusTooltipCard icon={<HardDrive className="h-4 w-4" />} title={t.statusBar.selectedSize} primary={formatFileSize(selectedTotalBytes)} rows={[{ label: t.statusBar.selected, value: formatFileSize(selectedTotalBytes), tone: 'cyan' }, { label: t.statusBar.folderFileSize, value: formatFileSize(folderTotalBytes) }]} />} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-300 font-bold">{formatFileSize(selectedTotalBytes)} {language === 'es' ? 'de' : 'of'} {formatFileSize(folderTotalBytes)}</span></div></Tooltip>

            {capacityDrive && (
              <Tooltip
                label={(
                  <StatusTooltipCard
                    icon={<HardDrive className="h-4 w-4" />}
                    title={t.statusBar.driveStorage.replace('{drive}', capacityDrive.letter)}
                    primary={`${driveUsedPct}%`}
                    description={t.statusBar.driveUsage
                      .replace('{drive}', capacityDrive.letter)
                      .replace('{used}', String(driveUsedPct))
                      .replace('{free}', formatStorageSize(freeDriveBytes, language))
                      .replace('{total}', formatStorageSize(capacityDrive.totalBytes, language))}
                    progress={{
                      value: driveUsedPct,
                      color: driveUsageColor,
                      label: t.statusBar.driveUsage
                        .replace('{drive}', capacityDrive.letter)
                        .replace('{used}', String(driveUsedPct))
                        .replace('{free}', formatStorageSize(freeDriveBytes, language))
                        .replace('{total}', formatStorageSize(capacityDrive.totalBytes, language)),
                    }}
                    rows={[
                      { label: t.statusBar.used, value: formatStorageSize(capacityDrive.usedBytes, language), tone: driveUsedPct >= 90 ? 'rose' : driveUsedPct >= 75 ? 'amber' : 'default' },
                      { label: t.statusBar.free, value: formatStorageSize(freeDriveBytes, language), tone: 'cyan' },
                      { label: t.statusBar.total, value: formatStorageSize(capacityDrive.totalBytes, language) },
                    ]}
                  />
                )}
                placement="top"
              >
                <div className="hidden items-center gap-1.5 border border-neutral-700 bg-neutral-900/90 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap sm:flex">
                  <span className="font-bold text-yellow-400">({capacityDrive.letter})</span>
                  <div
                    role="progressbar"
                    aria-label={t.statusBar.driveUsage
                      .replace('{drive}', capacityDrive.letter)
                      .replace('{used}', String(driveUsedPct))
                      .replace('{free}', formatStorageSize(freeDriveBytes, language))
                      .replace('{total}', formatStorageSize(capacityDrive.totalBytes, language))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={driveUsedPct}
                    className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-700"
                  >
                    <div className={`h-full rounded-full ${driveUsageColor}`} style={{ width: `${driveUsedPct}%` }} />
                  </div>
                  <span className={`font-bold ${driveUsageTextColor}`}>{driveUsedPct}%</span>
                  <span className="text-neutral-300">{formatStorageSize(freeDriveBytes, language)} {language === 'es' ? 'libres' : 'free'}</span>
                </div>
              </Tooltip>
            )}

            {capacityDrive && <Tooltip label={<StatusTooltipCard icon={<HardDrive className="h-4 w-4" />} title={t.statusBar.driveStorage.replace('{drive}', capacityDrive.letter)} primary={formatStorageSize(capacityDrive.totalBytes, language)} rows={[{ label: t.statusBar.used, value: formatStorageSize(capacityDrive.usedBytes, language), tone: driveUsedPct >= 90 ? 'rose' : driveUsedPct >= 75 ? 'amber' : 'default' }, { label: t.statusBar.free, value: formatStorageSize(freeDriveBytes, language), tone: 'cyan' }, { label: t.statusBar.total, value: formatStorageSize(capacityDrive.totalBytes, language) }]} />} placement="top"><div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap">
              <span className="text-neutral-400">Total:</span>
              <span className="text-yellow-300 font-bold">{formatStorageSize(capacityDrive.totalBytes, language)}</span>
              <span className="text-neutral-400 ml-1">{language === 'es' ? 'Usado:' : 'Used:'}</span>
              <span className="text-yellow-300 font-bold">{formatStorageSize(capacityDrive.usedBytes, language)}</span>
            </div></Tooltip>}
          </>
        )}
      </div>

      {/* Right section: Path length information, Clock & System indicators */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Path length & MAX_PATH monitor (Windows NTFS 260 limit) */}
        {!isSystemHome && <Tooltip label={<StatusTooltipCard icon={<Link2 className="h-4 w-4" />} title={t.statusBar.pathLength} primary={`${formatCount(pathLength)} / ${formatCount(MAX_PATH_WINDOWS)}`} description={displayPath} rows={[{ label: t.statusBar.currentPath, value: t.statusBar.characters.replace('{count}', formatCount(pathLength)) }, { label: t.statusBar.standardLimit, value: t.statusBar.characters.replace('{count}', formatCount(MAX_PATH_WINDOWS)) }, { label: remainingPathCharacters >= 0 ? t.statusBar.charactersAvailable : t.statusBar.charactersOver, value: t.statusBar.characters.replace('{count}', formatCount(Math.abs(remainingPathCharacters))), tone: remainingPathCharacters < 0 ? 'rose' : remainingPathCharacters <= 60 ? 'amber' : 'cyan' }]} />} placement="top"><div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[10px] ${
            isExceedingMaxPath
              ? 'bg-rose-950/80 border-rose-700/80 text-rose-300 font-bold animate-pulse'
              : isNearMaxPath
              ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
              : 'bg-neutral-950 border-neutral-800 text-neutral-300'
          }`}
        >
          <Link2 className="w-3 h-3 text-neutral-400 flex-shrink-0" />
          <span className="text-neutral-400 hidden xl:inline">{language === 'es' ? 'Ruta:' : 'Path:'}</span>
          <span className="font-bold text-neutral-100">{pathLength}</span>
          <span className="text-neutral-500 text-[9px]">/ {MAX_PATH_WINDOWS} ch</span>
        </div></Tooltip>}

        {/* Live clock */}
        <Tooltip label={<StatusTooltipCard icon={<Clock className="h-4 w-4" />} title={t.statusBar.dateAndTime} primary={clockTime} description={fullDate} rows={[{ label: t.statusBar.timeZone, value: timeZoneName }]} />} placement="top">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-neutral-300 text-[10px] whitespace-nowrap" tabIndex={0}>
            <Clock className="w-3 h-3 text-neutral-400 flex-shrink-0" />
            <span>{compactDateTime}</span>
          </div>
        </Tooltip>

        {/* Keyboard Shortcuts trigger */}
        <Tooltip label={shortcutsTooltip} placement="top"><button onClick={onOpenShortcuts} className="rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"><kbd className="keyboard-hint">F1</kbd></button></Tooltip>
      </div>
    </footer>
  );
};
