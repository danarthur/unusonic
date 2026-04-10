'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { resendInviteAction } from '@/features/team-invite/api/actions';

interface ClaimErrorProps {
  title?: string;
  message: string;
  /** Original token — enables the "Request new link" button. */
  token?: string;
}

export function ClaimError({
  title = 'Link invalid or expired',
  message,
  token,
}: ClaimErrorProps) {
  const [resendState, setResendState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResend() {
    if (!token) return;
    startTransition(async () => {
      const result = await resendInviteAction(token);
      if (result.ok) {
        setResendState('sent');
      } else {
        setResendState('error');
        setResendError(result.error);
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="w-full max-w-md rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-6 sm:p-8 text-center"
    >
      <div className="flex justify-center mb-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-unusonic-error)]/15 border border-[var(--color-unusonic-error)]/30">
          <AlertCircle className="size-7 text-[var(--color-unusonic-error)]" strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>
      <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--stage-text-secondary)]">
        {message}
      </p>

      {token && resendState === 'idle' && (
        <Button
          onClick={handleResend}
          disabled={isPending}
          variant="outline"
          className="mt-4 w-full"
          size="lg"
        >
          {isPending ? (
            <><Loader2 className="size-4 animate-spin mr-2" /> Sending...</>
          ) : (
            'Request new link'
          )}
        </Button>
      )}

      {resendState === 'sent' && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--stage-text-secondary)]">
          <Check className="size-4 text-green-500" />
          <span>New link sent to your email</span>
        </div>
      )}

      {resendState === 'error' && resendError && (
        <p className="mt-4 text-sm text-[var(--color-unusonic-error)]">
          {resendError}
        </p>
      )}

      <Button asChild className="mt-4 w-full" size="lg">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </motion.div>
  );
}
