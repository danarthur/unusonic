/**
 * QuickBooks Connect Button
 * Stage Engineering styled button for initiating QuickBooks OAuth
 * Workspace-scoped
 * @module features/finance-sync/ui/connect-button
 */

'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Link2Off, Loader2, CheckCircle2, Building2 } from 'lucide-react';
import { initiateQuickBooksOAuth, disconnectQuickBooks } from '../api/actions';

interface QuickBooksConnectButtonProps {
  workspaceId: string;
  isConnected?: boolean;
  companyName?: string | null;
  onConnectionChange?: (connected: boolean) => void;
}

export function QuickBooksConnectButton({
  workspaceId,
  isConnected = false,
  companyName,
  onConnectionChange,
}: QuickBooksConnectButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const handleConnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await initiateQuickBooksOAuth(workspaceId);
      
      if (!result.success) {
        setError(result.error || 'Failed to initiate connection');
        return;
      }
      
      if (result.authUrl) {
        // Redirect to QuickBooks authorization
        window.location.href = result.authUrl;
      }
    });
  };
  
  const handleDisconnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await disconnectQuickBooks(workspaceId);
      
      if (!result.success) {
        setError(result.error || 'Failed to disconnect');
        return;
      }
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      onConnectionChange?.(false);
    });
  };
  
  // Spring physics for smooth animations
  const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;
  
  if (isConnected) {
    return (
      <div className="flex flex-col gap-3">
        {/* Connected State Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          className="stage-panel p-4 flex items-center gap-4"
        >
          {/* Company Icon */}
          <div className="w-10 h-10 rounded-xl bg-[oklch(0.45_0.05_145_/_0.15)] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-[var(--color-unusonic-success)]" />
          </div>
          
          {/* Company Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
              {companyName || 'QuickBooks Company'}
            </p>
            <p className="text-xs text-[var(--stage-text-secondary)] flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-unusonic-success)]" />
              Connected
            </p>
          </div>
          
          {/* Disconnect Button */}
          <motion.button
            onClick={handleDisconnect}
            disabled={isPending}
            transition={springConfig}
            className="px-4 py-2 rounded-xl text-sm font-medium
              text-[var(--color-unusonic-error)]
              bg-[oklch(0.35_0.05_20_/_0.15)] hover:bg-[oklch(0.35_0.08_20_/_0.25)]
              border border-[oklch(0.65_0.18_20_/_0.2)] hover:border-[oklch(0.65_0.18_20_/_0.3)]
              transition-[color,background-color,border-color,filter] duration-200 hover:brightness-[1.03]
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2Off className="w-4 h-4" />
            )}
            Disconnect
          </motion.button>
        </motion.div>
        
        {/* Success Toast */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={springConfig}
              className="flex items-center gap-2 text-sm text-[var(--color-unusonic-success)]"
            >
              <CheckCircle2 className="w-4 h-4" />
              Successfully disconnected
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-[var(--color-unusonic-error)]"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex flex-col gap-3">
      {/* Connect Button */}
      <motion.button
        onClick={handleConnect}
        disabled={isPending}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
        className="group relative overflow-hidden
          stage-panel p-5
          hover:border-[oklch(1_0_0_/_0.12)]
          hover:shadow-[0_16px_36px_-12px_oklch(0_0_0_/_0.25)]
          hover:brightness-[1.02]
          transition-[border-color,box-shadow,filter]
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer"
      >
        {/* Walnut hover gradient overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 bg-gradient-to-br from-walnut/5 to-transparent pointer-events-none"
        />
        
        {/* Subtle noise texture */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
        
        {/* Content */}
        <div className="relative z-10 flex items-center gap-4">
          {/* Icon Container */}
          <div className="w-12 h-12 rounded-2xl
            bg-gradient-to-br from-[var(--color-qb-green)]/10 to-[var(--color-qb-green)]/5
            group-hover:from-[var(--color-qb-green)]/20 group-hover:to-[var(--color-qb-green)]/10
            border border-[var(--color-qb-green)]/20
            flex items-center justify-center
            transition-all duration-300 shrink-0">
            {isPending ? (
              <Loader2 className="w-6 h-6 text-[var(--color-qb-green)] animate-spin" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-[var(--color-qb-green)]"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2V7h2v10z" />
              </svg>
            )}
          </div>
          
          {/* Text */}
          <div className="flex-1 text-left">
            <p className="text-base font-medium text-[var(--stage-text-primary)] group-hover:text-walnut transition-colors">
              Connect QuickBooks
            </p>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">
              Sync invoices & payments automatically
            </p>
          </div>
          
          {/* Arrow */}
          <motion.div
            initial={{ x: 0 }}
            whileHover={{ x: 4 }}
            transition={springConfig}
            className="shrink-0"
          >
            <Link2 className="w-5 h-5 text-[var(--stage-text-secondary)] group-hover:text-walnut transition-colors" />
          </motion.div>
        </div>
      </motion.button>
      
      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springConfig}
            className="text-sm text-[var(--color-unusonic-error)] px-1"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
