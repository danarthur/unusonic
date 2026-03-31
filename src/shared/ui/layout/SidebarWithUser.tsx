/**
 * Sidebar with User Account
 * Navigation sidebar with sectioned nav, sliding active pill,
 * and icon-rail collapsed state.
 * @module components/layout/SidebarWithUser
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, LayoutGroup } from 'framer-motion';
import { Settings, LogOut, User, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { useSystemHeart } from '@/shared/ui/providers/SystemHeartContext';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { cn } from '@/shared/lib/utils';
import { signOutAction } from '@/shared/api/auth/sign-out';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useState, useEffect } from 'react';
import { navSections, isNavActive } from './nav-items';
import { useSidebarStore } from './sidebar-store';
import { useDensityStore, type DensityTier } from './density-store';

interface SidebarWithUserProps {
  user: {
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  workspaceName?: string | null;
}

const pillSpring = { type: 'spring', stiffness: 500, damping: 35 } as const;

export function SidebarWithUser({ user, workspaceName }: SidebarWithUserProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setViewState } = useSession();
  const { status: systemStatus, setStatus: setSystemStatus } = useSystemHeart();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { collapsed, toggle } = useSidebarStore();
  const { density, setDensity } = useDensityStore();

  // When route settles, return System Heart to idle
  useEffect(() => {
    const t = setTimeout(() => setSystemStatus('idle'), 400);
    return () => clearTimeout(t);
  }, [pathname, setSystemStatus]);

  // Keyboard shortcut: [ to toggle, Cmd+\ as alternative
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  const handleNavClick = (id: string) => {
    if (id === 'brain') setViewState('chat');
    else setViewState('overview');
  };

  const handleNavigation = (id: string, href: string) => {
    handleNavClick(id);
    setSystemStatus('loading');
    router.push(href);
  };

  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const isSettingsActive = pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <aside
      className={cn(
        'sidebar-panel h-full relative z-50 flex flex-col !p-0 rounded-r-2xl',
        collapsed ? 'w-[56px]' : 'w-[220px]'
      )}
    >
      <div className="py-4 flex flex-col h-full">
        {/* Brand Block — System Heart + Logotype */}
        <div className={cn('shrink-0 mb-1', collapsed ? 'px-1.5' : 'px-3')}>
          <button
            type="button"
            onClick={() => handleNavigation('overview', '/lobby')}
            className={cn(
              'flex items-center w-full rounded-xl p-2 hover:bg-[var(--stage-surface-hover)] cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
              collapsed ? 'justify-center' : 'gap-2.5'
            )}
            aria-label="Unusonic home"
          >
            <LivingLogo size="sm" status={systemStatus} />
            {!collapsed && (
              <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">Unusonic</span>
            )}
          </button>
        </div>

        {/* Workspace Indicator — expanded only */}
        {!collapsed && workspaceName && (
          <div className="px-5 mb-4">
            <p className="text-[10px] text-[var(--stage-text-tertiary)] truncate">{workspaceName}</p>
          </div>
        )}

        {/* Sectioned Navigation */}
        <LayoutGroup>
          <nav className={cn(
            'flex-1 flex flex-col gap-4 w-full overflow-y-auto',
            collapsed ? 'px-1.5' : 'px-3'
          )}>
            {navSections.map((section) => (
              <div key={section.label}>
                {/* Section header — expanded only */}
                {!collapsed && (
                  <p className="text-[10px] uppercase tracking-widest text-[var(--stage-text-tertiary)] font-medium px-3 mb-1.5 select-none">
                    {section.label}
                  </p>
                )}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const isActive = isNavActive(item.id, item.href, pathname);
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => handleNavClick(item.id)}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'group relative flex items-center h-10 rounded-xl transition-colors duration-150',
                          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                          isActive
                            ? 'text-[var(--stage-text-primary)]'
                            : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]'
                        )}
                        aria-label={item.label}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-pill"
                            className="absolute inset-0 rounded-xl bg-[var(--stage-accent)]/10"
                            transition={pillSpring}
                          />
                        )}
                        {(() => {
                          const IconComp = isActive && item.iconFilled ? item.iconFilled : item.icon;
                          return (
                            <IconComp
                              size={18}
                              strokeWidth={1.5}
                              className={cn(
                                'relative z-10 shrink-0 transition-colors',
                                isActive ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)]'
                              )}
                            />
                          );
                        })()}
                        {!collapsed && (
                          <span
                            className={cn(
                              'relative z-10 text-sm font-medium truncate',
                              isActive ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)]'
                            )}
                          >
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </LayoutGroup>

        {/* Bottom section: Settings + Collapse toggle + User */}
        <div className={cn('mt-auto flex flex-col gap-1 pt-2', collapsed ? 'px-1.5' : 'px-3')}>
          {/* Settings */}
          <Link
            href="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={cn(
              'group relative flex items-center h-10 rounded-xl transition-colors duration-150',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3',
              isSettingsActive
                ? 'text-[var(--stage-text-primary)] bg-[var(--stage-accent)]/10'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]'
            )}
            aria-label="Settings"
          >
            <Settings size={18} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Settings</span>}
          </Link>

          {/* Density selector — segmented control, same surface as sidebar */}
          {!collapsed && (
            <div className="relative flex items-center h-8 rounded-[var(--stage-radius-input)] mx-1 p-0.5 border border-[var(--stage-edge-subtle)]" style={{ background: 'var(--stage-surface-hover)' }}>
              {(['spacious', 'balanced', 'dense'] as DensityTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setDensity(tier)}
                  className={cn(
                    'relative flex-1 h-full text-[10px] font-medium tracking-wide transition-all duration-150 capitalize rounded-[calc(var(--stage-radius-input)-2px)] z-10',
                    density === tier
                      ? 'text-[var(--stage-text-primary)] bg-[var(--stage-surface-raised)] shadow-sm'
                      : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]'
                  )}
                >
                  {tier}
                </button>
              ))}
            </div>
          )}

          {/* Collapse / Expand toggle */}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center h-9 rounded-xl text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] transition-colors duration-150',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft size={16} strokeWidth={1.5} />
            ) : (
              <>
                <PanelLeftClose size={16} strokeWidth={1.5} />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="border-t border-[var(--stage-edge-subtle)] my-1" />

          {/* User Account — Footer */}
          <Popover open={isAccountOpen} onOpenChange={setIsAccountOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={collapsed ? (user?.fullName || 'Account') : undefined}
                className={cn(
                  'w-full h-12 flex items-center rounded-xl transition-colors duration-150',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                  isAccountOpen
                    ? 'stage-panel active-glass !rounded-xl'
                    : 'hover:bg-[var(--stage-surface-hover)]'
                )}
              >
                <div className={cn(
                  'avatar-primary bg-[var(--stage-accent)]/5 flex items-center justify-center shrink-0',
                  collapsed ? 'w-7 h-7' : 'w-8 h-8'
                )}>
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-medium text-[var(--stage-text-primary)]">{initials}</span>
                  )}
                </div>
                {!collapsed && (
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                      {user?.fullName || 'User'}
                    </p>
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={12}
              className="w-64 stage-panel p-0 border-[var(--stage-edge-subtle)]"
            >
              {/* User Info */}
              <div className="px-3 py-3 border-b border-[var(--stage-edge-subtle)]">
                <div className="flex items-center gap-3">
                  <div className="avatar-primary w-10 h-10 bg-[var(--stage-accent)]/5 flex items-center justify-center shrink-0">
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.fullName || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-5 h-5 text-[var(--stage-text-secondary)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                      {user?.fullName || 'User'}
                    </p>
                    <p className="text-xs text-[var(--stage-text-secondary)] truncate">{user?.email}</p>
                  </div>
                </div>

                {workspaceName && (
                  <div className="mt-3 px-2 py-1.5 rounded-lg bg-[var(--stage-accent)]/[0.03] border border-[var(--stage-edge-subtle)]">
                    <p className="text-[10px] text-[var(--stage-text-tertiary)] uppercase tracking-wider mb-0.5">
                      Workspace
                    </p>
                    <p className="text-xs font-medium text-[var(--stage-text-primary)] truncate">{workspaceName}</p>
                  </div>
                )}
              </div>

              {/* Menu Items */}
              <div className="py-2">
                <button
                  onClick={() => {
                    setIsAccountOpen(false);
                    router.push('/settings');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors text-left"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Settings</span>
                </button>

                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/5 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">Sign out</span>
                  </button>
                </form>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </aside>
  );
}
