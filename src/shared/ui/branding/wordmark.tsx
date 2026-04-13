/**
 * Wordmark — Typographic identity for Unusonic and Aion.
 *
 * Geist Sans, ALL CAPS, +0.12em tracking.
 * Unusonic: weight 500 (medium — instrument label).
 * Aion: weight 400 (one step lighter — sub-brand).
 */

interface WordmarkProps {
  brand?: 'unusonic' | 'aion';
  /** Font size in px. When used inside Lockup, this is computed to match mark cap height. */
  fontSize?: number;
  className?: string;
}

const BRAND_CONFIG = {
  unusonic: { text: 'UNUSONIC', weight: 500 },
  aion: { text: 'AION', weight: 400 },
} as const;

export function Wordmark({ brand = 'unusonic', fontSize, className }: WordmarkProps) {
  const { text, weight } = BRAND_CONFIG[brand];

  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
        fontWeight: weight,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        lineHeight: 1,
        ...(fontSize != null && { fontSize }),
      }}
      aria-label={brand === 'unusonic' ? 'Unusonic' : 'Aion'}
    >
      {text}
    </span>
  );
}
