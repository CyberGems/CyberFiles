import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canDropExternalPathsOnDestination,
  filterOutboundDraggablePaths,
  getExternalDragLeafName,
  getVolumeTransferKey,
  isValidDropDestinationPath,
  normalizeExternalDroppedPaths,
  resolveExternalDropOperation,
} from './externalDrop';

test('identifies valid vs non-writable drop destinations', () => {
  assert.equal(isValidDropDestinationPath('C:\\'), true);
  assert.equal(isValidDropDestinationPath('D:\\Projects\\Demo'), true);
  assert.equal(isValidDropDestinationPath('\\\\NAS01\\Media'), true);
  assert.equal(isValidDropDestinationPath('\\\\NAS01\\Media\\Photos'), true);
  assert.equal(isValidDropDestinationPath('mtp:\\Carlos P30\\Internal storage'), true);
  assert.equal(isValidDropDestinationPath('mtp:\\Carlos P30\\Internal storage\\DCIM'), true);

  assert.equal(isValidDropDestinationPath(''), false);
  assert.equal(isValidDropDestinationPath('::cyberfiles-this-pc::'), false);
  assert.equal(isValidDropDestinationPath('::cyberfiles-recycle-bin::'), false);
  assert.equal(isValidDropDestinationPath('::cyberfiles-recent::'), false);
  assert.equal(isValidDropDestinationPath('::cyberfiles-network::'), false);
  assert.equal(isValidDropDestinationPath('\\\\NAS01'), false);
  assert.equal(isValidDropDestinationPath('mtp:\\Carlos P30'), false);
  assert.equal(isValidDropDestinationPath('mtp:\\'), false);
});

test('strips Win32 verbatim prefixes, deduplicates, and prunes nested descendants', () => {
  const normalized = normalizeExternalDroppedPaths([
    '\\\\?\\C:\\Users\\Carlos\\Desktop\\Folder',
    'C:\\Users\\Carlos\\Desktop\\Folder\\nested.txt',
    '  \\\\?\\UNC\\NAS01\\Share\\photo.jpg  ',
    '\\\\nas01\\share\\photo.jpg',
    '::cyberfiles-this-pc::',
    '\\\\NAS01',
    '',
  ]);

  assert.deepEqual(normalized, [
    'C:\\Users\\Carlos\\Desktop\\Folder',
    '\\\\NAS01\\Share\\photo.jpg',
  ]);
});

test('resolves volume keys and Explorer copy vs move defaults with modifiers', () => {
  assert.equal(getVolumeTransferKey('C:\\Users\\Carlos\\Desktop\\a.txt'), 'drive:c');
  assert.equal(getVolumeTransferKey('\\\\NAS01\\Media\\2026\\a.jpg'), 'unc:\\\\nas01\\media');
  assert.equal(getVolumeTransferKey('mtp:\\Carlos P30\\Internal storage\\DCIM'), 'portable:carlos p30');

  // Same drive moves by default, Ctrl forces copy
  assert.equal(
    resolveExternalDropOperation(['C:\\Users\\Carlos\\Desktop\\a.txt'], 'C:\\Temp', { ctrlKey: false, shiftKey: false }),
    'move',
  );
  assert.equal(
    resolveExternalDropOperation(['C:\\Users\\Carlos\\Desktop\\a.txt'], 'C:\\Temp', { ctrlKey: true, shiftKey: false }),
    'copy',
  );

  // Cross-drive copies by default, Shift forces move
  assert.equal(
    resolveExternalDropOperation(['C:\\Users\\Carlos\\Desktop\\a.txt'], 'D:\\Backup', { ctrlKey: false, shiftKey: false }),
    'copy',
  );
  assert.equal(
    resolveExternalDropOperation(['C:\\Users\\Carlos\\Desktop\\a.txt'], 'D:\\Backup', { ctrlKey: false, shiftKey: true }),
    'move',
  );

  // Portable devices default to copy, Shift can override to move
  assert.equal(
    resolveExternalDropOperation(['C:\\Users\\Carlos\\Desktop\\a.txt'], 'mtp:\\Carlos P30\\Internal storage\\Download', { ctrlKey: false, shiftKey: false }),
    'copy',
  );
  assert.equal(
    resolveExternalDropOperation(['C:\\Users\\Carlos\\Desktop\\a.txt'], 'mtp:\\Carlos P30\\Internal storage\\Download', { ctrlKey: false, shiftKey: true }),
    'move',
  );

  // Different UNC shares default to copy
  assert.equal(
    resolveExternalDropOperation(['\\\\NAS01\\Inbox\\a.txt'], '\\\\NAS01\\Archive', { ctrlKey: false, shiftKey: false }),
    'copy',
  );
});

test('validates destination guards for self, same folder, and portable device root', () => {
  assert.deepEqual(
    canDropExternalPathsOnDestination(['C:\\Users\\Carlos\\Desktop\\Notes'], 'C:\\Users\\Carlos\\Desktop\\Notes\\Sub', 'move'),
    { allowed: false, reason: 'self-or-descendant' },
  );

  assert.deepEqual(
    canDropExternalPathsOnDestination(['C:\\Users\\Carlos\\Desktop\\file.txt'], 'mtp:\\Carlos P30', 'copy'),
    { allowed: false, reason: 'portable-root' },
  );

  assert.deepEqual(
    canDropExternalPathsOnDestination(['C:\\Users\\Carlos\\Desktop\\file.txt'], 'C:\\Users\\Carlos\\Desktop', 'move'),
    { allowed: false, reason: 'same-folder' },
  );

  assert.deepEqual(
    canDropExternalPathsOnDestination(['C:\\Users\\Carlos\\Desktop\\file.txt'], 'C:\\Users\\Carlos\\Desktop', 'copy'),
    { allowed: true },
  );

  assert.equal(getExternalDragLeafName('C:\\Users\\Carlos\\Desktop\\note.txt'), 'note.txt');
  assert.equal(getExternalDragLeafName('C:\\'), 'C:');
});

test('keeps portable staging cache drags as copy and filters outbound draggable paths', () => {
  assert.equal(
    resolveExternalDropOperation(
      ['C:\\Users\\Carlos\\AppData\\Local\\Temp\\CyberFiles\\portable-cache\\abc123\\photo.jpg'],
      'C:\\Users\\Carlos\\Desktop',
      { ctrlKey: false, shiftKey: true },
    ),
    'copy',
  );

  assert.deepEqual(
    filterOutboundDraggablePaths([
      { path: 'C:\\' },
      { path: '::cyberfiles-this-pc::' },
      { path: '\\\\NAS01' },
      { path: 'mtp:\\Carlos P30' },
      { path: 'mtp:\\Carlos P30\\Internal storage' },
      { path: 'mtp:\\Carlos P30\\Internal storage\\DCIM\\Camera\\IMG_01.jpg' },
      { path: 'C:\\Projects\\Demo' },
      { path: 'C:\\Projects\\Demo\\nested.txt' },
      { path: 'c:\\projects\\demo' },
    ]),
    [
      'mtp:\\Carlos P30\\Internal storage\\DCIM\\Camera\\IMG_01.jpg',
      'C:\\Projects\\Demo',
    ],
  );
});
