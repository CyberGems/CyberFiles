<p align="center">
  <a href="./README.md">English</a> · Español
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberFiles">
    <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles, un gestor de archivos de doble panel para Windows" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberFiles/releases/latest"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FCyberGems%2FCyberFiles%2Fmain%2Fpackage.json&query=%24.version&prefix=%20Descargar%20CyberFiles%20v&suffix=%20&style=for-the-badge&label=&labelColor=0891B2&color=0891B2" alt="Descargar la última versión" /><img src="https://img.shields.io/badge/Windows_10%2F11_(64--bit)-2563EB?style=for-the-badge" alt="Windows 10/11 (64 bits)" /></a>
  &nbsp;<a href="https://github.com/CyberGems/CyberFiles/releases"><img src="https://img.shields.io/badge/Todas_las_versiones-30363D?style=for-the-badge&logo=github&logoColor=white" alt="Todas las versiones" /><img src="https://img.shields.io/badge/Notas_de_la_versi%C3%B3n-475569?style=for-the-badge" alt="Notas de la versión" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Licencia-GPL--3.0-1F2428.svg?style=flat-square&color=334155" alt="Licencia" />&nbsp;
  <img src="https://img.shields.io/badge/Plataforma-Windows_10%2F11-1F2428.svg?style=flat-square&color=334155" alt="Plataforma" />&nbsp;
  <img src="https://img.shields.io/badge/Tauri-2.x-1F2428.svg?style=flat-square&logo=tauri&logoColor=white&color=334155" alt="Tauri" />&nbsp;
  <img src="https://img.shields.io/badge/React-19-1F2428.svg?style=flat-square&logo=react&logoColor=white&color=334155" alt="React" />&nbsp;
  <a href="https://github.com/CyberGems/CyberFiles/wiki"><img src="https://img.shields.io/badge/Wiki-Documentaci%C3%B3n-1F2428?style=flat-square&logo=gitbook&logoColor=white&color=334155" alt="Wiki" /></a>
</p>

---

## ¿Qué es CyberFiles?

CyberFiles es un **gestor de archivos de doble panel para Windows** pensado para quienes mueven archivos todo el día y quieren que el teclado haga casi todo el trabajo. Combina dos paneles independientes, cada uno con sus propias pestañas e historial, con vistas de detalles, lista e iconos, diseños y sesiones guardados, operaciones de copia y movimiento en cola con deshacer, una ubicación Recientes que lista lo que abriste, herramientas para ZIP y RAR y un panel de propiedades que previsualiza texto, imágenes, PDF y el contenido de archivos comprimidos. El descubrimiento de unidades, los iconos nativos, la Papelera de reciclaje y el diálogo de propiedades de Windows se resuelven a través del Shell de Windows, no con imitaciones. Creado con **Tauri 2**, **Rust**, **React** y **TypeScript**.

*Gratuito y de código abierto (GPLv3): sin anuncios, sin rastreo, sin telemetría y sin cuenta. Todo se ejecuta en tu PC.*

---

## 🗂️ ¿Por qué CyberFiles?

La mayoría de los gestores de archivos de Windows esconden el segundo panel tras una versión de pago o rodean las operaciones básicas de cuadros de diálogo. CyberFiles mantiene el flujo clásico de dos paneles, añade pestañas y espacios de trabajo encima, y muestra lo que ocurre con cada copia, movimiento y borrado.

| Necesidad | Solución |
|---|---|
| Trabajar en dos carpetas a la vez | Diseños doble vertical, doble horizontal o de panel único, cada panel con sus propias pestañas |
| Conservar un flujo de trabajo entre sesiones | Diseños, sesiones de pestañas y espacios de trabajo guardados, restaurados al iniciar si quieres |
| Volver al archivo que acabas de previsualizar | Una ubicación Recientes alimentada por el propio registro de aperturas de CyberFiles, con columna de última apertura |
| Mover muchos archivos con seguridad | Operaciones en cola con progreso, pausa, cancelación, errores por elemento e historial de deshacer |
| Ver dentro de un archivo sin abrirlo | Panel de propiedades con vistas previas de texto, código, Markdown, HTML, imágenes, PDF y archivos comprimidos |
| Manejar archivos comprimidos sin salir | Previsualizar y extraer ZIP y RAR, incluidos los protegidos con contraseña, y crear archivos ZIP |
| Encontrar las cosas rápido | Paleta de comandos, filtro en el panel y buscador global con patrones y expresiones regulares |
| Ordenar un árbol de carpetas caótico | Acceso rápido, árbol de carpetas, vista plana, estilos guardados por carpeta e iconos personalizados |
| No estorbar | Bandeja del sistema, atajo global configurable, instancia única y posición de ventana recordada |

