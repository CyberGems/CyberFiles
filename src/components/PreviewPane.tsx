import React, { useState } from 'react';
import { X, FileText, Image as ImageIcon, Code2, Copy, Check, Info, Music, Video } from 'lucide-react';
import { FileItem } from '../types';
import { formatFileSize } from '../utils/fileSystem';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface PreviewPaneProps {
  item: FileItem | null;
  onClose: () => void;
  onRename: () => void;
  nativePropertiesSupported: boolean;
  onOpenWindowsProperties: () => void;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({ item, onClose, onRename, nativePropertiesSupported, onOpenWindowsProperties }) => {
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  if (!item) {
    return (
      <aside className="w-80 bg-neutral-950 border-l border-neutral-800 flex flex-col justify-center items-center text-neutral-500 p-6 text-center select-none text-xs flex-shrink-0">
        <Info className="w-8 h-8 text-neutral-600 mb-2 stroke-[1.5]" />
        <div className="font-medium text-neutral-400 mb-1">{t.preview.noPreview}</div>
        <div>{t.preview.noPreviewDescription}</div>
      </aside>
    );
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(item.path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const renderContent = () => {
    if (item.type === 'image' && item.contentPreview) {
      return <img src={item.contentPreview} alt={item.name} className="max-h-52 max-w-full object-contain rounded shadow" referrerPolicy="no-referrer" />;
    }

    if (item.type === 'code' || item.type === 'text' || item.type === 'document') {
      return (
        <div className="w-full text-left font-mono text-[11px] leading-relaxed p-3 bg-neutral-950 max-h-60 overflow-y-auto select-text">
          <div className="flex items-center gap-2 pb-1 mb-2 border-b border-neutral-800 text-[10px] text-neutral-400">
            <Code2 className="w-3 h-3 text-cyan-400" />
            <span>{item.extension ? item.extension.toUpperCase() : t.preview.noExtension}</span>
          </div>
          <pre className="text-neutral-300 whitespace-pre-wrap">{item.contentPreview || t.preview.textUnavailable}</pre>
        </div>
      );
    }

    if (item.type === 'audio' || item.type === 'video') {
      const Icon = item.type === 'audio' ? Music : Video;
      return <div className="p-6 flex flex-col items-center justify-center text-neutral-400 gap-3"><Icon className="w-10 h-10 text-cyan-400" /><span className="text-[11px] text-center">{t.preview.mediaUnavailable}</span></div>;
    }

    return <div className="p-6 flex flex-col items-center justify-center text-neutral-500 gap-2"><FileText className="w-10 h-10 text-neutral-600 stroke-[1.5]" /><span className="text-[11px] font-mono uppercase">{item.extension || t.preview.noExtension}</span><span className="text-[10px] text-neutral-400">{formatFileSize(item.size)}</span></div>;
  };

  return (
    <aside className="w-80 bg-neutral-950 border-l border-neutral-800 flex flex-col justify-between select-none text-xs flex-shrink-0 h-full overflow-hidden">
      <div className="h-10 px-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/60">
        <span className="font-semibold text-neutral-200 truncate">{item.name}</span>
        <div className="flex flex-shrink-0 items-center gap-1">
          {nativePropertiesSupported && <Tooltip label={t.preview.openWindowsProperties} placement="bottom"><button type="button" onClick={onOpenWindowsProperties} aria-label={t.preview.openWindowsProperties} className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-cyan-300"><Info className="h-4 w-4" /></button></Tooltip>}
          <Tooltip label={t.preview.close} placement="bottom"><button onClick={onClose} className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"><X className="w-4 h-4" /></button></Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden flex flex-col items-center justify-center min-h-[190px] p-2">{renderContent()}</div>

        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.preview.properties}</div>
          <div className="bg-neutral-900/50 rounded-lg border border-neutral-800/80 p-2.5 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center text-neutral-400"><span>{t.preview.fileSize}:</span><span className="text-neutral-200">{formatFileSize(item.size)} ({item.size.toLocaleString()} bytes)</span></div>
            <div className="flex justify-between items-center text-neutral-400"><span>{t.preview.modified}:</span><span className="text-neutral-200">{item.modifiedDate}</span></div>
            <div className="flex justify-between items-center text-neutral-400"><span>{t.preview.attributes}:</span><span className="text-neutral-200">{item.attributes || '----'}</span></div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.preview.path}</div>
          <div className="flex items-center gap-1 bg-neutral-900/80 p-2 rounded-lg border border-neutral-800 text-[10px] font-mono text-neutral-300">
            <span className="truncate flex-1">{item.path}</span>
            <Tooltip label={copied ? t.preview.copied : t.preview.copyContent} placement="top"><button onClick={handleCopyPath} className="p-1 hover:text-cyan-300 rounded hover:bg-neutral-800 transition-colors flex-shrink-0">{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}</button></Tooltip>
          </div>
        </div>
      </div>

      <div className="p-2.5 border-t border-neutral-800 bg-neutral-900/60 flex items-center gap-2">
        <button onClick={onRename} className="flex-1 py-1.5 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-center font-medium transition-colors">{t.contextMenu.rename}</button>
      </div>
    </aside>
  );
};
