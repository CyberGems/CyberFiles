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
  Pencil,
  ClipboardCopy,
} from 'lucide-react';
import { ViewLayout, ViewMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import type { WindowsTerminalOption } from '../utils/nativeFileSystem';
import { UndoHistoryMenu, type UndoHistoryItem } from './UndoHistoryMenu';
import { ToolbarOverflowMenu, type ToolbarOverflowGroup } from './ToolbarOverflowMenu';
import { CommandBarDropdown, CommandBarDropdownHeading, CommandBarDropdownItem } from './CommandBarDropdown';
import {
  CommandBarButton,
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
  onRenameSelected: () => void;
  onCopyPath: () => void;
  copyPathEnabled: boolean;
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
  onRenameSelected,
  onCopyPath,
  copyPathEnabled,
  undoHistory,
  onUndoAction,
  undoBusy,
  selectedCount,
  flatView,
  flatViewAvailable,
  flatViewLoading,
  onToggleFlatView,
  onOpenWorkspaceManager,
  workspaceChangesPending,
}) => {
  const { t } = useLanguage();
  const disabled = selectedCount === 0;
  const [openToolbarMenu, setOpenToolbarMenu] = React.useState<'terminal' | 'view' | null>(null);
  const terminalControlRef = React.useRef<HTMLDivElement>(null);
  const viewControlRef = React.useRef<HTMLDivElement>(null);
  const menuRootRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLElement>(null);
  const [collapsedGroups, setCollapsedGroups] = React.useState<string[]>([]);
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

  /* Groups fold into the overflow menu only when the bar actually runs out of
     room. Each pass derives the desired collapsed set from the live layout
     instead of trusting width estimates: it toggles the collapse class in the
     DOM, measures the real result and commits the final state to React once.
     This replaced the old fixed container-query breakpoints, which clipped
     visibly whenever label length, language or zoom changed. */
  const OVERFLOW_COLLAPSE_ORDER = [
    'windows-actions',
    'workspace-manager',
    'locations-panel',
    'properties-panel',
    'view-menu',
    'primary-actions',
  ];

  const fitToolbar = React.useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const fits = () => bar.scrollWidth <= bar.clientWidth + 1;

    // Out of room: fold groups from the least essential until it really fits.
    if (!fits()) {
      for (const id of OVERFLOW_COLLAPSE_ORDER) {
        const el = bar.querySelector(`[data-overflow-group="${id}"]`);
        if (!el || el.classList.contains('command-bar-collapsed')) continue;
        el.classList.add('command-bar-collapsed');
        if (fits()) break;
      }
    }
    // Spare room: bring back collapsed groups from the most essential downward,
    // keeping only the ones that still leave the bar fitting when restored.
    if (fits()) {
      for (const id of [...OVERFLOW_COLLAPSE_ORDER].reverse()) {
        const el = bar.querySelector(`[data-overflow-group="${id}"]`);
        if (!el || !el.classList.contains('command-bar-collapsed')) continue;
        el.classList.remove('command-bar-collapsed');
        if (!fits()) el.classList.add('command-bar-collapsed');
      }
    }
    // The DOM now encodes the desired state; mirror it into React, but only
    // when it differs, so an unchanged layout never triggers a new render.
    const desired = OVERFLOW_COLLAPSE_ORDER.filter(id => bar.querySelector(`[data-overflow-group="${id}"]`)?.classList.contains('command-bar-collapsed'));
    setCollapsedGroups(prev => (prev.length === desired.length && prev.every(id => desired.includes(id)) ? prev : desired));
  }, []);

  React.useLayoutEffect(() => {
    fitToolbar();
  });

  React.useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => fitToolbar());
    observer.observe(bar);
    const right = bar.querySelector('.command-bar-actions');
    if (right) observer.observe(right);
    void document.fonts?.ready.then(() => fitToolbar()).catch(() => {});
    return () => observer.disconnect();
  }, [fitToolbar]);

  React.useEffect(() => {
    if (!openToolbarMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // Portalled menus live in document.body, outside menuRootRef; pressing
      // inside them must not close them (or the click never lands).
      if (target?.closest('[data-command-bar-portal]')) return;
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
      id: 'primary-actions',
      label: t.toolbar.fileActions,
      entries: [
        { id: 'primary-rename', label: t.toolbar.rename, shortcut: 'F2', icon: <Pencil className="h-4 w-4" />, disabled, onSelect: onRenameSelected },
        { id: 'primary-delete', label: t.toolbar.delete, shortcut: 'Del', icon: <Trash2 className="h-4 w-4" />, disabled, onSelect: onDeleteSelected },
        { id: 'primary-copy-path', label: selectedCount === 0 ? t.toolbar.copyFolderPath : t.toolbar.copyPath, icon: <ClipboardCopy className="h-4 w-4" />, disabled: !copyPathEnabled, onSelect: onCopyPath },
        { id: 'primary-new-folder', label: t.toolbar.newFolder, shortcut: 'F7', icon: <FolderPlus className="h-4 w-4" />, disabled: !canCreateFolder, onSelect: onNewFolder },
      ],
    },
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
    {
      id: 'view-menu',
      label: t.toolbar.viewModes,
      entries: [
        { id: 'view-details', label: t.toolbar.viewDetails, shortcut: 'Ctrl+1', icon: <List className="h-4 w-4" />, pressed: viewMode === 'details', onSelect: () => onViewModeChange('details') },
        { id: 'view-compact', label: t.toolbar.viewCompact, shortcut: 'Ctrl+2', icon: <StretchHorizontal className="h-4 w-4" />, pressed: viewMode === 'compact', onSelect: () => onViewModeChange('compact') },
        { id: 'view-icons', label: t.toolbar.viewIcons, shortcut: 'Ctrl+3', icon: <LayoutGrid className="h-4 w-4" />, pressed: viewMode === 'icons', onSelect: () => onViewModeChange('icons') },
        ...(!isCompactWindow ? [
          { id: 'layout-dual-vertical', label: t.header.layoutDualVertical, shortcut: 'Alt+1', icon: <Columns2 className="h-4 w-4" />, pressed: layout === 'dual-vertical', onSelect: () => onLayoutChange('dual-vertical') },
          { id: 'layout-dual-horizontal', label: t.header.layoutDualHorizontal, shortcut: 'Alt+2', icon: <Rows2 className="h-4 w-4" />, pressed: layout === 'dual-horizontal', onSelect: () => onLayoutChange('dual-horizontal') },
          { id: 'layout-single', label: t.header.layoutSingle, shortcut: 'Alt+3', icon: <Square className="h-4 w-4" />, pressed: layout === 'single', onSelect: () => onLayoutChange('single') },
        ] : []),
        { id: 'toggle-hidden', label: t.toolbar.showHiddenFiles, shortcut: 'Ctrl+H', icon: showHiddenFiles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />, pressed: showHiddenFiles, onSelect: onToggleShowHiddenFiles },
        { id: 'toggle-extensions', label: t.toolbar.showFileExtensions, shortcut: 'Ctrl+E', icon: <FileText className="h-4 w-4" />, pressed: showFileExtensions, onSelect: onToggleShowFileExtensions },
        { id: 'toggle-graphs', label: t.toolbar.relativeGraphs, shortcut: 'Ctrl+G', icon: <BarChart3 className="h-4 w-4" />, pressed: relativeGraphsEnabled, onSelect: onToggleRelativeGraphs },
        { id: 'toggle-flat-view', label: t.toolbar.flatView, shortcut: 'Ctrl+B', icon: <ListTree className="h-4 w-4" />, disabled: !flatViewAvailable, pressed: flatView, onSelect: onToggleFlatView },
      ],
    },
  ];
  const isCollapsedGroup = (id: string) => collapsedGroups.includes(id);
  const groupClass = (id: string) => `flex shrink-0 items-center gap-1.5 ${isCollapsedGroup(id) ? 'command-bar-collapsed' : ''}`;
  return (
    <header
      ref={barRef}
      data-label-position={toolbarLabelPosition}
      data-labels={toolbarLabelPosition === 'none' ? 'false' : 'true'}
      className="cyberfiles-command-bar relative min-h-14 overflow-hidden bg-neutral-900/95 border-b border-neutral-800 px-3 py-2 flex items-center justify-between gap-3 select-none z-20 backdrop-blur-md"
    >
      {/* Never squeezable: an overflow the bar cannot see (hidden inside this block)
          would paint over the right side instead of being folded into the menu. */}
      <div className="flex items-center gap-3 shrink-0">
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

        <div className="command-bar-primary flex shrink-0 items-center gap-1.5">
          <UndoHistoryMenu
            items={undoHistory}
            onUndo={onUndoAction}
            disabled={undoBusy}
            label={labels.undo}
            labelPosition={toolbarLabelPosition}
          />
          <div
            data-overflow-group="primary-actions"
            aria-hidden={isCollapsedGroup('primary-actions') || undefined}
            className={groupClass('primary-actions')}
          >
          <CommandBarButton
            label={labels.rename}
            labelPosition={toolbarLabelPosition}
            icon={<Pencil className="text-amber-400" />}
            onClick={onRenameSelected}
            disabled={disabled}
            tooltip={t.toolbar.rename}
            tooltipShortcut="F2"
            ariaLabel={t.toolbar.rename}
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
            label={labels.copyPath}
            labelPosition={toolbarLabelPosition}
            icon={<ClipboardCopy />}
            onClick={onCopyPath}
            disabled={!copyPathEnabled}
            tooltip={selectedCount === 0 ? t.toolbar.copyFolderPath : t.toolbar.copyPath}
            ariaLabel={selectedCount === 0 ? t.toolbar.copyFolderPath : t.toolbar.copyPath}
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
      </div>

      <div ref={menuRootRef} className="command-bar-actions flex items-center gap-1.5 flex-shrink-0">
        {windowsActionsAvailable && (
          <>
            <span className="command-bar-separator" aria-hidden="true" />
            <div data-overflow-group="windows-actions" aria-hidden={isCollapsedGroup('windows-actions') || undefined} className={groupClass('windows-actions')}>
              <CommandBarButton
                label={labels.explorer}
                labelPosition={toolbarLabelPosition}
                icon={<ExternalLink />}
                onClick={onShowInWindowsExplorer}
                disabled={!canUseFolderActions}
                tooltip={t.toolbar.showInWindowsExplorer}
                ariaLabel={t.toolbar.showInWindowsExplorer}
              />

              <div ref={terminalControlRef} className="relative flex items-center">
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
                <CommandBarDropdown
                  open={openToolbarMenu === 'terminal' && Boolean(terminalControlRef.current)}
                  onClose={() => setOpenToolbarMenu(null)}
                  anchorRef={terminalControlRef}
                  label={t.toolbar.chooseTerminal}
                >
                  {(['cmd', 'cmd-admin', 'powershell', 'powershell-admin'] as WindowsTerminalOption[]).map(option => (
                    <CommandBarDropdownItem
                      key={option}
                      label={terminalLabels[option]}
                      icon={<Terminal className="h-3.5 w-3.5" />}
                      checked={lastTerminalOption === option}
                      onSelect={() => { onLastTerminalOptionChange(option); onLaunchTerminal(option); setOpenToolbarMenu(null); }}
                    />
                  ))}
                </CommandBarDropdown>
              </div>
            </div>
          </>
        )}

        <div data-overflow-group="view-menu" aria-hidden={isCollapsedGroup('view-menu') || undefined} className={groupClass('view-menu')}>
          <div ref={viewControlRef} className="relative flex items-center">
            <CommandBarSplit
              label={viewMode === 'details' ? labels.details : viewMode === 'compact' ? labels.compact : labels.icons}
              labelPosition={toolbarLabelPosition}
              icon={viewMode === 'details' ? <List /> : viewMode === 'compact' ? <StretchHorizontal /> : <LayoutGrid />}
              onClick={() => setOpenToolbarMenu(openToolbarMenu === 'view' ? null : 'view')}
              tooltip={t.toolbar.viewModes}
              ariaLabel={t.toolbar.viewModes}
              caretLabel={t.toolbar.viewModes}
              caretExpanded={openToolbarMenu === 'view'}
              onCaretClick={() => setOpenToolbarMenu(openToolbarMenu === 'view' ? null : 'view')}
            />
            <CommandBarDropdown
              open={openToolbarMenu === 'view' && Boolean(viewControlRef.current)}
              onClose={() => setOpenToolbarMenu(null)}
              anchorRef={viewControlRef}
              label={t.toolbar.viewModes}
              className="w-64"
            >
              <CommandBarDropdownHeading label={t.toolbar.viewModes} />
              {([
                ['details', t.toolbar.viewDetails, t.toolbar.viewDetails, 'Ctrl+1', <List className="h-4 w-4" />],
                ['compact', t.toolbar.viewCompact, t.toolbar.viewCompact, 'Ctrl+2', <StretchHorizontal className="h-4 w-4" />],
                ['icons', t.toolbar.viewIcons, t.toolbar.viewIcons, 'Ctrl+3', <LayoutGrid className="h-4 w-4" />],
              ] as [ViewMode, string, string, string, React.ReactNode][]).map(([mode, label, ariaLabel, shortcut, icon]) => (
                <CommandBarDropdownItem
                  key={mode}
                  label={label}
                  icon={icon}
                  shortcut={shortcut}
                  checked={viewMode === mode}
                  onSelect={() => { setOpenToolbarMenu(null); onViewModeChange(mode); }}
                />
              ))}
              {!isCompactWindow && (
                <>
                  <CommandBarDropdownHeading label={t.header.layoutModes} />
                  {([
                    ['dual-vertical', t.header.layoutDualVertical, t.header.layoutDualVertical, 'Alt+1', <Columns2 className="h-4 w-4" />],
                    ['dual-horizontal', t.header.layoutDualHorizontal, t.header.layoutDualHorizontal, 'Alt+2', <Rows2 className="h-4 w-4" />],
                    ['single', t.header.layoutSingle, t.header.layoutSingle, 'Alt+3', <Square className="h-4 w-4" />],
                  ] as [ViewLayout, string, string, string, React.ReactNode][]).map(([layoutMode, label, ariaLabel, shortcut, icon]) => (
                    <CommandBarDropdownItem
                      key={layoutMode}
                      label={label}
                      icon={icon}
                      shortcut={shortcut}
                      checked={layout === layoutMode}
                      onSelect={() => { setOpenToolbarMenu(null); onLayoutChange(layoutMode); }}
                    />
                  ))}
                </>
              )}
              <CommandBarDropdownHeading label={t.toolbar.viewToggles} />
              <CommandBarDropdownItem
                label={t.toolbar.showHiddenFiles}
                icon={showHiddenFiles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                shortcut="Ctrl+H"
                checked={showHiddenFiles}
                onSelect={() => { setOpenToolbarMenu(null); onToggleShowHiddenFiles(); }}
              />
              <CommandBarDropdownItem
                label={t.toolbar.showFileExtensions}
                icon={<FileText className="h-4 w-4" />}
                shortcut="Ctrl+E"
                checked={showFileExtensions}
                onSelect={() => { setOpenToolbarMenu(null); onToggleShowFileExtensions(); }}
              />
              <CommandBarDropdownItem
                label={t.toolbar.relativeGraphs}
                icon={<BarChart3 className="h-4 w-4" />}
                shortcut="Ctrl+G"
                checked={relativeGraphsEnabled}
                onSelect={() => { setOpenToolbarMenu(null); onToggleRelativeGraphs(); }}
              />
              <CommandBarDropdownItem
                label={t.toolbar.flatView}
                icon={flatViewLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ListTree className="h-4 w-4" />}
                shortcut="Ctrl+B"
                checked={flatView}
                disabled={!flatViewAvailable}
                onSelect={() => { setOpenToolbarMenu(null); onToggleFlatView(); }}
              />
            </CommandBarDropdown>
          </div>
        </div>

        <span className="command-bar-separator" aria-hidden="true" />

        <div data-overflow-group="workspace-manager" aria-hidden={isCollapsedGroup('workspace-manager') || undefined} className={groupClass('workspace-manager')}>
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

        {!isCompactWindow && (
          <div data-overflow-group="locations-panel" aria-hidden={isCollapsedGroup('locations-panel') || undefined} className={groupClass('locations-panel')}>
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

        <div data-overflow-group="properties-panel" aria-hidden={isCollapsedGroup('properties-panel') || undefined} className={groupClass('properties-panel')}>
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

        <ToolbarOverflowMenu label={t.toolbar.moreActions} groups={overflowGroups} collapsedIds={collapsedGroups} />
      </div>
    </header>
  );
};
