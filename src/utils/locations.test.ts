import test from 'node:test';
import assert from 'node:assert/strict';
import { isDedicatedLayoutPath } from './locations';
import { NETWORK_PATH, SYSTEM_HOME_PATH } from '../types';

test('treats This PC as a dedicated layout', () => {
  assert.equal(isDedicatedLayoutPath(SYSTEM_HOME_PATH), true);
});

test('treats Network as a dedicated layout', () => {
  assert.equal(isDedicatedLayoutPath(NETWORK_PATH), true);
});

test('keeps a real folder on the file lister', () => {
  assert.equal(isDedicatedLayoutPath('C:\\Users\\CARLOS\\Documents'), false);
  assert.equal(isDedicatedLayoutPath('D:/_CiberCR/Descargas'), false);
});

test('treats a missing path as no dedicated layout', () => {
  assert.equal(isDedicatedLayoutPath(undefined), false);
  assert.equal(isDedicatedLayoutPath(null), false);
  assert.equal(isDedicatedLayoutPath(''), false);
});
