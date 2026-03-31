import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const RunOfShow = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="6" y1="4" x2="6" y2="20" />
      <circle cx="6" cy="8" r="2" />
      <circle cx="6" cy="16" r="2" />
      <rect x="11" y="6" width="9" height="4" rx="1" />
      <rect x="11" y="14" width="9" height="4" rx="1" />
    </svg>
  )
);
RunOfShow.displayName = 'RunOfShow';