'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/** Preset "Brand Signal" colors for team avatars and accents. */
export const BRAND_COLORS = [
  { label: 'Signal Blue', value: 'oklch(0.70 0.15 250)' },
  { label: 'Neon Green', value: 'oklch(0.75 0.18 145)' },
  { label: 'Warning Orange', value: 'oklch(0.75 0.16 85)' },
  { label: 'Walnut', value: 'oklch(0.55 0.02 60)' },
  { label: 'Neon Rose', value: 'oklch(0.65 0.20 350)' },
  { label: 'Infrared Ruby', value: 'oklch(0.70 0.18 20)' },
  { label: 'Hologram Blue', value: 'oklch(0.75 0.15 240)' },
  { label: 'Molten Gold', value: 'oklch(0.75 0.16 85)' },
] as const;

interface BrandColorPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

export function BrandColorPicker({ value, onChange, className }: BrandColorPickerProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {BRAND_COLORS.map(({ label, value: colorValue }) => (
        <button
          key={label}
          type="button"
          title={label}
          onClick={() => onChange(colorValue)}
          className={cn(
            'size-9 rounded-full border-2 transition-transform hover:scale-110',
            value === colorValue
              ? 'border-[var(--color-ink)] ring-2 ring-white/20'
              : 'border-transparent hover:border-white/20'
          )}
          style={{ backgroundColor: colorValue }}
          aria-label={label}
          aria-pressed={value === colorValue}
        />
      ))}
    </div>
  );
}
