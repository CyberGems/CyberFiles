import React, { useState, useEffect } from 'react';
import { Link2, Clock } from 'lucide-react';
import { DriveInfo, FileItem, TabState, SYSTEM_HOME_PATH } from '../types';
import { formatFileSize } from '../utils/fileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface BottomStatusBarProps {
  activePane: 'left' | 'right';
  currentTab: TabState;
  activeFiles: FileItem[];
  drives: DriveInfo[];
  onOpenShortcuts: () => void;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
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
  const driveLetter = (currentPath.slice(0, 2) || 'C:').toUpperCase();
  const currentDrive = isSystemHome ? undefined : drives.find(d => d.letter.toUpperCase() === driveLetter) || drives[0];

  const totalDriveGB = currentDrive ? (currentDrive.totalBytes / (1024 ** 3)).toFixed(0) : '447';
  const usedDriveGB = currentDrive ? (currentDrive.usedBytes / (1024 ** 3)).toFixed(0) : '413';
  const freeDriveGB = currentDrive 
    ? ((currentDrive.totalBytes - currentDrive.usedBytes) / (1024 ** 3)).toFixed(1).replace('.', ',') 
    : '33,6';
  const driveUsedPct = currentDrive?.totalBytes
    ? Math.round((currentDrive.usedBytes / currentDrive.totalBytes) * 100) 
    : 0;
  const capacityDrive = currentDrive && currentDrive.totalBytes > 0 && !isSystemHome ? currentDrive : null;

  if (!currentPath) {
    return (
      <footer id="app-bottom-status-bar" className="h-7 bg-black border-t border-neutral-800 px-2 text-[11px] font-mono text-neutral-400 flex items-center justify-between select-none z-30 flex-shrink-0">
        <span>{t.pane.noFolderOpen}</span>
        <Tooltip label={t.header.shortcutsTooltip} placement="top"><button onClick={onOpenShortcuts} className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200">F1</button></Tooltip>
      </footer>
    );
  }

  return (
    <footer 
      id="app-bottom-status-bar"
      className="h-7 bg-black border-t border-neutral-800 text-neutral-300 px-2 flex items-center justify-between text-[11px] font-mono select-none z-30 flex-shrink-0 gap-1.5 overflow-x-auto no-scrollbar"
    >
      {/* Left section: selection and capacity summary */}
      <div className="flex items-center gap-1 min-w-0">
        {/* Active Pane Indicator */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-200 mr-1 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${activePane === 'left' ? 'bg-cyan-400' : 'bg-amber-400'}`} />
          <span className="font-bold">{activePane === 'left' ? 'L' : 'R'}</span>
        </div>

        {/* 1. Files: X/Y */}
        <Tooltip label={language === 'es' ? `Archivos: ${selectedFileItems.length} seleccionados de ${fileItems.length} totales` : `Files: ${selectedFileItems.length} selected out of ${fileItems.length}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">{language === 'es' ? 'Archivos:' : 'Files:'}</span><span className="text-yellow-300 font-bold">{selectedFileItems.length}/{fileItems.length}</span></div></Tooltip>

        {/* 2. Folders: X/Y */}
        <Tooltip label={language === 'es' ? `Carpetas: ${selectedFolderItems.length} seleccionadas de ${folderItems.length} totales` : `Folders: ${selectedFolderItems.length} selected out of ${folderItems.length}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">{language === 'es' ? 'Carpetas:' : 'Folders:'}</span><span className="text-yellow-300 font-bold">{selectedFolderItems.length}/{folderItems.length}</span></div></Tooltip>

        {/* 3. Total: N */}
        <Tooltip label={language === 'es' ? `Total de objetos en esta carpeta: ${activeFiles.length}` : `Total items in this folder: ${activeFiles.length}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-400 font-bold">Total:</span><span className="text-yellow-300 font-bold">{activeFiles.length}</span></div></Tooltip>

        {/* 4. Bytes of Total (e.g., 0 bytes of 174 KB) */}
        <Tooltip label={language === 'es' ? `Tamaño seleccionado: ${formatFileSize(selectedTotalBytes)} de ${formatFileSize(folderTotalBytes)} total` : `Selected size: ${formatFileSize(selectedTotalBytes)} out of ${formatFileSize(folderTotalBytes)}`} placement="top"><div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap"><span className="text-yellow-300 font-bold">{formatFileSize(selectedTotalBytes)} {language === 'es' ? 'de' : 'of'} {formatFileSize(folderTotalBytes)}</span></div></Tooltip>

        {/* 5. Drive space percentage used pill (e.g. 93% used, 33,6 GB free) */}
        {capacityDrive && <Tooltip label={language === 'es' ? `Espacio en unidad ${capacityDrive.letter}: ${driveUsedPct}% ocupado, ${freeDriveGB} GB libres` : `Drive ${capacityDrive.letter}: ${driveUsedPct}% used, ${freeDriveGB} GB free`} placement="top"><div className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-neutral-800/90 text-neutral-200 border border-neutral-700 text-[10px] whitespace-nowrap font-medium"><span className="text-neutral-100 font-bold">{driveUsedPct}% {language === 'es' ? 'usado,' : 'used,'}</span><span className="text-neutral-300">{freeDriveGB} GB {language === 'es' ? 'libres' : 'free'}</span></div></Tooltip>}

        {/* 6. Drive Total & Used (e.g., (C:) Total: 447 GB  Used: 413 GB) */}
        {capacityDrive && <Tooltip label={language === 'es' ? `Capacidad de disco ${capacityDrive.letter}: ${totalDriveGB} GB total, ${usedDriveGB} GB ocupados` : `Drive ${capacityDrive.letter}: ${totalDriveGB} GB total, ${usedDriveGB} GB used`} placement="top"><div className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[10px] whitespace-nowrap">
          <span className="text-yellow-400 font-bold">({capacityDrive.letter})</span>
          <span className="text-neutral-400">{language === 'es' ? 'Total:' : 'Total:'}</span>
          <span className="text-yellow-300 font-bold">{totalDriveGB} GB</span>
          <span className="text-neutral-400 ml-1">{language === 'es' ? 'Usado:' : 'Used:'}</span>
          <span className="text-yellow-300 font-bold">{usedDriveGB} GB</span>
        </div></Tooltip>}
      </div>

      {/* Right section: Path length information, Clock & System indicators */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Path length & MAX_PATH monitor (Windows NTFS 260 limit) */}
        <Tooltip label={language === 'es' ? `Ruta actual: ${displayPath}. Longitud: ${pathLength} caracteres. Límite estándar de Windows: ${MAX_PATH_WINDOWS}.` : `Current path: ${displayPath}. Length: ${pathLength} characters. Standard Windows limit: ${MAX_PATH_WINDOWS}.`} placement="top"><div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[10px] ${
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
        </div></Tooltip>

        {/* Live clock */}
        <div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-neutral-300 text-[10px] whitespace-nowrap">
          <Clock className="w-3 h-3 text-neutral-400 flex-shrink-0" />
          <span>{currentTime || '24 mayo 2026 20:59:27'}</span>
        </div>

        {/* Keyboard Shortcuts trigger */}
        <Tooltip label={t.header.shortcutsTooltip} placement="top"><button onClick={onOpenShortcuts} className="px-1.5 py-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors text-[10px]">F1</button></Tooltip>
      </div>
    </footer>
  );
};
