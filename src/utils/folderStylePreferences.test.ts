import assert from 'node:assert/strict';
import test from 'node:test';
import { registerKnownMediaFolderPaths } from './fileSystem';
import { folderStylePathKey, folderStyleToCarry, readSavedFolderStyles, resolveAutoViewMode, resolveFolderStyle, savedFolderStyleForPath, writeSavedFolderStyles, type FolderStylePreference } from './folderStylePreferences';

const defaultStyle: FolderStylePreference = { viewMode: 'details', sortField: 'name', sortOrder: 'asc', groupBy: 'none' };
const downloadsStyle: FolderStylePreference = { viewMode: 'details', sortField: 'modifiedDate', sortOrder: 'desc', groupBy: 'modifiedDate' };
const inheritedStyle: FolderStylePreference = { viewMode: 'compact', sortField: 'type', sortOrder: 'asc', groupBy: 'none' };
const downloadsPath = 'C:/Users/Carlos/Downloads';
const styles = { [folderStylePathKey(downloadsPath)]: downloadsStyle };

test('saved folder style wins only for its exact normalized path', () => {
  assert.equal(folderStylePathKey('c:/USERS/Carlos/Downloads/'), folderStylePathKey(downloadsPath));
  assert.deepEqual(resolveFolderStyle(downloadsPath, inheritedStyle, styles), downloadsStyle);
  assert.deepEqual(resolveFolderStyle(`${downloadsPath}\\Other`, inheritedStyle, styles), inheritedStyle);
  assert.deepEqual(resolveFolderStyle('C:/Users/Carlos/Pictures', inheritedStyle, styles).viewMode, 'icons');
});

test('leaving a saved folder restores the style brought into it', () => {
  assert.deepEqual(folderStyleToCarry(downloadsPath, downloadsStyle, inheritedStyle, true, styles, defaultStyle), inheritedStyle);
  assert.deepEqual(folderStyleToCarry(downloadsPath, downloadsStyle, inheritedStyle, false, styles, defaultStyle), defaultStyle);
  assert.deepEqual(folderStyleToCarry('C:/Other', inheritedStyle, defaultStyle, true, styles, defaultStyle), inheritedStyle);
});

test('registered known media folders default to icons, saved styles still win', () => {
  const renamedPictures = 'C:/Users/Carlos/Mis fotos';
  const savedMediaStyle: FolderStylePreference = { viewMode: 'details', sortField: 'size', sortOrder: 'desc', groupBy: 'type' };
  registerKnownMediaFolderPaths([renamedPictures, '']);
  try {
    assert.equal(resolveFolderStyle(renamedPictures, inheritedStyle, {}).viewMode, 'icons');
    assert.equal(resolveFolderStyle('c:/users/carlos/MIS FOTOS/', inheritedStyle, {}).viewMode, 'icons');
    assert.equal(resolveFolderStyle(`${renamedPictures}/2020`, inheritedStyle, {}).viewMode, 'compact');
    assert.deepEqual(
      resolveFolderStyle(renamedPictures, inheritedStyle, { [folderStylePathKey(renamedPictures)]: savedMediaStyle }),
      savedMediaStyle,
    );
  } finally {
    registerKnownMediaFolderPaths([]);
  }
  assert.equal(resolveFolderStyle(renamedPictures, inheritedStyle, {}).viewMode, 'compact');
});

test('Explorer saved view mode drives the automatic default view', () => {
  const entry = (type: 'image' | 'audio' | 'video' | 'text' | 'folder') => ({ type });
  assert.equal(resolveAutoViewMode('Pictures', []), 'icons');
  assert.equal(resolveAutoViewMode('videos', []), 'icons');
  assert.equal(resolveAutoViewMode('  Music  ', []), 'icons');
  assert.equal(resolveAutoViewMode('Documents', []), 'details');
  assert.equal(resolveAutoViewMode('NotSpecified', []), 'details');
  assert.equal(resolveAutoViewMode(null, []), null);
  assert.equal(resolveAutoViewMode(undefined, []), null);
  // Mostly media content flips to icons; folders never count as media.
  const mostlyMedia = Array.from({ length: 10 }, (_, i) => entry(i < 7 ? 'image' : 'text'));
  assert.equal(resolveAutoViewMode(null, mostlyMedia), 'icons');
  // Exactly 60% media is not "mostly media" (Files uses a strict >60%).
  const atThreshold = Array.from({ length: 10 }, (_, i) => entry(i < 6 ? 'audio' : 'text'));
  assert.equal(resolveAutoViewMode(null, atThreshold), 'details');
  const mixedWithFolders = [...Array.from({ length: 5 }, () => entry('folder')), ...Array.from({ length: 5 }, () => entry('text'))];
  assert.equal(resolveAutoViewMode(null, mixedWithFolders), 'details');
  const empty: Array<{ type: 'image' }> = [];
  assert.equal(resolveAutoViewMode(null, empty), null);
});

test('folder styles persist by path and invalid entries are ignored', () => {
  const values = new Map<string, string>();
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  } as unknown as Window & typeof globalThis;
  try {
    writeSavedFolderStyles(styles);
    assert.deepEqual(readSavedFolderStyles(), styles);
    writeSavedFolderStyles({ [folderStylePathKey(downloadsPath)]: { ...downloadsStyle, displayPath: downloadsPath } });
    const restored = readSavedFolderStyles();
    assert.equal(restored[folderStylePathKey(downloadsPath)].displayPath, 'C:\\Users\\Carlos\\Downloads');
    assert.deepEqual(resolveFolderStyle(downloadsPath, defaultStyle, restored), downloadsStyle);
    const zoomedStyle = { ...downloadsStyle, iconZoom: 'xlarge' as const };
    writeSavedFolderStyles({ [folderStylePathKey(downloadsPath)]: zoomedStyle });
    assert.deepEqual(savedFolderStyleForPath(downloadsPath, readSavedFolderStyles()), zoomedStyle);
    values.set('cyberfiles_saved_folder_styles_v1', JSON.stringify({ ...styles, 'C:/Invalid': { ...downloadsStyle, groupBy: 'unknown', iconZoom: 'huge' } }));
    assert.deepEqual(readSavedFolderStyles(), styles);
  } finally {
    globalThis.window = originalWindow;
  }
});
