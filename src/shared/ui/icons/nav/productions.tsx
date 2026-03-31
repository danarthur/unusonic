import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Productions = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="9" width="16" height="11" rx="2" />
    <path d="M4 9l4.5-5h9L13 9" />
    <path d="M8.5 4l1.8 5" />
    <path d="M13 4l1.8 5" />
  </svg>
));
Productions.displayName = 'Productions';

export const ProductionsFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="9" width="16" height="11" rx="2" />
    <path d="M4 9l4.5-5h9L13 9" />
    <path d="M8.5 4l1.8 5" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
    <path d="M13 4l1.8 5" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
  </svg>
));
ProductionsFilled.displayName = 'ProductionsFilled';
