; CyberFiles - NSIS installer hooks
;
; The Tauri NSIS template remembers the last install folder as the default
; value of ${MANUPRODUCTKEY} so a reinstall lands in the same place. It clears
; that value only when the uninstaller's "Delete app data" checkbox is ticked
; AND only under the uninstaller's own shell context (SHCTX), so a plain
; uninstall leaves it behind in both hives. A stale value then overrides the
; install-mode choice on every later run: picking "only for me" can still be
; forced to Program Files. Clear it in both hives here; the /ifempty pass drops
; the key only when nothing else remains in it. Updates are skipped, matching
; the template, so an update keeps the current folder.

!ifndef CYBERFILES_INSTALLER_NSH
!define CYBERFILES_INSTALLER_NSH

!include LogicLib.nsh

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKLM "${MANUPRODUCTKEY}" ""
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" ""
    DeleteRegKey /ifempty HKLM "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
  ${EndIf}
!macroend

!endif ; CYBERFILES_INSTALLER_NSH