---

## ✨ Funciones principales

### 🗂️ Paneles, pestañas y espacios de trabajo
- **Tres diseños**: doble vertical, doble horizontal y panel único, con un divisor arrastrable entre paneles
- **Pestañas independientes**: cada panel conserva sus pestañas, historial de navegación, filtro y selección
- **Control de pestañas**: duplicar, renombrar, colorear, bloquear o reabrir desde el menú de la pestaña; colocar la barra de pestañas arriba, abajo, a la izquierda o a la derecha; elegir pestañas horizontales o verticales con ancho automático, fijo o uniforme
- **Contenido de la pestaña nueva**: elige si una pestaña nueva abre la carpeta predeterminada, la carpeta actual, un duplicado de la pestaña, tu carpeta personal, una pestaña vacía o una ubicación concreta
- **Diseños, sesiones y espacios de trabajo**: guarda el diseño actual, guarda una sesión de pestañas y combina ambos en un espacio de trabajo que se restaura en un paso
- **Comportamiento al iniciar**: continuar donde lo dejaste, abrir Este equipo o cargar una sesión guardada, desde Configuración o la pantalla de bienvenida
- **Avisos de cambios sin guardar**: guardar, actualizar o descartar los cambios pendientes de diseño y sesión al cerrar la ventana

### 📁 Navegación y vistas
- **Vista Este equipo**: unidades, carpetas habituales de Windows, ubicaciones de red y carpetas avanzadas de Windows en un solo lugar
- **Barra de direcciones**: la ruta de la carpeta actual con segmentos en los que puedes hacer clic; pulsa un nivel superior para volver, pulsa el segmento actual para actualizar la lista y abre carpetas recientes desde el chevron del borde derecho
- **Barra lateral**: solo ubicaciones, para que el árbol no salga nunca de la pantalla: acceso rápido con árbol de carpetas de carga diferida, unidades con barras de capacidad, carpetas avanzadas de Windows y estado de la Papelera de reciclaje
- **Panel de ubicaciones plegable**: oculta la barra lateral con Ctrl+L, con el botón junto al de propiedades o desde la paleta de comandos, y ambos paneles ocupan todo el ancho; la elección forma parte de los diseños guardados
- **Recientes**: una ubicación virtual que lista los archivos abiertos o previsualizados en CyberFiles, ordenados por última apertura, con columna de última apertura, eliminación por elemento y una acción para vaciar el historial
- **Acceso rápido**: fija hasta 100 carpetas, renombra o elimina accesos y ordénalos A–Z, Z–A o manualmente arrastrando (Alt+Arriba y Alt+Abajo también funcionan)
- **Vistas**: Detalles, Lista e Iconos grandes, con columnas redimensionables, columnas que se añaden u ocultan, encabezados ordenables y agrupación por fecha o tamaño
- **Gráficos relativos**: barras opcionales detrás de tamaños y fechas que muestran de un vistazo la forma de una carpeta
- **Carga progresiva**: las carpetas grandes cargan mientras te desplazas y la barra de estado mantiene totales exactos de archivos, carpetas y elementos
- **Vista plana**: lista de forma recursiva todas las subcarpetas en una sola lista, con confirmación cuando el árbol es grande
- **Filtro**: reduce la lista actual mientras escribes, sin lanzar una búsqueda completa; escribir rellena el filtro en lugar de saltar a un nombre, la consulta pasa a ser una ficha sobre la lista cuando hay selección y Esc siempre sale de él
- **Gestos de mouse**: mantén el botón derecho y arrastra a izquierda o derecha para retroceder o avanzar, o arriba y abajo para ir al inicio o al final de la lista; un clic derecho normal sigue abriendo el menú contextual
- **Bloqueo de estilo de carpeta**: mantén la vista, el orden y el ancho de columnas al navegar, o deja que cada carpeta use su estilo guardado
- **Iconos de carpeta personalizados**: elige icono, color e insignia de estado para una carpeta; CyberFiles lo guarda y nunca modifica Windows

