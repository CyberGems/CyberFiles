import { useState, type FormEvent, type ReactNode } from 'react';
import { BookmarkPlus, Check, FolderSync, LayoutTemplate, Pencil, Play, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import {
  DEFAULT_LAYOUT_PROFILE_ID,
  DEFAULT_SESSION_PROFILE_ID,
  type LayoutProfile,
  type TabSessionProfile,
  type WorkspaceProfile,
} from '../utils/workspaceProfiles';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

type ManagerTab = 'layouts' | 'sessions' | 'workspaces';
type ProfileKind = ManagerTab;

interface WorkspaceManagerModalProps {
  isOpen: boolean;
  layouts: LayoutProfile[];
  sessions: TabSessionProfile[];
  workspaces: WorkspaceProfile[];
  activeLayoutId: string;
  activeSessionId: string;
  activeWorkspaceId: string | null;
  layoutDirty: boolean;
  sessionDirty: boolean;
  canCreateWorkspace: boolean;
  onClose: () => void;
  onCreateLayout: (name: string) => boolean;
  onUpdateLayout: (id: string) => void;
  onApplyLayout: (id: string) => void;
  onRenameLayout: (id: string, name: string) => boolean;
  onDeleteLayout: (id: string) => void;
  onCreateSession: (name: string) => boolean;
  onUpdateSession: (id: string) => void;
  onApplySession: (id: string) => void;
  onRenameSession: (id: string, name: string) => boolean;
  onDeleteSession: (id: string) => void;
  onCreateWorkspace: (name: string) => boolean;
  onApplyWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string, name: string) => boolean;
  onDeleteWorkspace: (id: string) => void;
}

