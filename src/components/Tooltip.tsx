import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Placement = 'top' | 'bottom' | 'left' | 'right';
type ResolvedPlacement = Placement;

interface TooltipProps {
  label: ReactNode;
  placement?: Placement;
  children: ReactElement;
  disabled?: boolean;
}

interface TooltipPosition {
  left: number;
  top: number;
  placement: ResolvedPlacement;
  arrowOffset: number;
}

const GAP = 8;
const VIEWPORT_MARGIN = 8;
const SHOW_DELAY_MS = 280;

let activeTooltipOwner: symbol | null = null;
let dismissActiveTooltip: (() => void) | null = null;
let pendingTooltipOwner: symbol | null = null;
let cancelPendingTooltip: (() => void) | null = null;
let mountedTooltipInstances = 0;

const dismissAllTooltips = () => {
  const cancelPending = cancelPendingTooltip;
  cancelPendingTooltip = null;
  pendingTooltipOwner = null;
  cancelPending?.();

  const dismissActive = dismissActiveTooltip;
  dismissActiveTooltip = null;
  activeTooltipOwner = null;
  dismissActive?.();
};

const dismissTooltipWhenHidden = () => {
  if (document.visibilityState === 'hidden') dismissAllTooltips();
};

const attachTooltipWindowListeners = () => {
  window.addEventListener('blur', dismissAllTooltips);
  window.addEventListener('focus', dismissAllTooltips);
  window.addEventListener('pagehide', dismissAllTooltips);
  document.addEventListener('visibilitychange', dismissTooltipWhenHidden);
  document.addEventListener('pointerdown', dismissAllTooltips, true);
};

const detachTooltipWindowListeners = () => {
  window.removeEventListener('blur', dismissAllTooltips);
  window.removeEventListener('focus', dismissAllTooltips);
  window.removeEventListener('pagehide', dismissAllTooltips);
  document.removeEventListener('visibilitychange', dismissTooltipWhenHidden);
  document.removeEventListener('pointerdown', dismissAllTooltips, true);
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));
}

function getPosition(
  anchor: DOMRect,
  card: DOMRect,
  preferredPlacement: Placement,
): TooltipPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorCenterX = anchor.left + anchor.width / 2;
  const anchorCenterY = anchor.top + anchor.height / 2;
  let placement: ResolvedPlacement = preferredPlacement;

  if (placement === 'top' && anchor.top - GAP - card.height < VIEWPORT_MARGIN) placement = 'bottom';
  if (placement === 'bottom' && anchor.bottom + GAP + card.height > viewportHeight - VIEWPORT_MARGIN) placement = 'top';
  if (placement === 'left' && anchor.left - GAP - card.width < VIEWPORT_MARGIN) placement = 'right';
  if (placement === 'right' && anchor.right + GAP + card.width > viewportWidth - VIEWPORT_MARGIN) placement = 'left';

  if (placement === 'top' || placement === 'bottom') {
    const left = clamp(
      anchorCenterX - card.width / 2,
      VIEWPORT_MARGIN,
      viewportWidth - card.width - VIEWPORT_MARGIN,
    );
    const top = clamp(
      placement === 'top' ? anchor.top - GAP - card.height : anchor.bottom + GAP,
      VIEWPORT_MARGIN,
      viewportHeight - card.height - VIEWPORT_MARGIN,
    );

    return {
      left,
      top,
      placement,
      arrowOffset: clamp(anchorCenterX - left, 14, card.width - 14),
    };
  }

  const top = clamp(
    anchorCenterY - card.height / 2,
    VIEWPORT_MARGIN,
    viewportHeight - card.height - VIEWPORT_MARGIN,
  );
  const left = clamp(
    placement === 'left' ? anchor.left - GAP - card.width : anchor.right + GAP,
    VIEWPORT_MARGIN,
    viewportWidth - card.width - VIEWPORT_MARGIN,
  );

  return {
    left,
    top,
    placement,
    arrowOffset: clamp(anchorCenterY - top, 14, card.height - 14),
  };
}

function getArrowStyle(position: TooltipPosition): CSSProperties {
  const common: CSSProperties = {
    background: 'var(--cyberfiles-tooltip-background)',
    borderColor: 'rgba(103, 232, 249, 0.28)',
    borderStyle: 'solid',
  };

  switch (position.placement) {
    case 'top':
      return { ...common, bottom: -5, left: position.arrowOffset - 5, borderRightWidth: 1, borderBottomWidth: 1 };
    case 'bottom':
      return { ...common, top: -5, left: position.arrowOffset - 5, borderLeftWidth: 1, borderTopWidth: 1 };
    case 'left':
      return { ...common, right: -5, top: position.arrowOffset - 5, borderRightWidth: 1, borderTopWidth: 1 };
    case 'right':
      return { ...common, left: -5, top: position.arrowOffset - 5, borderLeftWidth: 1, borderBottomWidth: 1 };
  }
}

