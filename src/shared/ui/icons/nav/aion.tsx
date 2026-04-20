import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Aion nav icon — closed ring + centered Self.
 *
 * Matches the redesigned Aion Mark (2026-04-19). Jungian mandala:
 * totality (perimeter) + Self (center). Simpler stroked silhouette for
 * nav contexts — no motion, no iridescence. 24×24 viewBox for Lucide
 * compatibility.
 */

const CX = 12;
const CY = 12;
const R = 7.2;
const DOT_R = 1.4;

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
      <circle cx={CX} cy={CY} r={R} />
      <circle cx={CX} cy={CY} r={DOT_R} fill={color} stroke="none" />
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
      <circle cx={CX} cy={CY} r={R} />
      <circle cx={CX} cy={CY} r={DOT_R + 0.3} fill={color} stroke="none" />
    </svg>
  ),
);
AionFilled.displayName = 'AionFilled';
