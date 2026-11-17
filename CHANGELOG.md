# Changelog

All notable changes to CyberFiles are documented here.

## [0.10.0] - 2026-11-17

### 🇺🇸 English

- Add crash recovery: after an unexpected exit, the session of unsaved tabs is restored on the next launch, with the recovery boot check running once per webview load.
- Route tray quit through the unsaved-changes gate, and keep This PC and Network on their dedicated layouts.
- Measure every tray view at startup and resize the tray window before swapping views.
- Hide folder actions that the virtual locations cannot perform.
- Hide the Before you install guidance from the update modal.
- Show the CyberFiles website and description in the Windows uninstall entry.
- Update 12 npm dependencies and ship winget manifests with every release.

### 🇪🇸 Español

- Añade la recuperación tras fallo: tras una salida inesperada, la sesión de pestañas sin guardar se restaura en el siguiente arranque, con la comprobación de arranque de recuperación ejecutándose una vez por carga del webview.
- Pasa la salida de la bandeja por la puerta de cambios sin guardar, y mantiene Este equipo y Red en sus diseños dedicados.
- Mide cada vista de la bandeja al arranque y redimensiona la ventana antes de cambiar de vista.
- Oculta las acciones de carpeta que las ubicaciones virtuales no pueden realizar.
- Oculta la guía Antes de instalar del modal de actualización.
- Muestra el sitio web de CyberFiles y su descripción en la entrada de desinstalación de Windows.
- Actualiza 12 dependencias de npm y publica manifiestos winget con cada release.

## [0.9.0] - 2026-11-12

### 🇺🇸 English

- Tiles view: Explorer-style horizontal cards with the preview on the left and type, size and modified date on the right, reachable with Ctrl+4 from the action bar, context menu, header menu and command palette, and remembered per folder.
- Explorer-style thumbnails in the Grid and Tiles views, drawn through the Windows Shell thumbnail pipeline: video frames, PDF and Office first pages, audio album art, photo stacks for folders that contain images, and HEIC or AVIF when Windows has a codec for them, with a Settings toggle to turn item thumbnails off.
- Preview zoom for the Grid and Tiles views: Ctrl+mouse wheel or Ctrl+= / Ctrl+- steps the preview cells through four sizes from small to extra large, remembered per folder, with matching entries in the three view menus.
- Audio and video playback in the properties panel, streaming the file from disk through the asset protocol without copying it; formats the player cannot handle offer to open the file with its application.
- Small thumbnails in the Details view rows for files; folders keep their consistent icon.
- A webview-extracted video frame as a fallback when the Windows Shell has no thumbnail for a video, cached per path and limited to four concurrent decoders.
- Grid and Tiles previews draw unframed like Windows File Explorer: folder photo stacks float whole, thumbnails fill the cell edge to edge, and icons without a preview float unframed.
- Shell thumbnail batches extract eight files at a time, so folders never opened in Explorer no longer crawl on their first pass.
- Grid and Tiles request jumbo 256px Shell icons, keeping enlarged icons crisp instead of blurry.
- Shell icon and thumbnail lookups no longer silently return nothing on machines where the worker thread already had a COM apartment of another type, and larger cached thumbnail bitmaps are resized to the requested square instead of being discarded.
- A logon launch that finds the app already running now hands off silently instead of revealing a window that start-minimized keeps in the tray.
- The uninstaller explicitly removes the autostart Run entry so a removed install cannot leave a stale logon value behind.

### 🇪🇸 Español

