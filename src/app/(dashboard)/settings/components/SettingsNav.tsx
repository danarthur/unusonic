'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings,
  Users,
  Shield,
  Lock,
  Mail,
  LayoutGrid,
  Clock,
  Zap,
  UserCheck,
  Signpost,
  Tags,
  Paintbrush,
  Fingerprint,
  Workflow,
  Sparkles,
} from 'lucide-react';

type NavItem = { href: string; label: string; icon: typeof Settings };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'General',
    items: [
      { href: '/settings', label: 'Overview', icon: Settings },
      { href: '/settings/plan', label: 'Plan', icon: LayoutGrid },
      { href: '/settings/security', label: 'Security', icon: Lock },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/settings/team', label: 'Team', icon: Users },
      { href: '/settings/roles', label: 'Roles', icon: Shield },
      { href: '/settings/roster', label: 'Roster', icon: UserCheck },
    ],
  },
  {
    label: 'AI',
    items: [
      { href: '/settings/aion', label: 'Aion', icon: Sparkles },
    ],
  },
  {
    label: 'Production',
    items: [
      { href: '/settings/pipeline', label: 'Deal flow', icon: Workflow },
      { href: '/settings/call-times', label: 'Call times', icon: Clock },
      { href: '/settings/lead-sources', label: 'Lead sources', icon: Signpost },
      { href: '/settings/network-tags', label: 'Tags', icon: Tags },
    ],
  },
  {
    label: 'Brand',
    items: [
      { href: '/settings/identity', label: 'Identity', icon: Fingerprint },
      { href: '/settings/portal', label: 'Portal', icon: Paintbrush },
      { href: '/settings/email', label: 'Email', icon: Mail },
      { href: '/settings/connect-payouts', label: 'Payouts', icon: Zap },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Settings">
      {GROUPS.map((group, gi) => (
        <div key={group.label} className="flex items-center">
          {gi > 0 && (
            <div className="w-px h-5 mx-1.5 bg-[var(--stage-border)]" aria-hidden />
          )}
          <div className="flex items-center gap-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === '/settings'
                  ? pathname === '/settings'
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium tracking-tight transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)]'
                      : 'stage-hover overflow-hidden text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
