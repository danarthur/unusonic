'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

type DocuSealSignPanelProps = {
  embedSrc: string;
  onComplete?: () => void;
};

export function DocuSealSignPanel({ embedSrc, onComplete }: DocuSealSignPanelProps) {
  const router = useRouter();
  const [clicked, setClicked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!clicked) return;

    let attempts = 0;
    const MAX = 30;

    intervalRef.current = setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= MAX) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 6000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clicked, router]);

  useEffect(() => {
    if (!refreshing) return;
    queueMicrotask(() => {
      setRefreshing(false);
      onComplete?.();
    });
  }, [refreshing, onComplete]);

  function handleManualRefresh() {
    setRefreshing(true);
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="w-full rounded-[var(--portal-radius)] px-6 py-8 flex flex-col items-center gap-5 text-center"
      style={{
        backgroundColor: 'var(--portal-surface)',
        border: 'var(--portal-border-width) solid var(--portal-border)',
      }}
    >
      <div className="flex flex-col gap-1.5">
        <p
          className="text-xl"
          style={{
            color: 'var(--portal-text)',
            fontFamily: 'var(--portal-font-heading)',
            fontWeight: 'var(--portal-heading-weight)',
            letterSpacing: 'var(--portal-heading-tracking)',
          }}
        >
          Ready to sign?
        </p>
        <p
          className="text-sm leading-relaxed max-w-xs mx-auto"
          style={{ color: 'var(--portal-text-secondary)' }}
        >
          Your proposal opens in a new tab. Come back here once you&apos;ve signed — we&apos;ll update automatically.
        </p>
      </div>

      <a
        href={embedSrc}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setClicked(true)}
        className="inline-flex items-center gap-2 h-11 px-6 font-medium text-sm tracking-tight hover:bg-[oklch(1_0_0_/_0.08)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)]"
        style={{
          backgroundColor: 'var(--portal-accent)',
          color: 'var(--portal-accent-text)',
          borderRadius: 'var(--portal-btn-radius)',
        }}
      >
        Sign proposal
        <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
      </a>

      {clicked && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className="flex flex-col items-center gap-2"
        >
          <p className="text-xs" style={{ color: 'var(--portal-text-secondary)' }}>
            Waiting for signature confirmation&hellip;
          </p>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs transition-colors disabled:opacity-45"
            style={{ color: 'var(--portal-text-secondary)' }}
          >
            <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} strokeWidth={1.5} />
            Refresh now
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