- Vista Mosaicos: tarjetas horizontales al estilo del Explorador con la vista previa a la izquierda y tipo, tamaño y fecha de modificación a la derecha, accesible con Ctrl+4 desde la barra de acciones, el menú contextual, el menú de la cabecera y la paleta de comandos, y recordada por carpeta.
- Miniaturas al estilo del Explorador en las vistas Cuadrícula y Mosaicos, dibujadas a través del pipeline de miniaturas del Shell de Windows: fotogramas de vídeo, primeras páginas de PDF y Office, portadas de audio, pilas de fotos en carpetas que contienen imágenes, y HEIC o AVIF cuando Windows tiene el códec, con un interruptor en Configuración para desactivar las miniaturas de los elementos.
- Zoom de vista previa para las vistas Cuadrícula y Mosaicos: Ctrl+rueda del ratón o Ctrl+= / Ctrl+- recorre las celdas de vista previa por cuatro tamaños, de pequeño a extra grande, recordado por carpeta, con las mismas opciones en los tres menús de vistas.
- Reproducción de audio y vídeo en el panel de propiedades, transmitiendo el archivo desde el disco a través del protocolo de assets sin copiarlo; los formatos que el reproductor no puede manejar ofrecen abrir el archivo con su aplicación.
- Miniaturas pequeñas en las filas de la vista de detalles para archivos; las carpetas conservan su icono habitual.
- Un fotograma de vídeo extraído por la propia webview como respaldo cuando el Shell de Windows no tiene miniatura para un vídeo, guardado en caché por ruta y limitado a cuatro decodificadores simultáneos.
- Las vistas previas de Cuadrícula y Mosaicos se dibujan sin marco como el Explorador de archivos de Windows: las pilas de fotos de las carpetas flotan enteras, las miniaturas llenan la celda de borde a borde y los iconos sin vista previa flotan sin marco.
- Los lotes de miniaturas del Shell extraen ocho archivos a la vez, así las carpetas nunca abiertas en el Explorador ya no van lentas en su primera pasada.
- Cuadrícula y Mosaicos piden iconos jumbo de 256px del Shell, manteniendo nítidos los iconos ampliados en lugar de borrosos.
- Las consultas de iconos y miniaturas al Shell ya no devuelven vacío en silencio en equipos donde el hilo de trabajo ya tenía un apartment COM de otro tipo, y los bitmaps de miniaturas en caché más grandes se redimensionan al cuadrado solicitado en lugar de descartarse.
- Un inicio por sesión que encuentra la app ya abierta ahora cede el paso en silencio en lugar de mostrar una ventana que el inicio minimizado mantiene en la bandeja.
- El desinstalador elimina explícitamente la entrada Run de autoarranque, así que una instalación retirada no puede dejar un valor de inicio obsoleto.

## [0.8.0] - 2026-11-11

### 🇺🇸 English

- Adaptive tab strip: the add-tab button sits next to the last tab when there is room, and once the tabs outgrow the bar it anchors to the edge with scroll arrows that support press-and-hold.
- Tabs list button on the tab strip, always available: search tabs by name or path, jump to any tab, close individual tabs, or close everything except the active one behind an inline confirmation.
- Titlebar update notice button that opens the update dialog directly while an update is pending.
- Rich folder tooltips for custom quick access cards in This PC, with the same contents box and size scan as the default folders.
- Update notes now show in the interface language, with the full release body shipped in the updater manifest.
- Unsaved changes are asked about before the close dialog, so the tray-or-quit question only appears once the changes are resolved.
- The unsaved-changes dialog header uses a bare neutral icon, and the close dialog opens without a flash by preloading its module.
- This PC sections form three columns from 880px of list width, covering common 150% scaled displays.
- The active tab is kept in view while the tab strip settles at startup, and the tab strip no longer flashes the add button's hover after adding a tab.
- Fixed a hook order crash that could stop the app while opening the changes dialog.
- The tabs list toggle, the inline close-all behavior, and the active tab's close glyph color were corrected after user feedback.

### 🇪🇸 Español

- Tira de pestañas adaptativa: el botón de añadir pestaña se sitúa junto a la última pestaña cuando hay espacio, y cuando las pestañas desbordan la barra se ancla al borde con flechas de desplazamiento que admiten mantener pulsado.
- Botón de lista de pestañas en la tira, siempre disponible: busca pestañas por nombre o ruta, salta a cualquiera, ciérralas una a una o ciérralas todas menos la activa tras una confirmación inline.
- Botón de aviso de actualización en la barra de título que abre el diálogo de actualización directamente mientras hay una pendiente.
- Tooltips ricos de carpeta para las tarjetas de acceso rápido personalizadas en Este equipo, con la misma caja de contenidos y escaneo de tamaño que las carpetas por defecto.
- Las notas de la versión se muestran ahora en el idioma de la interfaz, con el cuerpo completo del release incluido en el manifiesto del actualizador.
- Los cambios sin guardar se preguntan antes del diálogo de cierre, así la elección entre bandeja y salida solo aparece cuando ya están resueltos.
- La cabecera del diálogo de cambios sin guardar usa un icono neutro sencillo, y el diálogo de cierre se abre sin destellos precargando su módulo.
- Las secciones de Este equipo forman tres columnas desde 880px de ancho de lista, cubriendo pantallas habituales al 150%.
- La pestaña activa se mantiene a la vista mientras la tira se asienta al arrancar, y la tira ya no destella el hover del botón de añadir tras crear una pestaña.
- Corregido un cierre inesperado por orden de hooks que podía detener la app al abrir el diálogo de cambios.
- El interruptor de la lista de pestañas, el comportamiento de cierre total inline y el color del glifo de cierre de la pestaña activa se corrigieron tras el feedback de los usuarios.

