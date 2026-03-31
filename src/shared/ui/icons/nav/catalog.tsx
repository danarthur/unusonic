import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Catalog = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="6" width="16" height="12" rx="2" />
    <line x1="7" y1="6" x2="7" y2="18" />
    <line x1="17" y1="6" x2="17" y2="18" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
));
Catalog.displayName = 'Catalog';

export const CatalogFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="6" width="16" height="12" rx="2" />
    <line x1="7" y1="6" x2="7" y2="18" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
    <line x1="17" y1="6" x2="17" y2="18" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
    <circle cx="12" cy="12" r="1.5" fill="var(--stage-surface, oklch(0 0 0))" />
  </svg>
));
CatalogFilled.displayName = 'CatalogFilled';
