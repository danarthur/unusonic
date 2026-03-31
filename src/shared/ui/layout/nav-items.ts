/**
 * Shared navigation items for sidebar and mobile dock.
 * Single source of truth — both surfaces import from here.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Lobby, LobbyFilled,
  Aion, AionFilled,
  Calendar, CalendarFilled,
  Network, NetworkFilled,
  Productions, ProductionsFilled,
  Catalog, CatalogFilled,
  Finance, FinanceFilled,
} from '@/shared/ui/icons';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  iconFilled?: LucideIcon;
  href: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Desktop sidebar — grouped by section */
export const navSections: NavSection[] = [
  {
    label: 'Core',
    items: [
      { id: 'overview', label: 'Overview', icon: Lobby, iconFilled: LobbyFilled, href: '/lobby' },
      { id: 'brain', label: 'Aion', icon: Aion, iconFilled: AionFilled, href: '/brain' },
      { id: 'calendar', label: 'Calendar', icon: Calendar, iconFilled: CalendarFilled, href: '/calendar' },
      { id: 'network', label: 'Contacts', icon: Network, iconFilled: NetworkFilled, href: '/network' },
    ],
  },
  {
    label: 'Production',
    items: [
      { id: 'production', label: 'Productions', icon: Productions, iconFilled: ProductionsFilled, href: '/crm' },
      { id: 'catalog', label: 'Gear', icon: Catalog, iconFilled: CatalogFilled, href: '/catalog' },
      { id: 'finance', label: 'Finance', icon: Finance, iconFilled: FinanceFilled, href: '/finance' },
    ],
  },
];

/** All nav items flattened (for route matching, etc.) */
export const allNavItems: NavItem[] = navSections.flatMap((s) => s.items);

/** Mobile dock — primary items shown in bottom bar */
export const dockItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Lobby, iconFilled: LobbyFilled, href: '/lobby' },
  { id: 'brain', label: 'Aion', icon: Aion, iconFilled: AionFilled, href: '/brain' },
  { id: 'production', label: 'Productions', icon: Productions, iconFilled: ProductionsFilled, href: '/crm' },
  { id: 'catalog', label: 'Gear', icon: Catalog, iconFilled: CatalogFilled, href: '/catalog' },
  { id: 'finance', label: 'Finance', icon: Finance, iconFilled: FinanceFilled, href: '/finance' },
];

/** Mobile dock — overflow items shown in "More" sheet */
export const moreItems: NavItem[] = [
  { id: 'calendar', label: 'Calendar', icon: Calendar, iconFilled: CalendarFilled, href: '/calendar' },
  { id: 'network', label: 'Contacts', icon: Network, iconFilled: NetworkFilled, href: '/network' },
];

/** Check if a nav item is active given the current pathname */
export function isNavActive(itemId: string, itemHref: string, pathname: string): boolean {
  if (itemId === 'overview') return pathname === '/lobby' || pathname === itemHref;
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
