import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, HardDrive, X } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { isUncPath, isUncServerRoot, normalizeDriveLetter, normalizeWindowsPath } from '../utils/fileSystem';
import { Tooltip } from './Tooltip';

interface MapNetworkDriveModalProps {
  initialPath?: string;
  usedDriveLetters: string[];
  errorMessage?: string | null;
  isBusy?: boolean;
  onClose: () => void;
  onSubmit: (values: {
    driveLetter: string;
    remotePath: string;
    reconnectAtSignIn: boolean;
    username?: string;
    password?: string;
    rememberCredentials?: boolean;
  }) => void;
}

const CANDIDATE_DRIVE_LETTERS = [
  'Z:', 'Y:', 'X:', 'W:', 'V:', 'U:', 'T:', 'S:', 'R:', 'Q:', 'P:',
  'O:', 'N:', 'M:', 'L:', 'K:', 'J:', 'I:', 'H:', 'G:', 'F:', 'E:', 'D:',
];

export const MapNetworkDriveModal: React.FC<MapNetworkDriveModalProps> = ({
  initialPath = '',
  usedDriveLetters,
  errorMessage,
  isBusy = false,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInputRef.current?.focus();
    folderInputRef.current?.select();
  }, []);

  const availableLetters = useMemo(() => {
    const usedSet = new Set(
      usedDriveLetters
        .map(letter => normalizeDriveLetter(letter))
        .filter((letter): letter is string => Boolean(letter)),
    );
    return CANDIDATE_DRIVE_LETTERS.filter(letter => !usedSet.has(letter));
  }, [usedDriveLetters]);

  const [driveLetter, setDriveLetter] = useState(() => availableLetters[0] ?? 'Z:');
  const [remotePath, setRemotePath] = useState(initialPath);
  const [reconnectAtSignIn, setReconnectAtSignIn] = useState(true);
  const [useDifferentCredentials, setUseDifferentCredentials] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(true);

  useEffect(() => {
    if (availableLetters.length > 0 && !availableLetters.includes(driveLetter)) {
      setDriveLetter(availableLetters[0]);
    }
  }, [availableLetters, driveLetter]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isBusy, onClose]);

  const normalizedRemotePath = useMemo(() => {
    const trimmed = remotePath.trim();
    if (!trimmed) return '';
    return normalizeWindowsPath(trimmed).replace(/\\+$/, '');
  }, [remotePath]);

  const isValidUncShare = useMemo(() => {
    if (!normalizedRemotePath) return false;
    return isUncPath(normalizedRemotePath) && !isUncServerRoot(normalizedRemotePath);
  }, [normalizedRemotePath]);

  const canSubmit =
    !isBusy &&
    availableLetters.length > 0 &&
    isValidUncShare &&
    (!useDifferentCredentials || username.trim().length > 0);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      driveLetter,
      remotePath: normalizedRemotePath,
      reconnectAtSignIn,
      username: useDifferentCredentials ? username.trim() : undefined,
      password: useDifferentCredentials ? password : undefined,
      rememberCredentials: useDifferentCredentials ? rememberCredentials : false,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cyberfiles-map-network-drive-title"
        aria-describedby="cyberfiles-map-network-drive-subtitle"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900 text-neutral-100 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-500/35 bg-indigo-950/45 text-indigo-300">
              <HardDrive className="h-5 w-5" />
            </span>
            <div>
              <h2 id="cyberfiles-map-network-drive-title" className="text-sm font-semibold text-white">
                {t.mapNetworkDriveModal.title}
              </h2>
              <p id="cyberfiles-map-network-drive-subtitle" className="mt-0.5 text-xs text-neutral-400">
                {t.mapNetworkDriveModal.subtitle}
              </p>
            </div>
          </div>
          <Tooltip label={t.core.cancel} shortcut="Esc" placement="bottom">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              aria-label={t.core.cancel}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-300">
                {t.mapNetworkDriveModal.driveLabel}
              </span>
              <select
                value={driveLetter}
                disabled={isBusy || availableLetters.length === 0}
                onChange={event => setDriveLetter(event.target.value)}
                aria-label={t.mapNetworkDriveModal.driveLabel}
                className="h-9 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 font-mono text-xs font-semibold text-cyan-200 outline-none transition-colors focus:border-cyan-500/70 disabled:opacity-50"
              >
                {availableLetters.map(letter => (
                  <option key={letter} value={letter}>
                    {letter}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-300">
                {t.mapNetworkDriveModal.folderLabel}
              </span>
              <input
                ref={folderInputRef}
                type="text"
                value={remotePath}
                disabled={isBusy}
                onChange={event => setRemotePath(event.target.value)}
                placeholder={t.mapNetworkDriveModal.folderPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 font-mono text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-colors focus:border-cyan-500/70"
              />
            </label>
          </div>

          {availableLetters.length === 0 && (
            <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              {t.mapNetworkDriveModal.noAvailableLetters}
            </div>
          )}

          <div className="space-y-2 pt-0.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-neutral-300 select-none">
              <input
                type="checkbox"
                checked={reconnectAtSignIn}
                disabled={isBusy}
                onChange={event => setReconnectAtSignIn(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-500 focus:ring-cyan-500/60"
              />
              <span>{t.mapNetworkDriveModal.reconnectAtSignIn}</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-neutral-300 select-none">
              <input
                type="checkbox"
                checked={useDifferentCredentials}
                disabled={isBusy}
                onChange={event => setUseDifferentCredentials(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-500 focus:ring-cyan-500/60"
              />
              <span>{t.mapNetworkDriveModal.useDifferentCredentials}</span>
            </label>
          </div>

          {useDifferentCredentials && (
            <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-neutral-300">
                  {t.networkAuthModal.usernameLabel}
                </span>
                <input
                  type="text"
                  value={username}
                  disabled={isBusy}
                  onChange={event => setUsername(event.target.value)}
                  placeholder={t.networkAuthModal.usernamePlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-8 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-colors focus:border-cyan-500/70"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-neutral-300">
                  {t.networkAuthModal.passwordLabel}
                </span>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    disabled={isBusy}
                    onChange={event => setPassword(event.target.value)}
                    placeholder={t.networkAuthModal.passwordPlaceholder}
                    autoComplete="off"
                    className="h-8 w-full rounded-lg border border-neutral-700 bg-neutral-950 pl-2.5 pr-8 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-colors focus:border-cyan-500/70"
                  />
                  <Tooltip
                    label={showPassword ? t.networkAuthModal.hidePassword : t.networkAuthModal.showPassword}
                    placement="top"
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? t.networkAuthModal.hidePassword : t.networkAuthModal.showPassword}
                      className="absolute right-1.5 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </Tooltip>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-neutral-300 select-none">
                <input
                  type="checkbox"
                  checked={rememberCredentials}
                  disabled={isBusy}
                  onChange={event => setRememberCredentials(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-cyan-500 focus:ring-cyan-500/60"
                />
                <span>{t.networkAuthModal.rememberCredentials}</span>
              </label>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/35 px-3 py-2 text-xs text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 pt-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:opacity-40"
            >
              {t.core.cancel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/60 bg-cyan-950/75 px-3.5 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:border-cyan-400 hover:bg-cyan-900/75 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>{isBusy ? t.mapNetworkDriveModal.submitting : t.mapNetworkDriveModal.submit}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
