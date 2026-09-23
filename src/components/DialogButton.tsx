import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type DialogButtonVariant = 'primary' | 'secondary' | 'danger';
type DialogButtonSize = 'regular' | 'compact';

interface DialogButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: DialogButtonVariant;
  size?: DialogButtonSize;
  shortcut?: string;
}

const variantClasses: Record<DialogButtonVariant, string> = {
  primary: 'border-cyan-400 bg-cyan-400 text-neutral-950 shadow-[0_0_22px_rgba(34,211,238,0.18)] hover:border-cyan-300 hover:bg-cyan-300',
  secondary: 'border-neutral-700 bg-neutral-950/50 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-neutral-100',
  danger: 'border-rose-600 bg-rose-600 text-white hover:border-rose-500 hover:bg-rose-500',
};

const sizeClasses: Record<DialogButtonSize, string> = {
  regular: 'min-h-14 rounded-xl px-5 py-3 text-[15px]',
  compact: 'min-h-9 rounded-md px-3 py-1.5 text-xs',
};

export const DialogButton = forwardRef<HTMLButtonElement, DialogButtonProps>(function DialogButton({
  children,
  variant = 'secondary',
  size = 'regular',
  shortcut,
  className = '',
  type = 'button',
  ...props
}, ref) {
  const keyClasses = variant === 'primary'
    ? 'border-neutral-950/30 bg-neutral-950/15 text-neutral-950'
    : 'border-neutral-700 bg-neutral-900/70 text-neutral-400';

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2.5 border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      <span>{children}</span>
      {shortcut && (
        <kbd aria-hidden="true" className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold leading-5 ${keyClasses}`}>
          {shortcut}
        </kbd>
      )}
    </button>
  );
});
