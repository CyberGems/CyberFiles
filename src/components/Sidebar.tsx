import React, { useEffect, useState, useMemo } from 'react';
import { 
  HardDrive, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Code2, 
  Music, 
  Video,
  Archive,
  Binary,
  Monitor, 
  FolderOpen, 
  ChevronDown,
  ChevronRight,
  Clock,
  FolderTree,
  Search,
  Trash2,
  Eye,
  X,
  Copy,
  MoveRight,
  Pencil,
} from 'lucide-react';
import { DriveInfo, FileItem, FileType, QuickAccessItem } from '../types';
import { formatFileSize, formatRelativeTime, getParentPath } from '../utils/fileSystem';
import type { RecycleBinStatus } from '../utils/nativeFileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface SidebarProps {
  drives: DriveInfo[];
  quickAccess: QuickAccessItem[];
  allFiles?: FileItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenDrive?: (path: string) => void;
  onSelectRecentFile?: (file: FileItem) => void;
  onClearRecentFiles?: () => void;
  selectedItems: FileItem[];
  onClearSelection: () => void;
  onCopySelected: () => void;
  onMoveSelected: () => void;
  onRenameSelected: () => void;
  onDeleteSelected: () => void;
  onOpenSelectedFolder: (item: FileItem) => void;
  onPreviewSelectedFile: (item: FileItem) => void;
  onCopySelectedPaths: (items: FileItem[]) => void;
  recycleBinSupported: boolean;
  recycleBinStatus: RecycleBinStatus | null;
  onRequestEmptyRecycleBin: () => void;
  isCollapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  drives,
  quickAccess,
  allFiles = [],
  currentPath,
  onNavigate,
  onOpenDrive,
  onSelectRecentFile,
  onClearRecentFiles,
  selectedItems,
  onClearSelection,
  onCopySelected,
  onMoveSelected,
  onRenameSelected,
  onDeleteSelected,
  onOpenSelectedFolder,
  onPreviewSelectedFile,
  onCopySelectedPaths,
  recycleBinSupported,
  recycleBinStatus,
  onRequestEmptyRecycleBin,
}) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'tree' | 'recent'>('tree');
  const [recentSearch, setRecentSearch] = useState('');
  const [recentCategory, setRecentCategory] = useState<'all' | 'code' | 'image' | 'document' | 'media'>('all');
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('cyberfiles_sidebar_collapsed_sections_v1') || 'null');
      return {
        drives: saved?.drives === true,
        quickAccess: saved?.quickAccess === true,
      };
    } catch {
      return { drives: false, quickAccess: false };
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('cyberfiles_sidebar_collapsed_sections_v1', JSON.stringify(collapsedSections));
    } catch {
      // Sidebar section preferences remain available for the current session.
    }
  }, [collapsedSections]);

  const toggleSection = (section: 'drives' | 'quickAccess') => {
    setCollapsedSections(previous => ({ ...previous, [section]: !previous[section] }));
  };

  const getQuickAccessIcon = (iconName: string) => {
    switch (iconName) {
      case 'monitor': return <Monitor className="w-3.5 h-3.5" />;
      case 'desktop': return <Monitor className="w-3.5 h-3.5" />;
      case 'download': return <Download className="w-3.5 h-3.5" />;
      case 'downloads': return <Download className="w-3.5 h-3.5" />;
      case 'documents': return <FileText className="w-3.5 h-3.5" />;
      case 'pictures': return <ImageIcon className="w-3.5 h-3.5" />;
      case 'music': return <Music className="w-3.5 h-3.5" />;
      case 'videos': return <Video className="w-3.5 h-3.5" />;
      case 'folder': return <FolderOpen className="w-3.5 h-3.5" />;
      case 'image': return <ImageIcon className="w-3.5 h-3.5" />;
      case 'code': return <Code2 className="w-3.5 h-3.5" />;
      case 'music': return <Music className="w-3.5 h-3.5" />;
      default: return <FolderOpen className="w-3.5 h-3.5" />;
    }
  };

  const getFileTypeIcon = (type: FileType) => {
    switch (type) {
      case 'code': return <Code2 className="w-3.5 h-3.5 text-cyan-400" />;
      case 'image': return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
      case 'audio': return <Music className="w-3.5 h-3.5 text-pink-400" />;
      case 'video': return <Video className="w-3.5 h-3.5 text-purple-400" />;
      case 'document':
      case 'text': return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'archive': return <Archive className="w-3.5 h-3.5 text-amber-400" />;
      default: return <Binary className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  // Recent files list sorted by lastAccessed descending
  const recentFiles = useMemo(() => {
    const list = allFiles.filter(f => !f.isFolder && f.lastAccessed);
    return list.sort((a, b) => {
      const timeA = new Date(a.lastAccessed!).getTime();
      const timeB = new Date(b.lastAccessed!).getTime();
      return timeB - timeA;
    });
  }, [allFiles]);

  // Filtered recent files
  const filteredRecentFiles = useMemo(() => {
    return recentFiles.filter(f => {
      if (recentCategory === 'code' && f.type !== 'code') return false;
      if (recentCategory === 'image' && f.type !== 'image') return false;
      if (recentCategory === 'document' && f.type !== 'document' && f.type !== 'text') return false;
      if (recentCategory === 'media' && f.type !== 'audio' && f.type !== 'video') return false;

      if (recentSearch.trim()) {
        const q = recentSearch.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [recentFiles, recentCategory, recentSearch]);

  const canEmptyRecycleBin = recycleBinSupported && recycleBinStatus?.available === true && recycleBinStatus.itemCount > 0;
  const recycleBinStateLabel = !recycleBinSupported
    ? t.sidebar.recycleBinDesktopOnly
    : !recycleBinStatus
      ? t.sidebar.recycleBinChecking
      : !recycleBinStatus.available
        ? t.sidebar.recycleBinUnavailable
        : recycleBinStatus.itemCount === 0
          ? t.sidebar.recycleBinEmpty
          : t.sidebar.recycleBinContents
            .replace('{count}', new Intl.NumberFormat(language === 'es' ? 'es' : 'en').format(recycleBinStatus.itemCount))
            .replace('{size}', formatFileSize(recycleBinStatus.totalBytes));

  return (
    <aside className="w-64 bg-neutral-950 border-r border-neutral-800/80 flex flex-col justify-between select-none flex-shrink-0 text-xs">
      
      {/* 1. Header Tabs: Explorador vs Archivos Recientes */}
      <div className="p-2 border-b border-neutral-800/80 bg-neutral-900/60 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('tree')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-[11px] transition-all ${
            activeTab === 'tree'
              ? 'bg-neutral-800 text-cyan-300 shadow-sm border border-neutral-700/60 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t.sidebar.tabLocations}</span>
        </button>

        <button
          onClick={() => setActiveTab('recent')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-[11px] transition-all relative ${
            activeTab === 'recent'
              ? 'bg-neutral-800 text-cyan-300 shadow-sm border border-neutral-700/60 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>{t.sidebar.tabRecent}</span>
          {recentFiles.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-neutral-950 text-cyan-400 border border-neutral-700">
              {recentFiles.length}
            </span>
          )}
        </button>
      </div>

      <div className="border-b border-neutral-800/80 bg-neutral-950 px-2 py-2">
        <Tooltip label={canEmptyRecycleBin ? t.sidebar.emptyRecycleBinAction : recycleBinStateLabel} placement="right" disabled={!canEmptyRecycleBin}>
          <button
            type="button"
            disabled={!canEmptyRecycleBin}
            onClick={onRequestEmptyRecycleBin}
            aria-label={`${t.sidebar.recycleBinTitle}: ${recycleBinStateLabel}`}
            className="flex w-full items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-2 text-left transition-colors enabled:hover:border-rose-800/80 enabled:hover:bg-rose-950/25 disabled:cursor-default"
          >
            <Trash2 className={`h-4 w-4 flex-shrink-0 ${canEmptyRecycleBin ? 'text-rose-300' : 'text-neutral-500'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold text-neutral-200">{t.sidebar.recycleBinTitle}</span>
              <span className={`block truncate text-[9px] ${canEmptyRecycleBin ? 'text-neutral-400' : 'text-neutral-500'}`}>{recycleBinStateLabel}</span>
            </span>
            {canEmptyRecycleBin && <span className="flex-shrink-0 rounded border border-rose-900/60 px-1.5 py-0.5 text-[9px] font-semibold text-rose-200">{t.sidebar.emptyRecycleBinButton}</span>}
          </button>
        </Tooltip>
      </div>

      {/* 2. Main Tab Body */}
      {selectedItems.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.sidebar.selectionTitle}</h2>
              <p className="mt-1 text-xs font-medium text-neutral-100">
                {selectedItems.length === 1 ? t.sidebar.oneItemSelected : t.sidebar.manyItemsSelected.replace('{count}', String(selectedItems.length))}
              </p>
            </div>
            <Tooltip label={t.sidebar.clearSelection}>
              <button
                type="button"
                onClick={onClearSelection}
                aria-label={t.sidebar.clearSelection}
                className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>

          <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2">
            {selectedItems.slice(0, 3).map(item => (
              <div key={item.id} className="flex min-w-0 items-center gap-2 py-1">
                <span className="flex-shrink-0">{item.isFolder ? <FolderOpen className="h-3.5 w-3.5 text-amber-300" /> : getFileTypeIcon(item.type)}</span>
                <div className="min-w-0 flex-1">
                  <Tooltip label={item.name} placement="top"><p className="truncate text-[11px] font-medium text-neutral-200">{item.name}</p></Tooltip>
                  <Tooltip label={item.path} placement="top"><p className="truncate font-mono text-[9px] text-neutral-500">{item.path}</p></Tooltip>
                </div>
              </div>
            ))}
            {selectedItems.length > 3 && (
              <p className="pt-1 text-[10px] text-neutral-500">{t.sidebar.moreSelected.replace('{count}', String(selectedItems.length - 3))}</p>
            )}
          </div>

          {selectedItems.length === 1 && (
            <button
              type="button"
              onClick={() => selectedItems[0].isFolder ? onOpenSelectedFolder(selectedItems[0]) : onPreviewSelectedFile(selectedItems[0])}
              className="flex w-full items-center gap-2 rounded-md border border-cyan-800/70 bg-cyan-950/40 px-2.5 py-2 text-left text-[11px] font-medium text-cyan-200 transition-colors hover:border-cyan-600 hover:bg-cyan-950/70"
            >
              {selectedItems[0].isFolder ? <FolderOpen className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{selectedItems[0].isFolder ? t.sidebar.openSelected : t.sidebar.previewSelected}</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onCopySelected} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800">
              <Copy className="h-3.5 w-3.5 flex-shrink-0 text-cyan-300" /><span>{t.toolbar.copyOpposite}</span>
            </button>
            <button type="button" onClick={onMoveSelected} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800">
              <MoveRight className="h-3.5 w-3.5 flex-shrink-0 text-cyan-300" /><span>{t.toolbar.moveOpposite}</span>
            </button>
            <button type="button" onClick={onRenameSelected} disabled={selectedItems.length !== 1} className="flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2 py-2 text-left text-[10px] text-neutral-200 transition-colors hover:border-cyan-700/70 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
              <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" /><span>{t.toolbar.rename}</span>
            </button>
            <button type="button" onClick={onDeleteSelected} className="flex min-w-0 items-center gap-1.5 rounded-md border border-rose-900/60 bg-rose-950/20 px-2 py-2 text-left text-[10px] text-rose-200 transition-colors hover:border-rose-700 hover:bg-rose-950/50">
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" /><span>{t.toolbar.delete}</span>
            </button>
          </div>

          <button type="button" onClick={() => onCopySelectedPaths(selectedItems)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[10px] text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200">
            <Copy className="h-3.5 w-3.5" />{t.sidebar.copySelectedPaths}
          </button>
        </div>
      ) : activeTab === 'tree' ? (
        <div className="p-3 space-y-5 overflow-y-auto flex-1">
          {drives.length > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => toggleSection('drives')}
              aria-expanded={!collapsedSections.drives}
              aria-label={`${t.sidebar.drivesTitle}: ${collapsedSections.drives ? t.sidebar.expandSection : t.sidebar.collapseSection}`}
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              {collapsedSections.drives ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>{t.sidebar.drivesTitle}</span>
            </button>

            {!collapsedSections.drives && <div className="space-y-1">
              {drives.map((drive) => {
                const hasCapacity = Number.isFinite(drive.totalBytes) && drive.totalBytes > 0;
                const usedPercentage = hasCapacity ? Math.min(100, Math.round((drive.usedBytes / drive.totalBytes) * 100)) : 0;
                const isSelected = currentPath.startsWith(drive.letter);

                return (
                  <button
                    key={drive.id}
                    onClick={() => onOpenDrive ? onOpenDrive(drive.letter + '\\') : onNavigate(drive.letter + '\\')}
                    className={`w-full text-left p-2 rounded-lg border transition-all ${
                      isSelected 
                        ? 'bg-neutral-900 border-cyan-500/40 text-neutral-100 shadow-sm' 
                        : 'bg-neutral-950/60 border-neutral-800/60 text-neutral-300 hover:bg-neutral-900/70 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <HardDrive className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-neutral-400'}`} />
                        <span className="font-mono font-bold text-xs">{drive.letter}</span>
                        <span className="text-[11px] text-neutral-400 truncate max-w-[100px]">{drive.label}</span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono">{hasCapacity ? `${usedPercentage}%` : '—'}</span>
                    </div>

                    {/* Usage Meter Bar */}
                    <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          usedPercentage > 85 ? 'bg-rose-500' : usedPercentage > 65 ? 'bg-amber-400' : 'bg-cyan-500'
                        }`}
                        style={{ width: hasCapacity ? `${usedPercentage}%` : '0%' }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] text-neutral-400 mt-1 font-mono">
                      <span>{language === 'es' ? 'Libre' : 'Free'}: {hasCapacity ? formatFileSize(drive.totalBytes - drive.usedBytes) : '—'}</span>
                      <span>Total: {hasCapacity ? formatFileSize(drive.totalBytes) : '—'}</span>
                    </div>
                  </button>
                );
              })}
            </div>}
          </div>
          )}

          {quickAccess.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => toggleSection('quickAccess')}
              aria-expanded={!collapsedSections.quickAccess}
              aria-label={`${t.sidebar.quickAccessTitle}: ${collapsedSections.quickAccess ? t.sidebar.expandSection : t.sidebar.collapseSection}`}
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              {collapsedSections.quickAccess ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>{t.sidebar.quickAccessTitle}</span>
            </button>

            {!collapsedSections.quickAccess && <div className="space-y-0.5">
              {quickAccess.map((item) => {
                const isSelected = currentPath.toLowerCase() === item.path.toLowerCase();

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.path)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors ${
                      isSelected
                        ? 'bg-neutral-800/90 text-cyan-300 font-medium'
                        : 'text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={isSelected ? 'text-cyan-400' : 'text-neutral-400'}>
                        {getQuickAccessIcon(item.icon)}
                      </span>
                      <span className="truncate text-[11px]">{item.name}</span>
                    </div>

                    {item.count !== undefined && (
                      <span className="text-[9px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>}
          </div>
          )}
        </div>
      ) : (
        /* RECENT FILES TAB */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Recent Controls: Search & Category Filter */}
          <div className="p-2.5 border-b border-neutral-800/80 bg-neutral-900/30 space-y-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
                placeholder="Filtrar recientes..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-7 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-500/60 font-mono"
              />
              {recentSearch && (
                <button
                  onClick={() => setRecentSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
              {(['all', 'code', 'document', 'image', 'media'] as const).map(cat => {
                const labels: Record<string, string> = {
                  all: 'Todos',
                  code: 'Código',
                  document: 'Docs',
                  image: 'Imágenes',
                  media: 'Media',
                };
                const isSelected = recentCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setRecentCategory(cat)}
                    className={`px-2 py-0.5 rounded-full font-mono transition-all ${
                      isSelected
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold'
                        : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                    }`}
                  >
                    {labels[cat]}
                  </button>
                );
              })}
            </div>

            {/* Sub-header with Count & Clear */}
            <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-0.5">
              <span>{filteredRecentFiles.length} de {recentFiles.length} archivos</span>
              {onClearRecentFiles && recentFiles.length > 0 && (
                <Tooltip label={t.sidebar.clearRecentTooltip}>
                  <button
                    onClick={onClearRecentFiles}
                    className="flex items-center gap-1 text-neutral-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>{t.sidebar.clearRecentHistory}</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* List of Recent Items */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-neutral-900/60">
            {filteredRecentFiles.length === 0 ? (
              <div className="p-6 text-center text-neutral-500 flex flex-col items-center justify-center space-y-2">
                <Clock className="w-8 h-8 text-neutral-700" />
                <p className="text-xs font-medium text-neutral-400">Sin archivos recientes</p>
                <p className="text-[10px] text-neutral-500 leading-relaxed max-w-[190px]">
                  Los archivos que abras, muevas o renombres en cualquier unidad aparecerán aquí automáticamente.
                </p>
              </div>
            ) : (
              filteredRecentFiles.map(file => {
                const parent = getParentPath(file.path);
                const parentName = parent.split(/\\|\//).filter(Boolean).pop() || parent;

                return (
                  <div
                    key={file.id}
                    onClick={() => onSelectRecentFile && onSelectRecentFile(file)}
                    className="group pt-1 pb-1.5 px-2 rounded-lg hover:bg-neutral-900/90 border border-transparent hover:border-neutral-800 cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 p-1 rounded bg-neutral-900/90 border border-neutral-800/80 group-hover:border-cyan-500/40 flex-shrink-0">
                        {getFileTypeIcon(file.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="font-medium text-neutral-200 truncate group-hover:text-cyan-300 text-xs"
                          >
                            <Tooltip label={file.name} placement="top"><span>{file.name}</span></Tooltip>
                          </span>
                        </div>

                        {/* Location folder & Size */}
                        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mt-0.5">
                          <Tooltip label={file.path} placement="top"><span className="truncate max-w-[110px]">📁 {parentName}</span></Tooltip>
                          <span className="text-neutral-400 font-semibold">{formatFileSize(file.size)}</span>
                        </div>

                        {/* Relative Timestamp */}
                        <div className="flex items-center justify-between text-[9px] font-mono text-neutral-400 mt-1">
                          <span className="flex items-center gap-1 text-amber-400/90">
                            <Clock className="w-2.5 h-2.5" />
                            {file.lastAccessed ? formatRelativeTime(file.lastAccessed) : 'Reciente'}
                          </span>

                          {/* Quick Actions on Hover */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip label={`${t.sidebar.goToFolder}: ${parent}`} placement="top">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigate(parent);
                                }}
                                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-300"
                              >
                                <FolderOpen className="w-3 h-3" />
                              </button>
                            </Tooltip>
                            <Tooltip label={t.sidebar.previewInViewer} placement="top">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectRecentFile) onSelectRecentFile(file);
                                }}
                                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-300"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

    </aside>
  );
};
