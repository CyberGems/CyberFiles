import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, Network, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';
import { DialogButton } from './DialogButton';

interface NetworkCredentialsModalProps {
  targetPath: string;
  isBusy: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (values: { username: string; password: string; rememberCredentials: boolean }) => void;
}

export function NetworkCredentialsModal({
  targetPath,
  isBusy,
  errorMessage,
  onClose,
  onSubmit,
}: NetworkCredentialsModalProps) {
  const { t } = useLanguage();
  const usernameRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(true);

  useEffect(() => {
    usernameRef.current?.focus();
    usernameRef.current?.select();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isBusy, onClose]);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={event => {
        if (!isBusy && event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-credentials-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-150"
        onSubmit={event => {
          event.preventDefault();
          if (!isBusy && username.trim()) {
            onSubmit({ username: username.trim(), password, rememberCredentials });
          }
        }}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 text-cyan-300" />
            <h2 id="network-credentials-title" className="text-sm font-semibold text-neutral-100">
              {t.networkAuthModal.title}
            </h2>
          </div>
          <Tooltip label={t.core.cancel} placement="bottom">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              aria-label={t.core.cancel}
              className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        <div className="space-y-3.5 p-4">
          <p className="text-xs leading-relaxed text-neutral-400">{t.networkAuthModal.subtitle}</p>

          <div className="flex items-start gap-2.5 rounded-lg border border-cyan-500/25 bg-cyan-950/20 px-3 py-2.5">
            <Network aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/80">
                {t.networkAuthModal.targetLabel}
              </div>
              <div className="truncate-start mt-0.5 font-mono text-xs text-neutral-100">{targetPath}</div>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/35 bg-rose-950/35 px-3 py-2 text-xs text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-300" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          <label className="block space-y-1.5 text-xs font-medium text-neutral-300">
            <span>{t.networkAuthModal.usernameLabel}</span>
            <input
              ref={usernameRef}
              type="text"
              autoComplete="off"
              value={username}
              onChange={event => setUsername(event.target.value)}
              disabled={isBusy}
              placeholder={t.networkAuthModal.usernamePlaceholder}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-sans text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1.5 text-xs font-medium text-neutral-300">
            <span>{t.networkAuthModal.passwordLabel}</span>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="off"
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={isBusy}
                placeholder={t.networkAuthModal.passwordPlaceholder}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 py-2 pl-3 pr-9 font-sans text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50"
              />
              <Tooltip
                label={showPassword ? t.networkAuthModal.hidePassword : t.networkAuthModal.showPassword}
                placement="top"
              >
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setShowPassword(current => !current)}
                  aria-label={showPassword ? t.networkAuthModal.hidePassword : t.networkAuthModal.showPassword}
                  className="absolute right-1.5 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </Tooltip>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-xs text-neutral-300 select-none">
            <input
              type="checkbox"
              checked={rememberCredentials}
              onChange={event => setRememberCredentials(event.target.checked)}
              disabled={isBusy}
              className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-400 focus:ring-cyan-400/30"
            />
            <span>{t.networkAuthModal.rememberCredentials}</span>
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-800 bg-neutral-950/40 px-4 py-3">
          <DialogButton size="compact" disabled={isBusy} onClick={onClose}>
            {t.core.cancel}
          </DialogButton>
          <DialogButton size="compact" variant="primary" type="submit" disabled={isBusy || !username.trim()}>
            {isBusy ? t.networkAuthModal.connecting : t.networkAuthModal.connect}
          </DialogButton>
        </footer>
      </form>
    </div>
  );
}
