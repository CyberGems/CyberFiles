import React, { useEffect, useRef } from 'react';
import { FilePlus2, FolderPlus, FolderOpen, Link2, FileSearch2, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

export type NewItemKind = 'folder' | 'text-file' | 'shortcut';

interface CreateItemModalProps {
  kind: NewItemKind;
  defaultName: string;
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; targetPath: string }) => void;
  onChooseTarget: (kind: 'file' | 'folder') => Promise<string | null>;
}

export function CreateItemModal({ kind, defaultName, isBusy, onClose, onSubmit, onChooseTarget }: CreateItemModalProps) {
  const { t } = useLanguage();
  const nameRef = useRef<HTMLInputElement>(null);
  const initialName = typeof defaultName === 'string' ? defaultName : '';
  const [name, setName] = React.useState(initialName);
  const [targetPath, setTargetPath] = React.useState('');
  const heading = kind === 'folder'
    ? t.contextMenu.newFolderName
    : kind === 'text-file'
      ? t.contextMenu.newTextFile
      : t.contextMenu.newShortcut;
  const Icon = kind === 'folder' ? FolderPlus : kind === 'text-file' ? FilePlus2 : Link2;

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isBusy, onClose]);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={event => { if (!isBusy && event.target === event.currentTarget) onClose(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-item-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-150"
        onSubmit={event => { event.preventDefault(); if (!isBusy) onSubmit({ name, targetPath }); }}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-cyan-300" />
            <h2 id="create-item-title" className="text-sm font-semibold text-neutral-100">{heading}</h2>
          </div>
          <Tooltip label={t.core.cancel} placement="bottom">
            <button type="button" disabled={isBusy} onClick={onClose} className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40">
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="space-y-3 p-4">
          <label className="block space-y-1.5 text-xs font-medium text-neutral-300">
            <span>{t.contextMenu.itemName}</span>
            <input
              ref={nameRef}
              autoComplete="off"
              value={name}
              onChange={event => setName(event.target.value)}
              disabled={isBusy}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-sans text-sm text-neutral-100 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50"
            />
          </label>
          {kind === 'shortcut' && (
            <label className="block space-y-1.5 text-xs font-medium text-neutral-300">
              <span>{t.contextMenu.shortcutTarget}</span>
              <input
                autoComplete="off"
                value={targetPath}
                onChange={event => setTargetPath(event.target.value)}
                disabled={isBusy}
                placeholder={t.contextMenu.shortcutTargetPlaceholder}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-sans text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50"
              />
              <div className="flex gap-2">
                <Tooltip label={t.contextMenu.chooseTargetFile} placement="top">
                  <button type="button" disabled={isBusy} onClick={() => { void onChooseTarget('file').then(path => { if (path) setTargetPath(path); }); }} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-cyan-500/50 hover:bg-neutral-800 hover:text-cyan-100 disabled:opacity-50">
                    <FileSearch2 className="h-3.5 w-3.5" />{t.contextMenu.chooseTargetFile}
                  </button>
                </Tooltip>
                <Tooltip label={t.contextMenu.chooseTargetFolder} placement="top">
                  <button type="button" disabled={isBusy} onClick={() => { void onChooseTarget('folder').then(path => { if (path) setTargetPath(path); }); }} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-cyan-500/50 hover:bg-neutral-800 hover:text-cyan-100 disabled:opacity-50">
                    <FolderOpen className="h-3.5 w-3.5" />{t.contextMenu.chooseTargetFolder}
                  </button>
                </Tooltip>
              </div>
            </label>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-800 bg-neutral-950/40 px-4 py-3">
          <Tooltip label={t.core.cancel} placement="top"><DialogButton size="compact" disabled={isBusy} onClick={onClose}>{t.core.cancel}</DialogButton></Tooltip>
          <Tooltip label={t.contextMenu.create} placement="top"><DialogButton size="compact" variant="primary" type="submit" disabled={isBusy || !(typeof name === 'string' && name.trim())}>{isBusy ? t.core.operationInProgress : t.contextMenu.create}</DialogButton></Tooltip>
        </footer>
      </form>
    </div>
  );
}
