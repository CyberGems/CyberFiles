import React from 'react';
import {
  Folder,
  FolderOpen,
  Code2,
  Terminal,
  FileCode,
  Cpu,
  GitBranch,
  Boxes,
  Database,
  Server,
  HardDrive,
  Image,
  Camera,
  Palette,
  Music,
  Film,
  Headphones,
  Video,
  Mic,
  Radio,
  FileText,
  BookOpen,
  Archive,
  Briefcase,
  Bookmark,
  Layers,
  Notebook,
  Shield,
  Key,
  Lock,
  Settings,
  Wrench,
  Flame,
  Zap,
  Sparkles,
  Heart,
  Star,
  Gamepad2,
  Coffee,
  ShoppingBag,
  Smile,
  Trophy,
  Rocket,
  Gift,
  Cloud,
  Compass,
  MapPin,
  Globe,
  Sun,
  Moon,
  Eye,
  Users,
  Bell,
  Tag,
  Download,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { CustomFolderIconConfig } from '../utils/folderIconPreferences';

export interface FolderIconDefinition {
  id: string;
  icon: LucideIcon;
  nameEn: string;
  nameEs: string;
  tags: string[];
  defaultColor: string; // Tailwind text color class for color mode
}

export interface FolderColorPreset {
  id: string;
  nameEn: string;
  nameEs: string;
  text: string;
  fill: string;
  bg: string;
  border: string;
}

export const FOLDER_COLOR_PRESETS: FolderColorPreset[] = [
  { id: 'amber', nameEn: 'Classic Amber', nameEs: 'Ámbar Clásico', text: 'text-amber-400', fill: 'fill-amber-400/20', bg: 'bg-amber-400', border: 'border-amber-400' },
  { id: 'cyan', nameEn: 'Cyber Cyan', nameEs: 'Cian Cibernético', text: 'text-cyan-400', fill: 'fill-cyan-400/20', bg: 'bg-cyan-400', border: 'border-cyan-400' },
  { id: 'emerald', nameEn: 'Neon Emerald', nameEs: 'Esmeralda Neón', text: 'text-emerald-400', fill: 'fill-emerald-400/20', bg: 'bg-emerald-400', border: 'border-emerald-400' },
  { id: 'purple', nameEn: 'Neon Violet', nameEs: 'Violeta Neón', text: 'text-purple-400', fill: 'fill-purple-400/20', bg: 'bg-purple-400', border: 'border-purple-400' },
  { id: 'rose', nameEn: 'Neon Rose', nameEs: 'Rosa Neón', text: 'text-rose-400', fill: 'fill-rose-400/20', bg: 'bg-rose-400', border: 'border-rose-400' },
  { id: 'blue', nameEn: 'Electric Blue', nameEs: 'Azul Eléctrico', text: 'text-blue-400', fill: 'fill-blue-400/20', bg: 'bg-blue-400', border: 'border-blue-400' },
  { id: 'orange', nameEn: 'Vibrant Orange', nameEs: 'Naranja Intenso', text: 'text-orange-400', fill: 'fill-orange-400/20', bg: 'bg-orange-400', border: 'border-orange-400' },
  { id: 'red', nameEn: 'Ruby Red', nameEs: 'Rojo Rubí', text: 'text-red-400', fill: 'fill-red-400/20', bg: 'bg-red-400', border: 'border-red-400' },
  { id: 'neutral', nameEn: 'Titanium Grey', nameEs: 'Gris Titanio', text: 'text-neutral-300', fill: 'fill-neutral-400/20', bg: 'bg-neutral-400', border: 'border-neutral-400' },
];

export const FOLDER_ICONS_CATALOG: FolderIconDefinition[] = [
  // Development / Code
  { id: 'code', icon: Code2, nameEn: 'Code & Dev', nameEs: 'Código y Programación', tags: ['code', 'dev', 'developer', 'source', 'código', 'desarrollo', 'git'], defaultColor: 'text-cyan-400' },
  { id: 'terminal', icon: Terminal, nameEn: 'Terminal / CLI', nameEs: 'Terminal y Comandos', tags: ['terminal', 'console', 'cli', 'bash', 'shell', 'consola', 'comandos'], defaultColor: 'text-emerald-400' },
  { id: 'file-code', icon: FileCode, nameEn: 'Source Files', nameEs: 'Archivos Fuente', tags: ['script', 'source', 'program', 'script', 'programa'], defaultColor: 'text-sky-400' },
  { id: 'git', icon: GitBranch, nameEn: 'Git & Branches', nameEs: 'Git y Ramas', tags: ['git', 'version', 'branch', 'vcs', 'repositorio'], defaultColor: 'text-orange-400' },
  { id: 'cpu', icon: Cpu, nameEn: 'Hardware / CPU', nameEs: 'Hardware y Chip', tags: ['cpu', 'processor', 'hardware', 'chip', 'procesador'], defaultColor: 'text-indigo-400' },
  { id: 'database', icon: Database, nameEn: 'Database / SQL', nameEs: 'Base de Datos', tags: ['database', 'sql', 'data', 'db', 'datos'], defaultColor: 'text-amber-400' },
  { id: 'server', icon: Server, nameEn: 'Server & Backend', nameEs: 'Servidor y Red', tags: ['server', 'backend', 'host', 'network', 'servidor', 'red'], defaultColor: 'text-purple-400' },
  { id: 'boxes', icon: Boxes, nameEn: 'Packages & Modules', nameEs: 'Paquetes y Módulos', tags: ['package', 'npm', 'cargo', 'modules', 'paquetes'], defaultColor: 'text-teal-400' },

  // Media / Arts
  { id: 'image', icon: Image, nameEn: 'Images & Photos', nameEs: 'Imágenes y Fotos', tags: ['image', 'photo', 'picture', 'art', 'imagen', 'fotos'], defaultColor: 'text-rose-400' },
  { id: 'camera', icon: Camera, nameEn: 'Photography', nameEs: 'Fotografía', tags: ['camera', 'photo', 'shot', 'cámara', 'capturas'], defaultColor: 'text-pink-400' },
  { id: 'palette', icon: Palette, nameEn: 'Design & Graphics', nameEs: 'Diseño y Gráficos', tags: ['design', 'art', 'ui', 'draw', 'diseño', 'arte', 'paleta'], defaultColor: 'text-violet-400' },
  { id: 'music', icon: Music, nameEn: 'Music & Audio', nameEs: 'Música y Sonido', tags: ['music', 'audio', 'song', 'sound', 'música', 'canción', 'sonido'], defaultColor: 'text-yellow-400' },
  { id: 'headphones', icon: Headphones, nameEn: 'Headphones / Podcasts', nameEs: 'Auriculares y Podcasts', tags: ['headphones', 'podcast', 'listen', 'auriculares'], defaultColor: 'text-amber-300' },
  { id: 'film', icon: Film, nameEn: 'Cinema & Movies', nameEs: 'Películas y Cine', tags: ['film', 'movie', 'cinema', 'video', 'película', 'cine'], defaultColor: 'text-rose-400' },
  { id: 'video', icon: Video, nameEn: 'Video Production', nameEs: 'Vídeo y Grabación', tags: ['video', 'record', 'clip', 'stream', 'grabación'], defaultColor: 'text-red-400' },
  { id: 'mic', icon: Mic, nameEn: 'Recordings / Audio', nameEs: 'Grabaciones de Voz', tags: ['mic', 'microphone', 'voice', 'audio', 'micrófono', 'voz'], defaultColor: 'text-blue-400' },

  // Office / Documents
  { id: 'file-text', icon: FileText, nameEn: 'Documents & Notes', nameEs: 'Documentos y Notas', tags: ['document', 'text', 'doc', 'pdf', 'documento', 'texto', 'apuntes'], defaultColor: 'text-blue-400' },
  { id: 'book-open', icon: BookOpen, nameEn: 'Books & Manuals', nameEs: 'Libros y Manuales', tags: ['book', 'read', 'guide', 'manual', 'libro', 'lectura', 'guía'], defaultColor: 'text-emerald-400' },
  { id: 'briefcase', icon: Briefcase, nameEn: 'Work & Projects', nameEs: 'Trabajo y Negocios', tags: ['work', 'job', 'business', 'project', 'trabajo', 'negocios', 'proyectos'], defaultColor: 'text-amber-500' },
  { id: 'archive', icon: Archive, nameEn: 'Archives & Backups', nameEs: 'Archivos y Respaldos', tags: ['archive', 'zip', 'rar', 'backup', 'comprimido', 'respaldo'], defaultColor: 'text-purple-400' },
  { id: 'notebook', icon: Notebook, nameEn: 'Notebook & Journal', nameEs: 'Cuaderno y Diario', tags: ['notebook', 'journal', 'notes', 'cuaderno', 'diario'], defaultColor: 'text-cyan-400' },
  { id: 'layers', icon: Layers, nameEn: 'Layers & Resources', nameEs: 'Capas y Recursos', tags: ['layers', 'stack', 'assets', 'resources', 'capas', 'recursos'], defaultColor: 'text-emerald-300' },
  { id: 'bookmark', icon: Bookmark, nameEn: 'Bookmarks', nameEs: 'Marcadores', tags: ['bookmark', 'saved', 'favorito', 'marcador'], defaultColor: 'text-amber-400' },

  // System / Security / Tools
  { id: 'shield', icon: Shield, nameEn: 'Security & Antivirus', nameEs: 'Seguridad y Protección', tags: ['security', 'shield', 'protect', 'seguridad', 'protegido'], defaultColor: 'text-emerald-400' },
  { id: 'lock', icon: Lock, nameEn: 'Private & Locked', nameEs: 'Privado y Protegido', tags: ['lock', 'private', 'secure', 'password', 'candado', 'privado', 'clave'], defaultColor: 'text-red-400' },
  { id: 'key', icon: Key, nameEn: 'Credentials & Keys', nameEs: 'Claves y Certificados', tags: ['key', 'auth', 'pass', 'llave', 'credenciales'], defaultColor: 'text-yellow-400' },
  { id: 'settings', icon: Settings, nameEn: 'Settings & Config', nameEs: 'Configuración y Ajustes', tags: ['settings', 'config', 'preferences', 'configuración', 'ajustes'], defaultColor: 'text-neutral-300' },
  { id: 'wrench', icon: Wrench, nameEn: 'Tools & Utilities', nameEs: 'Herramientas y Utilidades', tags: ['tools', 'wrench', 'fix', 'utilidades', 'herramientas'], defaultColor: 'text-orange-400' },
  { id: 'hard-drive', icon: HardDrive, nameEn: 'Disks & Storage', nameEs: 'Discos y Almacenamiento', tags: ['drive', 'disk', 'storage', 'disco', 'almacenamiento'], defaultColor: 'text-cyan-400' },
  { id: 'cloud', icon: Cloud, nameEn: 'Cloud & Sync', nameEs: 'Nube y Sincronización', tags: ['cloud', 'sync', 'drive', 'onedrive', 'nube'], defaultColor: 'text-sky-400' },
  { id: 'download', icon: Download, nameEn: 'Downloads', nameEs: 'Descargas', tags: ['download', 'descargas', 'bajar'], defaultColor: 'text-emerald-400' },
  { id: 'upload', icon: Upload, nameEn: 'Uploads', nameEs: 'Subidas y Envíos', tags: ['upload', 'subidas', 'enviar'], defaultColor: 'text-blue-400' },

  // Personal / Leisure / Favorites
  { id: 'star', icon: Star, nameEn: 'Favorites & Stars', nameEs: 'Favoritos y Destacados', tags: ['star', 'fav', 'favorite', 'estrella', 'favorito', 'destacado'], defaultColor: 'text-amber-300' },
  { id: 'heart', icon: Heart, nameEn: 'Personal & Liked', nameEs: 'Personal y Preferido', tags: ['heart', 'love', 'like', 'personal', 'corazón'], defaultColor: 'text-rose-400' },
  { id: 'gamepad', icon: Gamepad2, nameEn: 'Games & Gaming', nameEs: 'Juegos y Emuladores', tags: ['game', 'gaming', 'play', 'juegos', 'videojuegos'], defaultColor: 'text-purple-400' },
  { id: 'coffee', icon: Coffee, nameEn: 'Coffee & Leisure', nameEs: 'Café y Descanso', tags: ['coffee', 'break', 'cafe', 'ocio'], defaultColor: 'text-amber-600' },
  { id: 'shopping', icon: ShoppingBag, nameEn: 'Shopping & Finance', nameEs: 'Compras y Facturas', tags: ['shop', 'store', 'finance', 'compras', 'facturas'], defaultColor: 'text-teal-400' },
  { id: 'trophy', icon: Trophy, nameEn: 'Achievements & Best', nameEs: 'Logros y Premios', tags: ['trophy', 'win', 'premio', 'logros'], defaultColor: 'text-yellow-400' },
  { id: 'rocket', icon: Rocket, nameEn: 'Launches & Fast', nameEs: 'Lanzamientos y Proyectos', tags: ['rocket', 'launch', 'fast', 'cohete', 'lanzamiento'], defaultColor: 'text-rose-500' },
  { id: 'gift', icon: Gift, nameEn: 'Gifts & Goodies', nameEs: 'Regalos y Extras', tags: ['gift', 'present', 'regalo', 'obsequio'], defaultColor: 'text-pink-400' },
  { id: 'zap', icon: Zap, nameEn: 'Flash & Fast Access', nameEs: 'Rápido y Eléctrico', tags: ['zap', 'bolt', 'fast', 'rayo', 'rápido'], defaultColor: 'text-amber-400' },
  { id: 'sparkles', icon: Sparkles, nameEn: 'Magic & Special', nameEs: 'Especial y Mágico', tags: ['sparkles', 'magic', 'special', 'brillo', 'especial'], defaultColor: 'text-cyan-300' },
  { id: 'flame', icon: Flame, nameEn: 'Hot & Priority', nameEs: 'Prioritario y Urgente', tags: ['fire', 'flame', 'hot', 'fuego', 'urgente'], defaultColor: 'text-orange-500' },
  { id: 'globe', icon: Globe, nameEn: 'Web & Internet', nameEs: 'Web e Internet', tags: ['web', 'internet', 'global', 'red', 'mundo'], defaultColor: 'text-sky-400' },
  { id: 'users', icon: Users, nameEn: 'Team & Shared', nameEs: 'Equipo y Compartido', tags: ['users', 'team', 'shared', 'equipo', 'compartido', 'personas'], defaultColor: 'text-emerald-400' },
  { id: 'tag', icon: Tag, nameEn: 'Tagged & Categorized', nameEs: 'Etiquetas y Marcas', tags: ['tag', 'label', 'etiqueta', 'categoría'], defaultColor: 'text-indigo-400' },
  { id: 'bell', icon: Bell, nameEn: 'Notifications & Alerts', nameEs: 'Notificaciones y Avisos', tags: ['bell', 'alert', 'campana', 'avisos'], defaultColor: 'text-yellow-400' },
  { id: 'eye', icon: Eye, nameEn: 'Review & Inspect', nameEs: 'Revisión y Vista', tags: ['eye', 'view', 'inspect', 'ojo', 'revisar'], defaultColor: 'text-cyan-400' },
];

export function getFolderIconDefinition(iconId: string): FolderIconDefinition | undefined {
  return FOLDER_ICONS_CATALOG.find(item => item.id === iconId);
}

export function getFolderColorPreset(presetId?: string): FolderColorPreset {
  return FOLDER_COLOR_PRESETS.find(p => p.id === presetId) ?? FOLDER_COLOR_PRESETS[0];
}

interface FolderIconRendererProps {
  config?: CustomFolderIconConfig;
  size?: 'small' | 'medium' | 'large' | 'preview';
  className?: string;
  fallbackIcon?: React.ReactNode;
}

export const FolderIconRenderer: React.FC<FolderIconRendererProps> = ({
  config,
  size = 'small',
  className = '',
  fallbackIcon,
}) => {
  if (!config) {
    if (fallbackIcon) return <>{fallbackIcon}</>;
    const defaultColor = FOLDER_COLOR_PRESETS[0];
    const sizeClasses = size === 'preview' ? 'w-16 h-16' : size === 'large' ? 'w-8 h-8' : size === 'medium' ? 'w-5 h-5' : 'w-4 h-4';
    return <Folder className={`${sizeClasses} ${defaultColor.text} ${defaultColor.fill} flex-shrink-0 ${className}`} />;
  }

  const iconDef = getFolderIconDefinition(config.iconId);
  const colorPreset = getFolderColorPreset(config.colorPreset);
  const IconComp = iconDef ? iconDef.icon : FolderOpen;

  const isNeutral = config.category === 'neutral';
  const symbolColor = isNeutral ? 'text-neutral-300' : (iconDef ? iconDef.defaultColor : colorPreset.text);

  if (config.style === 'symbol') {
    if (size === 'preview') {
      return (
        <div className={`flex items-center justify-center p-2 rounded-2xl bg-neutral-900/90 border border-neutral-700 shadow-lg ${className}`}>
          <IconComp className={`w-14 h-14 ${symbolColor} drop-shadow-[0_0_12px_rgba(34,211,238,0.25)] flex-shrink-0`} />
        </div>
      );
    }
    if (size === 'large') {
      return <IconComp className={`w-8 h-8 ${symbolColor} flex-shrink-0 ${className}`} />;
    }
    if (size === 'medium') {
      return <IconComp className={`w-5 h-5 ${symbolColor} flex-shrink-0 ${className}`} />;
    }
    return <IconComp className={`w-4 h-4 ${symbolColor} flex-shrink-0 ${className}`} />;
  }

  // Folder with badge emblem
  const folderColor = isNeutral
    ? { text: 'text-neutral-400', fill: 'fill-neutral-400/20' }
    : { text: colorPreset.text, fill: colorPreset.fill };
  const emblemColor = isNeutral ? 'text-neutral-100' : 'text-neutral-100';

  if (size === 'preview') {
    return (
      <div className={`relative inline-flex items-center justify-center w-16 h-16 flex-shrink-0 ${className}`}>
        <Folder className={`w-16 h-16 ${folderColor.text} ${folderColor.fill} drop-shadow-[0_0_16px_rgba(251,191,36,0.2)]`} />
        <div className="absolute inset-0 flex items-center justify-center pt-2.5 pointer-events-none">
          <div className="rounded-full bg-neutral-950/80 p-1.5 shadow-md border border-neutral-700/60 backdrop-blur-sm">
            <IconComp className={`w-6 h-6 ${isNeutral ? 'text-neutral-200' : (iconDef ? iconDef.defaultColor : 'text-cyan-300')}`} />
          </div>
        </div>
      </div>
    );
  }

  if (size === 'large') {
    return (
      <div className={`relative inline-flex items-center justify-center w-8 h-8 flex-shrink-0 ${className}`}>
        <Folder className={`w-8 h-8 ${folderColor.text} ${folderColor.fill}`} />
        <div className="absolute inset-0 flex items-center justify-center pt-1 pointer-events-none">
          <div className="rounded-full bg-neutral-950/80 p-0.5 shadow-sm border border-neutral-800/80">
            <IconComp className={`w-3.5 h-3.5 ${isNeutral ? 'text-neutral-200' : (iconDef ? iconDef.defaultColor : 'text-cyan-300')}`} />
          </div>
        </div>
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className={`relative inline-flex items-center justify-center w-5 h-5 flex-shrink-0 ${className}`}>
        <Folder className={`w-5 h-5 ${folderColor.text} ${folderColor.fill}`} />
        <div className="absolute inset-0 flex items-center justify-center pt-0.5 pointer-events-none">
          <IconComp className={`w-2.5 h-2.5 ${emblemColor}`} />
        </div>
      </div>
    );
  }

  // small (16px)
  return (
    <div className={`relative inline-flex items-center justify-center w-4 h-4 flex-shrink-0 ${className}`}>
      <Folder className={`w-4 h-4 ${folderColor.text} ${folderColor.fill}`} />
      <div className="absolute inset-0 flex items-center justify-center pt-0.5 pointer-events-none">
        <IconComp className={`w-2 h-2 ${emblemColor}`} />
      </div>
    </div>
  );
};
