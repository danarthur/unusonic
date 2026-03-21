'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Users, Shield, User, Lock } from 'lucide-react';

const ITEMS: { href: string; label: string; icon: typeof Settings }[] = [
  { href: '/settings', label: 'Overview', icon: Settings },
  { href: '/settings/team', label: 'Team', icon: Users },
  { href: '/settings/roles', label: 'Roles', icon: Shield },
  { href: '/settings/security', label: 'Security', icon: Lock },
  { href: '/settings/identity', label: 'Identity', icon: User },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-1 p-1.5 rounded-xl liquid-panel border border-[var(--glass-border)] w-fit"
      aria-label="Settings"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/settings' ? pathname === '/settings' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium tracking-tight transition-colors ${
              isActive
                ? 'bg-[var(--glass-bg-hover)] text-ceramic'
                : 'text-ink-muted hover:text-ceramic hover:bg-[var(--glass-bg)]'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
