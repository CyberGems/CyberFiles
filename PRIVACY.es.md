# Privacidad — CyberFiles

CyberFiles funciona en tu PC y guarda tus datos en tu PC. **No tiene cuenta, telemetría, SDK de analítica ni anuncios.** Nunca envía tu rutas, preferencias de vista o copias de seguridad a su autor ni a nadie más.

Todo lo que sabe (rutas, preferencias de vista o copias de seguridad) se queda en `%APPDATA%\com.cybergems.cyberfiles\` (configuración JSON). Las versiones portables lo guardan todo en `CyberFiles_Data\config`, junto al ejecutable. El instalador incluye la casilla **Delete app data**. Las versiones portables guardan sus datos junto al ejecutable.

## Cuándo CyberFiles se conecta a internet

Estas son todas las conexiones que CyberFiles hace por su cuenta. Ninguna envía tu rutas, preferencias de vista o copias de seguridad. Como en cualquier petición de internet, el servidor ve tu dirección IP.

| Cuándo | Dónde | Para qué | Cómo desactivarlo |
|---|---|---|---|
| Al iniciar y cada 6 horas | `raw.githubusercontent.com` (manifiesto de actualizaciones firmado) | Consultar una versión nueva | Interruptor en Acerca de → Comprobación automática (`cyberfiles_auto_check_updates_v1`); las versiones portables desactivan el actualizador |

Abrir una ubicación de red o un recurso SMB ocurre solo cuando tú lo eliges.

CyberFiles es una pre-release alpha. Los detalles pueden cambiar antes de la primera versión estable.

## Qué lee CyberFiles de tu PC

CyberFiles lee las carpetas y rutas que introdujes en la app. Esa información se queda en pantalla. Todo lo que cambia el sistema pide confirmación antes y, cuando es posible, guarda una copia para poder deshacerlo.

## Dudas

Abre un issue: https://github.com/CyberGems/CyberFiles/issues

Para una pregunta concreta sobre privacidad, usa la [página de contacto](https://cybergems.org/contact). La declaración general de la suite está en [cybergems.org/es/privacy](https://cybergems.org/es/privacy).
