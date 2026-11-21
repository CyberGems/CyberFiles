import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface PortalMenuPlacement {
  top: number;
  right: number;
  maxHeight: number;
}

interface UsePortalMenuPlacementOptions {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
  /** Floor for the clamped maxHeight when neither side fits the menu. */
  minHeight?: number;
  /** Flip above the trigger when it does not fit below and above has more room. */
  flip?: boolean;
}

/**
 * Placement for menus portalled to document.body with fixed positioning:
 * inline menus get cut off by ancestors that clip their own overflow. Opens
 * below the trigger, flips above it when the measured height does not fit and
 * there is more room above, and recomputes while open on menu resizes and
 * window resizes. Call `armPlacement` synchronously in the open handler so
 * the first paint of the menu is already positioned before the measured
 * refinement runs.
 */
export function usePortalMenuPlacement({ open, triggerRef, menuRef, minHeight = 160, flip = true }: UsePortalMenuPlacementOptions) {
  const [placement, setPlacement] = useState<PortalMenuPlacement | null>(null);

  const updatePlacement = useCallback(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openAbove = flip && menuHeight > spaceBelow && spaceAbove > spaceBelow;
    const available = Math.max(openAbove ? spaceAbove : spaceBelow, minHeight);
    const maxHeight = Math.min(available, Math.round(window.innerHeight * 0.7));
    const top = openAbove
      ? Math.max(margin, rect.top - Math.min(menuHeight, maxHeight) - 6)
      : Math.min(rect.bottom + 6, Math.max(margin, window.innerHeight - minHeight - margin));
    setPlacement({ top, right: Math.max(margin, window.innerWidth - rect.right), maxHeight });
  }, [open, triggerRef, menuRef, minHeight, flip]);

  useEffect(() => {
    if (!open) return;
    updatePlacement();
    const menuEl = menuRef.current;
    if (typeof ResizeObserver !== 'undefined' && menuEl) {
      const observer = new ResizeObserver(updatePlacement);
      observer.observe(menuEl);
      window.addEventListener('resize', updatePlacement);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', updatePlacement);
      };
    }
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [open, updatePlacement, menuRef]);

  const armPlacement = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    setPlacement({
      top: rect.bottom + 6,
      right: Math.max(margin, window.innerWidth - rect.right),
      maxHeight: Math.min(Math.max(spaceBelow, minHeight), Math.round(window.innerHeight * 0.7)),
    });
  }, [triggerRef, minHeight]);

  return { placement, armPlacement, updatePlacement };
}
