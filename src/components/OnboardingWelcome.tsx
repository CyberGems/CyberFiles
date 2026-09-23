import { Check, FolderOpen, Monitor, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../locales/LanguageContext';
import { type AppTheme, useTheme } from '../themes/ThemeContext';
import { Tooltip } from './Tooltip';

interface OnboardingWelcomeProps {
  isOpen: boolean;
  onOpenFolder: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function OnboardingWelcome({ isOpen, onOpenFolder, onContinue, onSkip }: OnboardingWelcomeProps) {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [destination, setDestination] = useState<'system' | 'folder'>('system');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSkip]);

  if (!isOpen) return null;

  const continueOnboarding = () => {
    if (destination === 'folder') onOpenFolder();
    else onContinue();
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#080d16]/88 p-5 backdrop-blur-md">
      <section role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="relative w-full max-w-lg rounded-2xl border border-cyan-400/25 bg-neutral-900/95 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_36px_rgba(34,211,238,0.08)]">
        <Tooltip label={t.onboarding.close} placement="bottom">
        <button
          type="button"
          aria-label={t.onboarding.close}
          onClick={onSkip}
          className="absolute right-4 top-4 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <X className="h-4 w-4" />
        </button>
        </Tooltip>
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-neutral-950 shadow-lg shadow-cyan-500/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 id="welcome-title" className="text-xl font-semibold tracking-tight text-neutral-100">{t.onboarding.title}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-400">{t.onboarding.description}</p>

        <div className="mt-5 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-neutral-300">
            {t.settings.appearance}
            <select value={theme} onChange={event => setTheme(event.target.value as AppTheme)} className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-400">
              <option value="cyberfiles">{t.settings.cyberfiles.name}</option>
              <option value="gray">{t.settings.gray.name}</option>
              <option value="light">{t.settings.light.name}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-neutral-300">
            {t.settings.language}
            <select value={language} onChange={event => setLanguage(event.target.value as 'es' | 'en')} className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-400">
              <option value="es">{t.settings.spanish}</option>
              <option value="en">{t.settings.english}</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.onboarding.destination}>
          <button
            type="button"
            role="radio"
            aria-checked={destination === 'system'}
            onClick={() => setDestination('system')}
            className={`group rounded-xl border p-4 text-left transition-colors ${destination === 'system' ? 'border-cyan-500/50 bg-cyan-950/45 hover:border-cyan-400 hover:bg-cyan-950/65' : 'border-neutral-700 bg-neutral-950/60 hover:border-neutral-500 hover:bg-neutral-800'}`}
          >
            <Monitor className={`mb-3 h-5 w-5 ${destination === 'system' ? 'text-cyan-300' : 'text-neutral-400'}`} />
            <div className={`text-sm font-semibold ${destination === 'system' ? 'text-cyan-100' : 'text-neutral-100'}`}>{t.onboarding.exploreComputer}</div>
            <div className={`mt-1 text-xs leading-relaxed ${destination === 'system' ? 'text-cyan-200/70' : 'text-neutral-400'}`}>{t.onboarding.exploreComputerDescription}</div>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={destination === 'folder'}
            onClick={() => setDestination('folder')}
            className={`group rounded-xl border p-4 text-left transition-colors ${destination === 'folder' ? 'border-cyan-500/50 bg-cyan-950/45 hover:border-cyan-400 hover:bg-cyan-950/65' : 'border-neutral-700 bg-neutral-950/60 hover:border-neutral-500 hover:bg-neutral-800'}`}
          >
            <FolderOpen className={`mb-3 h-5 w-5 ${destination === 'folder' ? 'text-cyan-300' : 'text-neutral-400'}`} />
            <div className={`text-sm font-semibold ${destination === 'folder' ? 'text-cyan-100' : 'text-neutral-100'}`}>{t.onboarding.openFolder}</div>
            <div className={`mt-1 text-xs leading-relaxed ${destination === 'folder' ? 'text-cyan-200/70' : 'text-neutral-400'}`}>{t.onboarding.openFolderDescription}</div>
          </button>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-neutral-500">{t.onboarding.safetyNote}</p>
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-neutral-800 pt-4">
          <button type="button" onClick={onSkip} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100">
            {t.onboarding.skip}<kbd className="ml-2 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-400">Esc</kbd>
          </button>
          <button autoFocus type="button" onClick={continueOnboarding} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-lg shadow-cyan-900/20 transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-neutral-900">
            {t.onboarding.continue}<kbd className="rounded border border-cyan-900/40 px-1.5 py-0.5 text-[10px] text-cyan-950">Enter</kbd><Check className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
