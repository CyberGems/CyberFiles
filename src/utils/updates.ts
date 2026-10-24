/**
 * Update checks against the releases the release workflow publishes on GitHub.
 *
 * CyberFiles has no bundled updater, so a check can only report: the About modal shows the
 * result and the automatic check raises a toast pointing at the changelog. Everything here
 * fails quietly on purpose: being offline or rate limited must never interrupt the user.
 */

export const RELEASES_PAGE_URL = 'https://github.com/CyberGems/CyberFiles/releases';

const LATEST_RELEASE_API = 'https://api.github.com/repos/CyberGems/CyberFiles/releases/latest';
const AUTO_CHECK_KEY = 'cyberfiles_auto_check_updates_v1';
const NOTIFIED_VERSION_KEY = 'cyberfiles_update_notified_v1';
const REQUEST_TIMEOUT_MS = 10_000;

/** The About modal promises "on start and every six hours"; this is that six hours. */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface LatestRelease {
  version: string;
  url: string;
  name: string;
  publishedAt: string;
}

/** On by default, like the rest of the suite. Only an explicit "false" turns it off. */
export function getAutoCheckUpdates(): boolean {
  try {
    return localStorage.getItem(AUTO_CHECK_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAutoCheckUpdates(value: boolean): void {
  try {
    localStorage.setItem(AUTO_CHECK_KEY, value ? 'true' : 'false');
  } catch {
    // A preference that cannot be stored is not worth interrupting the user for.
  }
}

/** The version already announced by toast, so the same release is not announced twice. */
export function getNotifiedVersion(): string | null {
  try {
    return localStorage.getItem(NOTIFIED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setNotifiedVersion(version: string): void {
  try {
    localStorage.setItem(NOTIFIED_VERSION_KEY, version);
  } catch {
    // Ignore storage failures.
  }
}

function versionParts(version: string): number[] {
  const cleaned = version.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '';
  const parts = cleaned.split('.').map(part => Number.parseInt(part, 10));
  return parts.map(part => (Number.isFinite(part) ? part : 0));
}

/** True when `candidate` is a higher release than `current` (1.10.0 > 1.9.0). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    const payload = await response.json() as { tag_name?: string; html_url?: string; name?: string; published_at?: string; draft?: boolean };
    if (payload.draft) throw new Error('The latest release is still a draft');
    const version = payload.tag_name?.trim();
    if (!version) throw new Error('The release has no tag');
    return {
      version,
      url: payload.html_url?.trim() || RELEASES_PAGE_URL,
      name: payload.name?.trim() || version,
      publishedAt: payload.published_at ?? '',
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
