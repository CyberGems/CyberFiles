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
    ; The Explorer menu entry is an app registration, not user data, so a
    ; plain uninstall always removes it (the autostart Run entry is already
    ; cleared by the template above). Updates keep everything, matching the
    ; template's own app-data guard.
    DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInCyberFiles"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInCyberFiles"
  ${EndIf}
!macroend

!endif ; CYBERFILES_INSTALLER_NSH
