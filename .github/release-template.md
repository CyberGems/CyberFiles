<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles">
</p>

## 📁 CyberFiles {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! The summary paragraph below is injected from the annotated tag message. Use 25-45 words for the tag summary, lead with user-facing changes, and do not repeat the app name or version. -->
{{RELEASE_SUMMARY}}

> **New to CyberFiles?** A dual-pane Windows file manager with tabs, queued copy and move operations you can pause or undo, archive tools, and previews powered by the real Windows Shell.

---

### ✨ Key Features & Highlights

- **Tiles view:** A fourth view lays items out as Explorer-style cards, preview on the left and type, size and modified date on the right. Ctrl+4 switches to it, and every folder remembers whether it prefers it.
- **Explorer-style thumbnails:** Grid and Tiles draw the same previews Windows File Explorer shows, through the Shell's own pipeline: video frames, document first pages, audio album art and photo stacks for folders. A frame extracted by the app itself fills the gap for videos the Shell cannot thumbnail.
- **Preview zoom:** Ctrl+mouse wheel or Ctrl+= / Ctrl+- steps the Grid and Tiles preview cells through four sizes, remembered per folder, with the same sizes offered in the pane, context and header view menus.
- **Media in the properties panel:** Audio and video files play right in the preview pane, streaming from disk without copying the file; formats the player cannot handle offer to open the file with its application.
- **Startup hardening:** A logon launch that finds the app already running stays in the tray, the uninstaller now removes the autostart entry, and Shell lookups stopped silently returning empty on machines where the COM apartment was already initialized.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

Cuarta vista en Mosaicos, miniaturas reales al estilo del Explorador y zoom de vista previa por carpeta. Los vídeos y la música se reproducen en el panel de propiedades, y el arranque automático queda reforzado tras actualizar.

> **¿Nuevo en CyberFiles?** Un gestor de archivos Windows de doble panel, con pestañas, operaciones de copia y movimiento en cola que puedes pausar o deshacer, herramientas de archivos comprimidos y vistas previas con el Shell real de Windows.

---

### ✨ Novedades destacadas

- **Vista Mosaicos:** Un cuarto modo presenta los elementos como tarjetas al estilo del Explorador, con la vista previa a la izquierda y tipo, tamaño y fecha de modificación a la derecha. Ctrl+4 activa la vista y cada carpeta recuerda si la prefiere.
- **Miniaturas al estilo del Explorador:** Cuadrícula y Mosaicos dibujan las mismas vistas previas que muestra el Explorador de Windows, a través del propio pipeline del Shell: fotogramas de vídeo, primeras páginas de documentos, portadas de audio y pilas de fotos en carpetas. Un fotograma extraído por la propia app cubre los vídeos que el Shell no puede miniaturizar.
- **Zoom de vista previa:** Ctrl+rueda del ratón o Ctrl+= / Ctrl+- recorre las celdas de Cuadrícula y Mosaicos por cuatro tamaños, recordado por carpeta; los menús de vistas del panel, del contexto y de la cabecera ofrecen los mismos tamaños.
- **Medios en el panel de propiedades:** Los archivos de audio y vídeo se reproducen en el propio panel, transmitiendo desde el disco sin copiar el archivo; los formatos que el reproductor no puede manejar ofrecen abrirlos con su aplicación.
- **Arranque reforzado:** Un inicio por sesión que encuentra la app ya abierta se queda en la bandeja, el desinstalador elimina ahora la entrada de autoarranque, y las consultas al Shell dejaron de devolver vacío en equipos con el apartment COM ya inicializado.

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

*Crafted with precision by [CyberGems](https://cybergems.org)*
