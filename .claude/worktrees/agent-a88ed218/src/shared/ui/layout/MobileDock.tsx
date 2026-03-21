/**
 * Mobile Dock — Glassmorphism bottom bar for thumb-driven nav.
 * Shown on mobile only; desktop keeps Sidebar.
 * @module shared/ui/layout/MobileDock
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  MessageSquare,
  FolderKanban,
  BookMarked,
  Wallet,
  Menu,
  CalendarDays,
  Users,
  Settings,
  Sun,
  Moon,
  SunMoon,
  LogOut,
  User,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { useSystemHeart } from '@/shared/ui/providers/SystemHeartContext';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { cn } from '@/shared/lib/utils';
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

const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };

const dockItems = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid, href: '/lobby' },
  { id: 'brain', label: 'Brain', icon: MessageSquare, href: '/brain' },
  { id: 'production', label: 'Production', icon: FolderKanban, href: '/crm' },
  { id: 'catalog', label: 'Catalog', icon: BookMarked, href: '/catalog' },
  { id: 'finance', label: 'Finance', icon: Wallet, href: '/finance' },
];

const moreItems = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, href: '/calendar' },
  { id: 'network', label: 'Network', icon: Users, href: '/network' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
];

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
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleNav = (id: string, href: string) => {
    if (id === 'brain') setViewState('chat');
    else setViewState('overview');
    setSystemStatus('loading');
    router.push(href);
    setSheetOpen(false);
  };

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <>
      {/* Bottom bar — visible on mobile only via parent lg:hidden */}
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'liquid-panel !rounded-t-3xl !rounded-b-none border-t border-[var(--color-mercury)]',
          '!bg-[var(--sidebar-bg)] backdrop-blur-xl backdrop-saturate-150',
          'pb-[env(safe-area-inset-bottom)] pt-2 px-2',
          'liquid-levitation-bar'
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-around gap-1">
          {dockItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.id === 'overview' && pathname === '/lobby');
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => {
                  setViewState(item.id === 'brain' ? 'chat' : 'overview');
                  setSystemStatus('loading');
                }}
                className={cn(
                  'flex flex-col items-center justify-center min-w-[56px] py-2 rounded-xl transition-colors',
                  'active:scale-95 touch-manipulation',
                  isActive
                    ? 'liquid-panel active-glass !rounded-xl text-ink'
                    : 'text-ink-muted hover:text-ink'
                )}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon size={24} strokeWidth={1.5} className="shrink-0" />
                <span className="text-[10px] font-medium mt-0.5 truncate w-full text-center">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
                className={cn(
                  'flex flex-col items-center justify-center min-w-[56px] py-2 rounded-xl',
                  'text-ink-muted hover:text-ink active:scale-95 touch-manipulation'
                )}
                aria-label="More"
              >
                <Menu size={24} strokeWidth={1.5} />
                <span className="text-[10px] font-medium mt-0.5">More</span>
              </motion.button>
            </SheetTrigger>
            <SheetContent side="left" className="!max-w-[280px] flex flex-col p-0">
              <SheetHeader className="border-b border-[var(--color-mercury)] px-4 py-4">
                <div className="flex items-center gap-3">
                  <LivingLogo size="sm" status={systemStatus} />
                  <SheetTitle className="text-ceramic font-bold tracking-tight">
                    Signal
                  </SheetTitle>
                </div>
                <SheetClose />
              </SheetHeader>
              <SheetBody className="flex flex-col gap-1 p-3">
                {moreItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNav(item.id, item.href)}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-colors active:scale-[0.98]',
                        isActive
                          ? 'liquid-panel active-glass text-ink'
                          : 'text-ink-muted hover:text-ink hover:bg-ink/5'
                      )}
                    >
                      <item.icon size={20} strokeWidth={1.5} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
                <div className="my-2 border-t border-[var(--color-mercury)]" />
                <button
                  type="button"
                  onClick={cycleTheme}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left text-ink-muted hover:text-ink hover:bg-ink/5 transition-colors active:scale-[0.98]"
                >
                  {resolvedTheme === 'light' ? (
                    <Sun size={20} strokeWidth={1.5} />
                  ) : resolvedTheme === 'dark' ? (
                    <Moon size={20} strokeWidth={1.5} />
                  ) : (
                    <SunMoon size={20} strokeWidth={1.5} />
                  )}
                  <span className="text-sm font-medium">
                    {theme === 'system' ? 'System' : resolvedTheme === 'light' ? 'Light' : 'Dark'}
                  </span>
                </button>
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-ink/5 border border-[var(--glass-border)]">
                  <div className="avatar-primary w-9 h-9 bg-ink/10 flex items-center justify-center shrink-0">
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.fullName || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-4 h-4 text-ink-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {user?.fullName || 'User'}
                    </p>
                    {workspaceName && (
                      <p className="text-xs text-ink-muted truncate">
                        {workspaceName}
                      </p>
                    )}
                  </div>
                </div>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left text-ink-muted hover:text-red-500 hover:bg-red-500/5 transition-colors active:scale-[0.98]"
                  >
                    <LogOut size={20} strokeWidth={1.5} />
                    <span className="text-sm font-medium">Sign Out</span>
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
