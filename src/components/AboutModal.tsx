import { useEffect } from 'react';
import { BookOpen, ExternalLink, Globe, Github, MessageSquareWarning, Tag, X } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLanguage } from '../locales/LanguageContext';
import { isTauriDesktop } from '../utils/nativeFileSystem';
import { Tooltip } from './Tooltip';

const REPOSITORY_URL = 'https://github.com/CyberGems/CyberFiles';
const WEBSITE_URL = 'https://cybergems.org/apps/cyberfiles/';
const WIKI_URL = REPOSITORY_URL + '/wiki';
const ISSUES_URL = REPOSITORY_URL + '/issues';
const RELEASES_URL = REPOSITORY_URL + '/releases';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const openExternal = (url: string) => {
    if (isTauriDesktop()) {
      void openUrl(url).catch(console.error);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const links = [
    { label: t.about.website, url: WEBSITE_URL, icon: <Globe className="h-4 w-4" /> },
    { label: t.about.repository, url: REPOSITORY_URL, icon: <Github className="h-4 w-4" /> },
    { label: t.about.wiki, url: WIKI_URL, icon: <BookOpen className="h-4 w-4" /> },
    { label: t.about.issues, url: ISSUES_URL, icon: <MessageSquareWarning className="h-4 w-4" /> },
    { label: t.about.releases, url: RELEASES_URL, icon: <Tag className="h-4 w-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/25 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_32px_rgba(34,211,238,0.08)]"
      >
        <header className="flex items-start justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="h-14 w-14 rounded-xl border border-neutral-700 bg-neutral-900 object-contain p-1" />
            <div>
              <h2 id="about-title" className="text-base font-semibold tracking-tight text-neutral-100">{t.about.title}</h2>
              <p className="mt-1 text-[11px] font-mono text-cyan-300">{t.about.version.replace('{version}', __APP_VERSION__)}</p>
            </div>
          </div>
          <Tooltip label={t.about.close} placement="bottom">
            <button
              type="button"
              aria-label={t.about.close}
              onClick={onClose}
              className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <main className="space-y-4 px-5 py-5">
          <p className="text-sm leading-relaxed text-neutral-300">{t.about.description}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {links.map(link => (
              <Tooltip key={link.url} label={link.url} placement="top">
                <button
                  type="button"
                  aria-label={link.label}
                  onClick={() => openExternal(link.url)}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/65 px-3 py-2.5 text-left text-xs text-neutral-300 transition-colors hover:border-cyan-500/35 hover:bg-cyan-950/20 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
                >
                  <span className="flex-shrink-0 text-cyan-300">{link.icon}</span>
                  <span className="truncate">{link.label}</span>
                  <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0 text-neutral-600" />
                </button>
              </Tooltip>
            ))}
          </div>
        </main>

        <footer className="flex items-center justify-between border-t border-neutral-800 bg-neutral-900/40 px-5 py-3">
          <span className="text-[10px] text-neutral-500">{t.about.copyright.replace('{year}', String(new Date().getFullYear()))}</span>
          <Tooltip label={t.about.close} placement="top">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.about.close}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
            >
              {t.about.close}
            </button>
          </Tooltip>
        </footer>
      </section>
    </div>
  );
}