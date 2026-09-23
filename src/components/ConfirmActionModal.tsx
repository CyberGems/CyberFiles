import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { FileItem } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

interface ConfirmActionModalProps {
  items: FileItem[];
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({ items, onCancel, onConfirm }) => {
  const { t, language } = useLanguage();
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onCancel}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 id="confirm-delete-title" className="font-semibold text-neutral-100 text-sm">{t.core.deleteTitle}</h2>
          </div>
          <Tooltip label={t.core.cancel} placement="bottom"><button onClick={onCancel} className="p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded"><X className="w-4 h-4" /></button></Tooltip>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <p className="text-neutral-300">{t.core.deleteMessage}</p>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="text-xs font-semibold text-neutral-200 mb-2">{t.core.deleteItems.replace('{count}', String(items.length))}</div>
            <ul className="space-y-1 max-h-32 overflow-y-auto text-xs text-neutral-400">
              {items.slice(0, 20).map(item => <li key={item.id} className="truncate">{item.isFolder ? '📁' : '📄'} {item.name}</li>)}
              {items.length > 20 && <li>{language === 'es' ? `y ${items.length - 20} más...` : `and ${items.length - 20} more...`}</li>}
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-950/50">
          <DialogButton size="compact" onClick={onCancel}>{t.core.cancel}</DialogButton>
          <DialogButton size="compact" variant="danger" onClick={onConfirm}>{t.core.delete}</DialogButton>
        </div>
      </section>
    </div>
  );
};
