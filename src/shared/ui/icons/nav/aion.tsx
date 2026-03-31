import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Aion = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 4L20 12L12 20L4 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
));
Aion.displayName = 'Aion';

export const AionFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 4L20 12L12 20L4 12Z" />
    <circle cx="12" cy="12" r="3" fill="var(--stage-surface, oklch(0 0 0))" />
  </svg>
));
AionFilled.displayName = 'AionFilled';
