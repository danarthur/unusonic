import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Finance = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d="M13 9h2" />
    <path d="M13 15h2" />
  </svg>
));
Finance.displayName = 'Finance';

export const FinanceFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <path d="M9 4v16" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
    <path d="M13 9h2" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
    <path d="M13 15h2" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} />
  </svg>
));
FinanceFilled.displayName = 'FinanceFilled';
