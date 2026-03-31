import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const Lobby = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="4" width="7" height="9" rx="1.5" />
    <rect x="13" y="4" width="7" height="5" rx="1.5" />
    <rect x="4" y="15" width="7" height="5" rx="1.5" />
    <rect x="13" y="11" width="7" height="9" rx="1.5" />
  </svg>
));
Lobby.displayName = 'Lobby';

export const LobbyFilled = forwardRef<SVGSVGElement, LucideProps>(({ color = 'currentColor', size = 24, strokeWidth = 1.5, ...props }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="4" width="7" height="9" rx="1.5" />
    <rect x="13" y="4" width="7" height="5" rx="1.5" />
    <rect x="4" y="15" width="7" height="5" rx="1.5" />
    <rect x="13" y="11" width="7" height="9" rx="1.5" />
  </svg>
));
LobbyFilled.displayName = 'LobbyFilled';