### 🚚 Operaciones con archivos
- **Transferencias entre paneles**: copia con F5 o mueve con F6, o arrastra elementos entre paneles con la acción prevista visible antes de soltar
- **Portapapeles**: cortar, copiar y pegar con los atajos de Windows
- **Centro de operaciones**: copia, movimiento, extracción y creación de ZIP pasan por una cola con progreso, pausa, reanudación, cancelación y errores por elemento
- **Historial de deshacer**: las últimas diez acciones compatibles se revierten desde la barra de herramientas o desde el menú contextual del panel, con el motivo indicado cuando una acción no se puede deshacer
- **Crear y renombrar**: carpeta nueva, documento de texto nuevo, acceso directo nuevo, renombrado individual y un estudio de renombrado múltiple con buscar y reemplazar, prefijo, sufijo, numeración secuencial y cambios de mayúsculas; renombrar y copiar ruta están en la barra de acciones del panel, el campo de nombre ocupa la fila y un clic en el nombre de un elemento seleccionado inicia el renombrado en línea
- **Copiar ruta**: Ctrl+Shift+C copia la ruta de la selección, o la de la carpeta actual si no hay selección, desde la barra de acciones, el menú contextual o la paleta de comandos
- **Borrado a tu manera**: las eliminaciones van a la Papelera de reciclaje mediante el Shell, y Shift+Supr abre el diálogo con el borrado permanente ya marcado; el diálogo puede recordar el modo elegido para que las siguientes eliminaciones lo omitan, y Configuración › Eliminación restaura la confirmación o hace que el borrado permanente sea el predeterminado. La barra lateral muestra el contenido de la Papelera con acciones de restaurar y vaciar
- **Sin sobrescrituras silenciosas**: los conflictos de nombre reciben un nombre distinto en lugar de reemplazar un elemento existente

### 🗜️ Archivos comprimidos y vista previa
- **Vista previa de comprimidos**: lista el contenido de archivos ZIP y RAR, con petición de contraseña en los protegidos
- **Extracción**: extrae aquí o en una carpeta con el nombre del archivo, rechazando rutas no seguras
- **Crear ZIP**: comprime la selección o la carpeta actual en un archivo nuevo
- **Panel de propiedades**: vistas previas de texto, código, Markdown, HTML, imágenes y PDF, además de codificación, número de líneas y metadatos completos; al seleccionar una carpeta se añade un bloque de contenido con sus archivos, carpetas, tipo de contenido y tamaño total
- **Vistas previas de imagen**: PNG, JPEG, GIF, WebP, BMP, TIFF, ICO y SVG, con la misma miniatura en el tooltip del archivo y en la vista de iconos
- **Acciones rápidas**: copiar el contenido del archivo, copiar la ruta completa o abrir el diálogo de propiedades original de Windows

### 🔎 Búsqueda y herramientas
- **Paleta de comandos (Ctrl+K)**: salta a comandos y ubicaciones sin dejar el teclado
- **Buscador global de archivos**: busca por nombre o patrón, usa expresiones regulares, filtra por tamaño, tipo o categoría y localiza cualquier resultado en el panel activo
- **Búsqueda en contenido**: busca texto que CyberFiles ya haya previsualizado, con una nota explícita sobre qué se busca
- **Historial de búsquedas**: reutiliza o borra consultas recientes
- **Chuleta de atajos (F1)**: el mapa de teclas completo, disponible desde la barra de herramientas y la barra de estado
- **Tamaño de carpetas**: mantén el puntero sobre una carpeta para calcular su total, o pídelo desde la columna; los contadores de la barra de estado abren los atajos de selección y explican el total de la carpeta

