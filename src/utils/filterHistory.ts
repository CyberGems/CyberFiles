const FILTER_HISTORY_STORAGE_KEY = 'cyberfiles_pane_filter_history_v1';
const FILTER_PINS_STORAGE_KEY = 'cyberfiles_pane_filter_pins_v1';
const FILTER_HISTORY_CHANGE_EVENT = 'cyberfiles-filter-history-changed';
const FILTER_HISTORY_LIMIT = 15;
const FILTER_PINS_LIMIT = 10;
const FILTER_HISTORY_QUERY_LIMIT = 200;

function normalizeFilterList(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const query = value.trim();
    const key = query.toLowerCase();
    if (!query || query.length > FILTER_HISTORY_QUERY_LIMIT || seen.has(key)) continue;
    seen.add(key);
    list.push(query);
    if (list.length === limit) break;
  }
  return list;
}

function readStoredList(storageKey: string, limit: number): string[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    return normalizeFilterList(JSON.parse(stored), limit);
  } catch {
    return [];
  }
}

function persistStoredList(storageKey: string, items: string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new Event(FILTER_HISTORY_CHANGE_EVENT));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function readFilterHistory(): string[] {
  return readStoredList(FILTER_HISTORY_STORAGE_KEY, FILTER_HISTORY_LIMIT);
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
  persistStoredList(FILTER_HISTORY_STORAGE_KEY, next);
  return next;
}

export function removeFilterHistoryEntry(value: string): string[] {
  const key = value.trim().toLowerCase();
  const current = readFilterHistory();
  const next = current.filter(entry => entry.toLowerCase() !== key);
  if (next.length === current.length) return current;
  persistStoredList(FILTER_HISTORY_STORAGE_KEY, next);
  return next;
}

export function clearFilterHistory(): string[] {
  persistStoredList(FILTER_HISTORY_STORAGE_KEY, []);
  return [];
}

export function readPinnedFilters(): string[] {
  return readStoredList(FILTER_PINS_STORAGE_KEY, FILTER_PINS_LIMIT);
}

export function togglePinnedFilter(value: string): string[] {
  const query = value.trim();
  if (!query || query.length > FILTER_HISTORY_QUERY_LIMIT) return readPinnedFilters();
  const key = query.toLowerCase();
  const current = readPinnedFilters();
  const exists = current.some(entry => entry.toLowerCase() === key);
  const next = exists
    ? current.filter(entry => entry.toLowerCase() !== key)
    : [query, ...current].slice(0, FILTER_PINS_LIMIT);
  persistStoredList(FILTER_PINS_STORAGE_KEY, next);
  return next;
}

export function removePinnedFilter(value: string): string[] {
  const key = value.trim().toLowerCase();
  const current = readPinnedFilters();
  const next = current.filter(entry => entry.toLowerCase() !== key);
  if (next.length === current.length) return current;
  persistStoredList(FILTER_PINS_STORAGE_KEY, next);
  return next;
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

export function subscribeFilterPins(listener: (pins: string[]) => void): () => void {
  const handleSync = () => listener(readPinnedFilters());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === FILTER_PINS_STORAGE_KEY) {
      listener(readPinnedFilters());
    }
  };
  window.addEventListener(FILTER_HISTORY_CHANGE_EVENT, handleSync);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(FILTER_HISTORY_CHANGE_EVENT, handleSync);
    window.removeEventListener('storage', handleStorage);
  };
}