## [0.7.0] - 2026-11-10

### 🇺🇸 English

- Network drive support: browse LAN devices and SMB shares, navigate UNC paths, map and disconnect network drives, and authenticate with a native credentials dialog.
- Windows environment variables in folder paths (for example %APPDATA%), resolved at navigation time.
- Keyboard navigation for context menus and tab menus: arrow keys, anchored submenu flyouts, radio items, horizontal band navigation, and Space to activate menu items.
- Operations badge on the status bar button counting completed and failed operations since the last review, resetting when the operations center is opened, with a setting to turn the completed count off (on by default).
- Lister text size setting with scaled rows and headers, plus command palette commands for it.
- Configurable toast duration, hover pause, and a close button on toasts.
- Terminal launcher and flat view commands in the command palette.
- Offer to return to the previous folder when a removed drive reconnects.
- Compacted toolbar: merged view controls into a dropdown, overflow menu portal, and group collapsing measured from the window size.
- Command bar hugs its controls with refined split hover and category separators.
- Simplified the unsaved changes dialog to a Cancel prompt with an Esc hint.
- Startup panel and column preferences are no longer overridden by the layout profile, and legacy migration profiles are named in the stored language.
- Space now selects or deselects the focused item instead of toggling the properties panel (F3 keeps the panel), and the shortcuts modal documents both.
- Logical drive changes are watched automatically, tabs left on removed drives recover or return to This PC, stale session paths are sanitized, and Quick Access or recent folders on missing drives are marked offline.
- Removed the gap between the top tab strip and the navigation bar so tabs connect with the address bar block.
- Kept the batch rename modal open when a rename is rejected, localized its interface, and aligned filename validation with the backend.
- Hardened native folder listing, bounded flat view scans, and decoded legacy text previews.
- Set a main window background color to prevent the startup flash and fixed the squashed NSIS header icon.
- Do not force the properties panel open when opening a file, and polished Details view column headers and the extension column.

### 🇪🇸 Español

- Soporte de unidades de red: explora dispositivos LAN y recursos SMB, navega rutas UNC, conecta y desconecta unidades de red y autentícate con el diálogo nativo de credenciales.
- Variables de entorno de Windows en las rutas de carpetas (por ejemplo %APPDATA%), resueltas al navegar.
- Navegación por teclado en los menús contextuales y de pestañas: flechas, submenús anclados, elementos de opción, navegación horizontal por bandas y Espacio para activar los elementos del menú.
- Insignia de operaciones en el botón de la barra de estado que cuenta las operaciones completadas y fallidas desde la última revisión, se reinicia al abrir el centro de operaciones y tiene un ajuste para desactivar el conteo de completadas (activado por defecto).
- Ajuste de tamaño de texto del listador con filas y cabeceras escaladas, más comandos para él en la paleta de comandos.
- Duración configurable de los avisos, pausa al pasar el cursor y botón de cierre en los avisos.
- Comandos de lanzador de terminal y de vista plana en la paleta de comandos.
- Oferta de volver a la carpeta anterior cuando una unidad retirada se reconecta.
- Barra de herramientas compacta: controles de vista combinados en un desplegable, menú de desbordamiento en portal y colapso de grupos medido según el tamaño de la ventana.
- La barra de comandos abraza sus controles con un hover dividido refinado y separadores de categoría.
- Diálogo de cambios sin guardar simplificado a un aviso de Cancelar con pista de Esc.
- Las preferencias de panel de inicio y de columnas ya no las sobrescribe el perfil de diseño, y los perfiles de migración antiguos se nombran en el idioma guardado.
- Espacio ahora selecciona o deselecciona el elemento enfocado en lugar de alternar el panel de propiedades (F3 mantiene el panel), y el modal de atajos documenta ambos.
- Los cambios de unidades lógicas se vigilan automáticamente, las pestañas de unidades retiradas se recuperan o vuelven a Este equipo, las rutas de sesión obsoletas se depuran y los accesos rápidos o carpetas recientes en unidades ausentes se marcan como sin conexión.
- Eliminado el hueco entre la tira de pestañas superior y la barra de navegación para que las pestañas conecten con el bloque de la barra de direcciones.
- El modal de renombrado por lotes se mantiene abierto cuando se rechaza un renombrado, su interfaz está localizada y la validación de nombres está alineada con el backend.
- Listado nativo de carpetas reforzado, escaneos de vista plana acotados y vistas previas de texto antiguas decodificadas.
- Color de fondo de la ventana principal fijado para evitar el destello de arranque, e icono de cabecera NSIS aplastado corregido.
- Ya no se fuerza la apertura del panel de propiedades al abrir un archivo, y las cabeceras de columna de la vista de detalles y la columna de extensión están pulidas.

