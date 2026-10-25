/**
 * In-app updates.
 *
 * CyberFiles ships the Tauri updater: the app asks the signed manifest the release workflow
 * publishes, downloads the installer it points at and verifies its minisign signature before
 * running it. This module is the only place that talks to the plugin, so the windows never
 * have to know about it.
 *
 * Every check fails quietly on purpose: being offline or rate limited must never interrupt the
 * user. The About window reports the reason when the user asks for one.
 */

import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { isTauriDesktop } from './nativeFileSystem';

/** The release the updater just found. The plugin owns it; this module only passes it on. */
export type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

export const RELEASES_PAGE_URL = 'https://github.com/CyberGems/CyberFiles/releases';

const AUTO_CHECK_KEY = 'cyberfiles_auto_check_updates_v1';
const NOTIFIED_VERSION_KEY = 'cyberfiles_update_notified_v1';
const SKIPPED_VERSION_KEY = 'cyberfiles_skipped_update_version_v1';
const CHECK_TIMEOUT_MS = 15_000;

/** The About window promises "on start and every six hours"; this is that six hours. */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** What this copy of the app can do about updates at all. */
export type UpdateSupport = 'supported' | 'portable' | 'browser';

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // A preference that cannot be stored is not worth interrupting the user for.
  }
}

/** On by default, like the rest of the suite. Only an explicit "false" turns it off. */
export function getAutoCheckUpdates(): boolean {
  return readFlag(AUTO_CHECK_KEY) !== 'false';
}

export function setAutoCheckUpdates(value: boolean): void {
  writeFlag(AUTO_CHECK_KEY, value ? 'true' : 'false');
}

/** The version already announced by toast, so a mid-session check does not repeat itself. */
export function getNotifiedVersion(): string | null {
  return readFlag(NOTIFIED_VERSION_KEY);
}

export function setNotifiedVersion(version: string): void {
  writeFlag(NOTIFIED_VERSION_KEY, version);
}

/** Normalized so a manifest that writes "v0.7.0" and a tag that says "0.7.0" still match. */
function normalizeVersion(version: string | null | undefined): string {
  return (version ?? '').trim().replace(/^v/i, '');
}

export function getSkippedVersion(): string | null {
  return readFlag(SKIPPED_VERSION_KEY);
}

export function setSkippedVersion(version: string): void {
  writeFlag(SKIPPED_VERSION_KEY, normalizeVersion(version));
}

export function clearSkippedVersion(): void {
  writeFlag(SKIPPED_VERSION_KEY, null);
}

/** True when the user asked to be left alone until a version newer than this one ships. */
export function isSkippedVersion(version: string | null | undefined): boolean {
  const skipped = getSkippedVersion();
  if (!skipped) return false;
  return normalizeVersion(version) === skipped;
}

let portableBuild: Promise<boolean> | null = null;

/** The portable edition updates by downloading a new ZIP, never by running the installer. */
export function isPortableBuild(): Promise<boolean> {
  if (!isTauriDesktop()) return Promise.resolve(false);
  if (!portableBuild) {
    portableBuild = invoke<boolean>('is_portable_build').catch(() => false);
  }
  return portableBuild;
}

export async function getUpdateSupport(): Promise<UpdateSupport> {
  if (!isTauriDesktop()) return 'browser';
  return (await isPortableBuild()) ? 'portable' : 'supported';
}

/**
 * Asks the manifest for a release newer than this one.
 *
 * Returns null when there is nothing to install, including the cases where this copy cannot
 * install anything (browser preview, portable edition). Transport failures throw, so the
 * caller decides whether to stay quiet or show the reason.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if ((await getUpdateSupport()) !== 'supported') return null;
  return check({ timeout: CHECK_TIMEOUT_MS });
}

/** The tag page for a version, for the "view release" links. */
export function releasePageUrl(version: string): string {
  const tag = version.trim().startsWith('v') ? version.trim() : `v${version.trim()}`;
  return `${RELEASES_PAGE_URL}/tag/${tag}`;
}

/**
 * Turns whatever the updater threw into one readable line. The plugin nests the useful part
 * (a TLS failure, a 404 on the manifest) inside `cause` or a plain object, and a bare
 * "unknown error" in the dialog would hide exactly what the user needs to report.
 */
export function formatUpdaterError(error: unknown): string {
  if (error == null) return 'Unknown error';

  if (typeof error === 'string') {
    return error.trim() || 'Unknown error';
  }

  if (error instanceof Error) {
    const parts = [error.message?.trim()].filter(Boolean) as string[];
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause != null) {
      const nested = formatUpdaterError(cause);
      if (nested && nested !== parts[0]) parts.push(nested);
    }
    return parts.join(' · ') || 'Unknown error';
  }

  if (typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const candidates = [value.message, value.error, value.msg, value.reason]
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(entry => entry.trim());

    if (candidates.length > 0) {
      const nested = value.cause != null ? formatUpdaterError(value.cause) : '';
      if (nested && !candidates.includes(nested)) return `${candidates[0]} · ${nested}`;
      return candidates[0];
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

/** True when the failure looks like a transport problem, where retrying later is the answer. */
export function isUpdaterNetworkError(message: string): boolean {
  return /fetch|network|connect|timeout|timed out|dns|tls|certificate|sending request|request for url|connection reset|unreachable|name resolution|502|503/i.test(
    message,
  );
}

/**
 * The manifest carries the tag message as its notes, which is already plain text. This only
 * removes what a markdown body can drag along (HTML comments, a stray logo paragraph) and
 * collapses the blank lines a stripped section leaves behind.
 */
export function sanitizeReleaseNotes(body: string | null | undefined): string {
  if (!body) return '';
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<p\s+align=["']center["'][\s\S]*?<\/p>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
