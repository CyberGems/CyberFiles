import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  X, 
  Folder, 
  FileCode, 
  FileText, 
  Image as ImageIcon, 
  Music, 
  Video, 
  Archive, 
  Cpu, 
  File, 
  ArrowRight, 
  Copy, 
  Eye, 
  Sparkles, 
  Check, 
  Layers, 
  Filter,
  Clock,
  HardDrive
} from 'lucide-react';
import { FileItem, SearchMatch } from '../types';
import { formatFileSize, getFileExtension } from '../utils/fileSystem';
import { searchFileSystem, SearchOptions } from '../utils/searchIndex';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface FindFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  allFiles: FileItem[];
  currentPath: string;
  onNavigateToFile: (file: FileItem) => void;
  onPreviewFile?: (file: FileItem) => void;
}

export const FindFilesModal: React.FC<FindFilesModalProps> = ({
  isOpen,
  onClose,
  allFiles,
  currentPath,
  onNavigateToFile,
  onPreviewFile,
}) => {
  const { t, language } = useLanguage();
  const isSpanish = language === 'es';
  const [query, setQuery] = useState('');
  const [searchContent, setSearchContent] = useState(true);
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'tiny' | 'small' | 'medium' | 'large' | 'huge'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'code' | 'text' | 'image' | 'audio' | 'video' | 'executable' | 'folder' | 'document'>('all');
  const [extensionFilter, setExtensionFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Execute search
  const searchResults = useMemo(() => {
    const options: SearchOptions = {
      query,
      searchContent,
      scopePath: scope === 'current' ? currentPath : null,
      sizeFilter,
      typeFilter,
      caseSensitive,
      useRegex,
      extensionFilter,
    };
    return searchFileSystem(allFiles, options);
  }, [allFiles, query, searchContent, scope, currentPath, sizeFilter, typeFilter, caseSensitive, useRegex, extensionFilter]);

  // Reset selected index when query or filters change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, sizeFilter, typeFilter, scope]);

  if (!isOpen) return null;

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const match = searchResults.matches[selectedIndex];
      if (match) {
        onNavigateToFile(match.file);
        onClose();
      }
    }
  };

  const handleCopyPath = (file: FileItem) => {
    navigator.clipboard?.writeText(file.path);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const getFileIcon = (file: FileItem) => {
    if (file.isFolder) return <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    switch (file.type) {
      case 'code': return <FileCode className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
      case 'image': return <ImageIcon className="w-4 h-4 text-purple-400 flex-shrink-0" />;
      case 'text': return <FileText className="w-4 h-4 text-neutral-300 flex-shrink-0" />;
      case 'audio': return <Music className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      case 'video': return <Video className="w-4 h-4 text-rose-400 flex-shrink-0" />;
      case 'archive': return <Archive className="w-4 h-4 text-amber-500 flex-shrink-0" />;
      case 'executable': return <Cpu className="w-4 h-4 text-orange-400 flex-shrink-0" />;
      default: return <File className="w-4 h-4 text-neutral-400 flex-shrink-0" />;
    }
  };

  // Highlight search term
  const renderHighlightedText = (text: string, term: string) => {
    if (!term.trim()) return <span>{text}</span>;
    try {
      const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return (
        <span>
          {parts.map((part, i) =>
            part.toLowerCase() === term.toLowerCase() ? (
              <mark key={i} className="bg-amber-400/30 text-amber-200 font-bold px-0.5 rounded">
                {part}
              </mark>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </span>
      );
    } catch {
      return <span>{text}</span>;
    }
  };

  const totalSize = searchResults.matches.reduce((acc, m) => acc + (m.file.isFolder ? 0 : m.file.size), 0);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onKeyDown={handleKeyDown}
    >
      <div 
        className="w-full max-w-4xl max-h-[85vh] bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-4 py-3 bg-neutral-950/80 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <span>{isSpanish ? 'Buscar archivos' : 'Search files'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  Ctrl+F
                </span>
              </h2>
              <p className="text-[11px] text-neutral-400">
                {isSpanish ? 'Busca por nombre, ruta y contenido disponible en los datos cargados.' : 'Search by name, path, and available content in the loaded data.'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Omnibar & Toggles */}
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 space-y-3">
          {/* Main Input */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-cyan-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isSpanish ? 'Buscar por nombre, extensión o contenido (ej: informe, .pdf, presupuesto)...' : 'Search by name, extension, or content (e.g. report, .pdf, budget)...'}
              className="w-full bg-neutral-950 text-neutral-100 placeholder-neutral-500 pl-9 pr-24 py-2.5 rounded-lg border border-neutral-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-sm font-sans"
            />
            {query && (
              <Tooltip label={t.findFiles.clearSearch} placement="top">
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-20 text-neutral-500 hover:text-neutral-300 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
            <div className="absolute right-2.5 flex items-center gap-1">
              <Tooltip label={t.findFiles.caseSensitive} placement="top">
                <button
                  onClick={() => setCaseSensitive(!caseSensitive)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${
                    caseSensitive 
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' 
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Aa
                </button>
              </Tooltip>
              <Tooltip label={t.findFiles.useRegex} placement="top">
                <button
                  onClick={() => setUseRegex(!useRegex)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${
                    useRegex 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' 
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  .*
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Quick Scope & Filter Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Scope Toggle */}
            <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-md border border-neutral-800">
              <button
                onClick={() => setScope('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  scope === 'all' 
                    ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <HardDrive className="w-3 h-3 text-cyan-400" />
                <span>{isSpanish ? `Todos los elementos (${allFiles.length})` : `All loaded items (${allFiles.length})`}</span>
              </button>
              <button
                onClick={() => setScope('current')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  scope === 'current' 
                    ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Folder className="w-3 h-3 text-amber-400" />
                <span className="truncate max-w-[180px]">Carpeta actual: {currentPath.split('\\').pop() || currentPath}</span>
              </button>
            </div>

            {/* Content Search Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-neutral-300 select-none">
              <input
                type="checkbox"
                checked={searchContent}
                onChange={(e) => setSearchContent(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-950 text-cyan-500 focus:ring-0 focus:ring-offset-0"
              />
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-cyan-400" />
                <span>{isSpanish ? 'Buscar dentro del texto y código' : 'Search inside text and code'}</span>
              </span>
            </label>

            {/* Size Filter Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-neutral-400">Tamaño:</span>
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value as any)}
                className="bg-neutral-950 text-neutral-300 border border-neutral-800 rounded px-1.5 py-0.5 text-[11px] outline-none"
              >
                <option value="all">Cualquier tamaño</option>
                <option value="tiny">&lt; 10 KB</option>
                <option value="small">10 KB - 100 KB</option>
                <option value="medium">100 KB - 5 MB</option>
                <option value="large">5 MB - 50 MB</option>
                <option value="huge">&gt; 50 MB</option>
              </select>
            </div>

            {/* Type Filter Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-neutral-400">Tipo:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="bg-neutral-950 text-neutral-300 border border-neutral-800 rounded px-1.5 py-0.5 text-[11px] outline-none"
              >
                <option value="all">Todos los tipos</option>
                <option value="code">Código (.rs, .ts, .json)</option>
                <option value="text">Documentos de texto</option>
                <option value="image">Imágenes</option>
                <option value="executable">Ejecutables (.exe, .bat)</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="folder">Solo carpetas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Search Statistics Status Line */}
        <div className="px-4 py-1.5 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <div className="flex items-center gap-3">
            <span>
              Resultados: <strong className="text-cyan-400">{searchResults.matches.length}</strong> elementos
            </span>
            <span>·</span>
            <span>
              Tamaño acumulado: <strong className="text-yellow-400">{formatFileSize(totalSize)}</strong>
            </span>
            <span>·</span>
            <span>
              Escaneados: <strong className="text-neutral-200">{searchResults.totalScanned}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-500">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Tiempo: <strong className="text-emerald-400">{searchResults.durationMs} ms</strong></span>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[50vh] divide-y divide-neutral-800/60 bg-neutral-950/60 font-sans">
          {searchResults.matches.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-500">
              <Search className="w-10 h-10 text-neutral-700 mb-2 stroke-[1.5]" />
              <p className="text-sm font-medium text-neutral-400">No se encontraron archivos que coincidan</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                Prueba cambiando los términos de búsqueda, desactivando filtros de tamaño o ampliando el ámbito a todos los discos.
              </p>
            </div>
          ) : (
            searchResults.matches.map((match, idx) => {
              const file = match.file;
              const isSelected = idx === selectedIndex;
              const ext = getFileExtension(file.name);

              return (
                <div
                  key={file.id}
                  onClick={() => setSelectedIndex(idx)}
                  onDoubleClick={() => {
                    onNavigateToFile(file);
                    onClose();
                  }}
                  className={`px-4 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-cyan-950/70 border-l-2 border-cyan-400 text-neutral-100' 
                      : idx % 2 === 0 ? 'bg-neutral-900/30 hover:bg-neutral-800/50' : 'bg-neutral-900/10 hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1 pr-3">
                    <div className="mt-0.5">{getFileIcon(file)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-100 truncate">
                          {renderHighlightedText(file.name, query)}
                        </span>
                        {ext && (
                          <span className="text-[9px] font-mono px-1 py-0.2 bg-neutral-800 text-neutral-400 rounded uppercase">
                            {ext}
                          </span>
                        )}
                        {match.matchType === 'content' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Encontrado en contenido (línea {match.matchedLineNumber || 1})</span>
                          </span>
                        )}
                      </div>

                      {/* Content match snippet preview */}
                      {match.matchType === 'content' && match.contentSnippet && (
                        <div className="mt-1 px-2 py-1 rounded bg-black/60 border border-neutral-800 font-mono text-[11px] text-neutral-300 overflow-hidden text-ellipsis whitespace-nowrap max-w-xl">
                          <span className="text-neutral-500 mr-2">Línea {match.matchedLineNumber}:</span>
                          {renderHighlightedText(match.contentSnippet, query)}
                        </div>
                      )}

                      {/* Directory Breadcrumb */}
                      <p className="text-[11px] text-neutral-500 font-mono truncate mt-0.5">
                        {renderHighlightedText(file.path, query)}
                      </p>
                    </div>
                  </div>

                  {/* Metadata & Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div className="font-mono text-[11px] text-neutral-400 min-w-[70px]">
                      {file.isFolder ? '<DIR>' : formatFileSize(file.size)}
                    </div>
                    <div className="font-mono text-[10px] text-neutral-500 hidden md:block min-w-[110px]">
                      {file.modifiedDate}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                      <Tooltip label={t.findFiles.copyPath} placement="top">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPath(file);
                          }}
                          className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                        >
                          {copiedId === file.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </Tooltip>

                      {onPreviewFile && !file.isFolder && (
                        <Tooltip label={`${t.findFiles.previewFile} (F3)`} placement="top">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewFile(file);
                            }}
                            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-300"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}

                      <Tooltip label={t.findFiles.locateInPanel} placement="top">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToFile(file);
                            onClose();
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 font-medium text-[11px]"
                        >
                          <span>{t.findFiles.navigateToFile}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">↑/↓</kbd> Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">Enter</kbd> Localizar en panel
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">Esc</kbd> Cerrar
            </span>
          </div>
          <div className="text-neutral-500">
            Doble clic en cualquier elemento para abrir su carpeta inmediatamente
          </div>
        </div>
      </div>
    </div>
  );
};
