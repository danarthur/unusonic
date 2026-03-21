'use client';

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { motion } from 'framer-motion';
import { formatHex, formatCss, converter, parse, parseHex } from 'culori';
import { cn } from '@/shared/lib/utils';
import { BRAND_COLORS } from '@/features/org-management/ui/BrandColorPicker';

const HEX_REGEX = /^#?([0-9A-Fa-f]{6})$/;

/** Normalize stored value (hex or oklch) to 6-char hex (no #) for the tuner. */
function toStableHex(value: string | null): string {
  if (!value || typeof value !== 'string') return '000000';
  const trimmed = value.trim();
  const hexMatch = trimmed.match(HEX_REGEX);
  if (hexMatch) return (hexMatch[0].replace('#', '') || '000000').padEnd(6, '0').slice(0, 6).toUpperCase();
  try {
    const parsed = parse(trimmed);
    if (parsed) {
      const hex = formatHex(parsed);
      return hex.replace('#', '').toUpperCase();
    }
  } catch {
    // ignore
  }
  return '000000';
}

/** Convert hex to Oklch CSS string for readout (culori v4: use converter + formatCss). */
function hexToOklchLabel(hex: string): string {
  const normalized = hex.startsWith('#') ? hex : `#${hex}`;
  if (!HEX_REGEX.test(normalized)) return '—';
  try {
    const parsed = parseHex(normalized);
    if (!parsed) return '—';
    const toOklch = converter('oklch');
    const oklchColor = toOklch(parsed);
    return oklchColor ? formatCss(oklchColor) : '—';
  } catch {
    return '—';
  }
}

/** True if two colors are effectively the same (both hex or both oklch, compare normalized). */
function sameColor(a: string | null, b: string | null): boolean {
  if (!a || !b) return !a && !b;
  const ha = toStableHex(a);
  const hb = toStableHex(b);
  return ha === hb;
}

export interface ColorTunerProps {
  /** Current color: hex (#1A2B3C) or oklch string from DB. */
  value: string | null;
  onChange: (color: string) => void;
  className?: string;
}

type ColorTunerMode = 'presets' | 'hex';

/**
 * Chromatic Tuner – toggle between Presets and Hex/Picker. Don’t overwrite the hex field while focused.
 */
export function ColorTuner({ value, onChange, className }: ColorTunerProps) {
  const [mode, setMode] = React.useState<ColorTunerMode>('presets');
  const [inputRaw, setInputRaw] = React.useState(() => toStableHex(value ?? null));
  const isFocusedRef = React.useRef(false);

  const displayHex = React.useMemo(() => {
    const cleaned = inputRaw.replace(/^#/, '').slice(0, 6);
    if (!/^[0-9A-Fa-f]*$/.test(cleaned)) return '#000000';
    return `#${cleaned.padEnd(6, '0')}`;
  }, [inputRaw]);

  const isValidHex = HEX_REGEX.test(displayHex);
  const swatchColor = isValidHex ? displayHex : '#000000';
  const oklchLabel = isValidHex ? hexToOklchLabel(displayHex) : '—';

  // Sync from parent only when not editing (avoids overwriting while typing)
  React.useEffect(() => {
    if (isFocusedRef.current) return;
    setInputRaw(toStableHex(value ?? null));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
    setInputRaw(raw);
    // Only push to parent when we have a full valid hex (stops cursor/state fighting)
    if (raw.length === 6 && HEX_REGEX.test(`#${raw}`)) onChange(`#${raw}`);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    // Snap to normalized value from parent when leaving the field
    const stable = toStableHex(value ?? null);
    if (inputRaw !== stable) setInputRaw(stable);
  };

  const handlePickerChange = (hex: string) => {
    const match = hex.match(HEX_REGEX);
    if (match) {
      setInputRaw((match[1] ?? hex.replace(/^#/, '')).toUpperCase());
      onChange(hex);
    }
  };

  const handlePresetClick = (presetValue: string) => {
    isFocusedRef.current = false;
    const hex = toStableHex(presetValue);
    setInputRaw(hex);
    onChange(presetValue);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-4">
        <label className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Brand frequency (color)
        </label>
        <div className="flex rounded-lg border border-[var(--color-mercury)] bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => setMode('presets')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'presets'
                ? 'bg-white/10 text-[var(--color-ink)]'
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            )}
          >
            Presets
          </button>
          <button
            type="button"
            onClick={() => setMode('hex')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'hex'
                ? 'bg-white/10 text-[var(--color-ink)]'
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            )}
          >
            Hex
          </button>
        </div>
      </div>

      {mode === 'presets' ? (
        <div className="flex flex-wrap gap-2">
          {BRAND_COLORS.map(({ label, value: presetValue }) => {
            const isSelected = sameColor(value, presetValue);
            return (
              <button
                key={label}
                type="button"
                title={label}
                onClick={() => handlePresetClick(presetValue)}
                className={cn(
                  'size-9 rounded-full border-2 transition-transform hover:scale-110',
                  isSelected ? 'border-[var(--color-ink)] ring-2 ring-white/20' : 'border-transparent hover:border-white/20'
                )}
                style={{ backgroundColor: presetValue }}
                aria-label={label}
                aria-pressed={isSelected}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="size-12 shrink-0 rounded-full border border-white/10 shadow-lg overflow-hidden relative"
                style={{ backgroundColor: swatchColor }}
                aria-label="Open color picker"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
              </motion.button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-[var(--color-glass-surface)] border-[var(--color-mercury)] backdrop-blur-xl" align="start">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
                Choose any color
              </label>
              <input
                type="color"
                value={swatchColor}
                onChange={(e) => handlePickerChange(e.target.value)}
                className="h-10 w-full min-w-[200px] cursor-pointer rounded-lg border border-white/10 bg-transparent"
                aria-label="Color picker"
              />
            </PopoverContent>
          </Popover>

          <div className="flex-1 min-w-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] font-mono text-sm select-none">
                #
              </span>
              <input
                type="text"
                value={inputRaw}
                onChange={handleInputChange}
                onFocus={() => { isFocusedRef.current = true; }}
                onBlur={handleBlur}
                className={cn(
                  'w-full rounded-xl border bg-white/5 py-3 pl-8 pr-4 font-mono text-sm transition-colors outline-none uppercase tracking-wider',
                  'border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/50',
                  'focus:border-[var(--color-silk)]/50 focus:ring-2 focus:ring-[var(--color-silk)]/20',
                  !isValidHex && inputRaw.length === 6 && 'border-[var(--color-signal-error)]/50'
                )}
                maxLength={6}
                placeholder="1A2B3C"
                aria-invalid={!isValidHex && inputRaw.length === 6}
              />
            </div>
            <p className="mt-2 text-[10px] font-mono text-[var(--color-ink-muted)] flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[var(--color-signal-success)]/60 shrink-0" />
              {isValidHex ? (
                <>Oklch: {oklchLabel}</>
              ) : (
                <span className={cn(inputRaw.length === 6 && 'text-[var(--color-signal-error)]')}>
                  {inputRaw.length === 6 ? 'Invalid hex' : 'Enter 6 hex digits'}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
