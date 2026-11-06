import { CornerDownLeft } from 'lucide-react';

/**
 * Suite-wide rendering for keyboard hints: the Enter hint shows the return
 * glyph, matching DialogButton, tooltip shortcut chips and CyberNotes'
 * EnterGlyph. Every other key renders as its textual form.
 */
export function KeyboardShortcutContent({ shortcut }: { shortcut: string }) {
  return shortcut === 'Enter' ? (
    <CornerDownLeft className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
  ) : (
    <>{shortcut}</>
  );
}
