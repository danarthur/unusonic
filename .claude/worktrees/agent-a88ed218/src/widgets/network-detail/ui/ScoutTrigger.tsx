'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ScanSearch, Loader2, Sparkles } from 'lucide-react';
import { scoutEntity } from '@/features/intelligence';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { ScoutFindingsDialog } from './ScoutFindingsDialog';

interface ScoutTriggerProps {
  getUrl: () => string;
  onEnrich: (data: ScoutResult) => void;
  disabled?: boolean;
}

export function ScoutTrigger({ getUrl, onEnrich, disabled }: ScoutTriggerProps) {
  const [scanning, setScanning] = React.useState(false);
  const [findingsOpen, setFindingsOpen] = React.useState(false);
  const [findings, setFindings] = React.useState<ScoutResult | null>(null);

  const handleScan = async () => {
    const trimmed = getUrl()?.trim();
    if (!trimmed) {
      toast.error('Enter a website to scan.');
      return;
    }

    setScanning(true);
    toast('Acquiring signal…', {
      icon: <Loader2 className="size-3.5 animate-spin" />,
    });

    const result = await scoutEntity(trimmed);

    if ('error' in result) {
      toast.error(result.error);
    } else {
      toast.success('Intelligence acquired');
      setFindings(result.data);
      setFindingsOpen(true);
    }
    setScanning(false);
  };

  const handleConfirmFindings = React.useCallback(
    (data: ScoutResult) => {
      onEnrich(data);
    },
    [onEnrich]
  );

  const canScan = !disabled && !scanning && !!getUrl()?.trim();

  return (
    <>
    <div className="flex flex-col gap-2">
    <motion.button
      type="button"
      onClick={handleScan}
      disabled={!canScan}
      whileHover={canScan ? { scale: 1.02 } : undefined}
      whileTap={canScan ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`
        group relative flex items-center gap-2.5 rounded-xl px-4 py-2.5
        border transition-all duration-200
        ${canScan
          ? 'border-[var(--color-silk)]/50 bg-[var(--color-silk)]/5 hover:bg-[var(--color-silk)]/10 hover:border-[var(--color-silk)]/60 text-[var(--color-silk)] cursor-pointer'
          : 'border-[var(--color-mercury)]/50 bg-white/[0.02] text-[var(--color-ink-muted)]/60 cursor-not-allowed'
        }
      `}
    >
      <span
        className={`
          flex shrink-0 items-center justify-center rounded-lg p-1.5
          ${canScan ? 'bg-[var(--color-silk)]/15' : 'bg-white/5'}
        `}
      >
        {scanning ? (
          <Loader2 className={`size-4 animate-spin ${canScan ? 'text-[var(--color-silk)]' : 'text-[var(--color-ink-muted)]'}`} />
        ) : (
          <ScanSearch className={`size-4 ${canScan ? 'text-[var(--color-silk)]' : 'text-[var(--color-ink-muted)]'}`} />
        )}
      </span>
      <div className="flex flex-col items-start min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest leading-none">
          {scanning ? 'Scanning' : 'ION'}
        </span>
        <span className="text-[10px] text-[var(--color-ink-muted)] mt-0.5 truncate max-w-[140px]">
          {scanning ? 'Acquiring intelligence…' : 'Auto-fill from website'}
        </span>
      </div>
      {canScan && (
        <Sparkles className="size-3.5 shrink-0 text-[var(--color-silk)]/60 group-hover:text-[var(--color-silk)]/90 transition-colors" />
      )}
    </motion.button>
    </div>
    <ScoutFindingsDialog
      open={findingsOpen}
      onOpenChange={setFindingsOpen}
      findings={findings}
      onConfirm={handleConfirmFindings}
      onDiscard={() => setFindings(null)}
    />
    </>
  );
}
