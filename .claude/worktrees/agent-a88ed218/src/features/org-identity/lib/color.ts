import { formatHex, parse } from 'culori';

/** Return a CSS hex color with alpha (works for hex and oklch from presets). */
export function colorWithAlpha(color: string | null, alpha: number): string | undefined {
  if (!color?.trim()) return undefined;
  try {
    const parsed = parse(color.trim());
    if (!parsed) return undefined;
    return formatHex({ ...parsed, alpha });
  } catch {
    return undefined;
  }
}
