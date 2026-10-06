import React, { useEffect, useState } from 'react';
import { X, FileText, Folder, Image as ImageIcon, Code2, Copy, Check, Info, Music, Video, ChevronDown, ChevronUp, ExternalLink, Archive, TriangleAlert } from 'lucide-react';
import { FileItem } from '../types';
import { formatDateTimeForDisplay, type DateFormatMode } from '../utils/dateTime';
import { formatFileSize, isTextPreviewableFile } from '../utils/fileSystem';
import { isTauriDesktop, loadNativeImageThumbnail, loadNativePdfPreviewUrl, loadNativeArchivePreview, MAX_PDF_PREVIEW_BYTES, type NativeArchivePreview } from '../utils/nativeFileSystem';
import { formatFolderContentLabel, loadFolderContentSummary, type FolderContentSummary } from '../utils/folderContent';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

function renderMarkdownInline(source: string): React.ReactNode[] {
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|#[^)\s]*)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));
    const key = `inline-${tokenIndex++}`;
    if (match[2] && match[3]) {
      nodes.push(<a key={key} href={match[3]} target="_blank" rel="noreferrer noopener" className="text-cyan-300 underline underline-offset-2">{match[2]}</a>);
    } else if (match[4] || match[5]) {
      nodes.push(<strong key={key} className="font-semibold text-neutral-100">{match[4] || match[5]}</strong>);
    } else if (match[6] || match[7]) {
      nodes.push(<em key={key}>{match[6] || match[7]}</em>);
    } else if (match[8]) {
      nodes.push(<code key={key} className="rounded bg-neutral-800 px-1 py-0.5 text-cyan-200">{match[8]}</code>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

function renderMarkdown(source: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listKind: 'ordered' | 'unordered' | null = null;
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(<p key={`paragraph-${blocks.length}`} className="my-2 first:mt-0 last:mb-0">{renderMarkdownInline(paragraph.join(' '))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length === 0 || !listKind) return;
    const List = listKind === 'ordered' ? 'ol' : 'ul';
    blocks.push(<List key={`list-${blocks.length}`} className={`${listKind === 'ordered' ? 'list-decimal' : 'list-disc'} my-2 space-y-0.5 pl-5`}>
      {listItems.map((item, index) => <li key={index}>{renderMarkdownInline(item)}</li>)}
    </List>);
    listItems = [];
    listKind = null;
  };
  const flushText = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushText();
      if (codeLines) {
        blocks.push(<pre key={`code-${blocks.length}`} className="my-2 overflow-x-auto rounded bg-neutral-950 p-2 text-cyan-100"><code>{codeLines.join('\n')}</code></pre>);
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushText();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushText();
      const level = heading[1].length;
      const Heading = `h${level}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Heading key={`heading-${blocks.length}`} className="my-2 font-semibold leading-snug text-neutral-100">{renderMarkdownInline(heading[2])}</Heading>);
      continue;
    }
    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushText();
      blocks.push(<hr key={`rule-${blocks.length}`} className="my-3 border-neutral-700" />);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushText();
      blocks.push(<blockquote key={`quote-${blocks.length}`} className="my-2 border-l-2 border-cyan-500/60 pl-3 text-neutral-400">{renderMarkdownInline(quote[1])}</blockquote>);
      continue;
    }
    const unordered = /^\s*[-+*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextKind = unordered ? 'unordered' : 'ordered';
      if (listKind && listKind !== nextKind) flushList();
      listKind = nextKind;
      listItems.push((unordered || ordered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  if (codeLines) blocks.push(<pre key={`code-${blocks.length}`} className="my-2 overflow-x-auto rounded bg-neutral-950 p-2 text-cyan-100"><code>{codeLines.join('\n')}</code></pre>);
  flushText();
  return blocks;
}

function createSafeHtmlPreview(content: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`;
  if (/<head(?:\s[^>]*)?>/i.test(content)) {
    return content.replace(/<head(?:\s[^>]*)?>/i, head => `${head}${policy}`);
  }
  if (/<html(?:\s[^>]*)?>/i.test(content)) {
    return content.replace(/<html(?:\s[^>]*)?>/i, html => `${html}<head>${policy}</head>`);
  }
  return `<!doctype html><html><head>${policy}</head><body>${content}</body></html>`;
}

interface PreviewPaneProps {
  item: FileItem | null;
  dateFormat: DateFormatMode;
  onClose: () => void;
  nativePropertiesSupported: boolean;
  onOpenWindowsProperties: () => void;
  onOpenWithDefaultApp: () => void;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({ item, dateFormat, onClose, nativePropertiesSupported, onOpenWindowsProperties, onOpenWithDefaultApp }) => {
  const [copied, setCopied] = useState(false);
  const [collapsedSection, setCollapsedSection] = useState<'preview' | 'properties' | null>(null);
  const previewCollapsed = collapsedSection === 'preview';
  const propertiesCollapsed = collapsedSection === 'properties';
  const [imagePreviewSource, setImagePreviewSource] = useState<string | null>(null);
  const [imagePreviewState, setImagePreviewState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [pdfPreviewSource, setPdfPreviewSource] = useState<{ itemId: string; url: string } | null>(null);
  const [pdfPreviewState, setPdfPreviewState] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'too-large'>('idle');
  const [archivePreview, setArchivePreview] = useState<{ itemId: string; data: NativeArchivePreview } | null>(null);
  const [archivePreviewState, setArchivePreviewState] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'password-required' | 'desktop-only' | 'too-many-entries'>('idle');
  const [archivePassword, setArchivePassword] = useState('');
  const [archivePasswordError, setArchivePasswordError] = useState(false);
  const [folderContent, setFolderContent] = useState<{ itemId: string; status: 'loading' | 'done' | 'error'; summary?: FolderContentSummary } | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!item || item.isFolder || item.type !== 'image') {
      setImagePreviewSource(null);
      setImagePreviewState('idle');
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setImagePreviewSource(null);
    setImagePreviewState('loading');

    const loadPreview = async () => {
      try {
        if (item.contentPreview) {
          setImagePreviewSource(item.contentPreview);
          setImagePreviewState('ready');
          return;
        }

        if (item.handle && 'getFile' in item.handle) {
          const file = await (item.handle as FileSystemFileHandle).getFile();
          if (file.size > 64 * 1024 * 1024) throw new Error('Image exceeds the preview size limit');
          const nextObjectUrl = URL.createObjectURL(file);
          if (cancelled) {
            URL.revokeObjectURL(nextObjectUrl);
            return;
          }
          objectUrl = nextObjectUrl;
          setImagePreviewSource(nextObjectUrl);
          setImagePreviewState('ready');
          return;
        }

        if (isTauriDesktop()) {
          const thumbnail = await loadNativeImageThumbnail(item.path);
          if (!cancelled) {
            setImagePreviewSource(thumbnail);
            setImagePreviewState(thumbnail ? 'ready' : 'unavailable');
          }
          return;
        }

        if (!cancelled) setImagePreviewState('unavailable');
      } catch {
        if (!cancelled) setImagePreviewState('unavailable');
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item?.id, item?.path, item?.handle, item?.contentPreview, item?.type, item?.isFolder]);

  useEffect(() => {
    if (!item || item.isFolder || item.extension.toLowerCase() !== 'pdf') {
      setPdfPreviewSource(null);
      setPdfPreviewState('idle');
      return;
    }

    let cancelled = false;
    setPdfPreviewSource(null);
    if (item.size > MAX_PDF_PREVIEW_BYTES) {
      setPdfPreviewState('too-large');
      return;
    }
    setPdfPreviewState('loading');

    void loadNativePdfPreviewUrl(item.path).then(source => {
      if (cancelled) return;
      setPdfPreviewSource({ itemId: item.id, url: source });
    }).catch(() => {
      if (!cancelled) setPdfPreviewState('unavailable');
    });

    return () => { cancelled = true; };
  }, [item?.id, item?.path, item?.extension, item?.isFolder, item?.size]);

  useEffect(() => {
    if (!item || item.isFolder || item.type !== 'archive') {
      setArchivePreview(null);
      setArchivePreviewState('idle');
      return;
    }
    if (!['zip', 'rar'].includes(item.extension.toLowerCase())) {
      setArchivePreview(null);
      setArchivePreviewState('idle');
      return;
    }
    if (!isTauriDesktop()) {
      setArchivePreview(null);
      setArchivePreviewState('desktop-only');
      return;
    }
    let cancelled = false;
    setArchivePreview(null);
    setArchivePassword('');
    setArchivePasswordError(false);
    setArchivePreviewState('loading');
    void loadNativeArchivePreview(item.path).then(data => {
      if (cancelled) return;
      setArchivePreview({ itemId: item.id, data });
      setArchivePreviewState('ready');
    }).catch(error => {
      if (!cancelled) {
        const reason = String(error);
        setArchivePreviewState(reason.includes('ARCHIVE_TOO_MANY_ENTRIES') ? 'too-many-entries' : reason.includes('ARCHIVE_PASSWORD_REQUIRED') ? 'password-required' : 'unavailable');
      }
    });
    return () => { cancelled = true; };
  }, [item?.id, item?.path, item?.extension, item?.type, item?.isFolder]);

  useEffect(() => {
    if (!item?.isFolder) {
      setFolderContent(null);
      return;
    }
    let cancelled = false;
    setFolderContent({ itemId: item.id, status: 'loading' });
    void loadFolderContentSummary(item).then(
      summary => {
        if (!cancelled) setFolderContent({ itemId: item.id, status: 'done', summary });
      },
      () => {
        if (!cancelled) setFolderContent({ itemId: item.id, status: 'error' });
      },
    );
    return () => { cancelled = true; };
  }, [item?.id, item?.path, item?.handle, item?.isFolder]);

  if (!item) {
    return (
      <aside className="cyberfiles-preview-pane w-full min-w-0 bg-neutral-950 border-l border-neutral-800 flex flex-col justify-center items-center text-neutral-500 p-6 text-center select-none text-xs flex-shrink-0">
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
    if (item.isFolder) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-neutral-400">
          <Folder className="h-12 w-12 fill-amber-400/15 text-amber-400" />
          <span className="text-[11px] font-medium">{t.preview.folder}</span>
        </div>
      );
    }

    const extension = item.extension.toLowerCase();
    if (item.type === 'archive') {
      if (!['zip', 'rar'].includes(extension)) return <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400"><Archive className="h-10 w-10 text-violet-400" /><span className="text-[11px]">{t.preview.archiveFormatUnsupported}</span></div>;
      if (archivePreviewState === 'desktop-only') return <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400"><Archive className="h-10 w-10 text-violet-400" /><span className="text-[11px]">{t.preview.archivePreviewDesktopOnly}</span></div>;
      if (archivePreviewState === 'loading') return <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400"><Archive className="h-10 w-10 text-violet-400" /><span className="text-[11px]">{t.preview.archiveLoading}</span></div>;
      if (archivePreviewState === 'too-many-entries') return <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400"><TriangleAlert className="h-10 w-10 text-amber-400" /><span className="text-[11px]">{t.core.archiveTooManyEntries}</span></div>;
      if (archivePreviewState === 'password-required') return <div className="flex flex-col items-center justify-center gap-3 p-5 text-center text-neutral-300"><Archive className="h-9 w-9 text-violet-400" /><div className="text-xs font-medium">{t.preview.archivePasswordRequired}</div><form className="flex w-full max-w-xs flex-col gap-2" onSubmit={event => { event.preventDefault(); const password = archivePassword; if (!password) return; setArchivePassword(''); setArchivePasswordError(false); setArchivePreviewState('loading'); void loadNativeArchivePreview(item.path, password).then(data => { setArchivePreview({ itemId: item.id, data }); setArchivePreviewState('ready'); }).catch(error => { const reason = String(error); if (reason.includes('ARCHIVE_INVALID_PASSWORD') || reason.includes('ARCHIVE_PASSWORD_REQUIRED')) { setArchivePasswordError(true); setArchivePreviewState('password-required'); } else { setArchivePreviewState('unavailable'); } }); }}><input type="password" autoComplete="new-password" value={archivePassword} onChange={event => setArchivePassword(event.target.value)} placeholder={t.preview.archivePasswordPlaceholder} aria-label={t.preview.archivePasswordRequired} className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-left text-xs text-neutral-100 outline-none focus:border-cyan-500" />{archivePasswordError && <span className="text-left text-[10px] text-amber-300">{t.preview.archivePasswordIncorrect}</span>}<button type="submit" disabled={!archivePassword} className="rounded-md bg-cyan-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">{t.preview.archivePasswordContinue}</button></form></div>;
      const preview = archivePreview?.itemId === item.id ? archivePreview.data : null;
      if (!preview || archivePreviewState === 'unavailable') return <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400"><Archive className="h-10 w-10 text-violet-400" /><span className="text-[11px]">{t.preview.archivePreviewUnavailable}</span></div>;
      return (
        <div className="flex h-full min-h-0 w-full flex-col text-left">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 text-[10px] text-neutral-400">
            <span>{t.preview.archiveEntryCount.replace('{count}', preview.totalEntries.toLocaleString(language === 'es' ? 'es-CR' : 'en-US'))}</span>
            <span className="truncate text-right">{t.preview.archiveExpandedSize.replace('{size}', formatFileSize(preview.totalBytes))}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {preview.entries.map((entry, index) => {
              const warningLabel = entry.unsafePath || entry.link
                ? t.preview.archiveUnsafeEntry
                : !entry.extractable ? t.preview.archiveEntryUnavailable : null;
              return (
                <div key={`${index}:${entry.name}`} className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-[10px] text-neutral-300 hover:bg-neutral-800/60">
                  {entry.isDirectory ? <Folder className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" /> : <FileText className="h-3.5 w-3.5 flex-shrink-0 text-cyan-300" />}
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {warningLabel ? <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" aria-label={warningLabel} /> : <span className="flex-shrink-0 text-neutral-500">{entry.isDirectory ? '' : formatFileSize(entry.size)}</span>}
                </div>
              );
            })}
            {preview.truncated && <div className="px-2 py-2 text-center text-[10px] text-neutral-500">{t.preview.archiveTruncated.replace('{count}', preview.entries.length.toLocaleString(language === 'es' ? 'es-CR' : 'en-US'))}</div>}
          </div>
        </div>
      );
    }
    if (extension === 'pdf') {
      if (pdfPreviewState !== 'unavailable' && pdfPreviewState !== 'too-large' && pdfPreviewSource?.itemId === item.id) {
        return <iframe aria-label={`${t.preview.contentPreview}: ${item.name}`} src={pdfPreviewSource.url} onLoad={() => setPdfPreviewState('ready')} onError={() => setPdfPreviewState('unavailable')} className="h-full min-h-0 w-full border-0 bg-neutral-900" />;
      }

      const status = pdfPreviewState === 'loading'
        ? t.preview.pdfPreviewLoading
        : pdfPreviewState === 'too-large'
          ? t.preview.pdfPreviewTooLarge.replace('{limit}', formatFileSize(MAX_PDF_PREVIEW_BYTES))
          : isTauriDesktop() ? t.preview.pdfPreviewUnavailable : t.preview.pdfPreviewDesktopOnly;
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400">
          <FileText className="h-10 w-10 text-cyan-400" />
          <span className="text-[11px]">{status}</span>
          {nativePropertiesSupported && <Tooltip label={t.preview.openWithDefaultApp} placement="top"><button type="button" onClick={onOpenWithDefaultApp} className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[11px] text-neutral-200 transition-colors hover:border-cyan-600 hover:text-cyan-200">{t.preview.openWithDefaultApp}</button></Tooltip>}
        </div>
      );
    }

    if (extension === 'html' || extension === 'htm') {
      if (item.contentPreview === undefined) return <div className="p-6 text-center text-[11px] text-neutral-400">{t.preview.textUnavailable}</div>;
      return <iframe title={item.name} srcDoc={createSafeHtmlPreview(item.contentPreview)} sandbox="" referrerPolicy="no-referrer" className="h-full min-h-0 w-full border-0 bg-white" />;
    }

    if (extension === 'md' || extension === 'markdown') {
      if (item.contentPreview === undefined) return <div className="p-6 text-center text-[11px] text-neutral-400">{t.preview.textUnavailable}</div>;
      return <article className="h-full w-full min-h-0 max-h-full overflow-y-auto p-3 text-left text-[11px] leading-relaxed text-neutral-300 select-text">{renderMarkdown(item.contentPreview)}</article>;
    }

    if (item.type === 'image') {
      if (imagePreviewSource) {
        return <img src={imagePreviewSource} alt={item.name} className="max-h-full max-w-full object-contain rounded shadow" referrerPolicy="no-referrer" />;
      }
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-neutral-400">
          <ImageIcon className="h-10 w-10 text-cyan-400" />
          <span className="text-[11px] text-center">
            {imagePreviewState === 'unavailable' ? t.preview.imagePreviewUnavailable : t.preview.imagePreviewLoading}
          </span>
        </div>
      );
    }

    if (item.type === 'code' || item.type === 'text' || item.type === 'document' || isTextPreviewableFile(item)) {
      return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-neutral-950 p-3 text-left font-mono text-[11px] leading-relaxed select-text">
          <div className="flex items-center gap-2 pb-1 mb-2 border-b border-neutral-800 text-[10px] text-neutral-400">
            <Code2 className="w-3 h-3 text-cyan-400" />
            <span>{item.extension ? item.extension.toUpperCase() : t.preview.noExtension}</span>
          </div>
          <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-neutral-300">{item.contentPreview ?? t.preview.textUnavailable}</pre>
        </div>
      );
    }

    if (item.type === 'audio' || item.type === 'video') {
      const Icon = item.type === 'audio' ? Music : Video;
      return <div className="p-6 flex flex-col items-center justify-center text-neutral-400 gap-3"><Icon className="w-10 h-10 text-cyan-400" /><span className="text-[11px] text-center">{t.preview.mediaUnavailable}</span></div>;
    }

    return <div className="p-6 flex flex-col items-center justify-center text-neutral-500 gap-2"><FileText className="w-10 h-10 text-neutral-600 stroke-[1.5]" /><span className="text-[11px] font-sans uppercase">{item.extension || t.preview.noExtension}</span><span className="text-[10px] text-neutral-400">{formatFileSize(item.size)}</span></div>;
  };

  return (
    <aside className="cyberfiles-preview-pane flex h-full w-full min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-neutral-800 bg-neutral-950 text-xs select-none">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-3">
        <span className="truncate font-semibold text-neutral-200">{item.name}</span>
        <div className="flex flex-shrink-0 items-center gap-1">
          {!item.isFolder && item.extension.toLowerCase() === 'pdf' && nativePropertiesSupported && <Tooltip label={t.preview.openWithDefaultApp} placement="bottom"><button type="button" onClick={onOpenWithDefaultApp} aria-label={t.preview.openWithDefaultApp} className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-cyan-300"><ExternalLink className="h-4 w-4" /></button></Tooltip>}
          {nativePropertiesSupported && <Tooltip label={t.preview.openWindowsProperties} placement="bottom"><button type="button" onClick={onOpenWindowsProperties} aria-label={t.preview.openWindowsProperties} className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-cyan-300"><Info className="h-4 w-4" /></button></Tooltip>}
          <Tooltip label={t.preview.close} placement="bottom"><button type="button" onClick={onClose} aria-label={t.preview.close} className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"><X className="h-4 w-4" /></button></Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
        <section className={'flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/50 ' + (previewCollapsed ? 'flex-none' : 'flex-1')}>
          <div className="flex h-9 flex-shrink-0 items-center border-b border-neutral-800/80 px-1.5">
            <h2 className="flex h-full min-w-0 flex-1 items-center">
              <Tooltip label={previewCollapsed ? t.preview.expandPreview : t.preview.collapsePreview} placement="left">
                <button type="button" onClick={() => setCollapsedSection(previewCollapsed ? null : 'preview')} aria-label={previewCollapsed ? t.preview.expandPreview : t.preview.collapsePreview} aria-expanded={!previewCollapsed} className="collapse-toggle group flex h-full w-full items-center justify-between rounded-lg px-2.5 text-left">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.preview.contentPreview}</span>
                  {previewCollapsed ? <ChevronDown data-collapse-chevron="true" className="h-3.5 w-3.5 text-neutral-500" /> : <ChevronUp data-collapse-chevron="true" className="h-3.5 w-3.5 text-neutral-500" />}
                </button>
              </Tooltip>
            </h2>
          </div>
          {!previewCollapsed && <div className={'flex min-h-0 flex-1 justify-center ' + (item.extension.toLowerCase() === 'pdf' ? 'items-stretch overflow-hidden p-0' : 'items-center overflow-y-auto p-2')}>{renderContent()}</div>}
        </section>

        <section className={'flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/30 ' + (propertiesCollapsed ? 'flex-none' : 'flex-1')}>
          <div className="flex h-9 flex-shrink-0 items-center border-b border-neutral-800/80 px-1.5">
            <h2 className="flex h-full min-w-0 flex-1 items-center">
              <Tooltip label={propertiesCollapsed ? t.preview.expandProperties : t.preview.collapseProperties} placement="left">
                <button type="button" onClick={() => setCollapsedSection(propertiesCollapsed ? null : 'properties')} aria-label={propertiesCollapsed ? t.preview.expandProperties : t.preview.collapseProperties} aria-expanded={!propertiesCollapsed} className="collapse-toggle group flex h-full w-full items-center justify-between rounded-lg px-2.5 text-left">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.preview.properties}</span>
                  {propertiesCollapsed ? <ChevronUp data-collapse-chevron="true" className="h-3.5 w-3.5 text-neutral-500" /> : <ChevronDown data-collapse-chevron="true" className="h-3.5 w-3.5 text-neutral-500" />}
                </button>
              </Tooltip>
            </h2>
          </div>
          {!propertiesCollapsed && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-2.5 font-sans text-[11px] space-y-1.5">
                {item.isFolder ? (
                  <div className="flex items-center justify-between gap-3 text-neutral-400"><span>{t.preview.type}:</span><span className="text-right text-neutral-200">{t.preview.folder}</span></div>
                ) : (
                  <div className="flex items-center justify-between gap-3 text-neutral-400"><span>{t.preview.fileSize}:</span><span className="text-right text-neutral-200">{formatFileSize(item.size)} ({item.size.toLocaleString()} bytes)</span></div>
                )}
                {item.isFolder && (
                  <div className="flex items-center justify-between gap-3 text-neutral-400">
                    <span>{t.pane.folderContentTypeLabel}:</span>
                    <span className="text-right text-neutral-200">
                      {folderContent?.itemId === item.id && folderContent.status === 'done' && folderContent.summary
                        ? formatFolderContentLabel(folderContent.summary, t.pane.folderContentKinds)
                        : folderContent?.itemId === item.id && folderContent.status === 'error'
                          ? t.pane.folderTooltipCountFailed
                          : t.pane.folderTooltipCounting}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 text-neutral-400"><span>{t.preview.modified}:</span><span className="text-right text-neutral-200">{formatDateTimeForDisplay(item.modifiedAtMs, item.modifiedDate, dateFormat, language) || '----'}</span></div>
                <div className="flex items-center justify-between gap-3 text-neutral-400"><span>{t.preview.attributes}:</span><span className="text-right text-neutral-200">{item.attributes || '----'}</span></div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{t.preview.path}</div>
                <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/80 p-2 font-sans text-[10px] text-neutral-300">
                  <span className="flex-1 truncate">{item.path}</span>
                  <Tooltip label={copied ? t.preview.copied : t.preview.copyPath} placement="top"><button type="button" onClick={handleCopyPath} aria-label={copied ? t.preview.copied : t.preview.copyPath} className="flex-shrink-0 rounded p-1 transition-colors hover:bg-neutral-800 hover:text-cyan-300">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button></Tooltip>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

    </aside>
  );
};
