<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles">
</p>

## 📁 CyberFiles {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- COVERAGE: list every commit since the previous tag before drafting. Give every user-facing change at least one highlight and group related commits into one. Skip internal refactors, CI, tests and dependency bumps with no visible effect; keep small visible fixes such as copy, tooltips, shortcuts, themes, icons, spacing, stability and perceptible performance. Review the draft if 15+ user-facing commits produce fewer than 6 highlights, or 40+ total commits fewer than 8. Patch releases may have 1-3 highlights or a plain maintenance-only note. -->
<!-- changelog-summary:start -->
Adds Windows portable device browsing, native system drag-and-drop, a bulk timestamps and attributes editor with R/H/S flags, Explorer Shell flyouts, persistent filter history, automatic media-folder views, live folder watching, instant scan cancellation, clearer update controls, and refined tray, menu and title bar behavior.
<!-- changelog-summary:end -->

> **New to CyberFiles?** A dual-pane Windows file manager with tabs, queued copy and move operations you can pause or undo, archive tools, and previews powered by the real Windows Shell.

---

### ✨ Key Features & Highlights

- 📱 **Portable devices (MTP/PTP) and system drag-and-drop**: Browse `mtp:\` phones, tablets, and cameras in This PC and the sidebar, and drag files cleanly via Windows OLE between Desktop/Explorer and any CyberFiles pane, tab, breadcrumb, or sidebar target.
- 🕒 **Bulk timestamps & attributes studio (`Ctrl+Enter`)**: Modify Created, Modified, and Accessed dates, fill current time, copy dates between fields, shift timestamps with `+/−` relative offsets, change Read-Only/Hidden/System flags across subfolders, and inspect sortable `R/H/S` badges in the lister and Properties panel.
- 🪟 **Integrated Explorer Shell flyouts & sidebar menus**: Open "Show more options" with extracted native icons inside the app's own flyout menus, alongside full sidebar context menus, inline This PC tree browsing, and drag-to-Recycle-Bin.
- 🔎 **Persistent filter history with pins**: Reopen or pin frequent filter queries from a dropdown right below each pane's filter bar.
- 👁️ **Automatic default views & style controls**: Open media folders and Explorer icon-mode folders in Large Icons automatically, lock folder styles from the footer, and toggle Workspace Auto-Save from the header.
- ⚡ **Live watchers & instant cancellation**: Keep status bar drive capacities, folder counts, and flat-view caches updated immediately, and cancel hover-tooltip scans, manual size checks, Properties scans, and archive reads the moment focus moves.
- 🔄 **Update notification controls**: Expose toggles in Settings and About, separate download from installation in the notice, and improve the contrast of the control so automatic updates are easier to understand and manage.
- 🖥️ **Tray and title bar behavior**: Bring the window forward when a tray quit opens the unsaved-changes dialog, use the app name first in the tray window title, and standardize title bar hotkeys and `Alt+F4` so closing and quitting stay consistent.
- 🧭 **Quick Access and lister menus**: Group Recents and Recycle Bin under Quick Access, move Network to the end, keep the lister More-actions menu visible on short windows, and unify pane dropdown feedback and sidebar menu order, tooltips and target highlight.
- 🎯 **Usability & theme polish**: Firefox-style circular address bar buttons, shortcut badges on dialog buttons, reliable `Alt+Enter` Windows Properties, fixed GPU tab marquee animation, keep the restored tab centered at startup, toggleable footer selection menu, and theme-synced native window borders.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

Añade navegación por dispositivos portátiles Windows, arrastrar y soltar nativo, editor múltiple de fechas y atributos con insignias R/H/S, menús Shell, historial de filtros, vistas automáticas multimedia, vigilancia en vivo, cancelación inmediata de escaneos, controles de actualización más claros y bandeja, menús y barra de título refinados.

> **¿Nuevo en CyberFiles?** Un gestor de archivos Windows de doble panel, con pestañas, operaciones de copia y movimiento en cola que puedes pausar o deshacer, herramientas de archivos comprimidos y vistas previas con el Shell real de Windows.

---

### ✨ Novedades destacadas

- 📱 **Dispositivos portátiles (MTP/PTP) y arrastrar y soltar**: Explora teléfonos, tabletas y cámaras (`mtp:\`) desde Este equipo y la barra lateral, y arrastra archivos mediante Windows OLE entre el Escritorio/Explorador y cualquier panel, pestaña o miga de pan.
- 🕒 **Editor múltiple de fechas y atributos (`Ctrl+Enter`)**: Cambia fechas de Creación, Modificación y Último acceso, aplica la hora actual, copia una fecha a otra, desplaza horas con ajustes relativos `+/−`, edita Solo lectura/Oculto/Sistema en subcarpetas y visualiza insignias ordenables `R/H/S` en el listador y Propiedades.
- 🪟 **Menús Shell integrados y barra lateral contextual**: Abre "Mostrar más opciones" con sus iconos nativos dentro de los flyouts de la app, además de menús contextuales en la barra lateral, expansión en Este equipo y envío directo a la Papelera al soltar.
- 🔎 **Historial de filtros persistente y fijados**: Reutiliza o fija filtros frecuentes desde el desplegable situado bajo la barra de filtrado de cada panel.
- 👁️ **Vistas predeterminadas automáticas y control de estilos**: Abre carpetas multimedia en Iconos grandes automáticamente, bloquea estilos desde el pie del panel y activa o desactiva el autoguardado de espacios de trabajo desde la cabecera.
- ⚡ **Vigilancia en vivo y cancelación instantánea**: Mantiene al día capacidades de unidad, conteos en la barra de estado y vista plana, e interrumpe al instante cualquier escaneo de carpetas o comprimidos al retirar el cursor o cambiar de selección.
- 🔄 **Controles de notificaciones de actualización**: Añade interruptores en Ajustes y Acerca de, separa la descarga de la instalación en el aviso y mejora el contraste del control para entender y gestionar mejor las actualizaciones automáticas.
- 🖥️ **Comportamiento de bandeja y barra de título**: Trae la ventana al frente cuando la salida desde la bandeja abre el diálogo de cambios sin guardar, usa primero el nombre de la app en el título de la ventana de bandeja y unifica los atajos de la barra de título y `Alt+F4`.
- 🧭 **Acceso rápido y menús del listador**: Agrupa Recientes y Papelera en Acceso rápido, mueve Red al final, mantiene visible el menú Más acciones del listador en ventanas bajas y unifica la respuesta de los desplegables de panel y el orden, tooltips y resaltado de destino de los menús de la barra lateral.
- 🎯 **Mejoras de usabilidad y temas**: Botones circulares estilo Firefox en la barra de dirección, badges de atajos en botones de diálogos, `Alt+Enter` corregido para Propiedades de Windows, marquee GPU de pestañas reparado, pestaña restaurada centrada al iniciar y bordes nativos sincronizados con los tres temas.

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

> 🛡️ The report opens on VirusTotal and does not download anything. Sometimes one or two antivirus providers flag a safe file while the rest clear it; that is usually a false alarm. Our software is threat-free and the source code is public, so anyone can check it. Compare the SHA-256 below with your download and use only the links on this page.
> 🛡️ El informe se abre en VirusTotal y no descarga nada. A veces uno o dos proveedores de antivirus marcan un archivo seguro mientras los demás lo dan por limpio; suele ser una falsa alarma. Nuestro software está libre de amenazas y el código es público, cualquiera puede comprobarlo. Compara el SHA-256 de abajo con tu descarga y usa solo los enlaces de esta página.

**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{INSTALLER_HASH}})

```text
{{INSTALLER_HASH}}
```

**Portable**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{PORTABLE_HASH}})

```text
{{PORTABLE_HASH}}
```


The checksums are also available as a downloadable [SHA256SUMS.txt](https://github.com/CyberGems/CyberFiles/releases/download/{{VERSION}}/SHA256SUMS.txt).

---

📜 **Full changelog:** browse every version in [CHANGELOG.md](https://github.com/CyberGems/CyberFiles/blob/main/CHANGELOG.md).

*Crafted with precision by [CyberGems](https://cybergems.org)*
