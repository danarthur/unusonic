'use client';

import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, Calendar, MessageSquare, Wallet, BookMarked, Settings, Sun, Moon, SunMoon } from 'lucide-react';
import { useTheme } from "next-themes";
import { useEffect, useState } from 'react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { cn } from '@/shared/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setViewState } = useSession();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleNavigation = (id: string, href: string) => {
    if (id === 'brain') {
      setViewState('chat');
      router.push('/brain');
    } else {
      setViewState('overview');
      router.push(href);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid, href: '/lobby' },
    { id: 'brain', label: 'Brain', icon: MessageSquare, href: '/lobby' },
    { id: 'production', label: 'Production', icon: Calendar, href: '/crm' },
    { id: 'catalog', label: 'Catalog', icon: BookMarked, href: '/catalog' },
    { id: 'finance', label: 'Finance', icon: Wallet, href: '/finance' },
  ];

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <motion.aside
      initial={false}
      className="sidebar-panel h-full w-[88px] relative z-50 flex flex-col !p-0 rounded-r-2xl"
    >
      <div className="py-6">
        <div className="mb-10 h-12 w-full flex items-center justify-center shrink-0">
        <div
          onClick={() => handleNavigation('overview', '/')}
          className="w-10 h-10 rounded-xl bg-ink hover:scale-105 cursor-pointer transition-transform liquid-levitation flex items-center justify-center"
        >
          <div className="w-3 h-3 rounded-full bg-[var(--background)]" />
          </div>
      </div>

        <nav className="flex-1 flex flex-col gap-2 px-3 w-full">
        {navItems.map((item) => {
          const isActive = item.id === 'brain'
            ? pathname === '/brain'
            : pathname === item.href;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.id, item.href)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "group relative flex items-center h-12 rounded-xl transition-all duration-200 overflow-hidden",
                isActive
                  ? "liquid-panel active-glass !rounded-xl text-ink"
                  : "text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)]"
              )}
              aria-label={item.label}
            >
              <div className="w-[62px] flex items-center justify-center shrink-0">
                <item.icon
                  size={22}
                  strokeWidth={1.5}
                className={cn(
                    "transition-colors",
                    isActive ? "text-ink" : "text-ink-muted group-hover:text-ink"
                  )}
                />
                  </div>

              <AnimatePresence>
                {hoveredId === item.id && (
                  <motion.div
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="absolute left-full ml-3 px-3 py-1.5 bg-ink/90 text-[var(--background)] text-xs font-medium rounded-full pointer-events-none whitespace-nowrap liquid-levitation-strong z-[60]"
                  >
                    {item.label}
                  </motion.div>
                )}
              </AnimatePresence>
              </button>
          );
        })}
        </nav>

        <div className="mt-auto px-3 shrink-0 flex flex-col gap-2">
        <button
          onClick={cycleTheme}
          className="w-full h-12 flex items-center justify-center rounded-xl text-ink-muted hover:text-ink hover:bg-ink/5 transition-colors"
        >
          <div className="relative w-5 h-5">
            {!isMounted ? (
              <SunMoon className="absolute inset-0" />
            ) : theme === 'system' ? (
              <SunMoon className="absolute inset-0" />
            ) : resolvedTheme === 'light' ? (
              <Sun className="absolute inset-0" />
            ) : (
              <Moon className="absolute inset-0" />
            )}
          </div>
        </button>

        <button 
          onClick={() => router.push('/settings')}
          className={cn(
            "w-full h-12 flex items-center justify-center rounded-xl transition-colors",
            pathname === '/settings' 
              ? "liquid-panel active-glass !rounded-xl text-ink" 
              : "text-ink-muted hover:text-ink hover:bg-ink/5"
          )}
        >
          <Settings size={22} strokeWidth={1.5} />
        </button>
        </div>
      </div>
    </motion.aside>
  );
}

