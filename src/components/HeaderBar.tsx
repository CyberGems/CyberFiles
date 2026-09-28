import React from 'react';
import {
  Columns2,
  Rows2,
  Square,
  Copy,
  MoveRight,
  Edit3,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  StretchHorizontal,
  Search,
  Trash2,
  PanelsTopLeft,
  BarChart3,
} from 'lucide-react';
import { ViewLayout, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface HeaderBarProps {
  layout: ViewLayout;
  onLayoutChange: (layout: ViewLayout) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  relativeGraphsEnabled: boolean;
  onToggleRelativeGraphs: () => void;
  propertiesPanelOpen: boolean;
  onTogglePropertiesPanel: () => void;
  onRenameSelected: () => void;
  onNewFolder: () => void;
  onCopySelected: () => void;
  onMoveSelected: () => void;
  onDeleteSelected: () => void;
  selectedCount: number;
  onOpenSearch: () => void;
  onOpenWorkspaceManager: () => void;
  workspaceChangesPending: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  layout,
  onLayoutChange,
  viewMode,
  onViewModeChange,
  relativeGraphsEnabled,
  onToggleRelativeGraphs,
  propertiesPanelOpen,
  onTogglePropertiesPanel,
  onRenameSelected,
  onNewFolder,
  onCopySelected,
  onMoveSelected,
  onDeleteSelected,
  selectedCount,
  onOpenSearch,
  onOpenWorkspaceManager,
  workspaceChangesPending,
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
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-sans text-[10px] border border-neutral-700">Ctrl+F</kbd>
          </button>
        </Tooltip>

        <div className="header-actions flex items-center gap-1 overflow-x-auto min-w-0">
          <Tooltip label={t.toolbar.copyOpposite} disabled={disabled}><button onClick={onCopySelected} disabled={disabled} className="header-action"><Copy className="w-3.5 h-3.5 text-cyan-400" /><span className="core-action-label">{language === 'es' ? 'Copiar' : 'Copy'}</span><span className="shortcut">F5</span></button></Tooltip>
          <Tooltip label={t.toolbar.moveOpposite} disabled={disabled}><button onClick={onMoveSelected} disabled={disabled} className="header-action"><MoveRight className="w-3.5 h-3.5 text-blue-400" /><span className="core-action-label">{language === 'es' ? 'Mover' : 'Move'}</span><span className="shortcut">F6</span></button></Tooltip>
          <Tooltip label={t.toolbar.rename} disabled={disabled}><button onClick={onRenameSelected} disabled={disabled} className="header-action"><Edit3 className="w-3.5 h-3.5 text-amber-400" /><span className="core-action-label">{language === 'es' ? 'Renombrar' : 'Rename'}</span><span className="shortcut">F2</span></button></Tooltip>
          <Tooltip label={t.toolbar.delete} disabled={disabled}><button onClick={onDeleteSelected} disabled={disabled} className="header-action text-rose-200"><Trash2 className="w-3.5 h-3.5 text-rose-400" /><span className="core-action-label">{language === 'es' ? 'Eliminar' : 'Delete'}</span><span className="shortcut">Del</span></button></Tooltip>
          <Tooltip label={t.toolbar.newFolder}><button onClick={onNewFolder} className="header-action"><FolderPlus className="w-3.5 h-3.5 text-emerald-400" /><span className="action-label">{language === 'es' ? 'Nueva carpeta' : 'New folder'}</span><span className="shortcut">F7</span></button></Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="view-choice-group flex items-center" role="group" aria-label={t.toolbar.viewModes}>
          <Tooltip label={t.toolbar.viewDetails}><button type="button" aria-label={t.toolbar.viewDetails} aria-pressed={viewMode === 'details'} onClick={() => onViewModeChange('details')} className="view-choice"><List className="h-4 w-4" /></button></Tooltip>
          <Tooltip label={t.toolbar.viewCompact}><button type="button" aria-label={t.toolbar.viewCompact} aria-pressed={viewMode === 'compact'} onClick={() => onViewModeChange('compact')} className="view-choice"><StretchHorizontal className="h-4 w-4" /></button></Tooltip>
          <Tooltip label={t.toolbar.viewIcons}><button type="button" aria-label={t.toolbar.viewIcons} aria-pressed={viewMode === 'icons'} onClick={() => onViewModeChange('icons')} className="view-choice"><LayoutGrid className="h-4 w-4" /></button></Tooltip>
        </div>

        <Tooltip label={t.toolbar.relativeGraphs} placement="bottom">
          <button
            type="button"
            aria-label={t.toolbar.relativeGraphs}
            aria-pressed={relativeGraphsEnabled}
            onClick={onToggleRelativeGraphs}
            className={relativeGraphsEnabled ? 'flex h-9 w-9 items-center justify-center rounded-md border border-cyan-700/70 bg-cyan-950/70 text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70' : 'flex h-9 w-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70'}
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </Tooltip>

        <div className="view-choice-group flex items-center" role="group" aria-label={t.header.layoutModes}>
          <Tooltip label={t.header.layoutDualVertical}><button type="button" aria-label={t.header.layoutDualVertical} aria-pressed={layout === 'dual-vertical'} onClick={() => onLayoutChange('dual-vertical')} className="view-choice"><Columns2 className="h-4 w-4" /></button></Tooltip>
          <Tooltip label={t.header.layoutDualHorizontal}><button type="button" aria-label={t.header.layoutDualHorizontal} aria-pressed={layout === 'dual-horizontal'} onClick={() => onLayoutChange('dual-horizontal')} className="view-choice"><Rows2 className="h-4 w-4" /></button></Tooltip>
          <Tooltip label={t.header.layoutSingle}><button type="button" aria-label={t.header.layoutSingle} aria-pressed={layout === 'single'} onClick={() => onLayoutChange('single')} className="view-choice"><Square className="h-4 w-4" /></button></Tooltip>
        </div>

        <Tooltip label={`${t.workspaceProfiles.open}${workspaceChangesPending ? ` · ${t.workspaceProfiles.modified}` : ''}`} placement="bottom">
          <button type="button" onClick={onOpenWorkspaceManager} aria-label={`${t.workspaceProfiles.open}${workspaceChangesPending ? `, ${t.workspaceProfiles.modified}` : ''}`} className="relative flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 transition-colors hover:border-cyan-800 hover:bg-neutral-800 hover:text-cyan-200">
            <PanelsTopLeft className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">{t.workspaceProfiles.title}</span>
            {workspaceChangesPending && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-neutral-950 bg-amber-300" />}
          </button>
        </Tooltip>
        <Tooltip label={propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel}><button type="button" onClick={onTogglePropertiesPanel} aria-label={`${propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel} (F3)`} aria-pressed={propertiesPanelOpen} className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${propertiesPanelOpen ? 'bg-cyan-950/70 border-cyan-700/70 text-cyan-300' : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'}`}><Info className={`w-3.5 h-3.5 ${propertiesPanelOpen ? 'text-cyan-300' : 'text-neutral-400'}`} /><span className="hidden xl:inline">{t.toolbar.propertiesPanel}</span><span className="text-[10px] opacity-60 font-sans">F3</span></button></Tooltip>
      </div>

      <style>{`
        .header-actions { scrollbar-width:none; }
        .header-actions::-webkit-scrollbar { display:none; }
        .header-action { display:flex; align-items:center; gap:.375rem; padding:.375rem .625rem; border-radius:.375rem; color:var(--color-neutral-200); font-size:.75rem; font-weight:500; white-space:nowrap; transition:background-color .15s,color .15s; }
        .header-action:hover:not(:disabled) { background:var(--color-neutral-800); }
        .header-action:disabled { opacity:.4; cursor:not-allowed; }
        .header-action.accent { background:var(--color-cyan-950); border:1px solid var(--color-neutral-700); color:var(--color-cyan-200); }
        .shortcut { color:var(--color-neutral-500); font:10px "Segoe UI",Inter,ui-sans-serif,system-ui,sans-serif; }
        .view-choice-group { gap:2px; padding:3px; border:1px solid var(--color-neutral-700); border-radius:6px; background:var(--color-neutral-950); box-shadow:inset 0 1px 2px rgba(0,0,0,.35); }
        .view-choice { display:flex; width:34px; height:30px; align-items:center; justify-content:center; border:1px solid transparent; border-radius:3px; color:var(--color-neutral-500); transition:background-color .14s,color .14s,border-color .14s,box-shadow .14s; }
        .view-choice:hover:not([aria-pressed="true"]) { background:var(--color-neutral-800); color:var(--color-neutral-200); }
        .view-choice[aria-pressed="true"] { border-color:rgba(103,232,249,.2); background:#1d292d; color:#a5f3fc; box-shadow:inset 0 1px rgba(255,255,255,.045); }
        .view-choice:focus-visible { outline:2px solid rgba(34,211,238,.7); outline-offset:2px; }
        #root button.view-choice:not([data-file-item="true"]):not([role="separator"]):not(:disabled):active { scale:1; }
        @media (max-width: 1535px) { .action-label { display:none; } .header-action { padding:.375rem .5rem; } }
      `}</style>
    </header>
  );
};
