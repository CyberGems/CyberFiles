import { FileItem, SearchMatch } from '../types';
import { isSameOrDescendantPath } from './fileSystem';

export interface SearchOptions {
  query: string;
  searchContent: boolean;
  scopePath?: string | null; // e.g. "C:\\CyberGems" or null for all
  sizeFilter?: 'all' | 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  typeFilter?: 'all' | 'code' | 'text' | 'image' | 'audio' | 'video' | 'executable' | 'folder' | 'document';
  caseSensitive?: boolean;
  useRegex?: boolean;
  extensionFilter?: string; // e.g. "rs, ts, tsx"
}

export interface SearchResult {
  matches: SearchMatch[];
  totalScanned: number;
  durationMs: number;
}

export function searchFileSystem(
  files: FileItem[],
  options: SearchOptions
): SearchResult {
  const startTime = performance.now();
  const {
    query,
    searchContent = true,
    scopePath = null,
    sizeFilter = 'all',
    typeFilter = 'all',
    caseSensitive = false,
    useRegex = false,
    extensionFilter = '',
  } = options;

  const trimmedQuery = query.trim();
  const normalizedQuery = caseSensitive ? trimmedQuery : trimmedQuery.toLowerCase();

  // Parse regex if needed
  let regex: RegExp | null = null;
  if (useRegex && trimmedQuery) {
    try {
      regex = new RegExp(trimmedQuery, caseSensitive ? '' : 'i');
    } catch {
      // Fallback to literal search if regex is invalid
      regex = null;
    }
  }

  // Parse extension filter
  const targetExtensions = extensionFilter
    ? extensionFilter
        .split(',')
        .map(e => e.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean)
    : [];

  const matches: SearchMatch[] = [];
  let totalScanned = 0;

  for (const file of files) {
    totalScanned++;

    // 1. Scope filter
    if (scopePath && !isSameOrDescendantPath(file.path, scopePath)) {
      continue;
    }

    // 2. Type filter
    if (typeFilter !== 'all') {
      if (typeFilter === 'folder' && !file.isFolder) continue;
      if (typeFilter !== 'folder' && (file.isFolder || file.type !== typeFilter)) continue;
    }

    // 3. Extension filter
    if (targetExtensions.length > 0) {
      const ext = file.extension.toLowerCase();
      if (!targetExtensions.includes(ext)) {
        continue;
      }
    }

    // 4. Size filter
    if (sizeFilter !== 'all') {
      const sz = file.size;
      switch (sizeFilter) {
        case 'tiny': // < 10 KB
          if (sz >= 10 * 1024) continue;
          break;
        case 'small': // 10 KB - 100 KB
          if (sz < 10 * 1024 || sz >= 100 * 1024) continue;
          break;
        case 'medium': // 100 KB - 5 MB
          if (sz < 100 * 1024 || sz >= 5 * 1024 * 1024) continue;
          break;
        case 'large': // 5 MB - 50 MB
          if (sz < 5 * 1024 * 1024 || sz >= 50 * 1024 * 1024) continue;
          break;
        case 'huge': // > 50 MB
          if (sz < 50 * 1024 * 1024) continue;
          break;
      }
    }

    // If query is empty, every file passing the filters matches
    if (!trimmedQuery) {
      matches.push({
        file,
        matchType: 'name',
      });
      continue;
    }

    // 5. Match by Name / Path
    const targetName = caseSensitive ? file.name : file.name.toLowerCase();
    const targetPath = caseSensitive ? file.path : file.path.toLowerCase();

    let nameMatched = false;
    let pathMatched = false;

    if (regex) {
      nameMatched = regex.test(file.name);
      pathMatched = !nameMatched && regex.test(file.path);
    } else {
      nameMatched = targetName.includes(normalizedQuery);
      pathMatched = !nameMatched && targetPath.includes(normalizedQuery);
    }

    if (nameMatched) {
      matches.push({
        file,
        matchType: 'name',
      });
      continue;
    }

    if (pathMatched) {
      matches.push({
        file,
        matchType: 'path',
      });
      continue;
    }

    // 6. Match by Content (Full-Text Search)
    if (searchContent && !file.isFolder && file.contentPreview) {
      const content = file.contentPreview;
      let matchedLine: string | undefined;
      let lineNum: number | undefined;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const testLine = caseSensitive ? line : line.toLowerCase();
        const isMatch = regex ? regex.test(line) : testLine.includes(normalizedQuery);

        if (isMatch) {
          matchedLine = line.trim();
          lineNum = i + 1;
          break;
        }
      }

      if (matchedLine) {
        matches.push({
          file,
          matchType: 'content',
          contentSnippet: matchedLine,
          matchedLineNumber: lineNum,
        });
      }
    }
  }

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    matches,
    totalScanned,
    durationMs,
  };
}
