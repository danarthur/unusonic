'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { scoutEntity } from '@/features/intelligence';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { ScoutFindingsDialog } from './ScoutFindingsDialog';

interface SignalScoutInputProps {
  value: string;
  onChange: (val: string) => void;
  onEnrich: (data: ScoutResult) => void;
}

type SensorStatus = 'idle' | 'ready' | 'scanning' | 'success';

export function SignalScoutInput({ value, onChange, onEnrich }: SignalScoutInputProps) {
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
    const toastId = toast.loading('Acquiring signal…');

    const result = await scoutEntity(value.trim());

    if ('error' in result) {
      toast.error(result.error, { id: toastId });
      setStatus('ready');
    } else {
      toast.success('Intelligence acquired', { id: toastId });
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
      <label className="text-[10px] font-medium text-[var(--color-ink-muted)] uppercase tracking-widest">
        Website
      </label>
      <motion.div
        onMouseEnter={() => canActivate && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          group relative flex h-16 w-full items-stretch
          rounded-xl overflow-hidden
          transition-all duration-300
          ${canActivate
            ? 'border border-[var(--color-silk)]/50 bg-white/5 focus-within:border-[var(--color-silk)]/70'
            : 'border border-[var(--color-mercury)] bg-white/[0.02]'
          }
          ${canActivate && isHovered ? 'shadow-[0_0_24px_-6px_oklch(0.70_0.15_250_/_0.25)]' : ''}
        `}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. neonvelvet.net"
          className="relative z-10 min-w-0 flex-[2] h-full bg-transparent px-5 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60 outline-none font-mono text-sm"
        />
        <motion.button
          type="button"
          onClick={handleScan}
          disabled={!canActivate || isScanning}
          className={`
            relative z-10 flex min-w-[140px] sm:min-w-[160px] flex-1 items-center justify-center gap-3 pl-8 pr-5
            transition-colors duration-300
            ${canActivate && !isScanning
              ? 'cursor-pointer text-[var(--color-silk)]'
              : 'cursor-default text-[var(--color-ink-muted)]/40 pointer-events-none'
            }
          `}
          style={
            canActivate
              ? {
                  background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.015) 40%, rgba(255,255,255,0.04) 100%)',
                }
              : undefined
          }
          whileHover={canActivate && !isScanning ? { background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.08) 100%)' } : undefined}
          whileTap={canActivate && !isScanning ? { backgroundColor: 'rgba(255,255,255,0.08)' } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <motion.div
            className={`flex items-center justify-center pointer-events-none ${status === 'idle' ? 'opacity-30 grayscale' : 'opacity-100'}`}
            animate={
              canActivate && isHovered && !isScanning && status !== 'success'
                ? { scale: [1.08, 1.14, 1.08] }
                : { scale: 1 }
            }
            transition={
              canActivate && isHovered && !isScanning && status !== 'success'
                ? { scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } }
                : { type: 'spring', stiffness: 400, damping: 25 }
            }
          >
            <LivingLogo
              size="sm"
              status={isScanning ? 'loading' : status === 'success' ? 'success' : 'idle'}
            />
          </motion.div>
          <span
            className={`
              text-[11px] font-semibold uppercase tracking-widest
              ${isScanning ? 'text-[var(--color-silk)]' : canActivate ? 'text-[var(--color-ink-muted)] group-hover:text-[var(--color-silk)]/90' : 'text-[var(--color-ink-muted)]/50'}
            `}
          >
            {isScanning ? 'Scanning' : status === 'success' ? 'Acquired' : 'ION'}
          </span>
        </motion.button>
        {isScanning && (
          <motion.div
            className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-[var(--color-silk)]/12 to-transparent pointer-events-none"
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
