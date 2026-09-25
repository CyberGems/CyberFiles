import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Tooltip } from './Tooltip';

type SplitOrientation = 'vertical' | 'horizontal';

interface PaneSplitterProps {
  orientation: SplitOrientation;
  value: number;
  label: string;
  onChange: (value: number) => void;
}

interface ActiveDrag {
  parent: HTMLDivElement;
  pointerId: number;
  initialValue: number;
}

const MIN_SPLIT_PERCENT = 20;
const MAX_SPLIT_PERCENT = 80;
const SPLITTER_SIZE_PX = 8;

function clampSplitPercent(value: number) {
  return Math.max(MIN_SPLIT_PERCENT, Math.min(MAX_SPLIT_PERCENT, value));
}

function updateGridSplit(parent: HTMLDivElement, orientation: SplitOrientation, value: number) {
  const firstTrack = clampSplitPercent(value);
  const secondTrack = 100 - firstTrack;
  const template = 'minmax(0, ' + firstTrack + 'fr) ' + SPLITTER_SIZE_PX + 'px minmax(0, ' + secondTrack + 'fr)';
  parent.style.setProperty(orientation === 'vertical' ? 'grid-template-columns' : 'grid-template-rows', template);
}

export function PaneSplitter({ orientation, value, label, onChange }: PaneSplitterProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<ActiveDrag | null>(null);
  const pendingPercentRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  const getPercentFromPointer = (event: PointerEvent<HTMLDivElement>, parent: HTMLDivElement) => {
    const parentRect = parent.getBoundingClientRect();
    const splitterRect = event.currentTarget.getBoundingClientRect();
    const isVertical = orientation === 'vertical';
    const coordinate = isVertical ? event.clientX : event.clientY;
    const start = isVertical ? parentRect.left : parentRect.top;
    const total = isVertical ? parentRect.width : parentRect.height;
    const splitterSize = isVertical ? splitterRect.width : splitterRect.height;
    const available = Math.max(1, total - splitterSize);
    const firstPaneSize = coordinate - start - splitterSize / 2;
    return clampSplitPercent((firstPaneSize / available) * 100);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const parent = event.currentTarget.parentElement;
    if (!(parent instanceof HTMLDivElement)) return;

    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { parent, pointerId: event.pointerId, initialValue: value };
    pendingPercentRef.current = value;
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    pendingPercentRef.current = getPercentFromPointer(event, drag.parent);
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const currentDrag = dragRef.current;
      if (currentDrag) updateGridSplit(currentDrag.parent, orientation, pendingPercentRef.current);
    });
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const finalValue = commit ? pendingPercentRef.current : drag.initialValue;
    updateGridSplit(drag.parent, orientation, finalValue);
    dragRef.current = null;
    setDragging(false);

    if (commit) onChange(finalValue);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    pendingPercentRef.current = getPercentFromPointer(event, drag.parent);
    finishDrag(event, true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextValue = value;
    if (event.key === 'Home') nextValue = MIN_SPLIT_PERCENT;
    else if (event.key === 'End') nextValue = MAX_SPLIT_PERCENT;
    else if (orientation === 'vertical' && event.key === 'ArrowLeft') nextValue -= 2;
    else if (orientation === 'vertical' && event.key === 'ArrowRight') nextValue += 2;
    else if (orientation === 'horizontal' && event.key === 'ArrowUp') nextValue -= 2;
    else if (orientation === 'horizontal' && event.key === 'ArrowDown') nextValue += 2;
    else return;

    event.preventDefault();
    event.stopPropagation();
    nextValue = clampSplitPercent(nextValue);
    const parent = event.currentTarget.parentElement;
    if (parent instanceof HTMLDivElement) updateGridSplit(parent, orientation, nextValue);
    onChange(nextValue);
  };

  const isVertical = orientation === 'vertical';

  return (
    <Tooltip label={label} placement={isVertical ? 'top' : 'right'}>
      <div
        role="separator"
        aria-label={label}
        aria-orientation={orientation}
        aria-valuemin={MIN_SPLIT_PERCENT}
        aria-valuemax={MAX_SPLIT_PERCENT}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        className={
          'group relative z-10 flex shrink-0 touch-none select-none items-center justify-center outline-none focus-visible:bg-cyan-400/10 ' +
          (isVertical ? 'h-full w-2 cursor-col-resize' : 'h-2 w-full cursor-row-resize') +
          (dragging ? ' bg-cyan-400/10' : '')
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={event => finishDrag(event, false)}
        onLostPointerCapture={event => finishDrag(event, false)}
        onKeyDown={handleKeyDown}
      >
        <span
          aria-hidden="true"
          className={
            'absolute bg-neutral-800 transition-colors duration-150 group-hover:bg-cyan-400/60 group-focus-visible:bg-cyan-400/60 ' +
            (isVertical ? 'h-full w-px' : 'h-px w-full')
          }
        />
        <span
          aria-hidden="true"
          className={
            'absolute rounded-full bg-neutral-600 transition-colors duration-150 group-hover:bg-cyan-300 group-focus-visible:bg-cyan-300 ' +
            (dragging ? '!bg-cyan-200 ' : '') +
            (isVertical ? 'h-8 w-[3px]' : 'h-[3px] w-8')
          }
        />
      </div>
    </Tooltip>
  );
}
