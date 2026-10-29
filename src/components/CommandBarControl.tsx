import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Tooltip } from './Tooltip';

/**
 * Where the visible label of a command bar control sits relative to its icon.
 * `none` keeps the bar icon-only, which is the pre-label behaviour.
 */
export type ToolbarLabelPosition = 'none' | 'right' | 'left' | 'bottom' | 'top';

export const TOOLBAR_LABEL_POSITIONS: ToolbarLabelPosition[] = ['none', 'right', 'left', 'bottom', 'top'];

export const DEFAULT_TOOLBAR_LABEL_POSITION: ToolbarLabelPosition = 'bottom';

export function normalizeToolbarLabelPosition(value: unknown): ToolbarLabelPosition {
  return value === 'none' || value === 'right' || value === 'left' || value === 'top' || value === 'bottom'
    ? value
    : DEFAULT_TOOLBAR_LABEL_POSITION;
}

interface CommandBarLabelProps {
  label?: string;
}

/** Shared label markup so every control renders the same typography. */
export const CommandBarLabel: React.FC<CommandBarLabelProps> = ({ label }) => (
  <span className="command-control-label">{label}</span>
);

interface CommandBarIconProps {
  children: React.ReactNode;
  className?: string;
}

export const CommandBarIcon: React.FC<CommandBarIconProps> = ({ children, className }) => (
  <span className={className ? `command-control-icon ${className}` : 'command-control-icon'}>{children}</span>
);

export interface CommandBarButtonProps {
  label: string;
  labelPosition: ToolbarLabelPosition;
  icon: React.ReactNode;
  onClick: () => void;
  tooltip?: string;
  tooltipShortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  badge?: boolean;
}

/**
 * Single command bar action. One height, one border and one label treatment for
 * every button in the bar; `data-label` drives the icon/label direction in CSS.
 */
export const CommandBarButton: React.FC<CommandBarButtonProps> = ({
  label,
  labelPosition,
  icon,
  onClick,
  tooltip,
  tooltipShortcut,
  pressed,
  disabled,
  ariaLabel,
  badge,
}) => {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel ?? label}
      data-label={labelPosition}
      className="command-control"
    >
      <CommandBarIcon>{icon}</CommandBarIcon>
      {labelPosition !== 'none' && <CommandBarLabel label={label} />}
      {badge && <span aria-hidden="true" className="command-control-badge" />}
    </button>
  );
  if (!tooltip) return button;
  // A disabled button swallows pointer events, so the tooltip needs a focusable wrapper.
  if (disabled) {
    return (
      <Tooltip label={tooltip} shortcut={tooltipShortcut} placement="bottom">
        <span className="inline-flex" tabIndex={0} aria-label={tooltip}>{button}</span>
      </Tooltip>
    );
  }
  return <Tooltip label={tooltip} shortcut={tooltipShortcut} placement="bottom">{button}</Tooltip>;
};

export type CommandBarSegmentProps = Omit<CommandBarButtonProps, 'iconClassName'>;

/** One option inside a segmented command bar group (view modes, pane layouts). */
export const CommandBarSegment: React.FC<CommandBarSegmentProps> = ({
  label,
  labelPosition,
  icon,
  onClick,
  tooltip,
  tooltipShortcut,
  pressed,
  disabled,
  ariaLabel,
}) => {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel ?? label}
      data-label={labelPosition}
      className="view-choice command-segment"
    >
      <CommandBarIcon>{icon}</CommandBarIcon>
      {labelPosition !== 'none' && <CommandBarLabel label={label} />}
    </button>
  );
  if (!tooltip) return button;
  return <Tooltip label={tooltip} shortcut={tooltipShortcut} placement="bottom">{button}</Tooltip>;
};

interface CommandBarGroupProps {
  label: string;
  children: React.ReactNode;
}

export const CommandBarGroup: React.FC<CommandBarGroupProps> = ({ label, children }) => (
  <div role="group" aria-label={label} className="view-choice-group command-group">
    {children}
  </div>
);

export interface CommandBarSplitProps {
  label: string;
  labelPosition: ToolbarLabelPosition;
  icon: React.ReactNode;
  onClick: () => void;
  tooltip: string;
  tooltipShortcut?: string;
  caretLabel: string;
  onCaretClick: () => void;
  caretExpanded?: boolean;
  disabled?: boolean;
  caretDisabled?: boolean;
  ariaLabel?: string;
}

/**
 * Primary action with a secondary menu: both halves live inside the same frame so
 * the control keeps the shared command bar height.
 */
export const CommandBarSplit: React.FC<CommandBarSplitProps> = ({
  label,
  labelPosition,
  icon,
  onClick,
  tooltip,
  tooltipShortcut,
  caretLabel,
  onCaretClick,
  caretExpanded,
  disabled,
  caretDisabled,
  ariaLabel,
}) => (
  <div className="command-control command-split" data-label={labelPosition} data-expanded={caretExpanded ? 'true' : undefined}>
    <Tooltip label={tooltip} shortcut={tooltipShortcut} placement="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        data-label={labelPosition}
        className="command-split-main"
      >
        <CommandBarIcon>{icon}</CommandBarIcon>
        {labelPosition !== 'none' && <CommandBarLabel label={label} />}
      </button>
    </Tooltip>
    <Tooltip label={caretLabel} placement="bottom">
      <button
        type="button"
        onClick={onCaretClick}
        disabled={caretDisabled}
        aria-label={caretLabel}
        aria-haspopup="menu"
        aria-expanded={caretExpanded}
        className="command-split-caret"
      >
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
    </Tooltip>
  </div>
);
