import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { AlertCircle, BookmarkPlus, Check, FolderSync, LayoutTemplate, Pencil, Play, RefreshCw, Save, Trash2, X } from 'lucide-react';
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

type ProfileKind = 'layouts' | 'sessions' | 'workspaces';
type PartKind = Exclude<ProfileKind, 'workspaces'>;

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
  const dialogRef = useRef<HTMLElement>(null);
  const [creating, setCreating] = useState<ProfileKind | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ kind: ProfileKind; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: ProfileKind; id: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!props.isOpen) {
      setCreating(null);
      setEditing(null);
      setDeleting(null);
      setError('');
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, [props.isOpen]);

  if (!props.isOpen) return null;

  const layoutName = (id: string) => id === DEFAULT_LAYOUT_PROFILE_ID
    ? copy.defaultLayout
    : props.layouts.find(profile => profile.id === id)?.name ?? copy.defaultLayout;
  const sessionName = (id: string) => id === DEFAULT_SESSION_PROFILE_ID
    ? copy.defaultSession
    : props.sessions.find(profile => profile.id === id)?.name ?? copy.defaultSession;

  const openCreate = (kind: ProfileKind) => {
    setCreating(kind);
    setEditing(null);
    setDeleting(null);
    setName('');
    setError('');
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!creating) return;
    const normalized = name.trim();
    if (!normalized) {
      setError(copy.invalidName);
      return;
    }
    if (creating === 'workspaces' && !props.canCreateWorkspace) {
      setError(copy.saveWorkspaceNeedsSavedParts);
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

  const confirmDelete = () => {
    if (!deleting) return;
    if (deleting.kind === 'layouts') props.onDeleteLayout(deleting.id);
    else if (deleting.kind === 'sessions') props.onDeleteSession(deleting.id);
    else props.onDeleteWorkspace(deleting.id);
    setDeleting(null);
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (creating) setCreating(null);
      else if (editing) setEditing(null);
      else if (deleting) setDeleting(null);
      else props.onClose();
      setError('');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const iconAction = (label: string, onClick: () => void, icon: ReactNode, tone = 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100') => (
    <Tooltip label={label} placement="top">
      <button type="button" aria-label={label} onClick={onClick} className={`rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${tone}`}>
        {icon}
      </button>
    </Tooltip>
  );

  const renderCreateForm = (kind: ProfileKind) => {
    if (creating !== kind) return null;
    const label = kind === 'layouts' ? copy.nameNewLayout : kind === 'sessions' ? copy.nameNewSession : copy.nameNewWorkspace;
    return (
      <form onSubmit={submitCreate} className="workspace-manager-create-form mt-4 rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-3.5">
        <label htmlFor={`workspace-profile-name-${kind}`} className="block text-xs font-medium text-cyan-100">{label}</label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id={`workspace-profile-name-${kind}`}
            autoFocus
            autoComplete="off"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={copy.namePlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
          />
          <DialogButton type="submit" variant="primary" size="compact"><span className="inline-flex items-center gap-1.5"><Save className="h-3.5 w-3.5" />{copy.save}</span></DialogButton>
          {iconAction(copy.cancel, () => { setCreating(null); setError(''); }, <X className="h-4 w-4" />)}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      </form>
    );
  };

  const renderRow = (kind: ProfileKind, id: string, profileName: string, active: boolean, builtIn = false, description?: string) => {
    const isEditing = editing?.kind === kind && editing.id === id;
    const isDeleting = deleting?.kind === kind && deleting.id === id;
    const hasLinkedWorkspaces = kind === 'layouts'
      ? props.workspaces.some(profile => profile.layoutId === id)
      : kind === 'sessions' && props.workspaces.some(profile => profile.sessionId === id);
    const apply = () => {
      if (kind === 'layouts') props.onApplyLayout(id);
      else if (kind === 'sessions') props.onApplySession(id);
      else props.onApplyWorkspace(id);
    };
    return (
      <div key={id} className={`workspace-manager-row min-w-0 rounded-xl border px-3 py-2.5 ${active ? 'border-cyan-800/70 bg-cyan-950/15' : 'border-neutral-800 bg-neutral-950/45'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <form onSubmit={submitRename} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  aria-label={copy.renamePlaceholder}
                  value={editing.name}
                  onChange={event => setEditing({ ...editing, name: event.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-cyan-500"
                />
                <Tooltip label={copy.save} placement="top"><button type="submit" aria-label={copy.save} className="rounded-lg p-2 text-cyan-300 hover:bg-cyan-950/70"><Check className="h-3.5 w-3.5" /></button></Tooltip>
                {iconAction(copy.cancel, () => { setEditing(null); setError(''); }, <X className="h-3.5 w-3.5" />)}
              </form>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-neutral-100">{profileName}</span>
                  {builtIn && <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-500">{copy.builtIn}</span>}
                  {active && <span className="inline-flex items-center gap-1 rounded border border-cyan-900/70 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] text-cyan-200"><Check className="h-2.5 w-2.5" />{copy.active}</span>}
                </div>
                {description && <p className="mt-1 truncate text-[10px] text-neutral-500">{description}</p>}
              </>
            )}
          </div>
          {!isEditing && <div className="flex shrink-0 items-center gap-0.5">
            {iconAction(`${builtIn ? (kind === 'layouts' ? copy.restoreDefault : copy.restoreStartingSession) : copy.apply}: ${profileName}`, apply, <Play className="h-3.5 w-3.5" />, 'text-cyan-300 hover:bg-cyan-950/70 hover:text-cyan-100')}
            {!builtIn && iconAction(`${copy.rename}: ${profileName}`, () => { setEditing({ kind, id, name: profileName }); setCreating(null); setDeleting(null); setError(''); }, <Pencil className="h-3.5 w-3.5" />)}
            {!builtIn && iconAction(`${copy.delete}: ${profileName}`, () => { setDeleting({ kind, id }); setCreating(null); setEditing(null); setError(''); }, <Trash2 className="h-3.5 w-3.5" />, 'text-rose-300 hover:bg-rose-950/60 hover:text-rose-100')}
          </div>}
        </div>
        {isEditing && error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
        {isDeleting && <div className="mt-3 border-t border-neutral-800 pt-3">
          <p className="text-xs text-rose-200">{copy.deleteConfirm}</p>
          {hasLinkedWorkspaces && <p className="mt-1 text-xs text-neutral-400">{copy.deleteLinkedWorkspaces}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <DialogButton size="compact" onClick={() => setDeleting(null)}>{copy.cancel}</DialogButton>
            <DialogButton size="compact" variant="danger" onClick={confirmDelete}>{copy.delete}</DialogButton>
          </div>
        </div>}
      </div>
    );
  };

  const renderPartSection = (kind: PartKind) => {
    const isLayout = kind === 'layouts';
    const dirty = isLayout ? props.layoutDirty : props.sessionDirty;
    const activeId = isLayout ? props.activeLayoutId : props.activeSessionId;
    const defaultId = isLayout ? DEFAULT_LAYOUT_PROFILE_ID : DEFAULT_SESSION_PROFILE_ID;
    const profiles = isLayout ? props.layouts : props.sessions;
    const title = isLayout ? copy.layouts : copy.sessions;
    const activeName = isLayout ? layoutName(activeId) : sessionName(activeId);
    const saveLabel = isLayout ? copy.saveCurrentLayout : copy.saveCurrentSession;
    const updateLabel = isLayout ? copy.updateCurrentLayout : copy.updateCurrentSession;
    return (
      <section className="rounded-2xl border border-neutral-800 bg-[var(--cyberfiles-workspace-card-background)] p-4 shadow-lg shadow-black/10 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-900/70 bg-cyan-950/35 text-cyan-300">
            {isLayout ? <LayoutTemplate className="h-5 w-5" /> : <FolderSync className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-cyan-500">{isLayout ? '01' : '02'}</span>
              <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-400">{isLayout ? copy.layoutDescription : copy.sessionDescription}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950/55 px-3 py-2.5">
          <p className="min-w-0 text-xs text-neutral-400">{copy.currentProfile}: <span className="font-medium text-neutral-100">{activeName}</span></p>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${dirty ? 'border-amber-800/60 bg-amber-950/30 text-amber-200' : 'border-emerald-900/60 bg-emerald-950/25 text-emerald-300'}`}>
            {dirty ? <AlertCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            {dirty ? copy.unsavedState : copy.savedState}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <DialogButton size="compact" variant={dirty && activeId === defaultId ? 'primary' : 'secondary'} onClick={() => openCreate(kind)}>
            <span className="inline-flex items-center gap-1.5"><Save className="h-3.5 w-3.5" />{saveLabel}</span>
          </DialogButton>
          {dirty && activeId !== defaultId && <DialogButton size="compact" variant="primary" onClick={() => isLayout ? props.onUpdateLayout(activeId) : props.onUpdateSession(activeId)}>
            <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />{updateLabel}</span>
          </DialogButton>}
        </div>
        {renderCreateForm(kind)}

        <div className="mt-5 border-t border-neutral-800 pt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{copy.availableProfiles}</p>
          <div className="space-y-2">
            {renderRow(kind, defaultId, isLayout ? copy.defaultLayout : copy.defaultSession, activeId === defaultId, true)}
            {profiles.map(profile => renderRow(kind, profile.id, profile.name, activeId === profile.id))}
            {profiles.length === 0 && <p className="px-1 py-2 text-xs text-neutral-500">{isLayout ? copy.noLayouts : copy.noSessions}</p>}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="workspace-manager-modal workspace-manager-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-[#03070c]/80 p-3 backdrop-blur-md sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-manager-title"
        aria-describedby="workspace-manager-description"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={event => event.stopPropagation()}
        className="workspace-manager-dialog flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-700/80 bg-[var(--cyberfiles-workspace-dialog-background)] shadow-2xl shadow-black/60 focus:outline-none"
      >
        <header className="relative flex shrink-0 items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4 sm:px-6 sm:py-5">
          <div aria-hidden="true" className="pointer-events-none absolute -left-8 -top-20 h-40 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative min-w-0">
            <h2 id="workspace-manager-title" className="text-base font-semibold tracking-tight text-neutral-100 sm:text-lg">{copy.title}</h2>
            <p id="workspace-manager-description" className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">{copy.managerIntro}</p>
          </div>
          {iconAction(copy.close, props.onClose, <X className="h-4 w-4" />)}
        </header>

        <div className="workspace-manager-content min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {renderPartSection('layouts')}
            {renderPartSection('sessions')}
          </div>

          <section className="mt-4 rounded-2xl border border-cyan-900/60 bg-gradient-to-br from-cyan-950/25 via-[#101720] to-[#101720] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-700/60 bg-cyan-950/60 text-cyan-200"><BookmarkPlus className="h-5 w-5" /></span>
                <div>
                  <div className="flex items-center gap-2"><span className="text-[10px] font-semibold tracking-[0.18em] text-cyan-500">03</span><h3 className="text-sm font-semibold text-neutral-100">{copy.workspaces}</h3></div>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">{copy.workspaceDescription}</p>
                </div>
              </div>
              <DialogButton size="compact" variant="primary" disabled={!props.canCreateWorkspace} onClick={() => openCreate('workspaces')}>
                <span className="inline-flex items-center gap-1.5"><Save className="h-3.5 w-3.5" />{copy.saveCurrentWorkspace}</span>
              </DialogButton>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/45 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500">{copy.chooseLayout}</p>
                <p className="mt-1 flex items-center justify-between gap-2 text-xs font-medium text-neutral-100"><span className="truncate">{layoutName(props.activeLayoutId)}</span><span className={props.layoutDirty ? 'text-amber-300' : 'text-emerald-300'}>{props.layoutDirty ? copy.unsavedState : copy.savedState}</span></p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/45 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500">{copy.chooseSession}</p>
                <p className="mt-1 flex items-center justify-between gap-2 text-xs font-medium text-neutral-100"><span className="truncate">{sessionName(props.activeSessionId)}</span><span className={props.sessionDirty ? 'text-amber-300' : 'text-emerald-300'}>{props.sessionDirty ? copy.unsavedState : copy.savedState}</span></p>
              </div>
            </div>

            {!props.canCreateWorkspace && <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-amber-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-medium">{copy.workspaceLockedTitle}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-400">{copy.workspaceLockedDescription}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {props.layoutDirty && <span className="rounded-full border border-amber-800/60 px-2 py-0.5 text-[10px] text-amber-200">{copy.pendingLayout}</span>}
                  {props.sessionDirty && <span className="rounded-full border border-amber-800/60 px-2 py-0.5 text-[10px] text-amber-200">{copy.pendingSession}</span>}
                </div>
              </div>
            </div>}
            {props.canCreateWorkspace && <p className="mt-3 text-xs leading-5 text-neutral-500">{copy.workspaceLinkNote}</p>}
            {renderCreateForm('workspaces')}

            <div className="mt-5 border-t border-cyan-900/40 pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{copy.savedWorkspaces}</p>
              {props.workspaces.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">
                {props.workspaces.map(profile => renderRow(
                  'workspaces', profile.id, profile.name, props.activeWorkspaceId === profile.id, false,
                  copy.workspacePair.replace('{layout}', layoutName(profile.layoutId)).replace('{session}', sessionName(profile.sessionId)),
                ))}
              </div> : <p className="rounded-xl border border-dashed border-neutral-700/70 px-4 py-5 text-center text-xs text-neutral-500">{copy.noWorkspaces}</p>}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 justify-end border-t border-neutral-800 bg-neutral-950/30 px-4 py-3 sm:px-6">
          <DialogButton size="compact" onClick={props.onClose}>{copy.close}</DialogButton>
        </footer>
      </section>
    </div>
  );
}
