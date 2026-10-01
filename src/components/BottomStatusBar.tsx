import React, { useState, useEffect } from 'react';
import { Clock, HardDrive, Link2, Network } from 'lucide-react';
import { DriveInfo, FileItem, TabState, ViewLayout, SYSTEM_HOME_PATH } from '../types';
import { formatFileSize } from '../utils/fileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface BottomStatusBarProps {
  layout: ViewLayout;
  activePane: 'left' | 'right';
  currentTab: TabState;
  activeFiles: FileItem[];
  drives: DriveInfo[];
  onOpenShortcuts: () => void;
}

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
  drives,
  onOpenShortcuts,
}) => {
  const { language, t } = useLanguage();
  // Live clock updating every second.
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const day = now.getDate();
      const monthNames = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const month = monthNames[now.getMonth()];
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${day} ${month} ${year} ${hours}:${minutes}:${seconds}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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

  if (!currentPath) {
    return (
      <footer id="app-bottom-status-bar" className="h-7 bg-black border-t border-neutral-800 px-2 text-[11px] font-sans text-neutral-400 flex items-center justify-between select-none z-30 flex-shrink-0">
        <span>{t.pane.noFolderOpen}</span>
        <Tooltip label={t.header.shortcutsTooltip} placement="top"><button onClick={onOpenShortcuts} className="rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"><kbd className="keyboard-hint">F1</kbd></button></Tooltip>
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
          <Tooltip label={activePane === 'left' ? t.statusBar.leftPane : t.statusBar.rightPane} placement="top">
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
            <Tooltip label={t.statusBar.drivesCount.replace('{count}', String(nonNetworkDrives.length))} placement="top">
              <div className="flex items-center gap-1.5 border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] whitespace-nowrap">
                <HardDrive className="h-3 w-3 text-cyan-400" />
                <span className="font-semibold text-neutral-200">{t.statusBar.drivesCount.replace('{count}', String(nonNetworkDrives.length))}</span>
              </div>
            </Tooltip>
            <Tooltip label={t.statusBar.networkLocationsCount.replace('{count}', String(networkDrives.length))} placement="top">
              <div className="flex items-center gap-1.5 border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] whitespace-nowrap">
                <Network className="h-3 w-3 text-violet-300" />
                <span className="font-semibold text-neutral-200">{t.statusBar.networkLocationsCount.replace('{count}', String(networkDrives.length))}</span>
              </div>
            </Tooltip>
            {localTotalBytes > 0 && (
              <Tooltip
                label={t.statusBar.localStorageFree
                  .replace('{free}', formatStorageSize(localFreeBytes, language))
                  .replace('{total}', formatStorageSize(localTotalBytes, language))}
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
            <Tooltip label={language === 'es' ? `Archivos: ${selectedFileItems.length} seleccionados de ${fileItems.length} totales` : `Files: ${selectedFileItems.length} selected out of ${fileItems.length}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">{language === 'es' ? 'Archivos:' : 'Files:'}</span><span className="text-yellow-300 font-bold">{selectedFileItems.length}/{fileItems.length}</span></div></Tooltip>

            <Tooltip label={language === 'es' ? `Carpetas: ${selectedFolderItems.length} seleccionadas de ${folderItems.length} totales` : `Folders: ${selectedFolderItems.length} selected out of ${folderItems.length}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">{language === 'es' ? 'Carpetas:' : 'Folders:'}</span><span className="text-yellow-300 font-bold">{selectedFolderItems.length}/{folderItems.length}</span></div></Tooltip>

            <Tooltip label={language === 'es' ? `Total de objetos en esta carpeta: ${activeFiles.length}` : `Total items in this folder: ${activeFiles.length}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">Total:</span><span className="text-yellow-300 font-bold">{activeFiles.length}</span></div></Tooltip>

            <Tooltip label={language === 'es' ? `Tamaño seleccionado: ${formatFileSize(selectedTotalBytes)} de ${formatFileSize(folderTotalBytes)} total` : `Selected size: ${formatFileSize(selectedTotalBytes)} out of ${formatFileSize(folderTotalBytes)}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-300 font-bold">{formatFileSize(selectedTotalBytes)} {language === 'es' ? 'de' : 'of'} {formatFileSize(folderTotalBytes)}</span></div></Tooltip>

            {capacityDrive && (
              <Tooltip
                label={t.statusBar.driveUsage
                  .replace('{drive}', capacityDrive.letter)
                  .replace('{used}', String(driveUsedPct))
                  .replace('{free}', formatStorageSize(freeDriveBytes, language))
                  .replace('{total}', formatStorageSize(capacityDrive.totalBytes, language))}
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

            {capacityDrive && <Tooltip label={language === 'es' ? `Capacidad de disco ${capacityDrive.letter}: ${formatStorageSize(capacityDrive.totalBytes, language)} total, ${formatStorageSize(capacityDrive.usedBytes, language)} ocupados` : `Drive ${capacityDrive.letter}: ${formatStorageSize(capacityDrive.totalBytes, language)} total, ${formatStorageSize(capacityDrive.usedBytes, language)} used`} placement="top"><div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap">
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
        {!isSystemHome && <Tooltip label={language === 'es' ? `Ruta actual: ${displayPath}. Longitud: ${pathLength} caracteres. Límite estándar de Windows: ${MAX_PATH_WINDOWS}.` : `Current path: ${displayPath}. Length: ${pathLength} characters. Standard Windows limit: ${MAX_PATH_WINDOWS}.`} placement="top"><div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[10px] ${
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
        <div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-neutral-300 text-[10px] whitespace-nowrap">
          <Clock className="w-3 h-3 text-neutral-400 flex-shrink-0" />
          <span>{currentTime || '24 mayo 2026 20:59:27'}</span>
        </div>

        {/* Keyboard Shortcuts trigger */}
        <Tooltip label={t.header.shortcutsTooltip} placement="top"><button onClick={onOpenShortcuts} className="rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"><kbd className="keyboard-hint">F1</kbd></button></Tooltip>
      </div>
    </footer>
  );
};
