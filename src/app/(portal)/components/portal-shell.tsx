'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { portalNavItems, isPortalNavActive } from '@/shared/ui/layout/portal-nav-items';

interface PortalShellProps {
  user: { email: string; fullName: string | null; avatarUrl: string | null } | null;
  workspaceName: string | null;
}

export function PortalShell({ user, workspaceName }: PortalShellProps) {
  const pathname = usePathname();

  return (
    <>
      {/* ── Top Header (always visible) ──────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[oklch(1_0_0/0.06)] bg-[var(--stage-void)]/80 backdrop-blur-md px-4 sm:px-6 lg:px-8 h-14">
        {/* Left: workspace name */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] truncate">
            {workspaceName ?? 'Unusonic'}
          </span>
        </div>

        {/* Center: nav items (desktop only) */}
        <nav className="hidden sm:flex items-center gap-1">
          {portalNavItems.map((item) => {
            const active = isPortalNavActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0/0.08)]'
                    : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)]'
                  }
                `}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: user info + sign out */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-[var(--stage-text-tertiary)] truncate hidden sm:inline">
            {user?.fullName ?? user?.email}
          </span>
          <Link
            href="/signout"
            className="flex items-center gap-1 text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Link>
        </div>
      </header>

      {/* ── Bottom Tab Bar (mobile only) ─────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex sm:hidden items-stretch justify-around border-t border-[oklch(1_0_0/0.06)] bg-[var(--stage-void)]/90 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {portalNavItems.map((item) => {
          const active = isPortalNavActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`
                flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors
                ${active
                  ? 'text-[var(--stage-text-primary)]'
                  : 'text-[var(--stage-text-tertiary)]'
                }
              `}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
