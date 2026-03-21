'use client';

/**
 * QBO Connect card – Liquid Ceramic style.
 * Idle / Loading / Connected states; Connect QuickBooks and Disconnect.
 */

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Link2Off, Loader2, CheckCircle2, Building2 } from 'lucide-react';
import { initiateConnection, disconnectQbo } from '../api/actions';

const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface QboConnectCardProps {
  workspaceId: string;
  isConnected: boolean;
  realmId?: string | null;
  onConnectionChange?: (connected: boolean) => void;
}

export function QboConnectCard({
  workspaceId,
  isConnected,
  realmId,
  onConnectionChange,
}: QboConnectCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleConnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await initiateConnection(workspaceId);
      if (!result.success) {
        setError(result.error ?? 'Failed to initiate connection');
        return;
      }
      if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    });
  };

  const handleDisconnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await disconnectQbo(workspaceId);
      if (!result.success) {
        setError(result.error ?? 'Failed to disconnect');
        return;
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      onConnectionChange?.(false);
    });
  };

  if (isConnected) {
    return (
      <div className="flex flex-col gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          className="liquid-panel p-4 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">
              QuickBooks
            </p>
            <p className="text-xs text-ink-muted flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
              {realmId && (
                <span className="font-mono text-[10px] opacity-80 ml-1 truncate" title={realmId}>
                  {realmId}
                </span>
              )}
            </p>
          </div>
          <motion.button
            onClick={handleDisconnect}
            disabled={isPending}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            className="px-4 py-2 rounded-xl text-sm font-medium
              text-red-600 dark:text-red-400
              bg-red-500/5 hover:bg-red-500/10
              border border-red-500/20 hover:border-red-500/30
              transition-colors duration-200
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
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={springConfig}
              className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="w-4 h-4" />
              Successfully disconnected
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-red-500"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <motion.button
        onClick={handleConnect}
        disabled={isPending}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{
          scale: 1.01,
          boxShadow: '0 16px 36px -12px rgba(74, 69, 62, 0.28)',
        }}
        whileTap={{ scale: 0.99 }}
        transition={springConfig}
        className="group relative overflow-hidden
          liquid-panel p-5
          hover:border-[var(--glass-border-hover)]
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer"
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 bg-gradient-to-br from-walnut/5 to-transparent pointer-events-none"
        />
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl
            bg-ink/5 group-hover:bg-ink/10
            border border-[var(--glass-border)]
            flex items-center justify-center
            transition-all duration-300 shrink-0">
            {isPending ? (
              <Loader2 className="w-6 h-6 text-ink-muted animate-spin" />
            ) : (
              <Link2 className="w-6 h-6 text-ink-muted" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-base font-medium text-ink group-hover:text-walnut transition-colors">
              Connect QuickBooks
            </p>
            <p className="text-sm text-ink-muted mt-0.5">
              Sync invoices & payments automatically
            </p>
          </div>
        </div>
      </motion.button>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springConfig}
            className="text-sm text-red-500 px-1"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
