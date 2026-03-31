// foh.tsx
import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Foh = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Fader tracks */}
      <line x1="6" y1="4" x2="6" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="18" y1="4" x2="18" y2="20" />
      {/* Fader caps */}
      <rect x="4" y="14" width="4" height="4" rx="1" />
      <rect x="10" y="7" width="4" height="4" rx="1" />
      <rect x="16" y="11" width="4" height="4" rx="1" />
    </svg>
  )
);
Foh.displayName = 'Foh';