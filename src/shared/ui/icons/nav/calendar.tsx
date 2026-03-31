import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Calendar = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <line x1="16" y1="3" x2="16" y2="7" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <path d="M12 10v4l2 2" />
  </svg>
));
Calendar.displayName = 'Calendar';

export const CalendarFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth={strokeWidth} />
    <line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth={strokeWidth} />
    <path d="M12 10v4l2 2" stroke="var(--stage-surface, oklch(0 0 0))" strokeWidth={strokeWidth} fill="none" />
  </svg>
));
CalendarFilled.displayName = 'CalendarFilled';
