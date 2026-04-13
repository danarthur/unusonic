import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Aion nav icon — broken ouroboros matching the Aion Mark.
 *
 * Two arc segments forming a broken circle with asymmetric gaps (25° / 35°).
 * 24×24 viewBox, stroke-based for Lucide consistency.
 * The wider gap sits at ~1 o'clock, echoing the Phase Mark's diagonal offset.
 */

// Arc geometry scaled to 24×24 (center 12,12, radius 7.2)
const CX = 12;
const CY = 12;
const R = 7.2;
const DEG = Math.PI / 180;

// Base rotation -60° so gaps sit at 1 and 7 o'clock
const BASE = -60;

// Arc 1: 155°, Arc 2: 145° (asymmetric — the "one violation")
const A1_START = BASE;
const A1_END = BASE + 155;
const A2_START = BASE + 155 + 25; // after 25° gap
const A2_END = BASE + 155 + 25 + 145; // = BASE + 325°

function pt(deg: number): [number, number] {
  const r = deg * DEG;
  return [
    Math.round((CX + R * Math.cos(r)) * 1000) / 1000,
    Math.round((CY + R * Math.sin(r)) * 1000) / 1000,
  ];
}

// For SVG arc commands: large-arc-flag is 1 if span > 180°
const [a1sx, a1sy] = pt(A1_START);
const [a1ex, a1ey] = pt(A1_END);
const [a2sx, a2sy] = pt(A2_START);
const [a2ex, a2ey] = pt(A2_END);

// Arc 1 path: 155° span (< 180°, so large-arc = 0, sweep = 1 for CW)
const ARC_1 = `M${a1sx},${a1sy} A${R},${R} 0 0 1 ${a1ex},${a1ey}`;

// Arc 2 path: 145° span (< 180°, so large-arc = 0, sweep = 1 for CW)
const ARC_2 = `M${a2sx},${a2sy} A${R},${R} 0 0 1 ${a2ex},${a2ey}`;

export const Aion = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={ARC_1} />
      <path d={ARC_2} />
    </svg>
  ),
);
Aion.displayName = 'Aion';

export const AionFilled = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 2.5, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={ARC_1} />
      <path d={ARC_2} />
    </svg>
  ),
);
AionFilled.displayName = 'AionFilled';
