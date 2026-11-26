<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles">
</p>

## 📁 CyberFiles {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- COVERAGE: list every commit since the previous tag before drafting. Give every user-facing change at least one highlight and group related commits into one. Skip internal refactors, CI, tests and dependency bumps with no visible effect; keep small visible fixes such as copy, tooltips, shortcuts, themes, icons, spacing, stability and perceptible performance. Review the draft if 15+ user-facing commits produce fewer than 6 highlights, or 40+ total commits fewer than 8. Patch releases may have 1-3 highlights or a plain maintenance-only note. -->
<!-- changelog-summary:start -->
Fixes system tray menu positioning, mixed-DPI scaling, and vertical taskbar anchoring across multi-monitor setups, tightens the tray flyout gap to 4px, and adds an Exit option to the titlebar More menu.
<!-- changelog-summary:end -->

> **New to CyberFiles?** A dual-pane Windows file manager with tabs, queued copy and move operations you can pause or undo, archive tools, and previews powered by the real Windows Shell.

---

### ✨ Key Features & Highlights

- 🪟 **Accurate multi-monitor and mixed-DPI tray placement**: Reworked tray positioning in physical coordinates with per-monitor DPI handling and painted reveal so the menu opens cleanly beside vertical or horizontal taskbars with a `4px` flyout gap.
- 🚪 **Exit from the titlebar menu**: Added an `Exit CyberFiles` item to the titlebar More menu for quick full shutdown without using the system tray.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

Corrige el posicionamiento del menú de bandeja, el escalado en monitores con DPI mixto y el anclaje en barras verticales, ajusta el espacio de los flyouts a 4px y añade la opción Salir al menú Más de la barra de título.

> **¿Nuevo en CyberFiles?** Un gestor de archivos Windows de doble panel, con pestañas, operaciones de copia y movimiento en cola que puedes pausar o deshacer, herramientas de archivos comprimidos y vistas previas con el Shell real de Windows.

---

### ✨ Novedades destacadas

- 🪟 **Posicionamiento preciso en multimonitor y DPI mixto**: Se rehizo el cálculo de la bandeja en píxeles físicos con soporte DPI por monitor y revelado tras pintar, abriendo sin saltos junto a barras verticales u horizontales con un espacio de `4px` entre flyouts.
- 🚪 **Opción Salir en la barra de título**: Se agregó `Salir de CyberFiles` al menú Más de la barra de título para cerrar la aplicación por completo sin pasar por la bandeja del sistema.

### ℹ️ Antes de instalar

- **Windows:** esta versión aún no está firmada digitalmente. SmartScreen puede avisar antes de ejecutarla: **Más información › Ejecutar de todas formas**. Cuando Smart App Control está activado, Windows rechaza programas sin firmar; consulta la [política de firma de código](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verifica la descarga con los checksums SHA256 que aparecen más abajo.

</details>

---

### ℹ️ Before you install

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