### 🖥️ Integración con Windows
- **Iconos y propiedades nativos**: los iconos provienen de las aplicaciones asociadas en Windows y el botón de propiedades abre el diálogo real del sistema
- **Terminales y Explorador**: abre el Símbolo del sistema o PowerShell, con variantes de administrador, muestra la carpeta actual en el Explorador de archivos de Windows y salta a carpetas avanzadas de Windows
- **Bandeja del sistema**: un menú con estilo propio muestra el estado de la ventana, el atajo global, enlaces de ayuda, otras apps de CyberGems y la configuración
- **Atajo global**: muestra u oculta CyberFiles desde cualquier lugar con una combinación configurable (Alt+Shift+F por defecto)
- **Control de instancias**: instancia única por defecto, con opción de permitir ventanas separadas en cada inicio
- **Actualizaciones integradas**: la app consulta el manifiesto firmado de versiones al iniciar y cada seis horas, muestra las novedades e instala la versión nueva sobre la actual con la firma verificada; una versión que omitas no se vuelve a ofrecer
- **Memoria de ventana**: se restauran tamaño, posición y estado maximizado, y al cerrar puedes minimizar a la bandeja o salir con la decisión recordada
- **Detalle en la barra de estado**: recuentos de carpetas, tamaño de la selección, capacidad de la unidad, longitud de la ruta, fecha, hora y zona horaria

### 🎨 Personalización
- **3 temas**: CyberFiles (oscuro con acento cian), Gris y Claro
- **Interfaz bilingüe**: interfaz completa en inglés y español
- **Formatos de fecha**: estilo de la aplicación, configuración regional del sistema o ISO
- **Opciones de visualización**: resaltado de elementos recientes y estilo de elementos ocultos con tus propios colores, miniaturas de imágenes en tooltips, avisos y tooltips opcionales
- **Etiquetas de la barra**: muestra el nombre de cada acción junto a su icono a la derecha, izquierda, arriba o abajo, o deja solo los iconos; los atajos de teclado siguen en el tooltip de cada botón
- **Comportamiento al escribir**: elige si la primera letra escrita en un panel rellena el filtro o salta al primer nombre que coincide
- **Búsqueda en la configuración**: filtra los ajustes de todas las pestañas desde un solo campo
- **Restablecimiento de fábrica**: Configuración › General devuelve cada preferencia, estilo de carpeta, acceso rápido e historial a su valor inicial, sin tocar tus archivos
- **Pantalla de bienvenida**: configuración inicial de idioma, tema, estilo de carpetas y comportamiento al iniciar

---

## 🚀 Primeros pasos

### Instalación

