import test from 'node:test';
import assert from 'node:assert/strict';
import { getLaunchTargetPath } from './systemIntegration';

test('resolves camelCase targetPath from launch context', () => {
  assert.equal(getLaunchTargetPath({ startup: false, targetPath: 'C:\\Projects' }), 'C:\\Projects');
});

test('resolves snake_case target_path from launch context for backward compatibility', () => {
  assert.equal(getLaunchTargetPath({ startup: false, target_path: 'C:\\Downloads' }), 'C:\\Downloads');
});

test('returns null when target path is missing or empty', () => {
  assert.equal(getLaunchTargetPath(null), null);
  assert.equal(getLaunchTargetPath(undefined), null);
  assert.equal(getLaunchTargetPath({ startup: true, targetPath: null }), null);
});
