import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Copy, Delete, ListChecks, Redo2, Undo2 } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { isTauriDesktop, readNativeClipboardText } from '../utils/nativeFileSystem';

type TextTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
type SelectionDirection = 'forward' | 'backward' | 'none';

interface TextSnapshot {
  value: string;
  start: number | null;
  end: number | null;
  direction: SelectionDirection | null;
}

interface EditHistory {
  undo: TextSnapshot[];
  redo: TextSnapshot[];
  last: TextSnapshot;
}

interface OpenMenu {
  target: TextTarget;
  left: number;
  top: number;
  pasteAndGoPath: string | null;
}

const histories = new WeakMap<TextTarget, EditHistory>();
const beforeInputSnapshots = new WeakMap<TextTarget, TextSnapshot>();
const MAX_HISTORY_LENGTH = 100;

function getTextTarget(eventTarget: EventTarget | null): TextTarget | null {
  if (!(eventTarget instanceof Element)) return null;
  const candidate = eventTarget.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  if (candidate instanceof HTMLInputElement) {
    return ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'].includes(candidate.type.toLowerCase())
      ? null
      : candidate;
  }
  if (candidate instanceof HTMLTextAreaElement) return candidate;
  return candidate instanceof HTMLElement && candidate.isContentEditable ? candidate : null;
}

function readSnapshot(target: TextTarget): TextSnapshot {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    let start: number | null = null;
    let end: number | null = null;
    let direction: SelectionDirection | null = null;
    try {
      start = target.selectionStart;
      end = target.selectionEnd;
      direction = target.selectionDirection;
    } catch {
      // Some input types do not expose selection offsets.
    }
    return { value: target.value, start, end, direction };
  }
  return { value: target.innerHTML, start: null, end: null, direction: null };
}

function getHistory(target: TextTarget): EditHistory {
  let history = histories.get(target);
  if (!history) {
    history = { undo: [], redo: [], last: readSnapshot(target) };
    histories.set(target, history);
  }
  return history;
}

function isReadOnly(target: TextTarget): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target.disabled || target.readOnly
    : target.getAttribute('contenteditable') === 'false';
}

function hasSelection(target: TextTarget): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
  }
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && target.contains(selection.anchorNode));
}

function dispatchInput(target: TextTarget, inputType: string, data: string | null = null) {
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }));
}

function setControlValue(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(target, value);
}

function restoreSnapshot(target: TextTarget, snapshot: TextSnapshot) {
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    setControlValue(target, snapshot.value);
    try {
      target.setSelectionRange(snapshot.start ?? snapshot.value.length, snapshot.end ?? snapshot.value.length, snapshot.direction ?? 'none');
    } catch {
      // Some input types do not support selection ranges.
    }
  } else {
    target.innerHTML = snapshot.value;
  }
  getHistory(target).last = snapshot;
  dispatchInput(target, 'historyUndo');
}

function applyHistory(target: TextTarget, direction: 'undo' | 'redo') {
  const history = getHistory(target);
  const current = readSnapshot(target);
  if (current.value !== history.last.value) {
    history.undo.push(history.last);
    history.last = current;
  }
  const source = direction === 'undo' ? history.undo : history.redo;
  const destination = direction === 'undo' ? history.redo : history.undo;
  const snapshot = source.pop();
  if (!snapshot) return;
  destination.push(current);
  restoreSnapshot(target, snapshot);
}

function deleteSelectedText(target: TextTarget) {
  if (isReadOnly(target) || !hasSelection(target)) return;
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    const nextValue = target.value.slice(0, start) + target.value.slice(end);
    setControlValue(target, nextValue);
    target.setSelectionRange(start, start);
  } else {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    selection.deleteFromDocument();
  }
  dispatchInput(target, 'deleteContentBackward');
}

async function copySelectedText(target: TextTarget) {
  if (!hasSelection(target)) return;
  const text = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0)
    : window.getSelection()?.toString() ?? '';
  if (text) await navigator.clipboard.writeText(text);
}

