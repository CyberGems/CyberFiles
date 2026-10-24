/**
 * Published CyberGems apps shown in the tray menu's "More from CyberGems" view.
 * Mirrors the suite catalog used by the other CyberGems apps so the lists stay
 * consistent across the family.
 */
export interface SuiteApp {
  slug: string;
  name: string;
  short: { es: string; en: string };
  site: string;
}

export const SUITE_UPDATED = '2026-10-24';

export const SUITE_APPS: SuiteApp[] = [
  {
    slug: 'cyberclock',
    name: 'CyberClock',
    short: { es: 'Reloj de escritorio', en: 'Desktop clock' },
    site: 'https://cybergems.org/apps/cyberclock/',
  },
  {
    slug: 'cyberfeeds',
    name: 'CyberFeeds',
    short: { es: 'Lector RSS', en: 'RSS reader' },
    site: 'https://cybergems.org/apps/cyberfeeds/',
  },
  {
    slug: 'cyberlauncher',
    name: 'CyberLauncher',
    short: { es: 'Lanzador de apps', en: 'App launcher' },
    site: 'https://cybergems.org/apps/cyberlauncher/',
  },
  {
    slug: 'cybermanager',
    name: 'CyberManager',
    short: { es: 'Gestor de tareas', en: 'Task manager' },
    site: 'https://cybergems.org/apps/cybermanager/',
  },
  {
    slug: 'cybernotes',
    name: 'CyberNotes',
    short: { es: 'Notas', en: 'Notes' },
    site: 'https://cybergems.org/apps/cybernotes/',
  },
  {
    slug: 'cyberpaste',
    name: 'CyberPaste',
    short: { es: 'Portapapeles', en: 'Clipboard' },
    site: 'https://cybergems.org/apps/cyberpaste/',
  },
  {
    slug: 'cybersnap',
    name: 'CyberSnap',
    short: { es: 'Capturas y grabación', en: 'Capture and recording' },
    site: 'https://cybergems.org/apps/cybersnap/',
  },
  {
    slug: 'cybertray',
    name: 'CyberTray',
    short: { es: 'Bandeja del sistema', en: 'System tray' },
    site: 'https://cybergems.org/apps/cybertray/',
  },
  {
    slug: 'cyberviewer',
    name: 'CyberViewer',
    short: { es: 'Visor de imágenes', en: 'Image viewer' },
    site: 'https://cybergems.org/apps/cyberviewer/',
  },
  {
    slug: 'cyberwall',
    name: 'CyberWall',
    short: { es: 'Firewall por aplicación', en: 'App firewall' },
    site: 'https://cybergems.org/apps/cyberwall/',
  },
];

export const CYBERGEMS_SITE = 'https://cybergems.org';
export const CYBERGEMS_APPS = 'https://cybergems.org/#apps';
export const CYBERFILES_REPO = 'https://github.com/CyberGems/CyberFiles';
