import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const LoadIn = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 10v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <line x1="12" y1="4" x2="12" y2="14" />
      <polyline points="8 10 12 14 16 10" />
    </svg>
  )
);
LoadIn.displayName = 'LoadIn';