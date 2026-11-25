const FILTER_HISTORY_STORAGE_KEY = 'cyberfiles_pane_filter_history_v1';
const FILTER_HISTORY_CHANGE_EVENT = 'cyberfiles-filter-history-changed';
const FILTER_HISTORY_LIMIT = 15;
const FILTER_HISTORY_QUERY_LIMIT = 200;

function normalizeFilterHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const history: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const query = value.trim();
    const key = query.toLowerCase();
    if (!query || query.length > FILTER_HISTORY_QUERY_LIMIT || seen.has(key)) continue;
    seen.add(key);
    history.push(query);
    if (history.length === FILTER_HISTORY_LIMIT) break;
  }
  return history;
}

function persistFilterHistory(history: string[]): void {
  try {
    localStorage.setItem(FILTER_HISTORY_STORAGE_KEY, JSON.stringify(history));
    window.dispatchEvent(new Event(FILTER_HISTORY_CHANGE_EVENT));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function readFilterHistory(): string[] {
  try {
    const stored = localStorage.getItem(FILTER_HISTORY_STORAGE_KEY);
    if (!stored) return [];
    return normalizeFilterHistory(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function addFilterHistoryEntry(value: string): string[] {
  const current = readFilterHistory();
  const query = value.trim();
  if (!query || query.length > FILTER_HISTORY_QUERY_LIMIT) return current;
  const key = query.toLowerCase();
  const next = [query, ...current.filter(entry => entry.toLowerCase() !== key)].slice(0, FILTER_HISTORY_LIMIT);
  if (next.length === current.length && next.every((entry, index) => entry === current[index])) {
    return current;
  }
  persistFilterHistory(next);
  return next;
}

export function removeFilterHistoryEntry(value: string): string[] {
  const key = value.trim().toLowerCase();
  const current = readFilterHistory();
  const next = current.filter(entry => entry.toLowerCase() !== key);
  if (next.length === current.length) return current;
  persistFilterHistory(next);
  return next;
}

export function clearFilterHistory(): string[] {
  persistFilterHistory([]);
  return [];
}

export function subscribeFilterHistory(listener: (history: string[]) => void): () => void {
  const handleSync = () => listener(readFilterHistory());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === FILTER_HISTORY_STORAGE_KEY) {
      listener(readFilterHistory());
    }
  };
  window.addEventListener(FILTER_HISTORY_CHANGE_EVENT, handleSync);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(FILTER_HISTORY_CHANGE_EVENT, handleSync);
    window.removeEventListener('storage', handleStorage);
  };
}
