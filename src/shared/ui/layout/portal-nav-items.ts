/**
 * Portal navigation items — employee-facing portal.
 * Simpler than the dashboard nav: schedule, profile, pay.
 */

import { CalendarDays, Calendar, UserCircle, Banknote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PortalNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

export const portalNavItems: PortalNavItem[] = [
  { id: 'schedule', label: 'Gigs', icon: CalendarDays, href: '/schedule' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, href: '/calendar' },
  { id: 'pay', label: 'Pay', icon: Banknote, href: '/pay' },
  { id: 'profile', label: 'Profile', icon: UserCircle, href: '/profile' },
];

export function isPortalNavActive(itemHref: string, pathname: string): boolean {
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
