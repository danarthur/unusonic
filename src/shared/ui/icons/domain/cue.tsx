import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Cue = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="4" x2="5" y2="20" />
      <path d="M9 7l10 5-10 5V7z" />
    </svg>
  )
);
Cue.displayName = 'Cue';