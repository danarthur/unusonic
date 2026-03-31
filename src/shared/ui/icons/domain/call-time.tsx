import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const CallTime = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 12A8 8 0 1 1 12 4" />
      <path d="M12 12V7" />
      <path d="M19 3l-6 6" />
      <path d="M19 9h-6V3" />
    </svg>
  )
);
CallTime.displayName = 'CallTime';