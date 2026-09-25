import React from 'react';
import {
  Columns2,
  Rows2,
  Square,
  Copy,
  MoveRight,
  Edit3,
  FolderPlus,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  StretchHorizontal,
  FolderOpen,
  Search,
  Trash2,
} from 'lucide-react';
import { ViewLayout, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface HeaderBarProps {
  layout: ViewLayout;
  onLayoutChange: (layout: ViewLayout) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onRenameSelected: () => void;
  onNewFolder: () => void;
  onCopySelected: () => void;
  onMoveSelected: () => void;
  onDeleteSelected: () => void;
  selectedCount: number;
  onOpenRealFolder: () => void;
  onOpenSearch: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  layout,
  onLayoutChange,
  viewMode,
  onViewModeChange,
  previewOpen,
  onTogglePreview,
  onRenameSelected,
  onNewFolder,
  onCopySelected,
  onMoveSelected,
  onDeleteSelected,
  selectedCount,
  onOpenRealFolder,
  onOpenSearch,
}) => {
  const { t, language } = useLanguage();
  const disabled = selectedCount === 0;

  return (
    <header className="min-h-14 bg-neutral-900/95 border-b border-neutral-800 px-3 py-2 flex items-center justify-between gap-3 select-none z-20 backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">

        <Tooltip label={t.findFiles.title}>
          <button onClick={onOpenSearch} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-cyan-800/70 hover:border-cyan-500 text-neutral-300 hover:text-cyan-300 transition-all shadow-inner flex-shrink-0">
            <Search className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-medium">{language === 'es' ? 'Buscar' : 'Search'}</span>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono text-[10px] border border-neutral-700">Ctrl+F</kbd>
          </button>
        </Tooltip>

        <div className="header-actions flex items-center gap-1 overflow-x-auto min-w-0">
          <Tooltip label={t.toolbar.copyOpposite} disabled={disabled}><button onClick={onCopySelected} disabled={disabled} className="header-action"><Copy className="w-3.5 h-3.5 text-cyan-400" /><span className="core-action-label">{language === 'es' ? 'Copiar' : 'Copy'}</span><span className="shortcut">F5</span></button></Tooltip>
          <Tooltip label={t.toolbar.moveOpposite} disabled={disabled}><button onClick={onMoveSelected} disabled={disabled} className="header-action"><MoveRight className="w-3.5 h-3.5 text-blue-400" /><span className="core-action-label">{language === 'es' ? 'Mover' : 'Move'}</span><span className="shortcut">F6</span></button></Tooltip>
          <Tooltip label={t.toolbar.rename} disabled={disabled}><button onClick={onRenameSelected} disabled={disabled} className="header-action"><Edit3 className="w-3.5 h-3.5 text-amber-400" /><span className="core-action-label">{language === 'es' ? 'Renombrar' : 'Rename'}</span><span className="shortcut">F2</span></button></Tooltip>
          <Tooltip label={t.toolbar.delete} disabled={disabled}><button onClick={onDeleteSelected} disabled={disabled} className="header-action text-rose-200"><Trash2 className="w-3.5 h-3.5 text-rose-400" /><span className="core-action-label">{language === 'es' ? 'Eliminar' : 'Delete'}</span><span className="shortcut">Del</span></button></Tooltip>
          <Tooltip label={t.toolbar.newFolder}><button onClick={onNewFolder} className="header-action"><FolderPlus className="w-3.5 h-3.5 text-emerald-400" /><span className="action-label">{language === 'es' ? 'Nueva carpeta' : 'New folder'}</span><span className="shortcut">F7</span></button></Tooltip>
          <Tooltip label={t.sidebar.openLocalFolder}><button onClick={onOpenRealFolder} className="header-action accent"><FolderOpen className="w-3.5 h-3.5 text-cyan-400" /><span className="action-label">{language === 'es' ? 'Elegir carpeta' : 'Choose folder'}</span></button></Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center bg-neutral-950/70 p-0.5 rounded-lg border border-neutral-800">
          <Tooltip label={t.toolbar.viewDetails}><button onClick={() => onViewModeChange('details')} className={`p-1.5 rounded ${viewMode === 'details' ? 'bg-neutral-800 text-cyan-300' : 'text-neutral-400 hover:text-neutral-200'}`}><List className="w-3.5 h-3.5" /></button></Tooltip>
          <Tooltip label={t.toolbar.viewCompact}><button onClick={() => onViewModeChange('compact')} className={`p-1.5 rounded ${viewMode === 'compact' ? 'bg-neutral-800 text-cyan-300' : 'text-neutral-400 hover:text-neutral-200'}`}><StretchHorizontal className="w-3.5 h-3.5" /></button></Tooltip>
          <Tooltip label={t.toolbar.viewIcons}><button onClick={() => onViewModeChange('icons')} className={`p-1.5 rounded ${viewMode === 'icons' ? 'bg-neutral-800 text-cyan-300' : 'text-neutral-400 hover:text-neutral-200'}`}><LayoutGrid className="w-3.5 h-3.5" /></button></Tooltip>
        </div>

        <div className="flex items-center bg-neutral-950/70 p-0.5 rounded-lg border border-neutral-800">
          <Tooltip label={t.header.layoutDualVertical}><button onClick={() => onLayoutChange('dual-vertical')} className={`p-1.5 rounded ${layout === 'dual-vertical' ? 'bg-neutral-800 text-cyan-300' : 'text-neutral-400 hover:text-neutral-200'}`}><Columns2 className="w-3.5 h-3.5" /></button></Tooltip>
          <Tooltip label={t.header.layoutDualHorizontal}><button onClick={() => onLayoutChange('dual-horizontal')} className={`p-1.5 rounded ${layout === 'dual-horizontal' ? 'bg-neutral-800 text-cyan-300' : 'text-neutral-400 hover:text-neutral-200'}`}><Rows2 className="w-3.5 h-3.5" /></button></Tooltip>
          <Tooltip label={t.header.layoutSingle}><button onClick={() => onLayoutChange('single')} className={`p-1.5 rounded ${layout === 'single' ? 'bg-neutral-800 text-cyan-300' : 'text-neutral-400 hover:text-neutral-200'}`}><Square className="w-3.5 h-3.5" /></button></Tooltip>
        </div>

        <Tooltip label={t.toolbar.preview}><button onClick={onTogglePreview} className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${previewOpen ? 'bg-cyan-950/70 border-cyan-700/70 text-cyan-300' : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'}`}>{previewOpen ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-neutral-500" />}<span className="hidden xl:inline">{language === 'es' ? 'Visor' : 'Viewer'}</span><span className="text-[10px] opacity-60 font-mono">F3</span></button></Tooltip>
      </div>

      <style>{`
        .header-actions { scrollbar-width:none; }
        .header-actions::-webkit-scrollbar { display:none; }
        .header-action { display:flex; align-items:center; gap:.375rem; padding:.375rem .625rem; border-radius:.375rem; color:var(--color-neutral-200); font-size:.75rem; font-weight:500; white-space:nowrap; transition:background-color .15s,color .15s; }
        .header-action:hover:not(:disabled) { background:var(--color-neutral-800); }
        .header-action:disabled { opacity:.4; cursor:not-allowed; }
        .header-action.accent { background:var(--color-cyan-950); border:1px solid var(--color-neutral-700); color:var(--color-cyan-200); }
        .shortcut { color:var(--color-neutral-500); font:10px ui-monospace,SFMono-Regular,Menlo,monospace; }
        @media (max-width: 1535px) { .action-label { display:none; } .header-action { padding:.375rem .5rem; } }
      `}</style>
    </header>
  );
};
