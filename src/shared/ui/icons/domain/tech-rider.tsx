import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const TechRider = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M14 4v5h5" />
      <line x1="9" y1="13" x2="9" y2="16" />
      <line x1="12" y1="11" x2="12" y2="18" />
      <line x1="15" y1="14" x2="15" y2="16" />
    </svg>
  )
);
TechRider.displayName = 'TechRider';