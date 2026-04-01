'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { createPartnerSummon } from '@/features/summoning';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

interface SummonPartnerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerName: string;
  originOrgId: string;
  ghostOrgId: string;
  onSuccess?: () => void;
}

export function SummonPartnerModal({
  open,
  onOpenChange,
  partnerName,
  originOrgId,
  ghostOrgId,
  onSuccess,
}: SummonPartnerModalProps) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    const result = await createPartnerSummon(originOrgId, ghostOrgId, email.trim(), {
      redirectTo: '/network',
    });
    if (result.ok && result.cured) {
      setStatus('success');
      setMessage(result.message);
      onSuccess?.();
      router.refresh();
    } else if (result.ok && result.token) {
      setStatus('success');
      setMessage('Invitation sent.');
      onSuccess?.();
      onOpenChange(false);
      router.refresh();
    } else {
      setStatus('error');
      setMessage(!result.ok ? result.error : 'Unable to send invitation.');
    }
  };

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
    setEmail('');
    setStatus('idle');
    setMessage('');
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={false}
        >
          <motion.div
            role="presentation"
            className="absolute inset-0 bg-[oklch(0.12_0_0/0.6)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={handleClose}
            aria-hidden
          />
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="summon-modal-title"
            initial={{ scale: 0.98, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: -10 }}
            transition={STAGE_HEAVY}
            className="relative z-10 w-full max-w-md rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-6 shadow-2xl"
            data-surface="raised"
          >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id="summon-modal-title" className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
            Invite to Unusonic
          </h2>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] mb-4">
          Send an invite to claim this organization. Enter their email.
        </p>
        {status === 'success' ? (
          <div className="py-4">
            <p className="text-sm text-[var(--color-unusonic-success)]">{message}</p>
            <Button type="button" onClick={handleClose} className="mt-4 w-full">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block stage-label">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="booking@example.com"
                required
                className="stage-input"
              />
            </div>
            {status === 'error' && message && (
              <p className="text-sm text-[var(--color-unusonic-error)]">{message}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={status === 'loading' || !email.trim()}>
                {status === 'loading' ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        )}
          </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
