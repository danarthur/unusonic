'use client';

import React, { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { signProposal } from '../../api/proposal-actions';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface SignProposalDialogProps {
  open: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
  className?: string;
}

export function SignProposalDialog({
  open,
  onClose,
  token,
  onSuccess,
  className,
}: SignProposalDialogProps) {
  const [signatureName, setSignatureName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await signProposal(token, signatureName);
        if (result.success) {
          onSuccess();
          onClose();
          setSignatureName('');
          setError(null);
          try {
            const confetti = (await import('canvas-confetti')).default;
            confetti({
              particleCount: 80,
              spread: 55,
              origin: { y: 0.6 },
              colors: ['#D4C5B0', '#E5E2DC', '#4A453E', '#FDFCF8'],
              ticks: 120,
              gravity: 0.8,
              scalar: 1.1,
            });
          } catch {
            // confetti optional
          }
        } else {
          setError(result.error ?? 'Something went wrong.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      }
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal
          aria-labelledby="sign-dialog-title"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            aria-label="Close"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={spring}
            className={cn(
              'relative z-10 w-full max-w-md rounded-3xl p-6 sm:p-8',
              'bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)]',
              'liquid-levitation-strong',
              className
            )}
          >
            <div className="absolute right-4 top-4">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <h2
              id="sign-dialog-title"
              className="font-serif text-xl font-light text-ink tracking-tight pr-10"
            >
              Review & Sign
            </h2>
            <p className="text-sm text-ink-muted mt-1.5">
              Type your full legal name below to accept this proposal.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label htmlFor="signature-name" className="sr-only">
                Full name
              </label>
              <input
                id="signature-name"
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Your full name"
                disabled={isPending}
                className={cn(
                  'w-full rounded-2xl h-11 px-4 text-base text-ink placeholder:text-ink-muted',
                  'bg-[var(--muted)]/50 border border-[var(--glass-border)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--ring)]',
                  'disabled:opacity-60 transition-colors'
                )}
                autoFocus
                required
              />
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className={cn(
                    'flex-1 rounded-2xl h-10 font-medium text-ink',
                    'border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-colors',
                    'disabled:opacity-50'
                  )}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !signatureName.trim()}
                  className={cn(
                    'flex-1 rounded-2xl h-10 font-medium text-canvas bg-ink',
                    'hover:bg-walnut shadow-[var(--glass-shadow)] transition-all',
                    'disabled:opacity-50 disabled:pointer-events-none'
                  )}
                >
                  {isPending ? (
                    <Loader2 className="size-5 animate-spin mx-auto" aria-hidden />
                  ) : (
                    'Sign'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
