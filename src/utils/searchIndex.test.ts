import assert from 'node:assert/strict';
import test from 'node:test';
import { FileItem, FileType } from '../types';
import { searchFileSystem } from './searchIndex';

const file = (
  id: string,
  name: string,
  path: string,
  extra: Partial<FileItem> & { type?: FileType } = {},
): FileItem => ({
  id,
  name,
  path,
  isFolder: false,
  type: 'text',
  size: 10,
  modifiedDate: '2026-10-31 00:00',
  extension: name.split('.').pop() ?? '',
  ...extra,
});

test('filters by scope and matches names, paths and content', () => {
  const files = [
    file('a', 'report.txt', 'C:\\Work\\report.txt', { contentPreview: 'quarterly numbers' }),
    file('b', 'notes.md', 'C:\\Work\\notes.md', { contentPreview: 'no match here' }),
    file('c', 'report.txt', 'D:\\Other\\report.txt'),
  ];

  const scoped = searchFileSystem(files, {
    query: 'report',
    searchContent: false,
    scopePath: 'C:\\Work',
  });
  assert.deepEqual(scoped.matches.map(match => match.file.id), ['a']);

  const content = searchFileSystem(files, {
    query: 'quarterly',
    searchContent: true,
    scopePath: 'C:\\Work',
  });
  assert.equal(content.matches[0]?.matchType, 'content');
  assert.equal(content.matches[0]?.contentSnippet, 'quarterly numbers');
});

test('honours type, size and extension filters', () => {
  const files = [
    file('img', 'photo.png', 'C:\\Work\\photo.png', { type: 'image', size: 2048, extension: 'png' }),
    file('big', 'dump.bin', 'C:\\Work\\dump.bin', { type: 'binary', size: 60 * 1024 * 1024, extension: 'bin' }),
  ];

  assert.deepEqual(
    searchFileSystem(files, { query: '', searchContent: false, typeFilter: 'image' }).matches.map(match => match.file.id),
    ['img'],
  );
  assert.deepEqual(
    searchFileSystem(files, { query: '', searchContent: false, sizeFilter: 'huge' }).matches.map(match => match.file.id),
    ['big'],
  );
  assert.deepEqual(
    searchFileSystem(files, { query: '', searchContent: false, extensionFilter: 'png' }).matches.map(match => match.file.id),
    ['img'],
  );
});

test('returns every file that passes the filters when the query is empty', () => {
  const files = [
    file('a', 'one.txt', 'C:\\Work\\one.txt'),
    file('b', 'two.md', 'C:\\Work\\two.md'),
  ];
  const result = searchFileSystem(files, { query: '   ', searchContent: false, scopePath: 'C:\\Work' });
  assert.equal(result.matches.length, 2);
  assert.equal(result.totalScanned, 2);
});
