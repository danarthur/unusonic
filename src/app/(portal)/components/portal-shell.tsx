'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isPortalNavActive, NAV, type PortalNavItem } from '@/shared/lib/portal-profiles';

type SerializableNavItem = Omit<PortalNavItem, 'icon'>;

interface PortalShellProps {
  navItems: SerializableNavItem[];
}

/**
 * Portal Shell — mobile-only bottom tab bar.
 * Desktop navigation is handled by PortalSidebar.
 */
export function PortalShell({ navItems }: PortalShellProps) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex lg:hidden items-stretch justify-around border-t border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map((item) => {
        const active = isPortalNavActive(item.href, pathname);
        const Icon = NAV[item.id]?.icon;
        if (!Icon) return null;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`
              flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors
              ${active
                ? 'text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-secondary)]'
              }
            `}
          >
            <Icon className="size-5" />
            <span className="text-label font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
