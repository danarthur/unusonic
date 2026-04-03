/**
 * Portal navigation items — employee-facing portal.
 * Simpler than the dashboard nav: schedule, profile, pay.
 */

import { CalendarDays, UserCircle, Banknote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PortalNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

export const portalNavItems: PortalNavItem[] = [
  { id: 'schedule', label: 'Schedule', icon: CalendarDays, href: '/portal/schedule' },
  { id: 'profile', label: 'Profile', icon: UserCircle, href: '/portal/profile' },
  { id: 'pay', label: 'Pay', icon: Banknote, href: '/portal/pay' },
];

export function isPortalNavActive(itemHref: string, pathname: string): boolean {
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
