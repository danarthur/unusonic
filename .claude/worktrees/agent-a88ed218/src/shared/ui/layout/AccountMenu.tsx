/**
 * Account Menu Component
 * Dropdown menu for user account actions
 * @module components/layout/AccountMenu
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOutAction } from '@/shared/api/auth/sign-out';

interface AccountMenuProps {
  user: {
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
}

export function AccountMenu({ user }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;
  
  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);
  
  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';
  
  return (
    <div ref={menuRef} className="relative">
      {/* Trigger Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
        className="flex items-center gap-2 px-2 py-1.5 rounded-full
          bg-canvas/50 hover:bg-canvas/80 backdrop-blur-sm 
          border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)]
          transition-all duration-200"
      >
        {/* Avatar */}
        <div className="avatar-primary w-8 h-8 bg-ink/10 flex items-center justify-center shrink-0">
          {user?.avatarUrl ? (
            <img 
              src={user.avatarUrl} 
              alt={user.fullName || 'User'} 
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs font-medium text-ink">{initials}</span>
          )}
        </div>
        
        <ChevronDown 
          className={`w-4 h-4 text-ink-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </motion.button>
      
      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={springConfig}
            className="absolute right-0 mt-2 w-64 liquid-panel p-2 z-50"
          >
            {/* User Info */}
            <div className="px-3 py-3 border-b border-[var(--glass-border)]">
              <div className="flex items-center gap-3">
                <div className="avatar-primary w-10 h-10 bg-ink/10 flex items-center justify-center shrink-0">
                  {user?.avatarUrl ? (
                    <img 
                      src={user.avatarUrl} 
                      alt={user.fullName || 'User'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-ink-muted" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {user?.fullName || 'User'}
                  </p>
                  <p className="text-xs text-ink-muted truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Menu Items */}
            <div className="py-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/settings');
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                  text-ink-muted hover:text-ink hover:bg-ink/5
                  transition-colors text-left"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Settings</span>
              </button>
              
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                    text-ink-muted hover:text-red-600 hover:bg-red-500/5
                    transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sign Out</span>
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
