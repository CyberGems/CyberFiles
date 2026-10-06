import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFolderIconKey,
  getCustomFolderIcon,
  setCustomFolderIcon,
  exportFolderIconsJson,
  importFolderIconsJson,
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

test('falls back to folder name rule when path has no exact rule', () => {
  const nodeModulesConfig: CustomFolderIconConfig = {
    iconId: 'boxes',
    style: 'symbol',
    category: 'color',
    colorPreset: 'emerald',
  };
  const icons: SavedFolderIcons = {
    'name:node_modules': nodeModulesConfig,
  };

  assert.deepEqual(getCustomFolderIcon('C:\\Web\\App\\node_modules', icons), nodeModulesConfig);
  assert.deepEqual(getCustomFolderIcon('D:\\Other\\Project\\node_modules\\', icons), nodeModulesConfig);
});

test('adds and removes custom folder icon with badge and custom color', () => {
  const path = 'C:\\Work\\Music';
  const config: CustomFolderIconConfig = {
    iconId: 'music',
    style: 'symbol',
    category: 'color',
    customColor: '#ff007f',
    badge: {
      type: 'in-progress',
      label: 'WIP',
      color: '#06b6d4',
    },
  };

  const withIcon = setCustomFolderIcon(path, config, {});
  assert.deepEqual(getCustomFolderIcon(path, withIcon), config);

  const exported = exportFolderIconsJson(withIcon);
  assert.match(exported, /#ff007f/);

  const imported = importFolderIconsJson(exported, {});
  assert.equal(imported.success, true);
  assert.equal(imported.count, 1);
  assert.deepEqual(getCustomFolderIcon(path, imported.icons), config);

  const removed = setCustomFolderIcon(path, null, withIcon);
  assert.equal(getCustomFolderIcon(path, removed), undefined);
});
