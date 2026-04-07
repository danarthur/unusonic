'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { scoutEntity } from '@/features/intelligence';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { ScoutFindingsDialog } from './ScoutFindingsDialog';

interface AionScoutInputProps {
  value: string;
  onChange: (val: string) => void;
  onEnrich: (data: ScoutResult) => void;
}

type SensorStatus = 'idle' | 'ready' | 'scanning' | 'success';

export function AionScoutInput({ value, onChange, onEnrich }: AionScoutInputProps) {
  const [status, setStatus] = React.useState<SensorStatus>('idle');
  const [isHovered, setIsHovered] = React.useState(false);
  const [findingsOpen, setFindingsOpen] = React.useState(false);
  const [findings, setFindings] = React.useState<ScoutResult | null>(null);

  React.useEffect(() => {
    const hasSignal = value.includes('.') && value.length > 5;
    if (hasSignal && status === 'idle') setStatus('ready');
    if (!hasSignal && status !== 'scanning' && status !== 'success') setStatus('idle');
  }, [value, status]);

  const handleScan = async () => {
    if (status !== 'ready' && status !== 'success') return;
    setStatus('scanning');
    const toastId = toast.loading('Scanning...');

    const result = await scoutEntity(value.trim());

    if ('error' in result) {
      toast.error(result.error, { id: toastId });
      setStatus('ready');
    } else {
      toast.success('Scan complete', { id: toastId });
      setStatus('success');
      setFindings(result.data);
      setFindingsOpen(true);
      setTimeout(() => setStatus('ready'), 2500);
    }
  };

  const handleConfirmFindings = React.useCallback(
    (data: ScoutResult) => {
      onEnrich(data);
    },
    [onEnrich]
  );

  const handleDiscardFindings = React.useCallback(() => {
    setFindings(null);
  }, []);

  const canActivate = status === 'ready' || status === 'success';
  const isScanning = status === 'scanning';

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
        Website
      </label>
      <motion.div
        onMouseEnter={() => canActivate && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          group relative flex h-16 w-full items-stretch
          rounded-xl overflow-hidden
          transition-colors duration-[80ms]
          ${canActivate
            ? 'border border-[var(--stage-accent)]/50 bg-[oklch(1_0_0_/_0.10)]/50 focus-within:border-[var(--stage-accent)]/70'
            : 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-text-primary)]/[0.02]'
          }
        `}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. neonvelvet.net"
          className="stage-input relative z-10 min-w-0 flex-[2] h-full border-0 bg-transparent px-5 font-mono text-sm"
        />
        <motion.button
          type="button"
          onClick={handleScan}
          disabled={!canActivate || isScanning}
          className={`
            relative z-10 flex min-w-[140px] sm:min-w-[160px] flex-1 items-center justify-center gap-3 pl-8 pr-5
            transition-colors duration-[80ms]
            ${canActivate && !isScanning
              ? 'cursor-pointer text-[var(--stage-accent)] hover:bg-[oklch(1_0_0/0.08)] active:bg-[oklch(1_0_0/0.04)]'
              : 'cursor-default text-[var(--stage-text-secondary)] opacity-[0.45] pointer-events-none'
            }
          `}
          style={
            canActivate
              ? {
                  background: 'linear-gradient(to right, transparent 0%, color-mix(in oklch, var(--stage-text-primary) 1.5%, transparent) 40%, color-mix(in oklch, var(--stage-text-primary) 4%, transparent) 100%)',
                }
              : undefined
          }
          transition={STAGE_LIGHT}
        >
          <motion.div
            className={`flex items-center justify-center pointer-events-none ${status === 'idle' ? 'opacity-30 grayscale' : 'opacity-100'}`}
            animate={
              canActivate && isHovered && !isScanning && status !== 'success'
                ? { opacity: [0.88, 1, 0.88] }
                : { opacity: 1 }
            }
            transition={
              canActivate && isHovered && !isScanning && status !== 'success'
                ? { opacity: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } }
                : STAGE_LIGHT
            }
          >
            <LivingLogo
              size="sm"
              status={isScanning ? 'loading' : status === 'success' ? 'success' : 'idle'}
            />
          </motion.div>
          <span
            className={`
              text-xs font-medium uppercase tracking-widest
              ${isScanning ? 'text-[var(--stage-accent)]' : canActivate ? 'text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-accent)]/90' : 'text-[var(--stage-text-tertiary)]'}
            `}
          >
            {isScanning ? 'Scanning' : status === 'success' ? 'Acquired' : 'Aion'}
          </span>
        </motion.button>
        {isScanning && (
          <motion.div
            className="motion-reduce:hidden absolute inset-0 z-0 bg-gradient-to-r from-transparent via-[var(--stage-accent)]/12 to-transparent pointer-events-none"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </motion.div>

      <ScoutFindingsDialog
        open={findingsOpen}
        onOpenChange={setFindingsOpen}
        findings={findings}
        onConfirm={handleConfirmFindings}
        onDiscard={handleDiscardFindings}
      />
    </div>
  );
}
