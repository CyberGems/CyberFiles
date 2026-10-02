export type MouseGestureDirection = 'left' | 'right' | 'up' | 'down';

export interface MouseGesturePath {
  lastX: number;
  lastY: number;
  length: number;
  direction: MouseGestureDirection | null;
  peakProgress: number;
  cancelled: boolean;
}

export const MOUSE_GESTURE_MIN_DISTANCE = 48;

export function advanceMouseGesturePath(
  path: MouseGesturePath,
  startX: number,
  startY: number,
  x: number,
  y: number,
): MouseGesturePath {
  const step = Math.hypot(x - path.lastX, y - path.lastY);
  if (step < 3) return path;

  const dx = x - startX;
  const dy = y - startY;
  const displacement = Math.hypot(dx, dy);
  const length = path.length + step;
  let direction = path.direction;
  if (!direction && displacement >= MOUSE_GESTURE_MIN_DISTANCE) {
    if (Math.abs(dx) > Math.abs(dy) * 1.35) direction = dx < 0 ? 'left' : 'right';
    else if (Math.abs(dy) > Math.abs(dx) * 1.35) direction = dy < 0 ? 'up' : 'down';
  }

  const progress = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : direction === 'down' ? dy : 0;
  const peakProgress = direction ? Math.max(path.peakProgress, progress) : path.peakProgress;
  const perpendicular = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
  const distorted = length >= 100 && displacement < length * 0.72;
  const turned = direction !== null && (
    peakProgress - progress > 36 || perpendicular > 48
  );

  return {
    lastX: x,
    lastY: y,
    length,
    direction,
    peakProgress,
    cancelled: path.cancelled || distorted || turned,
  };
}
