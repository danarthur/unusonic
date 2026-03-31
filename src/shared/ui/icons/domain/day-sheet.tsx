// day-sheet.tsx
import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const DaySheet = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Single sheet */}
      <rect x="4" y="4" width="16" height="16" rx="2" />
      {/* Timeline margin */}
      <line x1="8" y1="7" x2="8" y2="17" />
      {/* Schedule blocks */}
      <line x1="11" y1="8" x2="16" y2="8" />
      <line x1="11" y1="12" x2="14" y2="12" />
      <line x1="11" y1="16" x2="16" y2="16" />
    </svg>
  )
);
DaySheet.displayName = 'DaySheet';