<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles">
</p>

## CyberFiles {{VERSION}}: Release Notes

### What is new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. -->
{{RELEASE_SUMMARY}}

> CyberFiles is a Windows-first file manager by CyberGems.

### Key features

- **Startup reliability:** resolves an immediate race-condition crash on launch in installed releases by ensuring backend application state is initialized before webview windows start navigation.
- **Windows shell integration:** open folders directly in CyberFiles from the Windows Explorer context menu on directories and background areas, and configure optional startup minimized to the tray.
- **Window activation:** ensures activating a second instance reliably restores and focuses the running CyberFiles window.
- **Large-folder browsing:** additional directory items load automatically as you scroll, while full folder counts remain available.
- **Flexible navigation:** dual vertical, dual horizontal, and single-pane layouts with independent tabs and history.
- **Recent work:** a Recents location lists the files you opened or previewed, sorted by last opened.
- **File management:** copy, move, rename, create folders, and send selected items to the Windows Recycle Bin. Queued operations show progress and can be paused or canceled.
- **Archive tools:** preview ZIP and RAR contents, extract password-protected archives, and create ZIP files.
- **Undo history:** reverse recent supported file operations from a ten-action history.
- **Command palette:** find commands and navigate to locations with Ctrl+K.
- **Useful previews:** view common text, Markdown, HTML, and image files in the preview pane.
- **Personal Quick Access:** pin folders from the sidebar or their context menu, rename and remove shortcuts, sort A–Z or Z–A, or arrange them manually by drag and drop.
- **Recent-item cues:** files and folders changed in the last 24 hours receive a subtle amber accent, with details available in their tooltips.
- **Customizable workspace:** details, compact, and icon views; adjustable columns; three themes; English and Spanish UI.
- **Informative status bar:** graphical drive usage and clearer details for local storage, selection, paths, and date and time.
- **System integration:** Windows-associated file icons, tray controls, Explorer context menu, and a configurable global shortcut.

### Características destacadas

- **Estabilidad de inicio:** soluciona el cierre inesperado al abrir la versión instalada garantizando que el estado del backend esté listo antes de que las ventanas carguen la interfaz.
- **Integración con el Shell de Windows:** abre carpetas directamente en CyberFiles desde el menú contextual del Explorador de Windows y configura el inicio minimizado en la bandeja del sistema.
- **Activación de ventana:** enfoca y restaura de forma fiable la ventana existente al intentar abrir una segunda instancia.
- **Navegación en carpetas grandes:** carga progresiva automática al desplazarse manteniendo el conteo completo de elementos.
- **Diseños flexibles:** doble vertical, doble horizontal y panel único con pestañas e historial independientes.
- **Ubicación Recientes:** lista los archivos abiertos o previsualizados ordenados por fecha de apertura.
- **Gestión de archivos:** operaciones en cola con pausa, cancelación, soporte de Papelera de reciclaje y 10 niveles de deshacer.

### Windows download

| File | Description | Platform |
| :--- | :--- | :--- |
| **[CyberFiles_{{VERSION_NUM}}_x64-setup.exe](https://github.com/CyberGems/CyberFiles/releases/download/{{VERSION}}/CyberFiles_{{VERSION_NUM}}_x64-setup.exe)** | Recommended NSIS installer. WebView2 is downloaded during setup if needed. | Windows 10 / 11 (x64) |
| **[CyberFiles_{{VERSION_NUM}}_x64-portable.zip](https://github.com/CyberGems/CyberFiles/releases/download/{{VERSION}}/CyberFiles_{{VERSION_NUM}}_x64-portable.zip)** | Extract and run without installation. Settings stay beside the app. Requires the WebView2 Evergreen Runtime. | Windows 10 / 11 (x64) |

### SHA-256 checksum

- **CyberFiles_{{VERSION_NUM}}_x64-setup.exe**: **{{SETUP_SHA256}}**
- **CyberFiles_{{VERSION_NUM}}_x64-portable.zip**: **{{PORTABLE_SHA256}}**
- The SHA-256 checksums are also included in the downloadable SHA256SUMS.txt file.

### VirusTotal

- **Automated scan:** {{VT_SCAN_STATUS}}
- **Security report:** [View report](https://www.virustotal.com/gui/file/{{SETUP_SHA256}})

---

*Made by [CyberGems](https://cybergems.org)*
