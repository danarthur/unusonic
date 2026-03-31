import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const PatchList = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* 2x2 Node Grid */}
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="7" r="2" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      {/* Patch cables */}
      <path d="M9 7c3 0 5 10 8 10" />
      <path d="M9 17c3 0 5-10 8-10" />
    </svg>
  )
);
PatchList.displayName = 'PatchList';
