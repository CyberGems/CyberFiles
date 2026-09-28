import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, Pipette } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';
import { Tooltip } from './Tooltip';

interface ColorValueEditorProps {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

type Rgb = [number, number, number];
type Hsv = { hue: number; saturation: number; value: number };

function parseHex(color: string): Rgb | null {
  const match = color.trim().match(/^#?([\da-f]{6})$/i);
  if (!match) return null;
  const value = match[1];
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16)) as Rgb;
}

function rgbToHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue].map(channel => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function hexToHsv(color: string): Hsv {
  const rgb = (parseHex(color) ?? [0, 0, 0]).map(channel => channel / 255) as Rgb;
  const [red, green, blue] = rgb;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2);
    else hue = 60 * ((red - green) / difference + 4);
  }
  return {
    hue: (hue + 360) % 360,
    saturation: maximum === 0 ? 0 : difference / maximum,
    value: maximum,
  };
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const chroma = value * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const offset = value - chroma;
  return rgbToHex([
    Math.round((red + offset) * 255),
    Math.round((green + offset) * 255),
    Math.round((blue + offset) * 255),
  ]);
}

export function ColorValueEditor({ label, value, disabled = false, onChange }: ColorValueEditorProps) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const currentColor = parseHex(value) ? value.toUpperCase() : '#000000';
  const initialHsv = hexToHsv(currentColor);
  const [isOpen, setIsOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(currentColor);
  const [channelDrafts, setChannelDrafts] = useState(() => (parseHex(currentColor) ?? [0, 0, 0]).map(String));
  const [hue, setHue] = useState(initialHsv.hue);
  const [saturation, setSaturation] = useState(initialHsv.saturation);
  const [brightness, setBrightness] = useState(initialHsv.value);

  useEffect(() => {
    const hsv = hexToHsv(currentColor);
    setHexDraft(currentColor);
    setChannelDrafts((parseHex(currentColor) ?? [0, 0, 0]).map(String));
    setHue(hsv.hue);
    setSaturation(hsv.saturation);
    setBrightness(hsv.value);
  }, [currentColor]);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismissOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', dismissOnEscape, true);
    };
  }, [isOpen]);

  const updateFromHsv = (nextHue: number, nextSaturation: number, nextBrightness: number) => {
    const nextColor = hsvToHex(nextHue, nextSaturation, nextBrightness);
    onChange(nextColor);
  };

  const handlePlanePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextSaturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const nextBrightness = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    setSaturation(nextSaturation);
    setBrightness(nextBrightness);
    updateFromHsv(hue, nextSaturation, nextBrightness);
  };

  const handlePlaneKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const amount = event.shiftKey ? 0.1 : 0.02;
    let nextSaturation = saturation;
    let nextBrightness = brightness;
    if (event.key === 'ArrowLeft') nextSaturation = Math.max(0, saturation - amount);
    else if (event.key === 'ArrowRight') nextSaturation = Math.min(1, saturation + amount);
    else if (event.key === 'ArrowUp') nextBrightness = Math.min(1, brightness + amount);
    else if (event.key === 'ArrowDown') nextBrightness = Math.max(0, brightness - amount);
    else return;
    event.preventDefault();
    setSaturation(nextSaturation);
    setBrightness(nextBrightness);
    updateFromHsv(hue, nextSaturation, nextBrightness);
  };

  const handleHexChange = (draft: string) => {
    setHexDraft(draft);
    const parsed = parseHex(draft);
    if (parsed) onChange(rgbToHex(parsed));
  };

  const handleChannelChange = (index: number, draft: string) => {
    setChannelDrafts(previous => previous.map((channel, channelIndex) => channelIndex === index ? draft : channel));
    if (!/^\d{1,3}$/.test(draft) || Number(draft) > 255) return;
    const nextRgb = parseHex(currentColor) ?? [0, 0, 0];
    nextRgb[index] = Number(draft);
    onChange(rgbToHex(nextRgb));
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 rounded-lg border border-neutral-800 bg-neutral-900/70 p-2.5 ${disabled ? 'opacity-55' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-neutral-300">{label}</span>
        <Tooltip label={t.settings.colorPickerOpen} placement="top">
          <button
            type="button"
            aria-label={t.settings.colorPickerOpen}
            aria-expanded={isOpen}
            disabled={disabled}
            onClick={() => setIsOpen(open => !open)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-950 px-1.5 text-neutral-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-200 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true" className="h-4 w-5 rounded border border-white/25 shadow-inner" style={{ backgroundColor: currentColor }} />
            <Pipette className="h-3.5 w-3.5" />
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </Tooltip>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {(['HEX', 'R', 'G', 'B'] as const).map((channel, index) => (
          <Tooltip key={channel} label={`${label} · ${channel}`} placement="top">
            <label className="block min-w-0 text-center">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-neutral-500">{channel}</span>
              <input
                type="text"
                inputMode={index === 0 ? 'text' : 'numeric'}
                spellCheck={false}
                aria-label={`${label} ${channel}`}
                disabled={disabled}
                value={index === 0 ? hexDraft : channelDrafts[index - 1] ?? '0'}
                onChange={event => index === 0 ? handleHexChange(event.target.value) : handleChannelChange(index - 1, event.target.value)}
                onBlur={() => {
                  setHexDraft(currentColor);
                  setChannelDrafts((parseHex(currentColor) ?? [0, 0, 0]).map(String));
                }}
                className="h-8 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-1 text-center font-mono text-[10px] uppercase text-neutral-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 disabled:cursor-not-allowed"
              />
            </label>
          </Tooltip>
        ))}
      </div>

      {isOpen && !disabled && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(19rem,calc(100vw-4rem))] rounded-xl border border-neutral-700 bg-neutral-900 p-3 shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-100">
          <Tooltip label={t.settings.colorSaturationBrightness} placement="top">
            <button
              type="button"
              aria-label={t.settings.colorSaturationBrightness}
              onPointerDown={event => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                handlePlanePointer(event);
              }}
              onPointerMove={event => { if (event.buttons === 1) handlePlanePointer(event); }}
              onKeyDown={handlePlaneKeyDown}
              className="relative block aspect-[2.2/1] w-full touch-none cursor-crosshair overflow-hidden rounded-md border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              style={{
                backgroundColor: hsvToHex(hue, 1, 1),
                backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
              }}
            >
              <span aria-hidden="true" className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%` }} />
            </button>
          </Tooltip>

          <Tooltip label={t.settings.colorHue} placement="top">
            <input
              type="range"
              aria-label={t.settings.colorHue}
              min="0"
              max="359"
              value={hue}
              onChange={event => {
                const nextHue = Number(event.target.value);
                setHue(nextHue);
                updateFromHsv(nextHue, saturation, brightness);
              }}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] accent-white"
            />
          </Tooltip>
          <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-500">
            <span>{t.settings.colorHue}</span>
            <span className="font-mono">{Math.round(hue)}°</span>
          </div>
        </div>
      )}
    </div>
  );
}
