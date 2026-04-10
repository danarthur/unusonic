'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { LogOut, PanelLeftClose, PanelLeft } from 'lucide-react';
import { isPortalNavActive, NAV, type PortalNavItem } from '@/shared/lib/portal-profiles';
import { useSidebarStore } from '@/shared/ui/layout/sidebar-store';
import { WorkspaceSwitcher, type WorkspaceEntry } from '@/shared/ui/layout/WorkspaceSwitcher';
import { cn } from '@/shared/lib/utils';

type SerializableNavItem = Omit<PortalNavItem, 'icon'>;

interface PortalSidebarProps {
  user: { email: string; fullName: string | null; avatarUrl: string | null } | null;
  workspaceName: string | null;
  workspaces?: WorkspaceEntry[];
  activeWorkspaceId?: string | null;
  navItems: SerializableNavItem[];
}

import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
const pillSpring = STAGE_LIGHT;

export function PortalSidebar({ user, workspaceName, workspaces, activeWorkspaceId, navItems }: PortalSidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();

  // Keyboard shortcut: [ to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <aside
      className={cn(
        'h-full relative z-50 flex flex-col bg-[var(--stage-surface)] border-r border-[var(--stage-edge-subtle)]',
        collapsed ? 'w-[56px]' : 'w-[220px]'
      )}
      style={{ transition: 'width 200ms ease' }}
    >
      <div className="py-4 flex flex-col h-full">
        {/* Workspace name / switcher */}
        <div className={cn('shrink-0 mb-4', collapsed ? 'px-1.5' : 'px-3')}>
          {workspaces && workspaces.length > 0 ? (
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId ?? null}
              collapsed={collapsed}
            />
          ) : (
            <div className={cn(
              'flex items-center rounded-xl p-2',
              collapsed ? 'justify-center' : 'gap-2.5'
            )}>
              <div className="size-7 rounded-lg bg-[oklch(1_0_0/0.08)] flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-[var(--stage-text-primary)]">
                  {workspaceName?.[0]?.toUpperCase() ?? 'U'}
                </span>
              </div>
              {!collapsed && workspaceName && (
                <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                  {workspaceName}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <LayoutGroup>
          <nav className={cn(
            'flex-1 flex flex-col gap-0.5 w-full',
            collapsed ? 'px-1.5' : 'px-3'
          )}>
            {navItems.map((item) => {
              const active = isPortalNavActive(item.href, pathname);
              const Icon = NAV[item.id]?.icon;
              if (!Icon) return null;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'group relative flex items-center h-10 rounded-xl transition-colors duration-[80ms]',
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    active
                      ? 'text-[var(--stage-text-primary)]'
                      : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.04)]'
                  )}
                  aria-label={item.label}
                >
                  {active && (
                    <motion.div
                      layoutId="portal-sidebar-pill"
                      className="absolute inset-0 rounded-xl bg-[oklch(1_0_0/0.08)]"
                      transition={pillSpring}
                    />
                  )}
                  <Icon
                    size={18}
                    strokeWidth={1.5}
                    className={cn(
                      'relative z-10 shrink-0 transition-colors',
                      active ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)]'
                    )}
                  />
                  {!collapsed && (
                    <span className={cn(
                      'relative z-10 text-sm font-medium truncate',
                      active ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)]'
                    )}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </LayoutGroup>

        {/* Bottom section */}
        <div className={cn('mt-auto flex flex-col gap-1 pt-2', collapsed ? 'px-1.5' : 'px-3')}>
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center h-9 rounded-xl text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors duration-[80ms]',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft size={16} strokeWidth={1.5} />
            ) : (
              <>
                <PanelLeftClose size={16} strokeWidth={1.5} />
                <span className="text-xs text-[var(--stage-text-secondary)]">Collapse</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="border-t border-[var(--stage-edge-subtle)] my-1" />

          {/* User + Sign out */}
          <div className={cn(
            'flex items-center rounded-xl',
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
          )}>
            <div className={cn(
              'rounded-full bg-[oklch(1_0_0/0.08)] flex items-center justify-center shrink-0',
              collapsed ? 'size-7' : 'size-8'
            )}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="size-full rounded-full object-cover" />
              ) : (
                <span className="text-xs font-medium text-[var(--stage-text-primary)]">{initials}</span>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                  {user?.fullName || user?.email || 'User'}
                </p>
              </div>
            )}
          </div>

          <Link
            href="/signout"
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              'flex items-center h-9 rounded-xl text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors duration-[80ms]',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3'
            )}
            aria-label="Sign out"
          >
            <LogOut size={16} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span className="text-xs">Sign out</span>}
          </Link>
        </div>
      </div>
    </aside>
  );
}
