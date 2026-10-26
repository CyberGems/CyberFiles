; CyberFiles - NSIS installer hooks
;
; The Tauri NSIS template remembers the last install folder as the default
; value of ${MANUPRODUCTKEY} so a reinstall lands in the same place, but it
; clears that value only under the uninstaller's own shell context (SHCTX).
; A leftover in the other hive then overrides the install-mode choice on every
; later run: picking "only for me" can still be forced to Program Files.
; Clear the remembered path in both hives so a stale value can never win; the
; /ifempty pass drops the key only when nothing else remains in it.

!ifndef CYBERFILES_INSTALLER_NSH
!define CYBERFILES_INSTALLER_NSH

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKLM "${MANUPRODUCTKEY}" ""
  DeleteRegValue HKCU "${MANUPRODUCTKEY}" ""
  DeleteRegKey /ifempty HKLM "${MANUPRODUCTKEY}"
  DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
!macroend

!endif ; CYBERFILES_INSTALLER_NSH
