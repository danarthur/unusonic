import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const LoadOut = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 10v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <line x1="12" y1="14" x2="12" y2="4" />
      <polyline points="8 8 12 4 16 8" />
    </svg>
  )
);
LoadOut.displayName = 'LoadOut';
