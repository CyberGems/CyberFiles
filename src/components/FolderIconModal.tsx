import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Palette,
  RotateCcw,
  Check,
  Search,
  Info,
  Folder,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import {
  FOLDER_ICONS_CATALOG,
  FOLDER_COLOR_PRESETS,
  FolderIconRenderer,
  FolderStatusBadge,
  getBadgeColor,
} from './folderIconsData';
import {
  readCustomFolderIcons,
  exportFolderIconsJson,
  importFolderIconsJson,
  type CustomFolderIconConfig,
  type FolderIconCategory,
  type FolderIconStyle,
  type FolderBadgeType,
  type SavedFolderIcons,
} from '../utils/folderIconPreferences';

interface FolderIconModalProps {
  isOpen: boolean;
  folderPath: string;
  folderName: string;
  currentConfig?: CustomFolderIconConfig;
  onApply: (config: CustomFolderIconConfig | null, nameRule?: { name: string; apply: boolean }) => void;
  onImportIcons?: (imported: SavedFolderIcons) => void;
  onClose: () => void;
}

const BADGE_OPTIONS: FolderBadgeType[] = [
  'none',
  'in-progress',
  'done',
  'important',
  'urgent',
  'archived',
  'custom',
];

export const FolderIconModal: React.FC<FolderIconModalProps> = ({
  isOpen,
  folderPath,
  folderName,
  currentConfig,
  onApply,
  onImportIcons,
  onClose,
}) => {
  const { t, language } = useLanguage();
  
  // Style defaults to 'symbol' as requested
  const [selectedIconId, setSelectedIconId] = useState<string>(() => currentConfig?.iconId ?? 'code');
  const [selectedStyle, setSelectedStyle] = useState<FolderIconStyle>(() => currentConfig?.style ?? 'symbol');
  const [selectedCategory, setSelectedCategory] = useState<FolderIconCategory>(() => currentConfig?.category ?? 'color');
  const [selectedColorPreset, setSelectedColorPreset] = useState<string>(() => currentConfig?.colorPreset ?? 'cyan');
  const [customColor, setCustomColor] = useState<string>(() => currentConfig?.customColor ?? '');
  const [isUsingCustomColor, setIsUsingCustomColor] = useState<boolean>(() => Boolean(currentConfig?.customColor));
  
  // Status Badge state
  const [badgeType, setBadgeType] = useState<FolderBadgeType>(() => currentConfig?.badge?.type ?? 'none');
  const [badgeCustomLabel, setBadgeCustomLabel] = useState<string>(() => currentConfig?.badge?.label ?? '');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Notice banner state in footer (dismissible, toggleable)
  const [showNotice, setShowNotice] = useState(false);
  
  // Collapsible Advanced section
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [applyNameRule, setApplyNameRule] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [advancedFeedback, setAdvancedFeedback] = useState<string | null>(null);

  const colorInputRef = useRef<HTMLInputElement>(null);

  const baseFolderName = useMemo(() => {
    const parts = folderPath.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : folderName;
  }, [folderPath, folderName]);

  // Synchronize state when modal opens or path changes
  useEffect(() => {
    if (isOpen) {
      setSelectedIconId(currentConfig?.iconId ?? 'code');
      setSelectedStyle(currentConfig?.style ?? 'symbol');
      setSelectedCategory(currentConfig?.category ?? 'color');
      setSelectedColorPreset(currentConfig?.colorPreset ?? 'cyan');
      setCustomColor(currentConfig?.customColor ?? '');
      setIsUsingCustomColor(Boolean(currentConfig?.customColor));
      setBadgeType(currentConfig?.badge?.type ?? 'none');
      setBadgeCustomLabel(currentConfig?.badge?.label ?? '');
      setSearchQuery('');
      setShowNotice(false);
      setIsAdvancedOpen(false);
      setApplyNameRule(false);
      setShowImportBox(false);
      setAdvancedFeedback(null);
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

  const draftConfig: CustomFolderIconConfig = useMemo(() => {
    const config: CustomFolderIconConfig = {
      iconId: selectedIconId,
      style: selectedStyle,
      category: selectedCategory,
    };
    if (isUsingCustomColor && customColor) {
      config.customColor = customColor;
    } else {
      config.colorPreset = selectedColorPreset;
    }
    if (badgeType !== 'none') {
      config.badge = {
        type: badgeType,
        label: badgeCustomLabel.trim() || undefined,
        color: isUsingCustomColor && customColor ? customColor : getBadgeColor(badgeType),
      };
    }
    return config;
  }, [
    selectedIconId,
    selectedStyle,
    selectedCategory,
    selectedColorPreset,
    isUsingCustomColor,
    customColor,
    badgeType,
    badgeCustomLabel,
  ]);

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
    onApply(draftConfig, { name: baseFolderName, apply: applyNameRule });
    onClose();
  };

  const handleReset = () => {
    onApply(null, { name: baseFolderName, apply: false });
    onClose();
  };

  const handleExport = async () => {
    try {
      const icons = readCustomFolderIcons();
      const json = exportFolderIconsJson(icons);
      await navigator.clipboard.writeText(json);
      setAdvancedFeedback(t.folderIconModal.exportSuccess);
      setTimeout(() => setAdvancedFeedback(null), 3500);
    } catch {
      // Fallback
    }
  };

  const handleImportSubmit = () => {
    if (!importJsonText.trim()) return;
    const currentIcons = readCustomFolderIcons();
    const result = importFolderIconsJson(importJsonText, currentIcons);
    if (result.success) {
      setAdvancedFeedback(t.folderIconModal.importSuccess.replace('{count}', String(result.count)));
      if (onImportIcons) onImportIcons(result.icons);
      setShowImportBox(false);
      setImportJsonText('');
      setTimeout(() => setAdvancedFeedback(null), 3500);
    } else {
      setAdvancedFeedback(t.folderIconModal.importError);
    }
  };

  const getBadgeLabel = (type: FolderBadgeType) => {
    switch (type) {
      case 'none': return t.folderIconModal.badgeNone;
      case 'in-progress': return t.folderIconModal.badgeInProgress;
      case 'done': return t.folderIconModal.badgeDone;
      case 'important': return t.folderIconModal.badgeImportant;
      case 'urgent': return t.folderIconModal.badgeUrgent;
      case 'archived': return t.folderIconModal.badgeArchived;
      case 'custom': return t.folderIconModal.badgeCustom;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-icon-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-700/80 bg-neutral-950 shadow-2xl shadow-cyan-950/40 text-neutral-100">
        
        {/* 1. Modal Header (Fixed, no scroll) */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800/80 px-6 py-3.5 bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-400 shadow-[0_0_12px_rgba(244,114,182,0.2)]">
              <Palette className="h-4.5 w-4.5" />
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

        {/* 2. Modal Body: No outer scrollbar; layout is flex-col so ONLY the grid or advanced section scrolls */}
        <div className="flex flex-1 flex-col min-h-0 px-6 py-3.5 space-y-3 overflow-hidden">
          
          {/* Top Control Block: Live Preview Card + Style Switcher + Color Swatches */}
          <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3.5 rounded-xl border border-neutral-800/90 bg-neutral-900/40 p-3">
            
            {/* Live Preview Box */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800/80 bg-neutral-950/70 p-3 text-center">
              <div className="mb-1.5 transition-transform duration-200 transform hover:scale-110">
                <FolderIconRenderer config={draftConfig} size="preview" />
              </div>
              <div className="flex items-center gap-1.5 justify-center max-w-full">
                <span className="truncate max-w-[130px] text-xs font-semibold text-neutral-200" title={folderName}>
                  {folderName}
                </span>
                {draftConfig.badge && draftConfig.badge.type !== 'none' && (
                  <FolderStatusBadge badge={draftConfig.badge} language={language} />
                )}
              </div>
              <span className="text-[10px] text-neutral-400 mt-0.5">
                {selectedStyle === 'symbol' ? t.folderIconModal.styleSymbol : t.folderIconModal.styleFolderBadge}
              </span>
            </div>

            {/* Presentation Style & Color Tint Options */}
            <div className="sm:col-span-2 flex flex-col justify-between space-y-2.5">
              {/* Style Switcher (Symbol is default) */}
              <div>
                <label className="text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                  {t.folderIconModal.presentationStyle}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStyle('symbol')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedStyle === 'symbol'
                        ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                  >
                    <Palette className="h-3.5 w-3.5 text-pink-400" />
                    <span>{t.folderIconModal.styleSymbol}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStyle('folder-badge')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedStyle === 'folder-badge'
                        ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5 text-amber-400" />
                    <span>{t.folderIconModal.styleFolderBadge}</span>
                  </button>
                </div>
              </div>

              {/* Color Preset Palette + Custom Color Picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t.folderIconModal.folderColor}
                  </label>
                  {isUsingCustomColor && (
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {customColor || '#06b6d4'}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {FOLDER_COLOR_PRESETS.map(preset => {
                    const isSelected = !isUsingCustomColor && selectedColorPreset === preset.id;
                    const presetLabel = language === 'es' ? preset.nameEs : preset.nameEn;
                    return (
                      <Tooltip key={preset.id} label={presetLabel} placement="top">
                        <button
                          type="button"
                          aria-label={presetLabel}
                          aria-pressed={isSelected}
                          onClick={() => {
                            setIsUsingCustomColor(false);
                            setSelectedColorPreset(preset.id);
                          }}
                          style={{ backgroundColor: preset.hex }}
                          className={`relative flex h-6 w-6 items-center justify-center rounded-full transition-all border border-black/40 ${
                            isSelected
                              ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-neutral-950 scale-110 shadow-lg'
                              : 'opacity-85 hover:opacity-100 hover:scale-105'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-neutral-950 stroke-[3]" />}
                        </button>
                      </Tooltip>
                    );
                  })}

                  {/* Custom Color Swatch with Native Color Picker */}
                  <Tooltip label={t.folderIconModal.pickColor} placement="top">
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={t.folderIconModal.pickColor}
                        onClick={() => {
                          setIsUsingCustomColor(true);
                          colorInputRef.current?.click();
                        }}
                        style={isUsingCustomColor && customColor ? { backgroundColor: customColor } : { background: 'conic-gradient(from 180deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
                        className={`relative flex h-6 w-6 items-center justify-center rounded-full transition-all border border-neutral-700 ${
                          isUsingCustomColor
                            ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-neutral-950 scale-110 shadow-lg'
                            : 'opacity-80 hover:opacity-100 hover:scale-105'
                        }`}
                      >
                        {isUsingCustomColor ? (
                          <Check className="h-3 w-3 text-neutral-950 stroke-[3]" />
                        ) : (
                          <Sparkles className="h-2.5 w-2.5 text-white drop-shadow" />
                        )}
                      </button>
                      <input
                        ref={colorInputRef}
                        type="color"
                        value={customColor || '#06b6d4'}
                        onChange={e => {
                          setIsUsingCustomColor(true);
                          setCustomColor(e.target.value);
                        }}
                        className="sr-only"
                        aria-hidden="true"
                      />
                    </div>
                  </Tooltip>
                </div>
              </div>

              {/* Status Badge Selector */}
              <div>
                <label className="text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                  {t.folderIconModal.statusBadge}
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {BADGE_OPTIONS.map(bType => {
                    const isSelected = badgeType === bType;
                    const bColor = getBadgeColor(bType);
                    const bLabel = getBadgeLabel(bType);
                    return (
                      <button
                        key={bType}
                        type="button"
                        onClick={() => setBadgeType(bType)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-all border ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200 shadow-sm'
                            : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                        }`}
                      >
                        {bType !== 'none' && (
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: bColor }}
                          />
                        )}
                        <span>{bLabel}</span>
                      </button>
                    );
                  })}
                  {badgeType === 'custom' && (
                    <input
                      type="text"
                      maxLength={10}
                      value={badgeCustomLabel}
                      onChange={e => setBadgeCustomLabel(e.target.value)}
                      placeholder={t.folderIconModal.badgeCustomTextPlaceholder}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10.5px] text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none max-w-[120px]"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Category Tabs & Search Bar */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5">
            {/* Category Segmented Control */}
            <div className="flex rounded-lg border border-neutral-800 bg-neutral-900/80 p-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('color')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
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
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
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
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/90 pl-8 pr-7 py-1 text-xs text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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

          {/* Icon Selection Grid: THE ONLY SCROLL CONTAINER */}
          <div className="flex-1 min-h-[150px] max-h-[220px] rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-2 overflow-y-auto">
            {filteredIcons.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500">
                {t.folderIconModal.noIconsFound}
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 p-0.5">
                {filteredIcons.map(iconDef => {
                  const isSelected = selectedIconId === iconDef.id;
                  const IconComp = iconDef.icon;
                  const iconName = language === 'es' ? iconDef.nameEs : iconDef.nameEn;
                  const iconHex = selectedCategory === 'neutral' ? '#d4d4d4' : iconDef.hexColor;

                  return (
                    <Tooltip key={iconDef.id} label={iconName} placement="top">
                      <button
                        type="button"
                        onClick={() => setSelectedIconId(iconDef.id)}
                        className={`flex flex-col items-center justify-center rounded-xl p-2 transition-all border ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-950/70 shadow-[0_0_12px_rgba(34,211,238,0.35)] scale-105'
                            : 'border-neutral-800/70 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-800 hover:scale-102'
                        }`}
                      >
                        <IconComp
                          className="h-5 w-5 transition-transform"
                          style={{ color: iconHex }}
                        />
                        <span className="truncate w-full text-center text-[9.5px] text-neutral-400 mt-1">
                          {iconName.split(/[\/\&]/)[0].trim()}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>

          {/* Collapsible Advanced Section ("Avanzado") */}
          <div className="flex-shrink-0 border-t border-neutral-800/60 pt-1.5">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(o => !o)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 hover:text-cyan-300 transition-colors"
            >
              {isAdvancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>{t.folderIconModal.advancedSection}</span>
              {advancedFeedback && (
                <span className="ml-2 text-cyan-400 font-normal animate-pulse">({advancedFeedback})</span>
              )}
            </button>

            {isAdvancedOpen && (
              <div className="mt-2 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5 text-xs text-neutral-300 animate-in fade-in duration-150">
                {/* Apply automatically to all matching folders */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyNameRule}
                    onChange={e => setApplyNameRule(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[11px]">
                    {t.folderIconModal.applyToAllMatchingName.replace('{name}', baseFolderName)}
                  </span>
                </label>

                {/* Export / Import Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:border-neutral-600 hover:text-white transition-colors"
                  >
                    <Download className="h-3 w-3 text-cyan-400" />
                    <span>{t.folderIconModal.exportConfig}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportBox(o => !o)}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:border-neutral-600 hover:text-white transition-colors"
                  >
                    <Upload className="h-3 w-3 text-emerald-400" />
                    <span>{t.folderIconModal.importConfig}</span>
                  </button>
                </div>

                {showImportBox && (
                  <div className="mt-2 space-y-1.5 pt-1 border-t border-neutral-800">
                    <textarea
                      rows={2}
                      value={importJsonText}
                      onChange={e => setImportJsonText(e.target.value)}
                      placeholder={t.folderIconModal.importPlaceholder}
                      className="w-full rounded border border-neutral-700 bg-neutral-950 p-1.5 font-mono text-[10px] text-neutral-200 focus:border-cyan-500 focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowImportBox(false)}
                        className="px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                      >
                        {t.folderIconModal.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={handleImportSubmit}
                        className="rounded bg-cyan-600 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-950 hover:bg-cyan-500"
                      >
                        {t.folderIconModal.importConfig}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Modal Footer (Fixed, no scroll; includes dismissible/toggleable notice & actions) */}
        <div className="flex-shrink-0 flex flex-col border-t border-neutral-800/80 bg-neutral-900/60 px-6 py-2.5">
          {/* Dismissible / Expandable Help Notice at bottom */}
          {showNotice && (
            <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-cyan-800/40 bg-cyan-950/30 px-3 py-2 text-[10.5px] text-cyan-200 animate-in fade-in duration-100">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400 mt-0.5" />
                <div>
                  <span className="font-semibold text-cyan-300">{t.folderIconModal.cyberFilesOnlyBadge}: </span>
                  {t.folderIconModal.cyberFilesOnlyNotice}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNotice(false)}
                className="text-cyan-400/70 hover:text-cyan-200 flex-shrink-0 text-[10px] underline ml-2"
              >
                {t.folderIconModal.dismissNotice}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
              {/* Subtle Info Toggle Button in footer */}
              <Tooltip label={t.folderIconModal.helpNoticeButton} placement="top">
                <button
                  type="button"
                  onClick={() => setShowNotice(v => !v)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    showNotice
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                      : 'text-neutral-500 hover:bg-neutral-800 hover:text-cyan-300'
                  }`}
                  aria-label={t.folderIconModal.helpNoticeButton}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
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
    </div>
  );
};