/** A viewport-aware tooltip that does not alter the layout of its trigger. */
export function Tooltip({ label, placement = 'bottom', children, disabled = false }: TooltipProps) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const delayRef = useRef<number | null>(null);
  const tooltipId = useId();
  const tooltipOwnerRef = useRef(Symbol('cyberfiles-tooltip'));

  const clearDelay = () => {
    if (delayRef.current !== null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (pendingTooltipOwner === tooltipOwnerRef.current) {
      pendingTooltipOwner = null;
      cancelPendingTooltip = null;
    }
  };

  const hide = () => {
    clearDelay();
    setAnchorElement(null);
    if (activeTooltipOwner === tooltipOwnerRef.current) {
      activeTooltipOwner = null;
      dismissActiveTooltip = null;
    }
  };

  const scheduleShow = (element: HTMLElement) => {
    clearDelay();
    const owner = tooltipOwnerRef.current;

    if (pendingTooltipOwner && pendingTooltipOwner !== owner) {
      const cancelPending = cancelPendingTooltip;
      pendingTooltipOwner = null;
      cancelPendingTooltip = null;
      cancelPending?.();
    }
    if (activeTooltipOwner && activeTooltipOwner !== owner) {
      const dismissActive = dismissActiveTooltip;
      activeTooltipOwner = null;
      dismissActiveTooltip = null;
      dismissActive?.();
    }

    delayRef.current = window.setTimeout(() => {
      pendingTooltipOwner = null;
      cancelPendingTooltip = null;
      activeTooltipOwner = owner;
      dismissActiveTooltip = hide;
      setAnchorElement(element);
      delayRef.current = null;
    }, SHOW_DELAY_MS);
    pendingTooltipOwner = owner;
    cancelPendingTooltip = clearDelay;
  };

  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);

  useEffect(() => {
    mountedTooltipInstances += 1;
    if (mountedTooltipInstances === 1) attachTooltipWindowListeners();

    return () => {
      mountedTooltipInstances -= 1;
      clearDelay();
      if (activeTooltipOwner === tooltipOwnerRef.current) {
        activeTooltipOwner = null;
        dismissActiveTooltip = null;
      }
      if (mountedTooltipInstances === 0) {
        detachTooltipWindowListeners();
        activeTooltipOwner = null;
        dismissActiveTooltip = null;
        pendingTooltipOwner = null;
        cancelPendingTooltip = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!anchorElement || !cardRef.current) {
      setPosition(null);
      return;
    }

    setPosition(getPosition(anchorElement.getBoundingClientRect(), cardRef.current.getBoundingClientRect(), placement));
  }, [anchorElement, placement]);

  useEffect(() => {
    if (!anchorElement) return;

    const dismiss = () => hide();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('wheel', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('wheel', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [anchorElement]);

  if (disabled || !label || !isValidElement(children)) return children;

  const child = children as ReactElement<any>;
  const onMouseEnter = (event: ReactMouseEvent<HTMLElement>) => {
    child.props.onMouseEnter?.(event);
    scheduleShow(event.currentTarget);
  };
  const onMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    child.props.onMouseLeave?.(event);
    hide();
  };
  const onFocus = (event: ReactFocusEvent<HTMLElement>) => {
    child.props.onFocus?.(event);
    scheduleShow(event.currentTarget);
  };
  const onBlur = (event: ReactFocusEvent<HTMLElement>) => {
    child.props.onBlur?.(event);
    hide();
  };
  const onClick = (event: ReactMouseEvent<HTMLElement>) => {
    child.props.onClick?.(event);
    hide();
  };

  const trigger = cloneElement(child, {
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onClick,
    'aria-describedby': anchorElement ? tooltipId : undefined,
    'data-has-tooltip': 'true',
  });

  return (
    <>
      {trigger}
      {anchorElement &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[1000]"
            style={{
              left: position ? position.left : -10000,
              top: position ? position.top : -10000,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            <div
              ref={cardRef}
              className="cyberfiles-tooltip-card relative max-w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-cyan-300/25 bg-[#101826]/95 px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.45),0_0_12px_rgba(34,211,238,0.14)] backdrop-blur-md animate-[cyberfiles-tooltip-in_140ms_ease-out]"
              style={{ background: 'var(--cyberfiles-tooltip-background)' }}
            >
              {label}
              {position && (
                <span
                  aria-hidden="true"
                  className="absolute h-2.5 w-2.5 rotate-45"
                  style={getArrowStyle(position)}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
