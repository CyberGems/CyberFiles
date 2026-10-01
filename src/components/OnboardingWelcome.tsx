import { Check, FolderSync, Monitor, Palette, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../locales/LanguageContext';
import { type AppTheme, useTheme } from '../themes/ThemeContext';
import { DEFAULT_SESSION_PROFILE_ID, type StartupBehavior, type TabSessionProfile } from '../utils/workspaceProfiles';


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

type OnboardingStep = 0 | 1 | 2;

const themes: AppTheme[] = ['cyberfiles', 'gray', 'light'];

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
  const [step, setStep] = useState<OnboardingStep>(0);
  const stepRef = useRef<OnboardingStep>(0);
  const savedSessions = sessions.filter(session => session.id !== DEFAULT_SESSION_PROFILE_ID);
  const selectedSession = savedSessions.find(session => session.id === startupSessionId);

  const startupLabels = useMemo<Record<StartupBehavior, string>>(() => ({
    continue: t.onboarding.startupContinue,
    home: t.onboarding.startupHome,
    session: t.onboarding.startupSession,
  }), [t.onboarding.startupContinue, t.onboarding.startupHome, t.onboarding.startupSession]);

  useEffect(() => {
    if (isOpen) {
      stepRef.current = 0;
      setStep(0);
    }
  }, [isOpen]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
      if (event.key === 'Enter' && event.target === document.body) {
        event.preventDefault();
        if (stepRef.current < 2) setStep(current => (current + 1) as OnboardingStep);
        else onContinue();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onContinue, onSkip]);

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

  const chooseStartupBehavior = (behavior: StartupBehavior) => {
    onStartupBehaviorChange(behavior);
    if (behavior === 'session' && !savedSessions.some(session => session.id === startupSessionId)) {
      const firstSession = savedSessions[0];
      if (firstSession) onStartupSessionIdChange(firstSession.id);
    }
  };

  const stepItems = [
    { number: '1', title: t.onboarding.stepAppearance, description: t.onboarding.stepAppearanceDescription, icon: Palette },
    { number: '2', title: t.onboarding.stepNavigation, description: t.onboarding.stepNavigationDescription, icon: FolderSync },
    { number: '3', title: t.onboarding.stepReady, description: t.onboarding.stepReadyDescription, icon: Check },
  ];

  const goNext = () => setStep(current => current < 2 ? (current + 1) as OnboardingStep : current);
  const goBack = () => setStep(current => current > 0 ? (current - 1) as OnboardingStep : current);
  const selectedStartupLabel = startupBehavior === 'session' && selectedSession
    ? `${startupLabels.session}: ${selectedSession.name}`
    : startupLabels[startupBehavior];

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#080d16]/88 p-4 backdrop-blur-md sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="grid cyberfiles-onboarding-shell w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-cyan-400/25 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_36px_rgba(34,211,238,0.08)] md:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden border-r border-cyan-900/40 bg-gradient-to-b from-cyan-950/80 via-neutral-950 to-neutral-950 p-6 md:flex md:flex-col">
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-950/70 p-1 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-300/30">
              <img src="/icon.png" alt="CyberFiles" className="h-full w-full rounded-lg object-contain" />
            </div>
            <div className="mt-4 text-lg font-semibold tracking-tight text-neutral-100">CyberFiles</div>
            <div className="mt-1 text-xs text-cyan-200/65">{t.onboarding.sidebarSubtitle}</div>
          </div>

          <nav className="relative my-auto space-y-4" aria-label={t.onboarding.stepsLabel}>
            {stepItems.map((item, index) => {
              const Icon = item.icon;
              const active = step === index;

              return (
                <button
                    key={item.number}
                    type="button"
                    onClick={() => setStep(index as OnboardingStep)}
                    className={`flex w-full cursor-pointer items-center gap-3 text-left text-neutral-400 transition-colors hover:text-neutral-200 ${active ? 'text-cyan-100' : ''}`}
                  >
                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? 'border-cyan-300 bg-cyan-300 text-neutral-950 shadow-[0_0_18px_rgba(34,211,238,0.45)]' : index < step ? 'border-cyan-700 bg-cyan-950/70 text-cyan-200' : 'border-cyan-900/70 bg-neutral-950/40 text-neutral-500'}`}>
                      {index < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="mt-0.5 block text-[10px] text-current/65">{item.description}</span>
                    </span>
                  </button>
              );
            })}
          </nav>

          <p className="relative text-[11px] leading-relaxed text-neutral-500">{t.onboarding.settingsHint}</p>
        </aside>

        <div className="relative flex min-h-0 flex-col bg-neutral-900/95">
          <button
              type="button"
              aria-label={t.onboarding.close}
              onClick={onSkip}
              className="absolute right-4 top-4 z-10 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <X className="h-4 w-4" />
            </button>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-8 sm:px-10 sm:pt-10">
            <div className="mb-6 flex items-center gap-2 md:hidden">
              {stepItems.map(item => <span key={item.number} className={`h-1.5 flex-1 rounded-full ${Number(item.number) - 1 <= step ? 'bg-cyan-400' : 'bg-neutral-700'}`} />)}
            </div>

            {step === 0 && (
              <div>
                <div className="flex items-center gap-2 text-cyan-300"><Palette className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">{t.onboarding.stepAppearance}</span></div>
                <h1 id="welcome-title" className="mt-3 text-2xl font-semibold tracking-tight text-neutral-100">{t.onboarding.appearanceTitle}</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">{t.onboarding.appearanceDescription}</p>

                <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <label className="grid gap-2 text-xs font-medium text-neutral-300">
                    {t.settings.language}
                    <select value={language} onChange={event => setLanguage(event.target.value as 'es' | 'en')} style={{ colorScheme: theme === 'light' ? 'light' : 'dark' }} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-cyan-400">
                      <option value="es" className="bg-neutral-900 text-neutral-100">{t.settings.spanish}</option>
                      <option value="en" className="bg-neutral-900 text-neutral-100">{t.settings.english}</option>
                    </select>
                  </label>
                </div>

                <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-400">{t.settings.appearance}</div>
                <div role="radiogroup" aria-label={t.settings.appearance} className="mt-2 grid gap-3 sm:grid-cols-3">
                  {themes.map(option => {
                    const selected = theme === option;
                    const copy = t.settings[option];
                    return (
                      <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTheme(option)}
                          className={`w-full rounded-xl border p-2.5 text-left transition-colors ${selected ? 'border-cyan-400 bg-cyan-950/35 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]' : 'border-neutral-700 bg-neutral-950/50 hover:border-neutral-500'}`}
                        >
                          <div className={`theme-preview theme-preview-${option} h-14 overflow-hidden rounded-lg border border-black/20`} aria-hidden="true"><span /><span /><span /></div>
                          <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-neutral-100">{copy.name}</span>{selected && <Check className="h-4 w-4 flex-shrink-0 text-cyan-300" />}</div>
                        </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="flex items-center gap-2 text-cyan-300"><FolderSync className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">{t.onboarding.stepNavigation}</span></div>
                <h1 id="welcome-title" className="mt-3 text-2xl font-semibold tracking-tight text-neutral-100">{t.onboarding.navigationTitle}</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">{t.onboarding.navigationDescription}</p>

                <label className={`mt-6 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${folderStyleLocked ? 'border-cyan-700/70 bg-cyan-950/25' : 'border-neutral-700 bg-neutral-950/60 hover:border-neutral-600'}`}>
                  <input type="checkbox" checked={folderStyleLocked} onChange={event => onFolderStyleLockedChange(event.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-neutral-600 bg-neutral-950 accent-cyan-400 focus:ring-cyan-400" />
                  <span><span className="block text-sm font-semibold text-neutral-100">{t.onboarding.keepFolderStyle}</span><span className="mt-1 block text-xs leading-relaxed text-neutral-400">{t.onboarding.keepFolderStyleDescription}</span></span>
                </label>

                <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-neutral-400">{t.onboarding.startupTitle}</div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">{t.onboarding.startupDescription}</p>
                <div role="radiogroup" aria-label={t.onboarding.startupTitle} className="mt-3 grid gap-2">
                  {startupOptions.map(option => {
                    const Icon = option.icon;
                    const selected = startupBehavior === option.id;
                    return (
                      <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-xs transition-colors ${selected ? 'border-cyan-700/70 bg-cyan-950/25' : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'}`}>
                        <input type="radio" name="onboarding-startup-behavior" value={option.id} checked={selected} onChange={() => chooseStartupBehavior(option.id)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-cyan-400 focus:ring-cyan-400" />
                        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${selected ? 'text-cyan-300' : 'text-neutral-500'}`} />
                        <span className="min-w-0"><span className="block font-medium text-neutral-100">{option.label}</span><span className="mt-1 block leading-relaxed text-neutral-400">{option.description}</span></span>
                      </label>
                    );
                  })}
                </div>
                {startupBehavior === 'session' && savedSessions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3.5 py-3">
                    <label className="block text-xs font-medium text-neutral-200" htmlFor="onboarding-startup-session-select">{t.onboarding.startupChooseSession}</label>
                    <select id="onboarding-startup-session-select" value={startupSessionId} onChange={event => onStartupSessionIdChange(event.target.value)} style={{ colorScheme: theme === 'light' ? 'light' : 'dark' }} className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-400">
                      {savedSessions.map(session => <option key={session.id} value={session.id} className="bg-neutral-900 text-neutral-100">{session.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="flex items-center gap-2 text-cyan-300"><Check className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">{t.onboarding.stepReady}</span></div>
                <h1 id="welcome-title" className="mt-3 text-2xl font-semibold tracking-tight text-neutral-100">{t.onboarding.readyTitle}</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">{t.onboarding.readyDescription}</p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.onboarding.summaryFolderStyle}</div>
                    <div className="mt-2 text-sm font-semibold text-neutral-100">{folderStyleLocked ? t.onboarding.enabled : t.onboarding.disabled}</div>
                    <div className="mt-1 text-xs leading-relaxed text-neutral-400">{t.onboarding.keepFolderStyle}</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t.onboarding.summaryStartup}</div>
                    <div className="mt-2 text-sm font-semibold text-neutral-100">{selectedStartupLabel}</div>
                    <div className="mt-1 text-xs leading-relaxed text-neutral-400">{t.onboarding.startupTitle}</div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-4 text-sm leading-relaxed text-cyan-100/80">{t.onboarding.readyHint}</div>
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 px-6 py-4 sm:px-10">
            <button type="button" onClick={onSkip} className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100">
                {t.onboarding.skip}
              </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button type="button" onClick={goBack} className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100">{t.onboarding.back}</button>
              )}
              {step < 2 ? (
                <button autoFocus type="button" onClick={goNext} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-lg shadow-cyan-900/20 transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-neutral-900">{t.onboarding.next}<span className="text-xs opacity-70">Enter</span></button>
              ) : (
                <button autoFocus type="button" onClick={onContinue} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-lg shadow-cyan-900/20 transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-neutral-900">{t.onboarding.finish}<Check className="h-4 w-4" /></button>
              )}
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
