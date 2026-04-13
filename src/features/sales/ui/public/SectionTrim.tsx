'use client';

/**
 * SectionTrim — decorative SVG dividers between proposal sections.
 * Driven by --portal-section-trim token. Renders between grouped sections
 * to create visual rhythm and theme identity.
 *
 * Variants: wave, angle, dots, straight, none.
 * Color: inherits from --portal-border or --portal-accent.
 */

export type TrimVariant = 'none' | 'wave' | 'angle' | 'dots' | 'straight';

interface SectionTrimProps {
  variant: TrimVariant;
  className?: string;
}

export function SectionTrim({ variant, className }: SectionTrimProps) {
  if (variant === 'none') return null;

  return (
    <div className={className} aria-hidden>
      {variant === 'wave' && <WaveTrim />}
      {variant === 'angle' && <AngleTrim />}
      {variant === 'dots' && <DotsTrim />}
      {variant === 'straight' && <StraightTrim />}
    </div>
  );
}

/** Soft sine wave — organic, warm (Linen, luxury) */
function WaveTrim() {
  return (
    <svg
      viewBox="0 0 1200 24"
      preserveAspectRatio="none"
      className="w-full h-4"
      fill="none"
    >
      <path
        d="M0 12 Q150 0 300 12 Q450 24 600 12 Q750 0 900 12 Q1050 24 1200 12"
        stroke="var(--portal-border)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Sharp angled line — graphic, bold (Poster, festival) */
function AngleTrim() {
  return (
    <svg
      viewBox="0 0 1200 20"
      preserveAspectRatio="none"
      className="w-full h-3"
      fill="none"
    >
      <path
        d="M0 20 L600 0 L1200 20"
        stroke="var(--portal-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Evenly spaced dots — technical, precise (Terminal, data) */
function DotsTrim() {
  return (
    <svg
      viewBox="0 0 1200 8"
      preserveAspectRatio="xMidYMid"
      className="w-full h-2"
    >
      {Array.from({ length: 40 }, (_, i) => (
        <circle
          key={i}
          cx={15 + i * 30}
          cy="4"
          r="1.5"
          fill="var(--portal-border)"
        />
      ))}
    </svg>
  );
}

/** Clean horizontal rule — structured, professional (Clean, Editorial, Broadcast) */
function StraightTrim() {
  return (
    <div
      className="w-full"
      style={{
        height: '1px',
        backgroundColor: 'var(--portal-border)',
      }}
    />
  );
}
