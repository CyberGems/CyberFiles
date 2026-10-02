import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMouseGesturePath, type MouseGesturePath } from './mouseGesture';

function trace(points: Array<[number, number]>): MouseGesturePath {
  return points.reduce<MouseGesturePath>((path, [x, y]) =>
    advanceMouseGesturePath(path, 0, 0, x, y), {
    lastX: 0,
    lastY: 0,
    length: 0,
    direction: null,
    peakProgress: 0,
    cancelled: false,
  });
}

test('recognizes straight gestures in all four directions', () => {
  assert.equal(trace([[-60, 4]]).direction, 'left');
  assert.equal(trace([[60, -4]]).direction, 'right');
  assert.equal(trace([[4, -60]]).direction, 'up');
  assert.equal(trace([[-4, 60]]).direction, 'down');
});

test('allows small corrections and ignores short movements', () => {
  assert.deepEqual(
    [trace([[20, 5], [70, 8]]).direction, trace([[20, 5], [70, 8]]).cancelled],
    ['right', false],
  );
  assert.equal(trace([[20, 5]]).direction, null);
});

test('cancels a sharp turn, reversal, or scribble', () => {
  assert.equal(trace([[80, 0], [80, 50]]).cancelled, true);
  assert.equal(trace([[90, 0], [40, 0]]).cancelled, true);
  assert.equal(trace([[35, 0], [0, 0], [35, 0], [0, 0]]).cancelled, true);
});
