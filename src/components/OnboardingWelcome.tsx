import { Check, FolderSync, Monitor, Palette, Sparkles, X } from 'lucide-react';
import { useEffect } from 'react';
import { useLanguage } from '../locales/LanguageContext';
import { type AppTheme, useTheme } from '../themes/ThemeContext';
import { DEFAULT_SESSION_PROFILE_ID, type StartupBehavior, type TabSessionProfile } from '../utils/workspaceProfiles';
import { Tooltip } from './Tooltip';

interface OnboardingWelcomeProps {
  isOpen: boolean;
  onContinue: () => void;
  onSkip: () => void;
  folderStyleLocked: boolean;
  onFolderStyleLockedChange: (enabled: boolean) => void;
  startupBehavior: StartupBehavior;
  onStartupBehaviorChange: (behavior: StartupBehavior) => void;
  startupSessionId: string;
  onStartupSessionIdChange: (sessionId: string) => void;
  sessions: TabSessionProfile[];
}

export function OnboardingWelcome({
  isOpen,
  onContinue,
  onSkip,
  folderStyleLocked,
  onFolderStyleLockedChange,
  startupBehavior,
  onStartupBehaviorChange,
  startupSessionId,
  onStartupSessionIdChange,
  sessions,
}: OnboardingWelcomeProps) {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const savedSessions = sessions.filter(session => session.id !== DEFAULT_SESSION_PROFILE_ID);

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

  const startupOptions: Array<{
    id: StartupBehavior;
    icon: typeof Monitor;
    label: string;
    description: string;
  }> = [
    { id: 'continue', icon: FolderSync, label: t.onboarding.startupContinue, description: t.onboarding.startupContinueDescription },
    { id: 'home', icon: Monitor, label: t.onboarding.startupHome, description: t.onboarding.startupHomeDescription },
    ...(savedSessions.length > 0
      ? [{ id: 'session' as const, icon: FolderSync, label: t.onboarding.startupSession, description: t.onboarding.startupSessionDescription }]
      : []),
  ];

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

        <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            <Palette className="h-3.5 w-3.5 text-cyan-300" />
            {t.onboarding.folderPreferences}
          </div>
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-3 text-xs transition-colors ${folderStyleLocked ? 'border-cyan-700/70 bg-cyan-950/25 text-neutral-200' : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'}`}>
            <input
              type="checkbox"
              checked={folderStyleLocked}
              onChange={event => onFolderStyleLockedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400"
            />
            <span>
              <span className="block font-medium text-neutral-200">{t.onboarding.keepFolderStyle}</span>
              <span className="mt-1 block leading-relaxed">{t.onboarding.keepFolderStyleDescription}</span>
            </span>
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t.onboarding.startupTitle}</div>
          <p className="mb-2 text-xs leading-relaxed text-neutral-500">{t.onboarding.startupDescription}</p>
          <div role="radiogroup" aria-label={t.onboarding.startupTitle} className="space-y-2">
            {startupOptions.map(option => {
              const Icon = option.icon;
              return (
                <label key={option.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition-colors ${startupBehavior === option.id ? 'border-cyan-700/70 bg-cyan-950/25 text-neutral-200' : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'}`}>
                  <input
                    type="radio"
                    name="onboarding-startup-behavior"
                    value={option.id}
                    checked={startupBehavior === option.id}
                    onChange={() => onStartupBehaviorChange(option.id)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400"
                  />
                  <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${startupBehavior === option.id ? 'text-cyan-300' : 'text-neutral-500'}`} />
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-200">{option.label}</span>
                    <span className="mt-1 block leading-relaxed">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {startupBehavior === 'session' && savedSessions.length > 0 && (
            <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-3">
              <label className="block text-xs font-medium text-neutral-200" htmlFor="onboarding-startup-session-select">{t.onboarding.startupChooseSession}</label>
              <select
                id="onboarding-startup-session-select"
                value={startupSessionId}
                onChange={event => onStartupSessionIdChange(event.target.value)}
                className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-neutral-200 outline-none focus:border-cyan-600"
              >
                {savedSessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-neutral-500">{t.onboarding.settingsHint}</p>
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-neutral-800 pt-4">
          <button type="button" onClick={onSkip} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100">
            {t.onboarding.skip}<kbd className="ml-2 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-400">Esc</kbd>
          </button>
          <button autoFocus type="button" onClick={onContinue} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-lg shadow-cyan-900/20 transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-neutral-900">
            {t.onboarding.continue}<kbd className="rounded border border-cyan-900/40 px-1.5 py-0.5 text-[10px] text-cyan-950">Enter</kbd><Check className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
