import React, { useState, useMemo } from 'react';
import { 
  X, 
  ArrowRight, 
  Check, 
  RefreshCw, 
  Sliders, 
  Hash, 
  Type, 
  CaseSensitive, 
  FileText 
} from 'lucide-react';
import { BatchRenameRule, FileItem } from '../types';
import { applyBatchRenamePreview } from '../utils/fileSystem';

interface BatchRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: FileItem[];
  onApplyRename: (renames: { id: string; original: string; renamed: string }[]) => void;
}

export const BatchRenameModal: React.FC<BatchRenameModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  onApplyRename,
}) => {
  const [rule, setRule] = useState<BatchRenameRule>({
    mode: 'replace',
    findText: '',
    replaceText: '',
    useRegex: false,
    prefix: '',
    suffix: '',
    startNumber: 1,
    numberStep: 1,
    paddingDigits: 3,
    caseType: 'lowercase',
    applyToExtension: false,
  });

  const previewItems = useMemo(() => {
    return applyBatchRenamePreview(selectedItems, rule);
  }, [selectedItems, rule]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApplyRename(previewItems);
    onClose();
  };

  const changedCount = previewItems.filter(p => p.original !== p.renamed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Estudio de Renombrado Masivo (Batch Rename)</h3>
              <p className="text-[11px] text-neutral-400">
                Previsualización en vivo sin modificar archivos reales
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5 text-xs">
          {/* Mode Selector Tabs */}
          <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800/80">
            <button
              onClick={() => setRule(r => ({ ...r, mode: 'replace' }))}
              className={`flex-1 py-1.5 px-3 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                rule.mode === 'replace' ? 'bg-neutral-800 text-cyan-300 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Buscar y Reemplazar</span>
            </button>

            <button
              onClick={() => setRule(r => ({ ...r, mode: 'prefix_suffix' }))}
              className={`flex-1 py-1.5 px-3 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                rule.mode === 'prefix_suffix' ? 'bg-neutral-800 text-cyan-300 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Prefijo / Sufijo</span>
            </button>

            <button
              onClick={() => setRule(r => ({ ...r, mode: 'numbering' }))}
              className={`flex-1 py-1.5 px-3 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                rule.mode === 'numbering' ? 'bg-neutral-800 text-cyan-300 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Numeración Secuencial</span>
            </button>

            <button
              onClick={() => setRule(r => ({ ...r, mode: 'case' }))}
              className={`flex-1 py-1.5 px-3 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                rule.mode === 'case' ? 'bg-neutral-800 text-cyan-300 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <CaseSensitive className="w-3.5 h-3.5" />
              <span>Mayúsculas / Minúsculas</span>
            </button>
          </div>

          {/* Configuration Form based on active mode */}
          <div className="bg-neutral-950/70 p-4 rounded-lg border border-neutral-800 space-y-3">
            {rule.mode === 'replace' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Buscar Texto</label>
                  <input
                    type="text"
                    placeholder="ej: copia, 2026, _raw"
                    value={rule.findText}
                    onChange={(e) => setRule({ ...rule, findText: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Reemplazar con</label>
                  <input
                    type="text"
                    placeholder="ej: final, v2, o dejar vacío para borrar"
                    value={rule.replaceText}
                    onChange={(e) => setRule({ ...rule, replaceText: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="col-span-full flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="regex-toggle"
                    checked={rule.useRegex}
                    onChange={(e) => setRule({ ...rule, useRegex: e.target.checked })}
                    className="rounded border-neutral-700 text-cyan-500 focus:ring-0 bg-neutral-900"
                  />
                  <label htmlFor="regex-toggle" className="text-neutral-300 font-medium cursor-pointer">
                    Habilitar expresiones regulares
                  </label>
                </div>
              </div>
            )}

            {rule.mode === 'prefix_suffix' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Prefijo (Inicio)</label>
                  <input
                    type="text"
                    placeholder="ej: [BACKUP]_"
                    value={rule.prefix}
                    onChange={(e) => setRule({ ...rule, prefix: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Sufijo (Final)</label>
                  <input
                    type="text"
                    placeholder="ej: _2026"
                    value={rule.suffix}
                    onChange={(e) => setRule({ ...rule, suffix: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {rule.mode === 'numbering' && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Número Inicial</label>
                  <input
                    type="number"
                    value={rule.startNumber}
                    onChange={(e) => setRule({ ...rule, startNumber: parseInt(e.target.value) || 0 })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Incremento (Paso)</label>
                  <input
                    type="number"
                    value={rule.numberStep}
                    onChange={(e) => setRule({ ...rule, numberStep: parseInt(e.target.value) || 1 })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-300">Ceros a la izquierda</label>
                  <select
                    value={rule.paddingDigits}
                    onChange={(e) => setRule({ ...rule, paddingDigits: parseInt(e.target.value) || 1 })}
                    className="w-full bg-neutral-900 border border-neutral-700/80 rounded-md px-3 py-1.5 text-neutral-100 font-mono focus:border-cyan-400 focus:outline-none"
                  >
                    <option value={1}>Sin ceros (1, 2, 3)</option>
                    <option value={2}>2 dígitos (01, 02, 03)</option>
                    <option value={3}>3 dígitos (001, 002, 003)</option>
                    <option value={4}>4 dígitos (0001, 0002)</option>
                  </select>
                </div>
              </div>
            )}

            {rule.mode === 'case' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['lowercase', 'uppercase', 'titlecase', 'kebab', 'camel'] as const).map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setRule({ ...rule, caseType: ct })}
                      className={`p-2 rounded border text-center font-mono capitalize transition-colors ${
                        rule.caseType === ct
                          ? 'bg-neutral-800 border-cyan-500 text-cyan-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="ext-case-toggle"
                    checked={rule.applyToExtension}
                    onChange={(e) => setRule({ ...rule, applyToExtension: e.target.checked })}
                    className="rounded border-neutral-700 text-cyan-500 focus:ring-0 bg-neutral-900"
                  />
                  <label htmlFor="ext-case-toggle" className="text-neutral-300 font-medium cursor-pointer">
                    Aplicar también a la extensión de archivo
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Live Before / After Comparison Table */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 px-1">
              <span>Comparación en tiempo real ({selectedItems.length} archivos seleccionados)</span>
              <span className="text-cyan-400 font-mono">{changedCount} con modificaciones</span>
            </div>

            <div className="border border-neutral-800 rounded-lg overflow-hidden max-h-56 overflow-y-auto bg-neutral-950 font-mono text-[11px]">
              <table className="w-full border-collapse">
                <thead className="bg-neutral-900/90 text-neutral-400 text-[10px] uppercase tracking-wider sticky top-0 border-b border-neutral-800">
                  <tr>
                    <th className="py-1.5 px-3 text-left font-semibold">Original</th>
                    <th className="py-1.5 px-3 text-center w-8"></th>
                    <th className="py-1.5 px-3 text-left font-semibold">Nuevo Nombre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900">
                  {previewItems.map((p) => {
                    const hasChanged = p.original !== p.renamed;
                    return (
                      <tr key={p.id} className={hasChanged ? 'bg-cyan-950/20' : ''}>
                        <td className="py-1.5 px-3 text-neutral-400 truncate max-w-[280px]">
                          {p.original}
                        </td>
                        <td className="py-1.5 px-2 text-center text-neutral-600">
                          <ArrowRight className="w-3 h-3 inline text-neutral-500" />
                        </td>
                        <td className={`py-1.5 px-3 truncate max-w-[280px] font-medium ${
                          hasChanged ? 'text-cyan-300' : 'text-neutral-500'
                        }`}>
                          {p.renamed}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between">
          <div className="text-[11px] text-neutral-400">
            {changedCount > 0 ? (
              <span>Se aplicarán cambios a <strong className="text-cyan-300">{changedCount}</strong> elementos.</span>
            ) : (
              <span>Sin modificaciones detectadas.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              disabled={changedCount === 0}
              className="px-4 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-black font-semibold disabled:opacity-40 disabled:hover:bg-cyan-500 transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Aplicar Renombrado</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
