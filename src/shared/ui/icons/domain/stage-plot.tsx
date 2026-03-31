import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const StagePlot = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 14h16v6H4z" />
      <path d="M7 14V6h10v8" />
      <circle cx="12" cy="10" r="1.5" />
      <circle cx="16" cy="17" r="1.5" />
      <circle cx="8" cy="17" r="1.5" />
    </svg>
  )
);
StagePlot.displayName = 'StagePlot';