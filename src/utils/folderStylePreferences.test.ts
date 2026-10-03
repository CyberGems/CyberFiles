import assert from 'node:assert/strict';
import test from 'node:test';
import { folderStylePathKey, folderStyleToCarry, readSavedFolderStyles, resolveFolderStyle, writeSavedFolderStyles, type FolderStylePreference } from './folderStylePreferences';

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
    values.set('cyberfiles_saved_folder_styles_v1', JSON.stringify({ ...styles, 'C:/Invalid': { ...downloadsStyle, groupBy: 'unknown' } }));
    assert.deepEqual(readSavedFolderStyles(), styles);
  } finally {
    globalThis.window = originalWindow;
  }
});