async function pasteText(target: TextTarget) {
  if (isReadOnly(target)) return;
  const text = isTauriDesktop() ? await readNativeClipboardText() : await navigator.clipboard.readText();
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const nextValue = target.value.slice(0, start) + text + target.value.slice(end);
    setControlValue(target, nextValue);
    const caret = start + text.length;
    target.setSelectionRange(caret, caret);
  } else {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange();
    if (!selection?.rangeCount) {
      range.selectNodeContents(target);
      range.collapse(false);
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  dispatchInput(target, 'insertFromPaste', text);
}

function selectAllText(target: TextTarget) {
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.select();
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getUsableExplorerAddress(value: string): string | null {
  let address = value.trim();
  if (!address || /[\r\n]/.test(address)) return null;
  if ((address.startsWith('"') && address.endsWith('"')) || (address.startsWith("'") && address.endsWith("'"))) {
    address = address.slice(1, -1).trim();
  }
  if (/^file:\/\//i.test(address)) {
    try {
      const url = new URL(address);
      let path = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname.toLowerCase() !== 'localhost') {
        path = `\\\\${url.hostname}${path.replace(/\//g, '\\')}`;
      } else {
        path = path.replace(/^\/([a-z]:)/i, '$1').replace(/\//g, '\\');
      }
      address = path;
    } catch {
      return null;
    }
  }
  const drivePath = /^[a-z]:[\\/]/i.test(address);
  const extendedDrivePath = /^\\\\\?\\[a-z]:[\\/]/i.test(address);
  const networkPath = /^\\\\[^\\]+\\[^\\]+/.test(address);
  return drivePath || extendedDrivePath || networkPath ? address : null;
}

export function TextInputContextMenu() {
  const { t } = useLanguage();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = getTextTarget(event.target);
      if (!target) return;
      event.preventDefault();
      target.focus();
      getHistory(target);
      const canPasteAndGo = target.dataset.pasteAndGo === 'true';
      setMenu({
        target,
        left: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
        top: Math.max(8, Math.min(event.clientY, window.innerHeight - (canPasteAndGo ? 292 : 260))),
        pasteAndGoPath: null,
      });
      if (canPasteAndGo && isTauriDesktop()) {
        void readNativeClipboardText().then(value => {
          const path = getUsableExplorerAddress(value);
          setMenu(previous => previous?.target === target ? { ...previous, pasteAndGoPath: path } : previous);
        }).catch(() => {
          setMenu(previous => previous?.target === target ? { ...previous, pasteAndGoPath: null } : previous);
        });
      }
    };
    const onBeforeInput = (event: Event) => {
      const target = getTextTarget(event.target);
      if (target) beforeInputSnapshots.set(target, readSnapshot(target));
    };
    const onInput = (event: Event) => {
      const target = getTextTarget(event.target);
      if (!target) return;
      const history = getHistory(target);
      const before = beforeInputSnapshots.get(target) ?? history.last;
      const after = readSnapshot(target);
      if (before.value !== after.value) {
        history.undo.push(before);
        if (history.undo.length > MAX_HISTORY_LENGTH) history.undo.shift();
        history.redo = [];
      }
      history.last = after;
      beforeInputSnapshots.delete(target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = getTextTarget(event.target);
      if (!target || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        applyHistory(target, event.shiftKey ? 'redo' : 'undo');
      } else if (key === 'y') {
        event.preventDefault();
        applyHistory(target, 'redo');
      }
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setMenu(null);
        return;
      }
      if (event instanceof PointerEvent && menuRef.current?.contains(event.target as Node)) return;
      if (event.type === 'pointerdown' || event.type === 'scroll' || event.type === 'resize') setMenu(null);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close, true);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', close, true);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!menu) return null;

  const history = getHistory(menu.target);
  const readOnly = isReadOnly(menu.target);
  const selected = hasSelection(menu.target);
  const selectAllSeparatorIndex = menu.target.dataset.pasteAndGo === 'true' ? 5 : 4;
  const actions = [
    { label: t.textFieldContextMenu.undo, icon: <Undo2 className="h-3.5 w-3.5" />, disabled: history.undo.length === 0, run: () => applyHistory(menu.target, 'undo') },
    { label: t.textFieldContextMenu.redo, icon: <Redo2 className="h-3.5 w-3.5" />, disabled: history.redo.length === 0, run: () => applyHistory(menu.target, 'redo') },
    { label: t.textFieldContextMenu.copy, icon: <Copy className="h-3.5 w-3.5" />, disabled: !selected, run: () => { void copySelectedText(menu.target).catch(() => {}); } },
    { label: t.textFieldContextMenu.paste, icon: <ClipboardPaste className="h-3.5 w-3.5" />, disabled: readOnly, run: () => { void pasteText(menu.target).catch(() => {}); } },
    ...(menu.target.dataset.pasteAndGo === 'true' ? [{
      label: t.textFieldContextMenu.pasteAndGo,
      icon: <ClipboardPaste className="h-3.5 w-3.5" />,
      disabled: !menu.pasteAndGoPath,
      run: () => {
        if (menu.pasteAndGoPath) {
          menu.target.dispatchEvent(new CustomEvent('cyberfiles-paste-and-go', { bubbles: true, detail: menu.pasteAndGoPath }));
        }
      },
    }] : []),
    { label: t.textFieldContextMenu.selectAll, icon: <ListChecks className="h-3.5 w-3.5" />, disabled: false, run: () => selectAllText(menu.target) },
    { label: t.textFieldContextMenu.delete, icon: <Delete className="h-3.5 w-3.5" />, disabled: readOnly || !selected, run: () => deleteSelectedText(menu.target) },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t.textFieldContextMenu.label}
      style={{ left: menu.left, top: menu.top }}
      className="fixed z-[120] min-w-52 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 p-1 text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-100"
    >
      {actions.map((action, index) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={() => { action.run(); setMenu(null); }}
          className={'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left transition-colors ' + (index === 2 || index === selectAllSeparatorIndex ? 'mt-1 border-t border-neutral-800 pt-2 ' : '') + (action.disabled ? 'cursor-not-allowed text-neutral-600' : 'text-neutral-200 hover:bg-neutral-800 hover:text-cyan-200 active:bg-cyan-950/60')}
        >
          {action.icon}<span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
