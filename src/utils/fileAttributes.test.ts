import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLocalDateTimeInputs,
  parsePositiveIntegerOffset,
  summarizeAttribute,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from './fileAttributes';

test('formats and parses valid leap-day and boundary local timestamps', () => {
  const cases = [
    new Date(2024, 1, 29, 23, 59, 59, 0).getTime(),
    new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
    new Date(2025, 11, 31, 12, 34, 56, 0).getTime(),
  ];

  for (const ms of cases) {
    const d = toLocalDateInputValue(ms);
    const t = toLocalTimeInputValue(ms);
    assert.equal(parseLocalDateTimeInputs(d, t), ms);
  }

  assert.equal(
    parseLocalDateTimeInputs('2024-02-29', '08:05'),
    new Date(2024, 1, 29, 8, 5, 0, 0).getTime(),
  );
});

test('rejects invalid calendar rollovers, bad times, and non-finite inputs', () => {
  assert.equal(parseLocalDateTimeInputs('2025-02-29', '12:00:00'), null);
  assert.equal(parseLocalDateTimeInputs('2026-04-31', '12:00:00'), null);
  assert.equal(parseLocalDateTimeInputs('2026-06-15', '25:00:00'), null);
  assert.equal(parseLocalDateTimeInputs('', '12:00:00'), null);
  assert.equal(parseLocalDateTimeInputs('2026-06-15', ''), null);

  assert.equal(toLocalDateInputValue(null), '');
  assert.equal(toLocalTimeInputValue(undefined), '');
  assert.equal(toLocalDateInputValue(Number.NaN), '');
  assert.equal(toLocalTimeInputValue(Number.POSITIVE_INFINITY), '');
});

test('parses positive integer timestamp offsets strictly', () => {
  assert.equal(parsePositiveIntegerOffset('1'), 1);
  assert.equal(parsePositiveIntegerOffset('48'), 48);
  assert.equal(parsePositiveIntegerOffset(' 12 '), 12);

  assert.equal(parsePositiveIntegerOffset('0'), null);
  assert.equal(parsePositiveIntegerOffset('-3'), null);
  assert.equal(parsePositiveIntegerOffset('1.5'), null);
  assert.equal(parsePositiveIntegerOffset('abc'), null);
  assert.equal(parsePositiveIntegerOffset(''), null);
});

test('summarizes attribute snapshots across unknown, off, on, and mixed states', () => {
  assert.deepEqual(summarizeAttribute([], 'readOnly'), {
    kind: 'unknown',
    onCount: 0,
    total: 0,
  });

  const mixed = [
    { readOnly: true, hidden: false, system: true },
    { readOnly: false, hidden: false, system: true },
    { readOnly: true, hidden: false, system: true },
  ];

  assert.deepEqual(summarizeAttribute(mixed, 'readOnly'), {
    kind: 'mixed',
    onCount: 2,
    total: 3,
  });
  assert.deepEqual(summarizeAttribute(mixed, 'hidden'), {
    kind: 'off',
    onCount: 0,
    total: 3,
  });
  assert.deepEqual(summarizeAttribute(mixed, 'system'), {
    kind: 'on',
    onCount: 3,
    total: 3,
  });
});