export function WorkspaceManagerModal(props: WorkspaceManagerModalProps) {
  const { t } = useLanguage();
  const copy = t.workspaceProfiles;
  const [tab, setTab] = useState<ManagerTab>('layouts');
  const [creating, setCreating] = useState<ProfileKind | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ kind: ProfileKind; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: ProfileKind; id: string } | null>(null);
  const [error, setError] = useState('');

  if (!props.isOpen) return null;

  const openCreate = (kind: ProfileKind) => {
    setCreating(kind);
    setName('');
    setError('');
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) {
      setError(copy.invalidName);
      return;
    }
    const created = creating === 'layouts'
      ? props.onCreateLayout(normalized)
      : creating === 'sessions'
        ? props.onCreateSession(normalized)
        : props.onCreateWorkspace(normalized);
    if (!created) {
      setError(copy.duplicateName);
      return;
    }
    setCreating(null);
    setName('');
    setError('');
  };

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const normalized = editing.name.trim();
    if (!normalized) {
      setError(copy.invalidName);
      return;
    }
    const renamed = editing.kind === 'layouts'
      ? props.onRenameLayout(editing.id, normalized)
      : editing.kind === 'sessions'
        ? props.onRenameSession(editing.id, normalized)
        : props.onRenameWorkspace(editing.id, normalized);
    if (!renamed) {
      setError(copy.duplicateName);
      return;
    }
    setEditing(null);
    setError('');
  };

  const beginRename = (kind: ProfileKind, profileId: string, currentName: string) => {
    setEditing({ kind, id: profileId, name: currentName });
    setDeleting(null);
    setError('');
  };

  const confirmDelete = () => {
    if (!deleting) return;
    if (deleting.kind === 'layouts') props.onDeleteLayout(deleting.id);
    else if (deleting.kind === 'sessions') props.onDeleteSession(deleting.id);
    else props.onDeleteWorkspace(deleting.id);
    setDeleting(null);
  };

  const layoutName = (id: string) => id === DEFAULT_LAYOUT_PROFILE_ID
    ? copy.defaultLayout
    : props.layouts.find(profile => profile.id === id)?.name ?? copy.defaultLayout;
  const sessionName = (id: string) => id === DEFAULT_SESSION_PROFILE_ID
    ? copy.defaultSession
    : props.sessions.find(profile => profile.id === id)?.name ?? copy.defaultSession;

  const tabs: Array<{ id: ManagerTab; label: string; icon: ReactNode }> = [
    { id: 'layouts', label: copy.layouts, icon: <LayoutTemplate className="h-3.5 w-3.5" /> },
    { id: 'sessions', label: copy.sessions, icon: <FolderSync className="h-3.5 w-3.5" /> },
    { id: 'workspaces', label: copy.workspaces, icon: <BookmarkPlus className="h-3.5 w-3.5" /> },
  ];

  const createLabel = tab === 'layouts' ? copy.saveCurrentLayout : tab === 'sessions' ? copy.saveCurrentSession : copy.saveCurrentWorkspace;
  const createButton = (
    <Tooltip label={tab === 'workspaces' && !props.canCreateWorkspace ? copy.saveWorkspaceNeedsSavedParts : createLabel} placement="bottom">
      <button type="button" aria-disabled={tab === 'workspaces' && !props.canCreateWorkspace} onClick={() => { if (tab === 'workspaces' && !props.canCreateWorkspace) return; openCreate(tab); }} className="inline-flex items-center gap-1.5 rounded-md border border-cyan-800 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 transition-colors hover:border-cyan-500 hover:bg-cyan-950/70 aria-disabled:cursor-not-allowed aria-disabled:opacity-40">
        <Save className="h-3.5 w-3.5" />{createLabel}
      </button>
    </Tooltip>
  );

  const renderProfileActions = ({
    kind,
    profileId,
    profileName,
    active,
    canUpdate,
    builtIn = false,
    onApply,
    onUpdate,
  }: {
    kind: ProfileKind;
    profileId: string;
    profileName: string;
    active: boolean;
    canUpdate: boolean;
    builtIn?: boolean;
    onApply: () => void;
    onUpdate?: () => void;
  }) => (
    <div className="flex shrink-0 items-center gap-1">
      {active && <span className="mr-1 inline-flex items-center gap-1 rounded border border-cyan-900/80 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] text-cyan-200"><Check className="h-3 w-3" />{copy.active}</span>}
      {active && canUpdate && onUpdate && (
        <Tooltip label={copy.update} placement="top">
          <button type="button" onClick={onUpdate} aria-label={copy.update} className="rounded p-1.5 text-cyan-300 transition-colors hover:bg-cyan-950/70"><RefreshCw className="h-3.5 w-3.5" /></button>
        </Tooltip>
      )}
      <Tooltip label={builtIn ? copy.restoreDefault : copy.apply} placement="top">
        <button type="button" onClick={onApply} aria-label={`${builtIn ? copy.restoreDefault : copy.apply}: ${profileName}`} className="rounded p-1.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-cyan-200"><Play className="h-3.5 w-3.5" /></button>
      </Tooltip>
      {!builtIn && <>
        <Tooltip label={copy.rename} placement="top">
          <button type="button" onClick={() => beginRename(kind, profileId, profileName)} aria-label={`${copy.rename}: ${profileName}`} className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"><Pencil className="h-3.5 w-3.5" /></button>
        </Tooltip>
        <Tooltip label={copy.delete} placement="top">
          <button type="button" onClick={() => { setDeleting({ kind, id: profileId }); setEditing(null); }} aria-label={`${copy.delete}: ${profileName}`} className="rounded p-1.5 text-rose-300 transition-colors hover:bg-rose-950/50"><Trash2 className="h-3.5 w-3.5" /></button>
        </Tooltip>
      </>}
    </div>
  );

  const renderRow = (
    kind: ProfileKind,
    profileId: string,
    profileName: string,
    description: string,
    active: boolean,
    canUpdate: boolean,
    onApply: () => void,
    onUpdate?: () => void,
    builtIn = false,
  ) => {
    const isEditing = editing?.kind === kind && editing.id === profileId;
    const isDeleting = deleting?.kind === kind && deleting.id === profileId;
    return (
      <div key={profileId} className={`workspace-manager-row rounded-lg border px-3 py-2.5 ${active ? 'border-cyan-800/70 bg-cyan-950/15' : 'border-neutral-800 bg-neutral-950/50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <form onSubmit={submitRename} className="flex items-center gap-2">
                <Tooltip label={copy.renamePlaceholder} placement="top">
                  <input autoFocus aria-label={copy.renamePlaceholder} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-cyan-600" />
                </Tooltip>
                <Tooltip label={copy.save} placement="top"><button type="submit" aria-label={copy.save} className="rounded p-1.5 text-cyan-300 hover:bg-cyan-950"><Check className="h-3.5 w-3.5" /></button></Tooltip>
                <Tooltip label={copy.cancel} placement="top"><button type="button" onClick={() => { setEditing(null); setError(''); }} aria-label={copy.cancel} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-3.5 w-3.5" /></button></Tooltip>
              </form>
            ) : <>
              <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-neutral-100">
                <span className="truncate">{profileName}</span>
                {builtIn && <span className="shrink-0 rounded border border-neutral-700 px-1 py-0.5 text-[9px] font-normal text-neutral-500">{copy.builtIn}</span>}
                {active && canUpdate && <span className="shrink-0 rounded border border-amber-900/70 bg-amber-950/40 px-1 py-0.5 text-[9px] font-normal text-amber-200">{copy.modified}</span>}
              </div>
              <p className="mt-1 truncate text-[10px] text-neutral-500">{description}</p>
            </>}
          </div>
          {renderProfileActions({ kind, profileId, profileName, active, canUpdate, builtIn, onApply, onUpdate })}
        </div>
        {isDeleting && (
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-neutral-800 pt-2 text-[10px] text-rose-200">
            <span>{copy.delete}?</span>
            <Tooltip label={copy.cancel} placement="top"><button type="button" onClick={() => setDeleting(null)} className="rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800">{copy.cancel}</button></Tooltip>
            <Tooltip label={copy.delete} placement="top"><button type="button" onClick={confirmDelete} className="rounded bg-rose-950 px-2 py-1 text-rose-200 hover:bg-rose-900">{copy.delete}</button></Tooltip>
          </div>
        )}
      </div>
    );
  };

  const emptyMessage = tab === 'layouts' ? copy.noLayouts : tab === 'sessions' ? copy.noSessions : copy.noWorkspaces;

  return (
    <div className="workspace-manager-modal workspace-manager-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title" className="workspace-manager-dialog flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 id="workspace-manager-title" className="text-sm font-semibold text-neutral-100">{copy.title}</h2>
            <p className="mt-1 text-[11px] text-neutral-500">{tab === 'layouts' ? copy.layoutDescription : tab === 'sessions' ? copy.sessionDescription : copy.workspaceDescription}</p>
          </div>
          <Tooltip label={copy.cancel} placement="bottom"><button type="button" aria-label={copy.cancel} onClick={props.onClose} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"><X className="h-4 w-4" /></button></Tooltip>
        </header>

        <div role="tablist" aria-label={copy.title} className="flex gap-1 border-b border-neutral-800 px-4 pt-3">
          {tabs.map(option => <Tooltip key={option.id} label={option.label} placement="bottom"><button type="button" role="tab" aria-selected={tab === option.id} onClick={() => { setTab(option.id); setCreating(null); setError(''); }} className={`inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 text-[11px] transition-colors ${tab === option.id ? 'border-neutral-700 bg-neutral-950 text-cyan-200' : 'border-transparent text-neutral-500 hover:text-neutral-200'}`}>{option.icon}{option.label}</button></Tooltip>)}
        </div>

        <div key={tab} className="workspace-manager-content min-h-0 flex-1 space-y-3 overflow-y-auto bg-neutral-950/40 p-4">
          <div className="flex justify-end">{createButton}</div>
          {creating === tab && (
            <form onSubmit={submitCreate} className="workspace-manager-create-form rounded-lg border border-cyan-900/70 bg-cyan-950/15 p-3">
              <div className="flex items-center gap-2">
                <Tooltip label={copy.namePlaceholder} placement="top">
                  <input autoFocus aria-label={copy.namePlaceholder} placeholder={copy.namePlaceholder} value={name} onChange={event => setName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-600" />
                </Tooltip>
                <Tooltip label={copy.save} placement="top"><button type="submit" aria-label={copy.save} className="rounded-md bg-cyan-900/70 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-800"><Save className="h-3.5 w-3.5" /></button></Tooltip>
                <Tooltip label={copy.cancel} placement="top"><button type="button" onClick={() => { setCreating(null); setError(''); }} aria-label={copy.cancel} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-800"><X className="h-3.5 w-3.5" /></button></Tooltip>
              </div>
              {error && <p role="alert" className="mt-2 text-[10px] text-rose-300">{error}</p>}
            </form>
          )}

          {tab === 'layouts' && <>
            {renderRow('layouts', DEFAULT_LAYOUT_PROFILE_ID, copy.defaultLayout, copy.restoreDefault, props.activeLayoutId === DEFAULT_LAYOUT_PROFILE_ID, false, () => props.onApplyLayout(DEFAULT_LAYOUT_PROFILE_ID), undefined, true)}
            {props.layouts.map(profile => renderRow('layouts', profile.id, profile.name, `${copy.layouts} · ${new Date(profile.updatedAt).toLocaleDateString()}`, props.activeLayoutId === profile.id, props.layoutDirty, () => props.onApplyLayout(profile.id), () => props.onUpdateLayout(profile.id)))}
          </>}

          {tab === 'sessions' && <>
            {renderRow('sessions', DEFAULT_SESSION_PROFILE_ID, copy.defaultSession, copy.sessionDescription, props.activeSessionId === DEFAULT_SESSION_PROFILE_ID, false, () => props.onApplySession(DEFAULT_SESSION_PROFILE_ID), undefined, true)}
            {props.sessions.map(profile => renderRow('sessions', profile.id, profile.name, `${copy.sessions} · ${new Date(profile.updatedAt).toLocaleDateString()}`, props.activeSessionId === profile.id, props.sessionDirty, () => props.onApplySession(profile.id), () => props.onUpdateSession(profile.id)))}
          </>}

          {tab === 'workspaces' && <>
            {props.workspaces.map(profile => renderRow(
              'workspaces',
              profile.id,
              profile.name,
              copy.workspacePair.replace('{layout}', layoutName(profile.layoutId)).replace('{session}', sessionName(profile.sessionId)),
              props.activeWorkspaceId === profile.id,
              props.activeWorkspaceId === profile.id && (props.layoutDirty || props.sessionDirty),
              () => props.onApplyWorkspace(profile.id),
            ))}
          </>}

          {((tab === 'layouts' && props.layouts.length === 0) || (tab === 'sessions' && props.sessions.length === 0) || (tab === 'workspaces' && props.workspaces.length === 0)) && !creating && (
            <div className="rounded-lg border border-dashed border-neutral-800 px-4 py-8 text-center text-xs text-neutral-500">{emptyMessage}</div>
          )}
          {error && creating !== tab && <p role="alert" className="text-[10px] text-rose-300">{error}</p>}
        </div>

        <footer className="flex justify-end border-t border-neutral-800 px-4 py-3">
          <Tooltip label={copy.cancel} placement="top"><DialogButton size="compact" onClick={props.onClose}>{copy.cancel}</DialogButton></Tooltip>
        </footer>
      </section>
    </div>
  );
}
