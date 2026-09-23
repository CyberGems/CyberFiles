import assert from 'node:assert/strict';
import test from 'node:test';
import { FileItem } from '../types';
import {
  applyBatchRenamePreview,
  getChildItems,
  getFileExtension,
  getParentPath,
  getRootItems,
  getUniqueName,
  isMediaPreviewPath,
  isWindowsDriveRoot,
  isSameOrDescendantPath,
  isValidFileName,
  rewritePathPrefix,
} from './fileSystem';

const item = (id: string, path: string, isFolder = false): FileItem => ({
  id,
  name: path.split('\\').at(-1) || path,
  path,
  isFolder,
  type: isFolder ? 'folder' : 'text',
  size: 0,
  modifiedDate: '2026-09-22 00:00',
  extension: isFolder ? '' : 'txt',
});

test('matches a path only inside the requested Windows tree', () => {
  assert.equal(isSameOrDescendantPath('C:\\Files\\Reports\\today.txt', 'C:\\Files'), true);
  assert.equal(isSameOrDescendantPath('C:\\Files2\\today.txt', 'C:\\Files'), false);
});

test('normalizes repeated separators at drive roots and reaches the virtual home', () => {
  assert.equal(isWindowsDriveRoot('C:\\\\'), true);
  assert.equal(isWindowsDriveRoot('D:/'), true);
  assert.equal(isWindowsDriveRoot('C:\\Users'), false);
  assert.equal(getParentPath('C:\\Users'), 'C:\\');
  assert.equal(getParentPath('C:\\\\'), 'C:\\');
});

test('recognizes common localized media folders for their thumbnail view default', () => {
  assert.equal(isMediaPreviewPath('C:\\Users\\Cali\\Pictures'), true);
  assert.equal(isMediaPreviewPath('C:\\Users\\Cali\\Imágenes'), true);
  assert.equal(isMediaPreviewPath('D:\\Media\\Música'), true);
  assert.equal(isMediaPreviewPath('D:\\Media\\Videos'), true);
  assert.equal(isMediaPreviewPath('D:\\Media\\Projects'), false);
});

test('does not mistake a date suffix for a file extension', () => {
  assert.equal(getFileExtension('app.log.2026-09-07'), 'log');
  assert.equal(getFileExtension('backup.2026-09-07'), '');
  assert.equal(getFileExtension('backup.2026-13-40'), '2026-13-40');
  assert.equal(getFileExtension('report.final.pdf'), 'pdf');
  assert.equal(getUniqueName('app.log.2026-09-07', ['app.log.2026-09-07']), 'app.log (1).2026-09-07');

  const datedLog = { ...item('dated-log', 'C:\\Files\\app.log.2026-09-07'), extension: 'log' };
  const renameRule = {
    mode: 'prefix_suffix' as const,
    findText: '', replaceText: '', useRegex: false, prefix: 'archive-', suffix: '',
    startNumber: 1, numberStep: 1, paddingDigits: 1,
    caseType: 'lowercase' as const, applyToExtension: false,
  };
  assert.equal(applyBatchRenamePreview([datedLog], renameRule)[0].renamed, 'archive-app.log.2026-09-07');
});

test('keeps only selected tree roots and preserves direct children', () => {
  const files = [
    item('folder', 'C:\\Files\\Project', true),
    item('child', 'C:\\Files\\Project\\notes.txt'),
    item('other', 'C:\\Files\\other.txt'),
  ];

  assert.deepEqual(getRootItems(files, ['folder', 'child']).map(file => file.id), ['folder']);
  assert.deepEqual(getChildItems(files, 'C:\\Files\\Project').map(file => file.id), ['child']);
});

test('generates safe non-conflicting names and rewrites child paths', () => {
  assert.equal(getUniqueName('report.txt', ['Report.txt', 'report (1).txt']), 'report (2).txt');
  assert.equal(rewritePathPrefix('C:\\Files\\Old\\child.txt', 'C:\\Files\\Old', 'D:\\Archive\\New'), 'D:\\Archive\\New\\child.txt');
  assert.equal(isValidFileName('valid name.txt'), true);
  assert.equal(isValidFileName('invalid:name.txt'), false);
});