## [0.6.3] - 2026-10-29

### 🇺🇸 English

- Search modal search preservation preference with prompt on close ("Keep", "Discard", and "Remember decision" options).
- Backdrop click dismiss support for search modal.
- Operations Center placement on the far right of the status bar, tracking create, rename, delete, restore, and undo operations with dedicated `Ctrl+J` shortcut.
- Modern lister context menu header with Windows 11 style quick-action buttons (Cut, Copy, Rename, Delete).
- Address bar empty area right-click support to directly enter edit mode and open context menu.
- Converted search modal input evaluation to concurrent `useDeferredValue` queries with windowed batch rendering and precompiled regexes for zero-latency keystroke response.
- Stabilized search modal layout height to prevent vertical jumping between empty and populated result states.
- Enhanced search scope labels to distinguish current folder count and multi-tab item totals with clear iconography.
- Fixed React hook call order in search modal by moving modal open guard past all hook invocations.
- Fixed elevated Administrator terminal launches to preserve current directory context.
- Fixed context menu viewport clamping to prevent off-screen overflow.

### 🇪🇸 Español

- Preferencia de conservación de la búsqueda en el modal de búsqueda con pregunta al cerrar (opciones "Conservar", "Descartar" y "Recordar decisión").
- Cierre del modal de búsqueda al hacer clic en el fondo.
- Centro de Operaciones situado en el extremo derecho de la barra de estado, registrando creaciones, renombrados, eliminaciones, restauraciones y deshacer con el atajo dedicado `Ctrl+J`.
- Cabecera moderna del menú contextual del listador con botones de acción rápida estilo Windows 11 (Cortar, Copiar, Renombrar, Eliminar).
- Clic derecho en las áreas vacías de la barra de direcciones para entrar directamente en modo de edición y abrir el menú contextual.
- La evaluación de la entrada del modal de búsqueda usa consultas concurrentes con `useDeferredValue`, renderizado por lotes en ventana y expresiones regulares precompiladas para una respuesta sin latencia al teclear.
- Altura del diseño del modal de búsqueda estabilizada para evitar saltos verticales entre los estados con y sin resultados.
- Etiquetas de ámbito de búsqueda mejoradas para distinguir el conteo de la carpeta actual y los totales de varias pestañas con iconografía clara.
- Corregido el orden de llamadas de los hooks de React en el modal de búsqueda moviendo la guarda de apertura tras todas las invocaciones de hooks.
- Corregidos los lanzamientos de terminal como Administrador para conservar el contexto de la carpeta actual.
- Corregido el ajuste del menú contextual al viewport para evitar desbordes fuera de pantalla.

## [0.6.2] - 2026-10-29

### 🇺🇸 English

- Fixed frameless window minimization and taskbar persistence.
- Repaired window hiding on maximize or restore.
- Aligned sidebar collapsible section header hover colors with theme tokens.
- Ensured reliable background system tray icon registration, with automatic recovery from Windows startup delays or timeouts.
- Fixed titlebar double-click maximize behavior and pointer drag handling across the custom title bar controls.
- Folders open directly from the Windows Explorer context menu and startup options register cleanly, without background console windows.

### 🇪🇸 Español

