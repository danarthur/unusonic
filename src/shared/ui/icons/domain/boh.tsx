// boh.tsx
import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Boh = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Stage floor and top rigging */}
      <line x1="4" y1="20" x2="20" y2="20" />
      <line x1="4" y1="4" x2="20" y2="4" />
      {/* Doorway in the background */}
      <path d="M16 20V8a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v12" />
      {/* Curtain swept to the left */}
      <path d="M8 4c2 6 2 12-4 16" />
    </svg>
  )
);
Boh.displayName = 'Boh';