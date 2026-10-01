import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Search } from 'lucide-react';

export interface CommandPaletteCommand {
  id: string;
  group: string;
  label: string;
  description?: string;
  keywords?: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  label: string;
  placeholder: string;
  noResults: string;
  commands: CommandPaletteCommand[];
  onClose: () => void;
}

export function CommandPalette({
  label,
  placeholder,
  noResults,
  commands,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return commands;
    return commands.filter(command => [
      command.label,
      command.description,
      command.keywords,
      command.group,
      command.shortcut,
    ].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
  }, [commands, query]);
  const selectableIndices = useMemo(
    () => rows.flatMap((command, index) => command.disabled ? [] : [index]),
    [rows],
  );
  const rowsKey = rows.map(command => command.id).join('\u0000');
  const selectableKey = selectableIndices.join(',');
  const firstSelectableIndex = selectableIndices[0] ?? -1;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(firstSelectableIndex);
  }, [query, rowsKey, selectableKey, firstSelectableIndex]);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector(`[data-command-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function moveActive(direction: -1 | 1) {
    if (selectableIndices.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const currentPosition = selectableIndices.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? direction === 1 ? 0 : selectableIndices.length - 1
      : (currentPosition + direction + selectableIndices.length) % selectableIndices.length;
    setActiveIndex(selectableIndices[nextPosition]);
  }

  function run(command: CommandPaletteCommand) {
    if (command.disabled) return;
    onClose();
    command.onSelect();
  }

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not(:disabled), button:not(:disabled)',
    ) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    trapTab(event);
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm animate-in fade-in duration-100"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[76vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-neutral-800 px-4">
          <Search aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-neutral-500" />
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-controls="command-palette-list"
            aria-activedescendant={activeIndex >= 0 ? `command-palette-option-${activeIndex}` : undefined}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveActive(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveActive(-1);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const command = rows[activeIndex];
                if (command) run(command);
              }
            }}
            className="h-[58px] min-w-0 flex-1 bg-transparent text-base text-neutral-100 outline-none placeholder:text-neutral-500"
          />
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={label}
          className="min-h-0 overflow-y-auto p-2"
        >
          {rows.length === 0 ? (
            <div role="status" className="px-3 py-8 text-center text-sm text-neutral-500">{noResults}</div>
          ) : (
            rows.map((command, index) => {
              const startsGroup = index === 0 || rows[index - 1].group !== command.group;
              const selected = index === activeIndex;
              return (
                <div key={command.id} role="presentation">
                  {startsGroup && (
                    <div role="presentation" className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 first:pt-1">
                      {command.group}
                    </div>
                  )}
                  <button
                    id={`command-palette-option-${index}`}
                    data-command-index={index}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={command.disabled || undefined}
                    disabled={command.disabled}
                    onMouseEnter={() => { if (!command.disabled) setActiveIndex(index); }}
                    onClick={() => run(command)}
                    className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      command.disabled
                        ? 'cursor-not-allowed text-neutral-600'
                        : selected
                          ? 'bg-neutral-700 text-neutral-100'
                          : 'text-neutral-200 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{command.label}</span>
                      {(command.disabledReason || command.description) && (
                        <span className={`mt-0.5 block truncate text-xs ${command.disabled ? 'text-neutral-600' : 'text-neutral-500'}`}>
                          {command.disabledReason || command.description}
                        </span>
                      )}
                    </span>
                    {command.shortcut && !command.disabled && (
                      <kbd className="keyboard-hint flex-shrink-0">
                        {command.shortcut}
                      </kbd>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