- Corregida la minimización de la ventana sin bordes y su persistencia en la barra de tareas.
- Reparado el ocultado de la ventana al maximizar o restaurar.
- Alineados los colores de hover de los encabezados colapsables de la barra lateral con las variables de tema.
- Registro fiable del icono de la bandeja del sistema en segundo plano, con recuperación automática de retrasos o tiempos de espera al iniciar Windows.
- Corregida la maximización por doble clic en la barra de título y el manejo del arrastre en los controles personalizados de la barra de título.
- Las carpetas se abren directamente desde el menú contextual del Explorador de Windows y las opciones de inicio se registran limpiamente, sin ventanas de consola en segundo plano.

## [0.6.1] - 2026-10-28

### 🇺🇸 English

- Windows Explorer context menu integration and startup preferences.
- Second-instance window activation.
- Fixed application state initialization before window creation to resolve launch crashes in installed builds.

### 🇪🇸 Español

- Integración con el menú contextual del Explorador de Windows y preferencias de inicio.
- Activación de la ventana al abrir una segunda instancia.
- Corregida la inicialización del estado de la aplicación antes de crear la ventana, resolviendo los cierres inesperados al abrir las versiones instaladas.

## [0.6.0] - 2026-10-24

### 🇺🇸 English

- New Recents location listing the files opened or previewed in CyberFiles, newest first, fed by the app's own access log; in Details view the modified column becomes Last opened, and single entries can be removed or the whole history cleared.
- Locations panel collapses from the command bar or with Ctrl+L and both panes take the full width; each pane keeps a single action row that swaps between the filter and the selection actions so the list never jumps, typing fills the filter by default, and Esc always leaves it.
- Rename and Copy path moved to the pane action bar; clicking the name of an already selected item starts an inline rename and the name field fills the row.
- Deletion follows your answer: the dialog can remember its choice, Shift+Delete opens it with permanent deletion already ticked, and Settings general deletion options restore the confirmation or make permanent deletion the default; a recycle delete is undoable the moment Windows moves the item, and restoring resolves the recorded entry instead of scanning the Recycle Bin.
- Reset to factory settings in Settings returns every preference, folder style, quick access entry, layout and history to its initial value without touching your files.
- Toolbar labels show the name of each action beside its icon on the right, left, top or bottom, or keep icons only.
- Folder summary in the inspector: selecting a folder shows its files, folders, content type and total size, and the status bar counters open the selection shortcuts.
- More image formats preview: ICO, CUR, TIFF and SVG in the properties panel and in tooltips.
- Branded installer: setup uses the CyberFiles artwork and follows the system language, English or Spanish.
- Fixed a duplicate row after a rename, an inline rename that committed the old name, a crash on empty Markdown and HTML previews, tooltips covering the pane bars, and a five-second delete caused by reading the Recycle Bin.

### 🇪🇸 Español

- Nueva ubicación Recientes que lista los archivos abiertos o previsualizados en CyberFiles, los más recientes primero, alimentada por el registro de accesos de la propia app; en la vista de detalles la columna de modificación pasa a ser de última apertura, y se puede borrar una entrada o vaciar todo el historial.
- El panel de ubicaciones se colapsa desde la barra de comandos o con Ctrl+L y ambos paneles ocupan todo el ancho; cada panel mantiene una única fila de acciones que alterna entre el filtro y las acciones de selección para que la lista no salte, al escribir se rellena el filtro por defecto y Esc siempre lo abandona.
- Renombrar y Copiar ruta se trasladan a la barra de acciones del panel; hacer clic en el nombre de un elemento ya seleccionado inicia un renombrado inline y el campo de nombre ocupa toda la fila.
- La eliminación sigue tu respuesta: el diálogo puede recordar la elección, Shift+Delete lo abre con la eliminación permanente ya marcada y las opciones de eliminación de Configuración restauran la confirmación o hacen permanente la eliminación por defecto; borrar a la Papelera se puede deshacer en cuanto Windows mueve el elemento, y restaurar resuelve la entrada registrada en lugar de escanear la Papelera de reciclaje.
- Restablecer a los ajustes de fábrica en Configuración devuelve cada preferencia, estilo de carpeta, acceso rápido, diseño e historial a su valor inicial, sin tocar tus archivos.
- Las etiquetas de la barra de herramientas muestran el nombre de cada acción junto a su icono a la derecha, izquierda, arriba o abajo, o solo iconos.
- Resumen de la carpeta en el inspector: al seleccionar una carpeta muestra sus archivos, carpetas, tipo de contenido y tamaño total, y los contadores de la barra de estado abren los atajos de selección.
- Más formatos de imagen con vista previa: ICO, CUR, TIFF y SVG en el panel de propiedades y en los tooltips.
- Instalador con la marca: el instalador usa el arte de CyberFiles y sigue el idioma del sistema, español o inglés.
- Corregidos una fila duplicada tras renombrar, un renombrado inline que confirmaba el nombre antiguo, un cierre inesperado con vistas previas vacías de Markdown y HTML, tooltips que cubrían las barras del panel y una eliminación de cinco segundos causada por leer la Papelera de reciclaje.

