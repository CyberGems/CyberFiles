import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const { language } = useLanguage();
  const isSpanish = language === 'es';

  const shortcuts = [
    { key: 'Tab', desc: isSpanish ? 'Cambiar entre el panel izquierdo y el derecho' : 'Switch between the left and right pane' },
    { key: 'F5', desc: isSpanish ? 'Copiar la selección al panel opuesto' : 'Copy the selection to the opposite pane' },
    { key: 'F6', desc: isSpanish ? 'Mover la selección al panel opuesto' : 'Move the selection to the opposite pane' },
    { key: 'F2', desc: isSpanish ? 'Renombrar el elemento seleccionado' : 'Rename the selected item' },
    { key: 'Ctrl + R', desc: isSpanish ? 'Abrir el renombrado múltiple' : 'Open batch rename' },
    { key: 'Espacio / F3', desc: isSpanish ? 'Mostrar u ocultar la vista previa' : 'Show or hide the preview' },
    { key: 'F7', desc: isSpanish ? 'Crear una carpeta en la ruta actual' : 'Create a folder in the current path' },
    { key: 'Ctrl + F', desc: isSpanish ? 'Buscar por nombre, ruta o contenido disponible' : 'Search by name, path, or available content' },
    { key: 'Ctrl + A', desc: isSpanish ? 'Seleccionar todos los elementos visibles' : 'Select all visible items' },
    { key: 'Ctrl + T', desc: isSpanish ? 'Abrir una pestaña en el panel activo' : 'Open a tab in the active pane' },
    { key: 'Ctrl + W', desc: isSpanish ? 'Cerrar la pestaña activa' : 'Close the active tab' },
    { key: 'Backspace', desc: isSpanish ? 'Subir a la carpeta superior' : 'Go to the parent folder' },
    { key: 'Enter', desc: isSpanish ? 'Entrar en una carpeta o abrir un archivo' : 'Open a folder or file' },
    { key: 'Supr / Delete', desc: isSpanish ? 'Solicitar confirmación para eliminar' : 'Ask for deletion confirmation' },
    { key: 'Esc', desc: isSpanish ? 'Cerrar cuadros de diálogo' : 'Close dialogs' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">{isSpanish ? 'Atajos de teclado de CyberFiles' : 'CyberFiles keyboard shortcuts'}</h3>
              <p className="text-[11px] text-neutral-400">{isSpanish ? 'Comandos para navegar y gestionar archivos' : 'Commands for navigating and managing files'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50 border border-neutral-800/80 text-xs"
            >
              <span className="text-neutral-300 text-[11.5px]">{s.desc}</span>
              <kbd className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-cyan-300 font-mono text-[11px] font-semibold whitespace-nowrap shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium"
          >
            {isSpanish ? 'Cerrar' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
