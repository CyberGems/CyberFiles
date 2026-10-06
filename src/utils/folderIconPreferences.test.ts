import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFolderIconKey,
  getCustomFolderIcon,
  setCustomFolderIcon,
  type SavedFolderIcons,
  type CustomFolderIconConfig,
} from './folderIconPreferences';

test('normalizes folder paths with case and slashes', () => {
  const p1 = 'C:\\Users\\Carlos\\Projects';
  const p2 = 'c:/users/carlos/projects/';
  assert.equal(normalizeFolderIconKey(p1), normalizeFolderIconKey(p2));
});

test('retrieves custom folder icon ignoring slash style', () => {
  const config: CustomFolderIconConfig = {
    iconId: 'code',
    style: 'folder-badge',
    category: 'color',
    colorPreset: 'cyan',
  };
  const icons: SavedFolderIcons = {
    [normalizeFolderIconKey('D:\\Games\\Cyberpunk')]: config,
  };

  assert.deepEqual(getCustomFolderIcon('d:/games/cyberpunk/', icons), config);
  assert.equal(getCustomFolderIcon('D:\\Other', icons), undefined);
});

test('adds and removes custom folder icon', () => {
  const path = 'C:\\Work\\Music';
  const config: CustomFolderIconConfig = {
    iconId: 'music',
    style: 'symbol',
    category: 'color',
    colorPreset: 'rose',
  };

  const withIcon = setCustomFolderIcon(path, config, {});
  assert.deepEqual(getCustomFolderIcon(path, withIcon), config);

  const removed = setCustomFolderIcon(path, null, withIcon);
  assert.equal(getCustomFolderIcon(path, removed), undefined);
});
