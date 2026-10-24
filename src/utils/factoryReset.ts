/* Every preference this app owns is written under this prefix, so the reset sweeps by prefix
   instead of by an explicit key list: a setting added tomorrow is reset tomorrow, not the day
   someone remembers to add it here. */
const PREFERENCE_PREFIX = 'cyberfiles_';

/* The three keys that are not preferences. The migration flag is a one-shot that must not run
   again, the session id is bookkeeping for the current launch, and the onboarding flag records
   that the tour was already seen — replaying it is not a factory reset. */
const PRESERVED_KEYS = new Set([
  'cyberfiles_onboarding_complete',
  'cyberfiles_startup_session_v1',
  'cyberfiles_date_format_system_default_migrated_v1',
]);

/* Removes every stored preference and returns how many keys went. The caller reloads the
   window afterwards: each preference is read once on mount, so a reload is what makes the
   defaults take effect everywhere at once. */
export function resetLocalPreferences(): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(PREFERENCE_PREFIX) && !PRESERVED_KEYS.has(key)) keys.push(key);
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
      removed += 1;
    }
  } catch {
    // Storage unavailable: nothing was stored, so there is nothing to clear.
  }
  return removed;
}