## [0.5.0] - 2026-10-21

### 🇺🇸 English

- Custom tray menu.
- Searchable settings with per-folder styles.
- Redesigned lister with live column resizing and instant selection.
- Folder-centric address bar.
- Faster navigation, mouse gestures, and GPL-3.0 licensing.

### 🇪🇸 Español

- Menú de bandeja personalizado.
- Ajustes con búsqueda y estilos por carpeta.
- Listador rediseñado con cambio de tamaño de columnas en vivo y selección instantánea.
- Barra de direcciones centrada en las carpetas.
- Navegación más rápida, gestos del ratón y licencia GPL-3.0.

## [0.4.0] - 2026-10-02

### 🇺🇸 English

- Recursive folder browsing and flexible tab layouts.
- Clearer folder details, plus improved navigation and keyboard selection.

### 🇪🇸 Español

- Navegación recursiva de carpetas y diseños de pestañas flexibles.
- Detalles de carpeta más claros, además de navegación y selección con teclado mejoradas.

## [0.3.0] - 2026-10-01

### 🇺🇸 English

- Progressive loading for large folders: additional directory items load automatically as you scroll while full folder counts remain available.
- Refreshed onboarding flow.
- Reliable Quick Access reordering.
- Clearer storage and date details in the status bar.

### 🇪🇸 Español

- Carga progresiva para carpetas grandes: los elementos se cargan automáticamente al desplazarse mientras se mantiene el conteo completo de la carpeta.
- Flujo de bienvenida renovado.
- Reordenación fiable de los accesos rápidos.
- Detalles más claros de almacenamiento y fechas en la barra de estado.

## [0.2.0] - 2026-09-29

### 🇺🇸 English

- Command palette (Ctrl+K) with current-folder context and clearer folder-size feedback.
- ZIP and RAR archive preview and extraction with password support, plus ZIP creation.
- Queued activity center for file operations, with progress, pause and cancel for queued operations.
- Undo history reversing recent supported file operations from a ten-action history.
- Native Windows file icons.
- Refinements to dual-pane workflows, sessions and selection actions.

### 🇪🇸 Español

- Paleta de comandos (Ctrl+K) con contexto de la carpeta actual e información más clara del tamaño de las carpetas.
- Vista previa y extracción de archivos ZIP y RAR con soporte de contraseñas, además de creación de ZIP.
- Centro de actividad con cola para las operaciones de archivos, con progreso, pausa y cancelación de las operaciones en cola.
- Historial de deshacer para revertir operaciones recientes soportadas desde un historial de diez acciones.
- Iconos de archivo nativos de Windows.
- Refinamientos en los flujos de doble panel, las sesiones y las acciones de selección.

## [0.1.0] - 2026-09-25

### 🇺🇸 English

- First Windows installer preview of CyberFiles: dual-pane navigation with dual vertical, dual horizontal and single-pane layouts, independent tabs and history, and file management with copy, move, rename and Recycle Bin support.
- Common text, Markdown, HTML and image previews; Quick Access shortcuts sortable A to Z or by drag and drop; recent-item cues with a subtle amber accent for changes in the last 24 hours; three themes; English and Spanish UI; tray controls and a configurable global shortcut.

### 🇪🇸 Español

- Primera vista previa del instalador de Windows de CyberFiles: navegación de doble panel con diseños de doble vertical, doble horizontal y panel único, pestañas e historial independientes, y gestión de archivos con copiar, mover, renombrar y soporte de Papelera de reciclaje.
- Vistas previas de texto, Markdown, HTML e imágenes; accesos rápidos ordenables de la A a la Z o arrastrando; avisos con un sutil acento ámbar para lo cambiado en las últimas 24 horas; tres temas; interfaz en español e inglés; controles de bandeja y un atajo global configurable.
