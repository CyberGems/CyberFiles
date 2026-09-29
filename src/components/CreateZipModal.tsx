import React, { useEffect, useRef, useState } from 'react';
import { Archive, FolderOpen, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { DialogButton } from './DialogButton';
import { Tooltip } from './Tooltip';

interface CreateZipModalProps {
  defaultName: string;
  itemCount: number;
  targetPath: string;
  onClose: () => void;
  onChooseTarget: () => Promise<string | null>;
  onSubmit: (archiveName: string, targetPath: string) => void;
}

export function CreateZipModal({ defaultName, itemCount, targetPath, onClose, onChooseTarget, onSubmit }: CreateZipModalProps) {
  const { language, t } = useLanguage();
  const isSpanish = language === 'es';
  const [name, setName] = useState(defaultName);
  const [destination, setDestination] = useState(targetPath);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-zip-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-150"
        onSubmit={event => { event.preventDefault(); if (name.trim() && destination) onSubmit(name.trim(), destination); }}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Archive className="h-4 w-4 text-violet-300" />
            <h2 id="create-zip-title" className="text-sm font-semibold text-neutral-100">{isSpanish ? 'Crear archivo ZIP' : 'Create ZIP archive'}</h2>
          </div>
          <Tooltip label={t.core.cancel} placement="bottom">
            <button type="button" onClick={onClose} className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100">
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
            <div className="text-xs font-medium text-neutral-200">{isSpanish ? `Se incluirán ${itemCount} ${itemCount === 1 ? 'elemento' : 'elementos'}` : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} will be included`}</div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-xs text-neutral-500">{destination}</div>
              <Tooltip label={isSpanish ? 'Cambiar carpeta de destino' : 'Choose destination folder'} placement="top">
                <button type="button" onClick={() => { void onChooseTarget().then(path => { if (path) setDestination(path); }); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 transition hover:border-cyan-600 hover:bg-neutral-800">
                  <FolderOpen className="h-3.5 w-3.5" />{isSpanish ? 'Cambiar' : 'Change'}
                </button>
              </Tooltip>
            </div>
          </div>
          <label className="block space-y-1.5 text-xs font-medium text-neutral-300">
            <span>{isSpanish ? 'Nombre del archivo' : 'Archive name'}</span>
            <input
              ref={nameRef}
              autoComplete="off"
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-sans text-sm text-neutral-100 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15"
            />
            <span className="block text-[11px] font-normal text-neutral-500">
              {isSpanish ? 'Si el nombre ya existe, se añadirá un número para evitar sobrescribirlo.' : 'If the name already exists, a number will be added to prevent overwriting it.'}
            </span>
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-800 bg-neutral-950/40 px-4 py-3">
          <Tooltip label={t.core.cancel} placement="top"><DialogButton size="compact" onClick={onClose}>{t.core.cancel}</DialogButton></Tooltip>
          <Tooltip label={isSpanish ? 'Crear y añadir a Operaciones de archivos' : 'Create and add to File operations'} placement="top">
            <DialogButton size="compact" variant="primary" type="submit" disabled={!name.trim() || !destination}>{isSpanish ? 'Crear ZIP' : 'Create ZIP'}</DialogButton>
          </Tooltip>
        </footer>
      </form>
    </div>
  );
}
