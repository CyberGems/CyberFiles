<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles">
</p>

## 📁 CyberFiles {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- changelog-summary:start -->
Crash recovery now restores unsaved tab sessions after an unexpected exit, the tray quits through the unsaved-changes gate and keeps This PC and Network on their dedicated layouts, folder actions hide where they cannot apply, and the update modal drops the pre-install guidance. Releases now ship winget manifests.
<!-- changelog-summary:end -->

> **New to CyberFiles?** A dual-pane Windows file manager with tabs, queued copy and move operations you can pause or undo, archive tools, and previews powered by the real Windows Shell.

---

### ✨ Key Features & Highlights

- 💾 **Crash recovery for tabs**: After an unexpected exit, the session of unsaved tabs is restored on the next launch, with the recovery boot check running once per webview load.

- 🖥️ **Tray layout and quit polish**: This PC and Network stay on their dedicated layouts, tray views are measured at startup and resized before swapping, folder actions hide where the virtual locations cannot apply, and quitting routes through the unsaved-changes gate.

- 🧹 **Updates, uninstall and maintenance**: The update modal skips "Before you install", the Windows uninstall entry shows the website and description, 12 npm dependencies plus the dialog and opener Tauri plugins are refreshed, and every release ships winget manifests.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

La recuperación tras fallo restaura ahora las sesiones de pestañas sin guardar tras una salida inesperada, la bandeja sale por la puerta de cambios sin guardar y mantiene Este equipo y Red en sus diseños dedicados, las acciones de carpeta se ocultan donde no aplican y el modal de actualización omite la guía previa. Los releases publican manifiestos winget.

> **¿Nuevo en CyberFiles?** Un gestor de archivos Windows de doble panel, con pestañas, operaciones de copia y movimiento en cola que puedes pausar o deshacer, herramientas de archivos comprimidos y vistas previas con el Shell real de Windows.

---

### ✨ Novedades destacadas

- 💾 **Recuperación de pestañas tras un fallo**: Tras una salida inesperada, la sesión de pestañas sin guardar se restaura en el siguiente arranque, con la comprobación de arranque de recuperación ejecutándose una vez por carga del webview.

- 🖥️ **Pulido de la bandeja**: Este equipo y Red mantienen sus diseños dedicados, las vistas de la bandeja se miden al arranque y se redimensionan antes del cambio, las acciones de carpeta se ocultan donde las ubicaciones virtuales no aplican, y salir pasa por la puerta de cambios sin guardar.

- 🧹 **Actualizaciones, desinstalación y mantenimiento**: El modal de actualización omite «Antes de instalar», la entrada de desinstalación de Windows muestra el sitio web y la descripción, se renuevan 12 dependencias de npm más los plugins Tauri de dialog y opener, y cada release publica manifiestos winget.

### ⚠️ Antes de instalar

- **Windows:** esta versión aún no está firmada digitalmente. SmartScreen puede avisar antes de ejecutarla: **Más información › Ejecutar de todas formas**. Cuando Smart App Control está activado, Windows rechaza programas sin firmar; consulta la [política de firma de código](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verifica la descarga con los checksums SHA256 que aparecen más abajo.

</details>

---

### ⚠️ Before you install

- **Windows:** this release is not code-signed yet. SmartScreen may ask before it runs: **More info › Run anyway**. Where Smart App Control is on, Windows refuses unsigned programs; see the [code signing policy](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verify the download with the SHA256 checksums below.

---

### 📦 Downloads & Packages

> ⬇️ **Direct download:** click a file name to download it now. Same files as in **Assets** at the bottom of this page.

| File | Description | Platform |
| :--- | :--- | :--- |
| **[`CyberFiles_{{VERSION_NUM}}_x64-setup.exe`](https://github.com/CyberGems/CyberFiles/releases/download/{{VERSION}}/CyberFiles_{{VERSION_NUM}}_x64-setup.exe)** | 🚀 **Recommended Installer** (NSIS setup with Start Menu, Desktop & Startup options) | Windows 10 / 11 (x64) |
| **[`CyberFiles_{{VERSION_NUM}}_x64-portable.zip`](https://github.com/CyberGems/CyberFiles/releases/download/{{VERSION}}/CyberFiles_{{VERSION_NUM}}_x64-portable.zip)** | 💼 **Portable Archive** (Extract and run without installation. Settings stay beside the app.) | Windows 10 / 11 (x64) |

---

### 🔐 VirusTotal and SHA256

> 🛡️ The report opens on VirusTotal and does not download anything.

**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{INSTALLER_HASH}})

```text
{{INSTALLER_HASH}}
```

**Portable**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{PORTABLE_HASH}})

```text
{{PORTABLE_HASH}}
```

The SHA-256 checksums are also included in the downloadable SHA256SUMS.txt file.

---

📜 **Full changelog:** browse every version in [CHANGELOG.md](https://github.com/CyberGems/CyberFiles/blob/main/CHANGELOG.md).

*Crafted with precision by [CyberGems](https://cybergems.org)*
