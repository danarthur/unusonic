// advance.tsx
import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Advance = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Left approaching arrow */}
      <line x1="4" y1="12" x2="10" y2="12" />
      <path d="M7 9l3 3-3 3" />
      {/* Right approaching arrow */}
      <line x1="20" y1="12" x2="14" y2="12" />
      <path d="M17 9l-3 3 3 3" />
    </svg>
  )
);
Advance.displayName = 'Advance';