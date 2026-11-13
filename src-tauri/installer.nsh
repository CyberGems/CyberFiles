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

; Keep the header layout unchanged (text left, artwork right) now that a
; branded header bitmap replaces the default NSIS header icon control, which
; rendered the app icon distorted at non-default DPI settings.
!define MUI_HEADERIMAGE_RIGHT

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKLM "${MANUPRODUCTKEY}" ""
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" ""
    DeleteRegKey /ifempty HKLM "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    ; The Explorer menu entry is an app registration, not user data, so a
    ; plain uninstall always removes it. The autostart Run entry points at the
    ; executable being removed, so it is cleared here too: making the deletion
    ; explicit keeps the uninstall correct no matter what the NSIS template's
    ; own cleanup happens to cover. Updates keep everything, matching the
    ; template's own app-data guard.
    DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInCyberFiles"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInCyberFiles"
    ; Matches AUTOSTART_RUN_VALUE in src-tauri/src/main.rs ("CyberFiles").
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CyberFiles"
  ${EndIf}
!macroend

; Add/Remove Programs "Comments": the Tauri NSIS template does not write it.
; Keep this line in sync with description in package.json.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "Comments" "A dual-pane file manager for Windows built for keyboard-first file work."
!macroend

!endif ; CYBERFILES_INSTALLER_NSH
