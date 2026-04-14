/**
 * Mobile Dock — Stage-surface bottom bar for thumb-driven nav.
 * Shown on mobile only; desktop keeps Sidebar.
 * @module shared/ui/layout/MobileDock
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Menu,
  Settings,
  LogOut,
  User,
} from 'lucide-react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { useSystemHeart } from '@/shared/ui/providers/SystemHeartContext';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { signOutAction } from '@/shared/api/auth/sign-out';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { dockItems, moreItems, isNavActive } from './nav-items';


interface MobileDockProps {
  user: {
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  workspaceName?: string | null;
}

export function MobileDock({ user, workspaceName }: MobileDockProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setViewState } = useSession();
  const { status: systemStatus, setStatus: setSystemStatus } = useSystemHeart();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleNav = (id: string, href: string) => {
    if (id === 'aion') setViewState('chat');
    else setViewState('overview');
    setSystemStatus('loading');
    router.push(href);
    setSheetOpen(false);
  };

  return (
    <>
      {/* Bottom bar — visible on mobile only via parent lg:hidden */}
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'bg-[var(--stage-surface)] border-t border-[oklch(1_0_0/0.06)]',
          'pb-[env(safe-area-inset-bottom)] pt-2 px-2'
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-around gap-1">
          {dockItems.map((item) => {
            const isActive = isNavActive(item.id, item.href, pathname);
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => {
                  setViewState(item.id === 'aion' ? 'chat' : 'overview');
                  setSystemStatus('loading');
                }}
                className={cn(
                  'flex flex-col items-center justify-center min-w-[56px] py-2 rounded-xl transition-colors',
                  'touch-manipulation',
                  isActive
                    ? 'bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                )}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {(() => {
                  const IconComp = isActive && item.iconFilled ? item.iconFilled : item.icon;
                  return <IconComp size={24} strokeWidth={1.5} className="shrink-0" />;
                })()}
                <span className="text-label font-medium mt-0.5 truncate w-full text-center">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex flex-col items-center justify-center min-w-[56px] py-2 rounded-xl',
                  'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] touch-manipulation'
                )}
                aria-label="More"
              >
                <Menu size={24} strokeWidth={1.5} />
                <span className="text-label font-medium mt-0.5">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="!max-w-[280px] flex flex-col p-0">
              <SheetHeader className="border-b border-[var(--stage-edge-subtle)] px-4 py-4">
                <div className="flex items-center gap-3">
                  <LivingLogo size="sm" status={systemStatus} />
                  <SheetTitle className="text-[var(--stage-text-primary)] font-medium tracking-tight">
                    Unusonic
                  </SheetTitle>
                </div>
                <SheetClose />
              </SheetHeader>
              <SheetBody className="flex flex-col gap-1 p-3">
                {moreItems.map((item) => {
                  const isActive = isNavActive(item.id, item.href, pathname);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNav(item.id, item.href)}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-colors',
                        isActive
                          ? 'bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)]'
                          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]'
                      )}
                    >
                      {(() => {
                        const IconComp = isActive && item.iconFilled ? item.iconFilled : item.icon;
                        return <IconComp size={20} strokeWidth={1.5} />;
                      })()}
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}

                {/* Settings in more sheet */}
                <button
                  type="button"
                  onClick={() => handleNav('settings', '/settings')}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-colors',
                    pathname.startsWith('/settings')
                      ? 'bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)]'
                      : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]'
                  )}
                >
                  <Settings size={20} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Settings</span>
                </button>

                <div className="my-2 border-t border-[var(--stage-edge-subtle)]" />
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl stage-panel-nested">
                  <div className="avatar-primary w-9 h-9 bg-[var(--stage-accent)]/5 flex items-center justify-center shrink-0">
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.fullName || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-4 h-4 text-[var(--stage-text-secondary)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                      {user?.fullName || 'User'}
                    </p>
                    {workspaceName && (
                      <p className="text-xs text-[var(--stage-text-secondary)] truncate">
                        {workspaceName}
                      </p>
                    )}
                  </div>
                </div>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/5 transition-colors"
                  >
                    <LogOut size={20} strokeWidth={1.5} />
                    <span className="text-sm font-medium">Sign out</span>
                  </button>
                </form>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
