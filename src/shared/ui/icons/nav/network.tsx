import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Network = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="6" r="3" />
    <circle cx="6" cy="16" r="3" />
    <circle cx="18" cy="16" r="3" />
    <path d="M10.5 8.5l-3 4.5" />
    <path d="M13.5 8.5l3 4.5" />
    <path d="M9 16h6" />
  </svg>
));
Network.displayName = 'Network';

export const NetworkFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="6" r="3" fill={color} />
    <circle cx="6" cy="16" r="3" fill={color} />
    <circle cx="18" cy="16" r="3" fill={color} />
    <path d="M10.5 8.5l-3 4.5" />
    <path d="M13.5 8.5l3 4.5" />
    <path d="M9 16h6" />
  </svg>
));
NetworkFilled.displayName = 'NetworkFilled';
