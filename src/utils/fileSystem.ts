import { BatchRenameRule, FileItem, FileType, SortField, SortOrder } from '../types';

/**
 * Windows path helpers live in one place so the UI and the future native
 * adapter use the same rules for roots, descendants and renames.
 */
export function normalizeWindowsPath(path: string): string {
  const normalized = path.replace(/\//g, '\\').trim();
  const driveRoot = normalized.match(/^([a-zA-Z]:)\\*$/);
  if (driveRoot) return `${driveRoot[1]}\\`;
  return normalized.replace(/\\+$/, '') || normalized;
}

export function isWindowsDriveRoot(path: string): boolean {
  return /^[a-zA-Z]:\\$/.test(normalizeWindowsPath(path));
}

const MEDIA_PREVIEW_FOLDER_NAMES = new Set([
  'picture', 'pictures', 'image', 'images', 'photo', 'photos', 'foto', 'fotos', 'imagen', 'imagenes', 'mis imagenes',
  'music', 'musica', 'my music', 'mi musica',
  'video', 'videos', 'my videos', 'mis videos',
]);

export function isMediaPreviewPath(path: string): boolean {
  const normalized = normalizeWindowsPath(path);
  const folderName = normalized.split('\\').filter(Boolean).pop() || '';
  const key = folderName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return MEDIA_PREVIEW_FOLDER_NAMES.has(key);
}

export function isSameOrDescendantPath(candidatePath: string, rootPath: string): boolean {
  const candidate = normalizeWindowsPath(candidatePath).toLowerCase().replace(/\\$/, '');
  const root = normalizeWindowsPath(rootPath).toLowerCase().replace(/\\$/, '');
  return candidate === root || candidate.startsWith(`${root}\\`);
}

export function joinWindowsPath(parentPath: string, childName: string): string {
  return `${normalizeWindowsPath(parentPath).replace(/\\$/, '')}\\${childName}`;
}

export function rewritePathPrefix(path: string, oldRoot: string, newRoot: string): string {
  const normalizedPath = normalizeWindowsPath(path);
  const normalizedOldRoot = normalizeWindowsPath(oldRoot);
  if (normalizedPath.toLowerCase() === normalizedOldRoot.toLowerCase()) return normalizeWindowsPath(newRoot);

  const suffix = normalizedPath.slice(normalizedOldRoot.length).replace(/^\\+/, '');
  return suffix ? joinWindowsPath(newRoot, suffix) : normalizeWindowsPath(newRoot);
}

export function getRootItems(items: FileItem[], selectedIds: string[]): FileItem[] {
  const selected = items.filter(item => selectedIds.includes(item.id));
  return selected.filter(item =>
    !selected.some(other =>
      other.id !== item.id &&
      other.isFolder &&
      isSameOrDescendantPath(item.path, other.path)
    )
  );
}

export function getItemsInTree(items: FileItem[], rootPath: string): FileItem[] {
  return items.filter(item => isSameOrDescendantPath(item.path, rootPath));
}

export function isValidFileName(name: string): boolean {
  const trimmed = name.trim();
  return Boolean(
    trimmed &&
    trimmed !== '.' &&
    trimmed !== '..' &&
    !/[\\/:*?"<>|]/.test(trimmed) &&
    !/[. ]$/.test(trimmed)
  );
}

export function getUniqueName(desiredName: string, existingNames: Iterable<string>): string {
  const normalizedNames = new Set(Array.from(existingNames, name => name.toLowerCase()));
  if (!normalizedNames.has(desiredName.toLowerCase())) return desiredName;

  const extension = getFileExtension(desiredName);
  const suffix = extension ? `.${extension}` : '';
  const baseName = suffix ? desiredName.slice(0, -suffix.length) : desiredName;
  let index = 1;
  let candidate = `${baseName} (${index})${suffix}`;
  while (normalizedNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${baseName} (${index})${suffix}`;
  }
  return candidate;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1));
  return `${val} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1 && parts[0] !== '') {
    return parts.pop()?.toLowerCase() || '';
  }
  return '';
}

export function detectFileType(name: string, isFolder: boolean): FileType {
  if (isFolder) return 'folder';
  const ext = getFileExtension(name);
  
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'bmp':
    case 'ico':
      return 'image';
    case 'rs':
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'json':
    case 'toml':
    case 'html':
    case 'css':
    case 'py':
    case 'cpp':
    case 'c':
    case 'h':
    case 'cs':
    case 'sql':
    case 'yaml':
    case 'yml':
      return 'code';
    case 'txt':
    case 'md':
    case 'log':
    case 'ini':
    case 'cfg':
      return 'text';
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg':
    case 'aac':
      return 'audio';
    case 'mp4':
    case 'mkv':
    case 'mov':
    case 'avi':
    case 'webm':
      return 'video';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return 'archive';
    case 'pdf':
    case 'doc':
    case 'docx':
    case 'xls':
    case 'xlsx':
    case 'ppt':
    case 'pptx':
      return 'document';
    case 'exe':
    case 'msi':
    case 'bat':
    case 'cmd':
    case 'ps1':
      return 'executable';
    case 'bin':
    case 'dat':
    case 'iso':
    case 'sys':
    case 'dll':
      return 'binary';
    default:
      return 'unknown';
  }
}

export function getParentPath(currentPath: string): string {
  // Handle Windows paths: "C:\Users\Cali\Documents" -> "C:\Users\Cali"
  const normalizedPath = normalizeWindowsPath(currentPath);
  if (/^[a-zA-Z]:\\?$/.test(normalizedPath)) return `${normalizedPath.slice(0, 2)}\\`;

  const normalized = normalizedPath.replace(/\\+$/, '');
  const parts = normalized.split(/\\|\//);
  if (parts.length <= 1) return normalized;
  if (parts.length === 2 && /^[a-zA-Z]:$/.test(parts[0])) return `${parts[0]}\\`;
  parts.pop();
  return parts.join('\\');
}

export function getChildItems(allFiles: FileItem[], folderPath: string): FileItem[] {
  const normFolder = normalizeWindowsPath(folderPath).replace(/\\+$/, '').toLowerCase();
  
  return allFiles.filter(item => {
    // If the path equals folderPath, don't include itself
    if (item.path.toLowerCase() === normFolder) return false;
    
    // Find parent of item
    const itemParent = getParentPath(item.path).toLowerCase();
    return itemParent === normFolder;
  });
}

export function sortFiles(items: FileItem[], field: SortField, order: SortOrder): FileItem[] {
  return [...items].sort((a, b) => {
    // Folders always first unless sorting specifically, but standard is folders on top
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;

    let compare = 0;
    switch (field) {
      case 'name':
        compare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'size':
        compare = a.size - b.size;
        break;
      case 'type':
        compare = a.type.localeCompare(b.type);
        break;
      case 'modifiedDate':
        compare = a.modifiedDate.localeCompare(b.modifiedDate);
        break;
      case 'extension':
        compare = a.extension.localeCompare(b.extension);
        break;
      default:
        compare = a.name.localeCompare(b.name);
    }

    return order === 'asc' ? compare : -compare;
  });
}

export function applyBatchRenamePreview(items: FileItem[], rule: BatchRenameRule): { original: string; renamed: string; id: string }[] {
  return items.map((item, index) => {
    const ext = item.isFolder ? '' : (item.extension ? `.${item.extension}` : '');
    const baseName = item.isFolder ? item.name : (ext ? item.name.slice(0, -ext.length) : item.name);
    let newBaseName = baseName;
    let newExt = ext;

    if (rule.mode === 'replace') {
      if (rule.findText) {
        if (rule.useRegex) {
          try {
            const rx = new RegExp(rule.findText, 'g');
            newBaseName = baseName.replace(rx, rule.replaceText);
          } catch {
            newBaseName = baseName;
          }
        } else {
          newBaseName = baseName.replaceAll(rule.findText, rule.replaceText);
        }
      }
    } else if (rule.mode === 'prefix_suffix') {
      newBaseName = `${rule.prefix}${baseName}${rule.suffix}`;
    } else if (rule.mode === 'numbering') {
      const num = rule.startNumber + index * rule.numberStep;
      const padded = String(num).padStart(rule.paddingDigits, '0');
      newBaseName = `${rule.prefix}${baseName}_${padded}${rule.suffix}`;
    } else if (rule.mode === 'case') {
      switch (rule.caseType) {
        case 'lowercase':
          newBaseName = baseName.toLowerCase();
          break;
        case 'uppercase':
          newBaseName = baseName.toUpperCase();
          break;
        case 'titlecase':
          newBaseName = baseName.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
          break;
        case 'kebab':
          newBaseName = baseName.replace(/\s+/g, '-').toLowerCase();
          break;
        case 'camel':
          newBaseName = baseName
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, idx) => idx === 0 ? word.toLowerCase() : word.toUpperCase())
            .replace(/\s+/g, '');
          break;
      }
      if (rule.applyToExtension) {
        newExt = rule.caseType === 'uppercase' ? ext.toUpperCase() : ext.toLowerCase();
      }
    }

    return {
      id: item.id,
      original: item.name,
      renamed: `${newBaseName}${newExt}`,
    };
  });
}

export function formatRelativeTime(dateString: string, lang: 'es' | 'en' = 'es'): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return lang === 'es' ? 'Ahora mismo' : 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return lang === 'es' ? 'Ahora mismo' : 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return lang === 'es' ? `Hace ${diffMin} min` : `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return lang === 'es' ? `Hace ${diffHours} h` : `${diffHours} h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return lang === 'es' ? 'Ayer' : 'Yesterday';
    if (diffDays < 7) return lang === 'es' ? `Hace ${diffDays} días` : `${diffDays} days ago`;
    return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}
