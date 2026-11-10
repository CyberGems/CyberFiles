import { ArrowDown } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

/** Titlebar notice for a pending update: a calm pulsing arrow beside the window
    controls that opens the update dialog without digging through menus. */
export function TitleBarUpdateButton({ version, onClick }: { version: string; onClick: () => void }) {
  const { t } = useLanguage();
  const tooltip = t.updates.titleBarButton.replace('{version}', version);

  return (
    <Tooltip label={tooltip} placement="bottom">
      <button
        type="button"
        data-titlebar-no-drag=""
        aria-label={tooltip}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500/25 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 motion-safe:animate-[cyberfiles-update-badge-pulse_3.5s_ease-in-out_infinite]"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
