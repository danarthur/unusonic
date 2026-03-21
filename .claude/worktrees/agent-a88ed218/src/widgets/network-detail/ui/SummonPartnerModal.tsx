'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { createPartnerSummon } from '@/features/summoning';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

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
      setMessage(!result.ok ? result.error : 'Something went wrong.');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setEmail('');
    setStatus('idle');
    setMessage('');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={false}
        >
          <motion.div
            role="presentation"
            className="absolute inset-0 bg-[var(--color-obsidian)]/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
            onClick={handleClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="summon-modal-title"
            initial={{ opacity: 0, scale: 0.98, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={spring}
            className="relative z-10 w-full max-w-md rounded-3xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] p-6 shadow-2xl backdrop-blur-xl"
          >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id="summon-modal-title" className="text-lg font-medium tracking-tight text-[var(--color-ink)]">
            Invite to Signal
          </h2>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)] mb-4">
          Send an invite to claim this organization. Enter their email.
        </p>
        {status === 'success' ? (
          <div className="py-4">
            <p className="text-sm text-[var(--color-signal-success)]">{message}</p>
            <Button type="button" onClick={handleClose} className="mt-4 w-full">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="booking@example.com"
                required
                className="bg-white/5 border-[var(--color-mercury)]"
              />
            </div>
            {status === 'error' && message && (
              <p className="text-sm text-[var(--color-signal-error)]">{message}</p>
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
      )}
    </AnimatePresence>
  );
}
