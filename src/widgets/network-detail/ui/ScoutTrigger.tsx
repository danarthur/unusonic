'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ScanSearch, Loader2, Sparkles } from 'lucide-react';
import { scoutEntity } from '@/features/intelligence';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
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
      transition={STAGE_MEDIUM}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-xl px-4 py-2.5 border transition-colors duration-[80ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        canScan
          ? 'border-[oklch(1_0_0/0.10)] bg-[oklch(1_0_0/0.06)] hover:bg-[oklch(1_0_0/0.08)] hover:border-[oklch(1_0_0/0.14)] text-[var(--stage-text-primary)] cursor-pointer'
          : 'border-[oklch(1_0_0_/_0.08)]/50 bg-[oklch(0.20_0_0/0.05)] text-[var(--stage-text-secondary)]/60 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg p-1.5',
          canScan ? 'bg-[oklch(1_0_0/0.10)]' : 'bg-[var(--stage-surface-raised)]',
        )}
      >
        {scanning ? (
          <Loader2 className={cn('size-4 animate-spin', canScan ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]')} />
        ) : (
          <ScanSearch className={cn('size-4', canScan ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]')} />
        )}
      </span>
      <div className="flex flex-col items-start min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-widest leading-none">
          {scanning ? 'Scanning' : 'Aion'}
        </span>
        <span className="text-[10px] text-[var(--stage-text-secondary)] mt-0.5 truncate max-w-[140px]">
          {scanning ? 'Acquiring intelligence…' : 'Auto-fill from website'}
        </span>
      </div>
      {canScan && (
        <Sparkles className="size-3.5 shrink-0 text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] transition-colors" />
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
