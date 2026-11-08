/**
 * Text size steps for the file lister (rows and column headers). Every size in
 * the lister multiplies its base pixel value by the scale factor of the chosen
 * step, so one CSS variable keeps rows, text and the virtualizer consistent.
 */
export type ListerTextScale = 'small' | 'normal' | 'large' | 'xlarge';

export const LISTER_TEXT_SCALES: ListerTextScale[] = ['small', 'normal', 'large', 'xlarge'];

export function normalizeListerTextScale(value: unknown): ListerTextScale {
  return LISTER_TEXT_SCALES.includes(value as ListerTextScale) ? value as ListerTextScale : 'normal';
}

/** CSS custom property that carries the scale factor into the pane styles. */
export const LISTER_TEXT_SCALE_CSS_VAR: string = '--lister-text-scale';

export function listerTextScaleFactor(scale: ListerTextScale): number {
  switch (scale) {
    case 'small': return 0.9;
    case 'large': return 1.15;
    case 'xlarge': return 1.3;
    default: return 1;
  }
}
