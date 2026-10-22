import React from 'react';
import {
  Columns2,
  Rows2,
  Square,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  StretchHorizontal,
  ListTree,
  LoaderCircle,
  Trash2,
  PanelsTopLeft,
  BarChart3,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Terminal,
  Menu,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import { SYSTEM_HOME_PATH, ViewLayout, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import type { WindowsTerminalOption } from '../utils/nativeFileSystem';
import { UndoHistoryMenu, type UndoHistoryItem } from './UndoHistoryMenu';
import { ToolbarOverflowMenu, type ToolbarOverflowGroup } from './ToolbarOverflowMenu';
import {
  CommandBarButton,
  CommandBarGroup,
  CommandBarSegment,
  CommandBarSplit,
  type ToolbarLabelPosition,
} from './CommandBarControl';

interface HeaderBarProps {
  layout: ViewLayout;
  onLayoutChange: (layout: ViewLayout) => void;
  isCompactWindow: boolean;
  activePane: 'left' | 'right';
  onActivePaneChange: (pane: 'left' | 'right') => void;
  sidebarDrawerOpen: boolean;
  onToggleSidebarDrawer: () => void;
  locationsPanelOpen: boolean;
  onToggleLocationsPanel: () => void;
  toolbarLabelPosition: ToolbarLabelPosition;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  relativeGraphsEnabled: boolean;
  onToggleRelativeGraphs: () => void;
  showHiddenFiles: boolean;
  onToggleShowHiddenFiles: () => void;
  showFileExtensions: boolean;
  onToggleShowFileExtensions: () => void;
  currentFolderPath: string;
  windowsActionsAvailable: boolean;
  lastTerminalOption: WindowsTerminalOption;
  onLastTerminalOptionChange: (option: WindowsTerminalOption) => void;
  onShowInWindowsExplorer: () => void;
  onLaunchTerminal: (option: WindowsTerminalOption) => void;
  propertiesPanelOpen: boolean;
  onTogglePropertiesPanel: () => void;
  onNewFolder: () => void;
  onDeleteSelected: () => void;
  undoHistory: UndoHistoryItem[];
  onUndoAction: (id: string) => void;
  undoBusy: boolean;
  selectedCount: number;
  flatView: boolean;
  flatViewAvailable: boolean;
  flatViewTooltip: string;
  flatViewLoading: boolean;
  onToggleFlatView: () => void;
  onOpenWorkspaceManager: () => void;
  workspaceChangesPending: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  layout,
  onLayoutChange,
  isCompactWindow,
  activePane,
  onActivePaneChange,
  sidebarDrawerOpen,
  onToggleSidebarDrawer,
  locationsPanelOpen,
  onToggleLocationsPanel,
  toolbarLabelPosition,
  viewMode,
  onViewModeChange,
  relativeGraphsEnabled,
  onToggleRelativeGraphs,
  showHiddenFiles,
  onToggleShowHiddenFiles,
  showFileExtensions,
  onToggleShowFileExtensions,
  currentFolderPath,
  windowsActionsAvailable,
  lastTerminalOption,
  onLastTerminalOptionChange,
  onShowInWindowsExplorer,
  onLaunchTerminal,
  propertiesPanelOpen,
  onTogglePropertiesPanel,
  onNewFolder,
  onDeleteSelected,
  undoHistory,
  onUndoAction,
  undoBusy,
  selectedCount,
  flatView,
  flatViewAvailable,
  flatViewTooltip,
  flatViewLoading,
  onToggleFlatView,
  onOpenWorkspaceManager,
  workspaceChangesPending,
}) => {
  const { t, language } = useLanguage();
  const disabled = selectedCount === 0;
  const [openToolbarMenu, setOpenToolbarMenu] = React.useState<'terminal' | null>(null);
  const menuRootRef = React.useRef<HTMLDivElement>(null);
  const hasDriveRoot = /^[a-z]:/i.test(currentFolderPath) && (currentFolderPath[2] === '\\' || currentFolderPath[2] === '/');
  const canUseFolderActions = windowsActionsAvailable && !currentFolderPath.startsWith('::') && (hasDriveRoot || currentFolderPath.startsWith('\\\\'));
  const canCreateFolder = Boolean(currentFolderPath) && !currentFolderPath.startsWith('::');
  const labels = t.toolbar.buttonLabels;
  const terminalLabels: Record<WindowsTerminalOption, string> = {
    cmd: t.toolbar.commandPromptHere,
    'cmd-admin': t.toolbar.commandPromptAdminHere,
    powershell: t.toolbar.powerShellHere,
    'powershell-admin': t.toolbar.powerShellAdminHere,
  };
  const workspaceTooltip = `${t.workspaceProfiles.open}${workspaceChangesPending ? ` · ${t.workspaceProfiles.modified}` : ''}`;
  React.useEffect(() => {
    if (!openToolbarMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setOpenToolbarMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenToolbarMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openToolbarMenu]);

  const overflowGroups: ToolbarOverflowGroup[] = [
    {
      id: 'windows-actions',
      label: t.toolbar.tools,
      entries: windowsActionsAvailable ? [
        { id: 'show-in-explorer', label: t.toolbar.showInWindowsExplorer, icon: <ExternalLink className="h-4 w-4" />, disabled: !canUseFolderActions, onSelect: onShowInWindowsExplorer },
        ...(['cmd', 'cmd-admin', 'powershell', 'powershell-admin'] as WindowsTerminalOption[]).map(option => ({
          id: 'terminal-' + option,
          label: terminalLabels[option],
          icon: <Terminal className="h-4 w-4" />,
          disabled: !canUseFolderActions,
          pressed: lastTerminalOption === option,
          onSelect: () => { onLastTerminalOptionChange(option); onLaunchTerminal(option); },
        })),
      ] : [],
    },
    {
      id: 'view-modes',
      label: t.toolbar.viewModes,
      entries: [
        { id: 'view-details', label: t.toolbar.viewDetails, shortcut: 'Ctrl+1', icon: <List className="h-4 w-4" />, pressed: viewMode === 'details', onSelect: () => onViewModeChange('details') },
        { id: 'view-compact', label: t.toolbar.viewCompact, shortcut: 'Ctrl+2', icon: <StretchHorizontal className="h-4 w-4" />, pressed: viewMode === 'compact', onSelect: () => onViewModeChange('compact') },
        { id: 'view-icons', label: t.toolbar.viewIcons, shortcut: 'Ctrl+3', icon: <LayoutGrid className="h-4 w-4" />, pressed: viewMode === 'icons', onSelect: () => onViewModeChange('icons') },
      ],
    },
    {
      id: 'layout-modes',
      label: t.header.layoutModes,
      entries: isCompactWindow ? [] : [
        { id: 'layout-dual-vertical', label: t.header.layoutDualVertical, shortcut: 'Alt+1', icon: <Columns2 className="h-4 w-4" />, pressed: layout === 'dual-vertical', onSelect: () => onLayoutChange('dual-vertical') },
        { id: 'layout-dual-horizontal', label: t.header.layoutDualHorizontal, shortcut: 'Alt+2', icon: <Rows2 className="h-4 w-4" />, pressed: layout === 'dual-horizontal', onSelect: () => onLayoutChange('dual-horizontal') },
        { id: 'layout-single', label: t.header.layoutSingle, shortcut: 'Alt+3', icon: <Square className="h-4 w-4" />, pressed: layout === 'single', onSelect: () => onLayoutChange('single') },
      ],
    },
    {
      id: 'workspace-manager',
      label: t.workspaceProfiles.title,
      entries: [{
        id: 'workspace-manager',
        label: t.workspaceProfiles.title,
        shortcut: 'Ctrl+Shift+W',
        icon: <PanelsTopLeft className="h-4 w-4" />,
        onSelect: onOpenWorkspaceManager,
      }],
    },
    {
      id: 'view-toggles',
      label: t.toolbar.tools,
      entries: [
        { id: 'toggle-hidden', label: t.toolbar.showHiddenFiles, shortcut: 'Ctrl+H', icon: showHiddenFiles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />, pressed: showHiddenFiles, onSelect: onToggleShowHiddenFiles },
        { id: 'toggle-extensions', label: t.toolbar.showFileExtensions, shortcut: 'Ctrl+E', icon: <FileText className="h-4 w-4" />, pressed: showFileExtensions, onSelect: onToggleShowFileExtensions },
        { id: 'toggle-graphs', label: t.toolbar.relativeGraphs, shortcut: 'Ctrl+G', icon: <BarChart3 className="h-4 w-4" />, pressed: relativeGraphsEnabled, onSelect: onToggleRelativeGraphs },
        { id: 'toggle-flat-view', label: t.toolbar.flatView, shortcut: 'Ctrl+B', icon: <ListTree className="h-4 w-4" />, disabled: !flatViewAvailable, pressed: flatView, onSelect: onToggleFlatView },
      ],
    },
    {
      id: 'locations-panel',
      label: t.toolbar.locationsPanel,
      entries: [{
        id: 'toggle-locations',
        label: locationsPanelOpen ? t.toolbar.hideLocationsPanel : t.toolbar.showLocationsPanel,
        shortcut: 'Ctrl+L',
        icon: <PanelLeft className="h-4 w-4" />,
        pressed: locationsPanelOpen,
        onSelect: onToggleLocationsPanel,
      }],
    },
    {
      id: 'properties-panel',
      label: t.toolbar.propertiesPanel,
      entries: [{
        id: 'toggle-properties',
        label: propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel,
        shortcut: 'F3',
        icon: <Info className="h-4 w-4" />,
        pressed: propertiesPanelOpen,
        onSelect: onTogglePropertiesPanel,
      }],
    },
  ];
  return (
    <header
      data-label-position={toolbarLabelPosition}
      data-labels={toolbarLabelPosition === 'none' ? 'false' : 'true'}
      className="cyberfiles-command-bar command-bar-container min-h-14 bg-neutral-900/95 border-b border-neutral-800 px-3 py-2 flex items-center justify-between gap-3 select-none z-20 backdrop-blur-md"
    >
      <div className="flex items-center gap-3 min-w-0">
        {isCompactWindow && (
          <div className="compact-window-controls flex shrink-0 items-center gap-1">
            <Tooltip label={sidebarDrawerOpen ? t.header.closeSidebar : t.header.openSidebar} placement="bottom">
              <button type="button" aria-label={sidebarDrawerOpen ? t.header.closeSidebar : t.header.openSidebar} aria-expanded={sidebarDrawerOpen} onClick={onToggleSidebarDrawer} className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:border-cyan-800 hover:bg-neutral-800 hover:text-cyan-200">
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
            </Tooltip>
            <div className="compact-pane-selector flex items-center gap-0.5 rounded-md border border-neutral-800 bg-neutral-950 p-0.5" role="group" aria-label={t.statusBar.activePaneTitle}>
              <Tooltip label={t.statusBar.leftPane} placement="bottom">
                <button type="button" aria-label={t.statusBar.leftPane} aria-pressed={activePane === 'left'} onClick={() => onActivePaneChange('left')} className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${activePane === 'left' ? 'border-cyan-700/70 bg-cyan-950/70 text-cyan-200' : 'border-transparent text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'}`}>
                  <PanelLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t.statusBar.rightPane} placement="bottom">
                <button type="button" aria-label={t.statusBar.rightPane} aria-pressed={activePane === 'right'} onClick={() => onActivePaneChange('right')} className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${activePane === 'right' ? 'border-cyan-700/70 bg-cyan-950/70 text-cyan-200' : 'border-transparent text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'}`}>
                  <PanelRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="header-actions flex items-center gap-1.5 overflow-x-auto min-w-0">
          <UndoHistoryMenu
            items={undoHistory}
            onUndo={onUndoAction}
            disabled={undoBusy}
            label={labels.undo}
            labelPosition={toolbarLabelPosition}
          />
          <CommandBarButton
            label={labels.delete}
            labelPosition={toolbarLabelPosition}
            icon={<Trash2 className="text-rose-400" />}
            onClick={onDeleteSelected}
            disabled={disabled}
            tooltip={t.toolbar.delete}
            tooltipShortcut="Del"
            ariaLabel={t.toolbar.delete}
          />
          <CommandBarButton
            label={labels.newFolder}
            labelPosition={toolbarLabelPosition}
            icon={<FolderPlus className="text-emerald-400" />}
            onClick={onNewFolder}
            disabled={!canCreateFolder}
            tooltip={t.toolbar.newFolder}
            tooltipShortcut="F7"
            ariaLabel={t.toolbar.newFolder}
          />
        </div>
      </div>

      <div ref={menuRootRef} className="command-bar-actions flex items-center gap-1.5 flex-shrink-0">
        {windowsActionsAvailable && (
          <div data-overflow-group="windows-actions" className="flex items-center gap-1.5">
            <CommandBarButton
              label={labels.explorer}
              labelPosition={toolbarLabelPosition}
              icon={<ExternalLink />}
              onClick={onShowInWindowsExplorer}
              disabled={!canUseFolderActions}
              tooltip={t.toolbar.showInWindowsExplorer}
              ariaLabel={t.toolbar.showInWindowsExplorer}
            />

            <div className="relative flex items-center">
              <CommandBarSplit
                label={labels.terminal}
                labelPosition={toolbarLabelPosition}
                icon={<Terminal />}
                onClick={() => onLaunchTerminal(lastTerminalOption)}
                tooltip={terminalLabels[lastTerminalOption]}
                ariaLabel={terminalLabels[lastTerminalOption]}
                disabled={!canUseFolderActions}
                caretLabel={t.toolbar.chooseTerminal}
                caretDisabled={!canUseFolderActions}
                caretExpanded={openToolbarMenu === 'terminal'}
                onCaretClick={() => setOpenToolbarMenu(openToolbarMenu === 'terminal' ? null : 'terminal')}
              />
              {openToolbarMenu === 'terminal' && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 min-w-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl">
                  {(['cmd', 'cmd-admin', 'powershell', 'powershell-admin'] as WindowsTerminalOption[]).map(option => (
                    <button key={option} type="button" role="menuitem" aria-label={terminalLabels[option]} onClick={() => { onLastTerminalOptionChange(option); onLaunchTerminal(option); setOpenToolbarMenu(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-cyan-200">
                      <Terminal className="h-3.5 w-3.5 text-neutral-400" />
                      <span>{terminalLabels[option]}</span>
                      {lastTerminalOption === option && <span className="ml-auto text-cyan-300">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div data-overflow-group="view-modes" className="flex items-center">
          <CommandBarGroup label={t.toolbar.viewModes}>
            <CommandBarSegment label={labels.details} labelPosition={toolbarLabelPosition} icon={<List />} pressed={viewMode === 'details'} onClick={() => onViewModeChange('details')} tooltip={t.toolbar.viewDetails} tooltipShortcut="Ctrl+1" ariaLabel={t.toolbar.viewDetails} />
            <CommandBarSegment label={labels.compact} labelPosition={toolbarLabelPosition} icon={<StretchHorizontal />} pressed={viewMode === 'compact'} onClick={() => onViewModeChange('compact')} tooltip={t.toolbar.viewCompact} tooltipShortcut="Ctrl+2" ariaLabel={t.toolbar.viewCompact} />
            <CommandBarSegment label={labels.icons} labelPosition={toolbarLabelPosition} icon={<LayoutGrid />} pressed={viewMode === 'icons'} onClick={() => onViewModeChange('icons')} tooltip={t.toolbar.viewIcons} tooltipShortcut="Ctrl+3" ariaLabel={t.toolbar.viewIcons} />
          </CommandBarGroup>
        </div>

        <div data-overflow-group="layout-modes" className="flex items-center">
          <CommandBarGroup label={t.header.layoutModes}>
            <CommandBarSegment label={labels.layoutVertical} labelPosition={toolbarLabelPosition} icon={<Columns2 />} pressed={layout === 'dual-vertical'} onClick={() => onLayoutChange('dual-vertical')} tooltip={t.header.layoutDualVertical} tooltipShortcut="Alt+1" ariaLabel={t.header.layoutDualVertical} />
            <CommandBarSegment label={labels.layoutHorizontal} labelPosition={toolbarLabelPosition} icon={<Rows2 />} pressed={layout === 'dual-horizontal'} onClick={() => onLayoutChange('dual-horizontal')} tooltip={t.header.layoutDualHorizontal} tooltipShortcut="Alt+2" ariaLabel={t.header.layoutDualHorizontal} />
            <CommandBarSegment label={labels.layoutSingle} labelPosition={toolbarLabelPosition} icon={<Square />} pressed={layout === 'single'} onClick={() => onLayoutChange('single')} tooltip={t.header.layoutSingle} tooltipShortcut="Alt+3" ariaLabel={t.header.layoutSingle} />
          </CommandBarGroup>
        </div>

        <div data-overflow-group="workspace-manager" className="flex items-center">
          <CommandBarButton
            label={labels.workspace}
            labelPosition={toolbarLabelPosition}
            icon={<PanelsTopLeft className="text-cyan-400" />}
            onClick={onOpenWorkspaceManager}
            tooltip={workspaceTooltip}
            tooltipShortcut="Ctrl+Shift+W"
            ariaLabel={workspaceTooltip}
            badge={workspaceChangesPending}
          />
        </div>

        <div data-overflow-group="view-toggles" className="flex items-center gap-1.5">
          <CommandBarButton label={labels.hidden} labelPosition={toolbarLabelPosition} icon={showHiddenFiles ? <Eye /> : <EyeOff />} pressed={showHiddenFiles} onClick={onToggleShowHiddenFiles} tooltip={t.toolbar.showHiddenFiles} tooltipShortcut="Ctrl+H" ariaLabel={t.toolbar.showHiddenFiles} />
          <CommandBarButton label={labels.extensions} labelPosition={toolbarLabelPosition} icon={<FileText />} pressed={showFileExtensions} onClick={onToggleShowFileExtensions} tooltip={t.toolbar.showFileExtensions} tooltipShortcut="Ctrl+E" ariaLabel={t.toolbar.showFileExtensions} />
          <CommandBarButton label={labels.graphs} labelPosition={toolbarLabelPosition} icon={<BarChart3 />} pressed={relativeGraphsEnabled} onClick={onToggleRelativeGraphs} tooltip={t.toolbar.relativeGraphs} tooltipShortcut="Ctrl+G" ariaLabel={t.toolbar.relativeGraphs} />
          <CommandBarButton
            label={labels.flatView}
            labelPosition={toolbarLabelPosition}
            icon={flatViewLoading ? <LoaderCircle className="animate-spin" /> : <ListTree />}
            pressed={flatView}
            disabled={!flatViewAvailable}
            onClick={onToggleFlatView}
            tooltip={flatViewTooltip}
            tooltipShortcut="Ctrl+B"
            ariaLabel={`${t.toolbar.flatView}: ${flatViewTooltip}`}
          />
        </div>

        {!isCompactWindow && (
          <div data-overflow-group="locations-panel" className="flex items-center">
            <CommandBarButton
              label={labels.locations}
              labelPosition={toolbarLabelPosition}
              icon={<PanelLeft />}
              pressed={locationsPanelOpen}
              onClick={onToggleLocationsPanel}
              tooltip={locationsPanelOpen ? t.toolbar.hideLocationsPanel : t.toolbar.showLocationsPanel}
              tooltipShortcut="Ctrl+L"
              ariaLabel={locationsPanelOpen ? t.toolbar.hideLocationsPanel : t.toolbar.showLocationsPanel}
            />
          </div>
        )}

        <div data-overflow-group="properties-panel" className="flex items-center">
          <CommandBarButton
            label={labels.properties}
            labelPosition={toolbarLabelPosition}
            icon={<Info />}
            pressed={propertiesPanelOpen}
            onClick={onTogglePropertiesPanel}
            tooltip={propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel}
            tooltipShortcut="F3"
            ariaLabel={`${propertiesPanelOpen ? t.toolbar.hidePropertiesPanel : t.toolbar.showPropertiesPanel} (F3)`}
          />
        </div>

        <ToolbarOverflowMenu label={t.toolbar.moreActions} groups={overflowGroups} />
      </div>

      <style>{`
        .header-actions { scrollbar-width:none; }
        .header-actions::-webkit-scrollbar { display:none; }
        .command-bar-container { container-type:inline-size; container-name:commandbar; }
        .toolbar-overflow-trigger { display:none; }
        @container commandbar (max-width: 1180px) {
          [data-overflow-group="windows-actions"],
          [data-overflow-group="workspace-manager"] { display:none !important; }
          .toolbar-overflow-trigger { display:flex; }
        }
        @container commandbar (max-width: 980px) {
          [data-overflow-group="view-modes"],
          [data-overflow-group="view-toggles"] { display:none !important; }
        }
        @container commandbar (max-width: 780px) {
          [data-overflow-group="layout-modes"] { display:none !important; }
        }
        /* Visible labels widen every control, so groups fold into the overflow menu sooner. */
        @container commandbar (max-width: 1640px) {
          .cyberfiles-command-bar[data-labels='true'] [data-overflow-group="workspace-manager"] { display:none !important; }
          .cyberfiles-command-bar[data-labels='true'] .toolbar-overflow-trigger { display:flex; }
        }
        @container commandbar (max-width: 1500px) {
          .cyberfiles-command-bar[data-labels='true'] [data-overflow-group="view-modes"] { display:none !important; }
        }
        @container commandbar (max-width: 1340px) {
          .cyberfiles-command-bar[data-labels='true'] [data-overflow-group="layout-modes"] { display:none !important; }
        }
        @container commandbar (max-width: 1180px) {
          .cyberfiles-command-bar[data-labels='true'] [data-overflow-group="windows-actions"] { display:none !important; }
        }
        @container commandbar (max-width: 1050px) {
          .cyberfiles-command-bar[data-labels='true'] [data-overflow-group="view-toggles"] { display:none !important; }
        }
      `}</style>
    </header>
  );
};
