import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Palette,
  RotateCcw,
  Check,
  Search,
  Info,
  Folder,
} from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import {
  FOLDER_ICONS_CATALOG,
  FOLDER_COLOR_PRESETS,
  FolderIconRenderer,
  type FolderIconDefinition,
} from './folderIconsData';
import type {
  CustomFolderIconConfig,
  FolderIconCategory,
  FolderIconStyle,
} from '../utils/folderIconPreferences';

interface FolderIconModalProps {
  isOpen: boolean;
  folderPath: string;
  folderName: string;
  currentConfig?: CustomFolderIconConfig;
  onApply: (config: CustomFolderIconConfig | null) => void;
  onClose: () => void;
}

export const FolderIconModal: React.FC<FolderIconModalProps> = ({
  isOpen,
  folderPath,
  folderName,
  currentConfig,
  onApply,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const [selectedIconId, setSelectedIconId] = useState<string>(() => currentConfig?.iconId ?? 'code');
  const [selectedStyle, setSelectedStyle] = useState<FolderIconStyle>(() => currentConfig?.style ?? 'folder-badge');
  const [selectedCategory, setSelectedCategory] = useState<FolderIconCategory>(() => currentConfig?.category ?? 'color');
  const [selectedColorPreset, setSelectedColorPreset] = useState<string>(() => currentConfig?.colorPreset ?? 'cyan');
  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize state when modal opens or path changes
  useEffect(() => {
    if (isOpen) {
      setSelectedIconId(currentConfig?.iconId ?? 'code');
      setSelectedStyle(currentConfig?.style ?? 'folder-badge');
      setSelectedCategory(currentConfig?.category ?? 'color');
      setSelectedColorPreset(currentConfig?.colorPreset ?? 'cyan');
      setSearchQuery('');
    }
  }, [isOpen, folderPath, currentConfig]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const draftConfig: CustomFolderIconConfig = useMemo(() => ({
    iconId: selectedIconId,
    style: selectedStyle,
    category: selectedCategory,
    colorPreset: selectedColorPreset,
  }), [selectedIconId, selectedStyle, selectedCategory, selectedColorPreset]);

  const filteredIcons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return FOLDER_ICONS_CATALOG;
    return FOLDER_ICONS_CATALOG.filter(icon => {
      const matchEn = icon.nameEn.toLowerCase().includes(query);
      const matchEs = icon.nameEs.toLowerCase().includes(query);
      const matchTags = icon.tags.some(tag => tag.toLowerCase().includes(query));
      return matchEn || matchEs || matchTags;
    });
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleSave = () => {
    onApply(draftConfig);
    onClose();
  };

  const handleReset = () => {
    onApply(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-icon-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-700/80 bg-neutral-950/95 shadow-2xl shadow-cyan-950/30 text-neutral-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/80 px-6 py-4 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-400 shadow-[0_0_15px_rgba(244,114,182,0.2)]">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h2 id="folder-icon-modal-title" className="text-sm font-semibold tracking-wide text-neutral-100">
                {t.folderIconModal.title}
              </h2>
              <p className="text-[11px] text-neutral-400 truncate max-w-md" title={folderPath}>
                {folderName} <span className="text-neutral-500 font-mono">({folderPath})</span>
              </p>
            </div>
          </div>
          <Tooltip label={t.folderIconModal.cancel} placement="bottom">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.folderIconModal.cancel}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          
          {/* CyberFiles-only notice banner */}
          <div className="flex items-start gap-2.5 rounded-xl border border-cyan-800/40 bg-cyan-950/20 px-3.5 py-2.5 text-[11px] text-cyan-200">
            <Info className="h-4 w-4 flex-shrink-0 text-cyan-400 mt-0.5" />
            <div>
              <span className="font-semibold text-cyan-300">{t.folderIconModal.cyberFilesOnlyBadge}: </span>
              {t.folderIconModal.cyberFilesOnlyNotice}
            </div>
          </div>

          {/* Live Preview Card & Style Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            
            {/* Live Preview Box */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-4 text-center">
              <div className="mb-2 transition-transform duration-200 transform hover:scale-110">
                <FolderIconRenderer config={draftConfig} size="preview" />
              </div>
              <span className="truncate max-w-[160px] text-xs font-semibold text-neutral-200 mt-1" title={folderName}>
                {folderName}
              </span>
              <span className="text-[10px] text-neutral-400 mt-0.5">
                {selectedStyle === 'folder-badge' ? t.folderIconModal.styleFolderBadge : t.folderIconModal.styleSymbol}
              </span>
            </div>

            {/* Presentation Style & Color Tint Options */}
            <div className="md:col-span-2 flex flex-col justify-between space-y-3">
              {/* Style Switcher */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">
                  {t.folderIconModal.presentationStyle}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStyle('folder-badge')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      selectedStyle === 'folder-badge'
                        ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5 text-amber-400" />
                    <span>{t.folderIconModal.styleFolderBadge}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStyle('symbol')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      selectedStyle === 'symbol'
                        ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                  >
                    <Palette className="h-3.5 w-3.5 text-pink-400" />
                    <span>{t.folderIconModal.styleSymbol}</span>
                  </button>
                </div>
              </div>

              {/* Color Preset Palette */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">
                  {t.folderIconModal.folderColor}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {FOLDER_COLOR_PRESETS.map(preset => {
                    const isSelected = selectedColorPreset === preset.id;
                    const presetLabel = language === 'es' ? preset.nameEs : preset.nameEn;
                    return (
                      <Tooltip key={preset.id} label={presetLabel} placement="top">
                        <button
                          type="button"
                          aria-label={presetLabel}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedColorPreset(preset.id)}
                          className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-all ${preset.bg} ${
                            isSelected
                              ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-neutral-950 scale-110 shadow-lg'
                              : 'opacity-75 hover:opacity-100 hover:scale-105'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 text-neutral-950 stroke-[3]" />}
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Category Tabs & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            
            {/* Category Segmented Control */}
            <div className="flex rounded-lg border border-neutral-800 bg-neutral-900/80 p-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('color')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === 'color'
                    ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span>🎨</span>
                <span>{t.folderIconModal.categoryColor}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('neutral')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === 'neutral'
                    ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span>⚪</span>
                <span>{t.folderIconModal.categoryNeutral}</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t.folderIconModal.searchPlaceholder}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/90 pl-8 pr-7 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Icon Selection Grid */}
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-3">
            {filteredIcons.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500">
                {t.folderIconModal.noIconsFound}
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 max-h-[220px] overflow-y-auto p-1">
                {filteredIcons.map(iconDef => {
                  const isSelected = selectedIconId === iconDef.id;
                  const IconComp = iconDef.icon;
                  const iconName = language === 'es' ? iconDef.nameEs : iconDef.nameEn;
                  const iconColor = selectedCategory === 'neutral' ? 'text-neutral-300' : iconDef.defaultColor;

                  return (
                    <Tooltip key={iconDef.id} label={iconName} placement="top">
                      <button
                        type="button"
                        onClick={() => setSelectedIconId(iconDef.id)}
                        className={`flex flex-col items-center justify-center rounded-xl p-2.5 transition-all border ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-950/60 shadow-[0_0_12px_rgba(34,211,238,0.35)] scale-105'
                            : 'border-neutral-800/70 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-800 hover:scale-102'
                        }`}
                      >
                        <IconComp className={`h-6 w-6 ${iconColor} transition-transform`} />
                        <span className="truncate w-full text-center text-[10px] text-neutral-400 mt-1">
                          {iconName.split(/[\/\&]/)[0].trim()}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-neutral-800/80 bg-neutral-900/50 px-6 py-3.5">
          <div>
            {currentConfig && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:border-rose-800 hover:bg-rose-900/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t.folderIconModal.resetDefault}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-700 bg-neutral-800/70 px-4 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
            >
              {t.folderIconModal.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500 bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-neutral-950 transition-all hover:bg-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)]"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{t.folderIconModal.save}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