1. Descarga la [última versión](https://github.com/CyberGems/CyberFiles/releases/latest)
2. Ejecuta el instalador NSIS, o extrae el ZIP portable y abre `CyberFiles.exe`
3. Sigue la pantalla de bienvenida para elegir idioma, tema, estilo de carpetas y comportamiento al iniciar

El instalador ofrece una instalación por usuario o para todo el sistema; la opción para todo el sistema puede pedir aprobación de administrador. El instalador usa la ilustración de CyberFiles y sigue el idioma del sistema, inglés o español. Si falta el entorno Microsoft Edge WebView2 Evergreen Runtime, el instalador descarga su bootstrapper, por lo que necesitas conexión a internet durante la instalación.

Los archivos de la versión incluyen `SHA256SUMS.txt` con las sumas de comprobación de ambos paquetes, para que puedas verificar una descarga antes de ejecutarla.

### Edición portable

El ZIP portable contiene `CyberFiles.exe` y un breve `README.txt`. Extráelo donde quieras y ejecuta el archivo; no hace falta instalador. La configuración y el perfil de WebView2 se guardan en la carpeta `CyberFiles_Data` junto al ejecutable, así que conserva esa carpeta al mover o respaldar la aplicación y mantén la ubicación con permisos de escritura.

El perfil portable es independiente del de una copia instalada, y ambas ediciones pueden ejecutarse a la vez. Los paquetes portables están destinados a Windows 10 y 11 en x64 y requieren WebView2 Evergreen Runtime, que ya está presente en instalaciones actuales de Windows 11 y en muchas de Windows 10 actualizadas.

### 🛡️ Windows SmartScreen

Windows puede mostrar un aviso de SmartScreen la primera vez que ejecutas el instalador de CyberFiles: es una app de hobby sin firma, así que Windows todavía no tiene reputación del archivo. Es lo esperado; el código es público para que puedas inspeccionar exactamente qué hace. Lo mismo puede aparecer al abrir la versión portable.

Para continuar:

<details>
<summary><strong>Ver cómo ejecutar el instalador (paso a paso)</strong></summary>

Windows muestra este aviso con cualquier instalador sin un certificado de firma de código de pago; no significa que el archivo sea inseguro. <strong>No</strong> pulses "No ejecutar":

1. Ejecuta el instalador `CyberFiles-Setup.exe`. Windows puede mostrar el diálogo azul "Windows protegió tu PC".

![Aviso de Windows SmartScreen](https://cybergems.org/branding/smartscreen-warning.svg)

2. Pulsa el enlace pequeño **Más información**.

![Diálogo de SmartScreen tras Más información](https://cybergems.org/branding/smartscreen-runanyway.svg)

3. Pulsa **Ejecutar de todas formas**. El instalador arranca con normalidad.

Puedes verificar el archivo de forma independiente: compara el SHA con el de la versión en GitHub, analízalo en VirusTotal o compílalo desde el código fuente. Más detalles: [guía de SmartScreen en el sitio web](https://cybergems.org/download#smartscreen).

</details>

---

## 🛠️ Tecnologías y arquitectura

- **Plataforma:** Windows 10 y 11 (x64)
- **Shell de escritorio:** Tauri 2 con Rust
- **Interfaz:** React 19, TypeScript, Vite y Tailwind CSS 4
- **Integración con Windows:** los crates `windows` y `windows-sys` para operaciones del Shell, extracción de iconos, información de unidades y la Papelera de reciclaje
- **Archivos comprimidos:** el crate `zip` (con AES) y `unrar-rs`
- **Almacenamiento:** sin base de datos; las preferencias viven en el perfil de WebView y en pequeños archivos JSON de la carpeta de configuración
- **Entorno de ejecución:** Microsoft Edge WebView2 Evergreen Runtime

```
CyberFiles/
├── src/                        Frontend React
│   ├── components/             Paneles, pestañas, diálogos, ajustes, vista previa
│   ├── locales/                Textos en inglés y español
│   ├── themes/                 Contexto de temas
│   ├── tray/                   Ventana de bandeja, catálogo de la suite y estilos
│   ├── utils/                  Utilidades de archivos, espacios de trabajo, índice de búsqueda
│   ├── App.tsx                 Estructura de la app, estado y teclado
│   └── main.tsx                Punto de entrada del frontend
├── src-tauri/
│   ├── src/main.rs             Comandos, integración con el Shell, bandeja y atajo global
│   ├── src/windows_file_icons.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/                    Empaquetado portable y helper del servidor de desarrollo
├── public/                     Iconos de la aplicación
├── tray.html                   Entrada de la ventana de bandeja
├── vite.config.ts
└── package.json
```

### Puntos clave de la arquitectura

- **Rust controla el sistema de archivos**: copiar, mover, renombrar, borrar, comprimir y consultar unidades ocurre en comandos nativos, no en el webview
- **Comportamiento fiel al Shell de Windows**: los borrados usan `IFileOperation` con la marca de reciclaje, los iconos vienen de las listas de imágenes del Shell y las propiedades abren el diálogo real de Windows
- **Transferencias en cola**: las operaciones informan del progreso y del resultado por elemento, de modo que los fallos parciales siguen visibles
- **Dos puntos de entrada en el frontend**: `index.html` para la ventana principal y `tray.html` para el menú transparente de la bandeja, compilados por una sola configuración de Vite
- **Interfaz diferida**: el panel de archivos y cada diálogo se cargan bajo demanda, lo que mantiene ligero el arranque

### Compilar desde el código fuente (desarrolladores)

Solo es necesario si quieres trabajar en CyberFiles o compilarlo tú mismo; los usuarios habituales pueden saltarse esta sección.

#### Requisitos

Node.js 22 o superior (el flujo de publicación usa Node 24), un toolchain estable de Rust con el target `x86_64-pc-windows-msvc` y los [requisitos de Tauri para Windows](https://v2.tauri.app/start/prerequisites/): herramientas de compilación de Microsoft C++ y el entorno WebView2. Compilar el instalador también requiere NSIS.

#### Desarrollo

```powershell
npm ci
npm run dev
```

`npm run dev` inicia la app de escritorio mediante Tauri y gestiona el servidor de Vite internamente. No hay un modo de navegador compatible; el servidor interno de Vite existe solo para diagnosticar la interfaz.

#### Comprobaciones y pruebas

```powershell
npm test
npm run test:native
npm run check
```

`npm test` ejecuta las pruebas unitarias de TypeScript, `npm run test:native` las de Rust y `npm run check` la comprobación de tipos y la compilación del frontend.

#### Compilación

```powershell
npm run build:desktop
npm run build:installer
npm run build:portable
```

El ejecutable de depuración se genera en `src-tauri/target/debug/cyberfiles.exe`. La compilación del instalador crea un paquete NSIS en `src-tauri/target/release/bundle/nsis`, y la portable crea un ZIP en `src-tauri/target/release/bundle/portable`. La primera compilación nativa tarda varios minutos mientras se compilan las dependencias de Rust.

Publicar una etiqueta anotada `v*` que coincida con las versiones de `package.json` y `src-tauri/tauri.conf.json` compila y publica una versión; el mensaje de la etiqueta se convierte en el resumen de la versión.

#### Firma de las versiones

Las copias instaladas verifican cada actualización con una clave minisign. La clave pública vive en `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); la privada es el secreto `TAURI_SIGNING_PRIVATE_KEY` del repositorio, junto con `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` si la clave tiene contraseña. Sin ese secreto el flujo de publicación se detiene antes de compilar, porque un instalador sin firma se instalaría y luego nunca se actualizaría.

Cada versión escribe además `latest.json` (versión, notas, URL del instalador y firma) y lo publica en la rama `updater`. La app lee esa rama en lugar de `releases/latest/download/latest.json`, porque todas las versiones 0.x se marcan como pre-release y el endpoint `latest` de GitHub las ignora.

---

## ⌨️ Atajos de teclado

| Tecla | Acción |
|---|---|
| `Tab` | Cambiar entre el panel izquierdo y el derecho |
| `F1` | Abrir la chuleta de atajos de teclado |
| `F2` | Renombrar el elemento seleccionado |
| `Ctrl+Shift+C` | Copiar la ruta de la selección, o la de la carpeta si no hay selección |
| `F3` o `Espacio` | Mostrar u ocultar el panel de propiedades |
| `Ctrl+L` | Mostrar u ocultar el panel de ubicaciones |
| `F5` | Copiar la selección al panel opuesto |
| `F6` | Mover la selección al panel opuesto |
| `F7` | Crear una carpeta en la ubicación actual |
| `Ctrl+R` | Abrir el renombrado múltiple |
| `Ctrl+F` | Buscar por nombre, ruta o contenido disponible |
| `Ctrl+K` | Abrir la paleta de comandos y ubicaciones |
| `Ctrl+T` / `Ctrl+W` | Abrir una pestaña / cerrar la pestaña activa |
| `Ctrl+A` | Seleccionar todos los elementos visibles |
| `Shift+flechas` | Ampliar o reducir la selección |
| `Shift+Inicio` / `Shift+Fin` | Seleccionar hasta el principio o el final de la lista |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copiar, cortar y pegar archivos |
| `Backspace` | Subir a la carpeta superior |
| `Enter` | Abrir una carpeta o un archivo |
| `Supr` | Enviar la selección a la Papelera de reciclaje, o borrar permanentemente con `Shift+Supr` |
| `Esc` | Cerrar diálogos y salir del filtro |
| `Alt+Shift+F` | Mostrar u ocultar CyberFiles (global, configurable) |

Con la lista de archivos enfocada, escribir letras rellena el filtro de forma predeterminada, o salta a un nombre coincidente si desactivas esa opción en Configuración › Navegación; en el modo de salto, repetir la letra recorre las coincidencias. Con el orden manual del Acceso rápido, Alt+Arriba y Alt+Abajo mueven el acceso enfocado.

---

## 🧪 Estado del proyecto

CyberFiles es una versión preliminar temprana centrada en Windows. La versión actual valida el instalador empaquetado, la edición portable y los flujos ampliados de gestión de archivos. Otras plataformas de escritorio no se han validado.

Dos limitaciones actuales son intencionadas y están documentadas:

- **Las ubicaciones de red no se pueden usar como destino de borrado.** El borrado a la Papelera acepta solo rutas locales canónicas en unidades fijas o extraíbles; las rutas UNC, las unidades de red asignadas, los medios ópticos y las raíces del sistema de archivos se rechazan con un error por elemento. Usa el Explorador de Windows para borrar en red.
- **Vaciar la Papelera sigue el comportamiento de Windows.** Pasa una ruta nula al Shell, que vacía las Papeleras de todas las unidades, así que su alcance puede ser mayor que el del indicador de estado. Es permanente y no se puede deshacer.

Consulta [Operaciones de archivos y seguridad](https://github.com/CyberGems/CyberFiles/wiki/File-Operations-and-Safety) para la lista completa de comportamientos.

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Abre un issue describiendo el cambio antes de empezar un trabajo grande y envía pull requests contra la rama principal. Mantén los textos visibles para el usuario disponibles en inglés y en español.

## 🙏 Agradecimientos

CyberFiles se apoya en componentes de código abierto como [Tauri](https://tauri.app/), [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide](https://lucide.dev/), el crate [`zip`](https://crates.io/crates/zip) y [`unrar-rs`](https://crates.io/crates/unrar-rs), gracias a sus autores y mantenedores.

La compatibilidad con RAR incluye código fuente de UnRAR. Sus términos de licencia se reproducen en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## ❤️ Donar

Después de incontables horas construyendo y refinando **CyberFiles** para mi propio uso, hace poco decidí compartirlo con el mundo junto al resto de mis herramientas de código abierto en [CyberGems](https://github.com/CyberGems#-all-apps--repositories).

Si te apetece apoyar futuras actualizaciones, lo agradecería de verdad. Tu donación ayuda a mantener el desarrollo, publicar nuevas funciones, acelerar actualizaciones y correcciones, y mejorar la documentación. También puedes mostrar tu apoyo [dándole una estrella al repositorio en GitHub](https://github.com/CyberGems/CyberFiles). ¡Gracias! 🙏

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=M4PY3UPJA5Y6Q"><img src="https://img.shields.io/badge/Donar-PayPal-0070BA?style=for-the-badge&logo=paypal" alt="Donar por PayPal" /></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/cybergems"><img src="https://img.shields.io/badge/Ap%C3%B3yame_en_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Apóyame en Ko-fi" /></a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/cybergems"><img src="https://img.shields.io/badge/Invitarme_a_un_caf%C3%A9-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Invitarme a un café" /></a>
</p>

<div align="center">

<details>
<summary><b>Donaciones en criptomonedas (BTC, ETH, USDT, LTC): pulsa para ver las direcciones</b></summary>

| Activo | Dirección | QR |
|---|---|---|
| **BTC** | <pre><code>bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4</code></pre> | <img src="assets/donate/qr-btc.png" width="90" height="90" alt="QR BTC" /> |
| **ETH** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="assets/donate/qr-eth.png" width="90" height="90" alt="QR ETH" /> |
| **USDT (ERC20 / BEP20)** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="assets/donate/qr-eth.png" width="90" height="90" alt="QR USDT" /> |
| **USDT (TRC20)** | <pre><code>TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD</code></pre> | <img src="assets/donate/qr-usdt-tron.png" width="90" height="90" alt="QR USDT TRC20" /> |
| **LTC** | <pre><code>LWGnEHgcFCE2BRkzLnsdPDD8Y8ZeDK577X</code></pre> | <img src="assets/donate/qr-ltc.png" width="90" height="90" alt="QR LTC" /> |

> ⚠️ Envía solo el activo seleccionado en la red indicada. Usar la red equivocada provoca la pérdida permanente de los fondos.

</details>

</div>

---

## 📄 Licencia

CyberFiles se distribuye bajo los términos de la Licencia Pública General GNU v3.0. Consulta [LICENSE](LICENSE) para el texto completo de la licencia.

Copyright (C) 2026 CyberGems

---

## ❓ Preguntas frecuentes

Para guías de uso, configuración, atajos de teclado, detalles de seguridad y solución de problemas, visita la [wiki de CyberFiles](https://github.com/CyberGems/CyberFiles/wiki):

| Página | Qué cubre |
|---|---|
| [Cómo se usa CyberFiles](https://github.com/CyberGems/CyberFiles/wiki/How-Do-You-Use) | Este equipo, paneles, pestañas, vistas e inspección de elementos |
| [Configuración](https://github.com/CyberGems/CyberFiles/wiki/Settings) | Temas, idioma, navegación, inicio y atajo global |
| [Operaciones de archivos y seguridad](https://github.com/CyberGems/CyberFiles/wiki/File-Operations-and-Safety) | Cola, deshacer, Papelera y restricciones de red |
| [Instalación y configuración](https://github.com/CyberGems/CyberFiles/wiki/Installation-and-Setup) | Versiones, edición portable, comandos de desarrollo y compilaciones |
| [Solución de problemas](https://github.com/CyberGems/CyberFiles/wiki/Troubleshooting) | Dudas habituales sobre operaciones, archivos comprimidos y atajos |

---

<div align="center" style="background:#0D0F17; border:1px solid rgba(0,255,255,0.12); border-radius:12px; padding:28px 20px; margin-top:32px;">

### ¡Gracias por usar CyberFiles! 🎉

Creado por [**CyberGems**](https://cybergems.org)

</div>
<p align="center">
  <a href="https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles&title=CyberFiles%3A%20un%20gestor%20de%20archivos%20de%20doble%20panel%20para%20Windows"><img src="https://img.shields.io/badge/Compartir_en_Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white" alt="Compartir en Reddit" /></a>
  &nbsp;<a href="https://twitter.com/intent/tweet?text=CyberFiles%3A%20un%20gestor%20de%20archivos%20de%20doble%20panel%20para%20Windows&url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Compartir_en_X-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="Compartir en X" /></a>
  &nbsp;<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Compartir_en_Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white" alt="Compartir en Facebook" /></a>
  &nbsp;<a href="mailto:?subject=CyberFiles%3A%20un%20gestor%20de%20archivos%20de%20doble%20panel%20para%20Windows&body=CyberFiles%3A%20un%20gestor%20de%20archivos%20de%20doble%20panel%20para%20Windows%20https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Compartir_por_Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Compartir por correo" /></a>
  &nbsp;<a href="https://t.me/share/url?url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles&text=CyberFiles%3A%20un%20gestor%20de%20archivos%20de%20doble%20panel%20para%20Windows"><img src="https://img.shields.io/badge/Compartir_en_Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Compartir en Telegram" /></a>
  &nbsp;<a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Compartir_en_LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Compartir en LinkedIn" /></a>
</p>

---

## 🔗 Ver también

Más aplicaciones gratuitas, de código abierto y con la privacidad primero de [**CyberGems**](https://github.com/CyberGems):

| App | Descripción |
|:---:|---|
| 🕐&nbsp;[**CyberClock**](https://github.com/CyberGems/CyberClock#readme) | Reloj de escritorio con analógico y digital, calendario, temporizador, cronómetro y módulo de relajación. |
| 📢&nbsp;[**CyberFeeds**](https://github.com/CyberGems/CyberFeeds#readme) | Lector RSS y Atom de alto rendimiento y local-first, creado para la velocidad, la privacidad y la lectura limpia. |
| 🚀&nbsp;[**CyberLauncher**](https://github.com/CyberGems/CyberLauncher#readme) | Lanzador de aplicaciones de Windows con esquinas calientes, programador, monitor de sistema y terminal integrada. |
| 💻&nbsp;[**CyberManager**](https://github.com/CyberGems/CyberManager#readme) | Gestor de tareas ligero y de alto rendimiento, virtualizado y nativo de NT, una potente alternativa al Administrador de Tareas. |
| 📝&nbsp;[**CyberNotes**](https://github.com/CyberGems/CyberNotes#readme) | App de notas centrada en la privacidad con texto enriquecido, carpetas, pestañas y almacenamiento local protegido con bcrypt. |
| ⚡&nbsp;[**CyberPaste**](https://github.com/CyberGems/CyberPaste#readme) | Gestor de portapapeles centrado en la privacidad para texto, código, imágenes, HTML y archivos. |
| 📸&nbsp;[**CyberSnap**](https://github.com/CyberGems/CyberSnap#readme) | Suite de captura y anotación de pantalla con herramientas vectoriales, OCR de alta velocidad, grabación de pantalla y selector de color. |
| ⭐&nbsp;[**CyberTray**](https://github.com/CyberGems/CyberTray#readme) | Lanzador de bandeja de alto rendimiento con hotspots, monitoreo de sistema, gestor de procesos y bóveda de archivos protegida con PIN. |
| 💫&nbsp;[**CyberViewer**](https://github.com/CyberGems/CyberViewer#readme) | Visor y editor de imágenes completo diseñado para usuarios casuales y avanzados. |
| 🛡️&nbsp;[**CyberWall**](https://github.com/CyberGems/CyberWall#readme) | Cortafuegos de Windows fácil de usar con reglas por aplicación en tiempo real gracias al motor kernel WFP. |

➡️ **[Todas las aplicaciones en cybergems.org](https://cybergems.org)**
