'use client';

/**
 * Claim error surface — rendered when the invite token is invalid, used,
 * or expired. Uses the `stage-stripe-error` pattern per the login audit
 * (no filled error tint, no raw oklch literals, stage-btn primitives only).
 */

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Loader2, ArrowRight } from 'lucide-react';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={STAGE_HEAVY}
      className="stage-panel w-full max-w-md p-[var(--stage-padding)]"
      data-surface="surface"
    >
      <div className="stage-panel-nested stage-stripe-error px-4 py-4">
        <div className="flex items-start gap-3">
          <AlertCircle
            className="size-5 shrink-0 text-[var(--color-unusonic-error)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium text-[var(--stage-text-primary)]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-[var(--stage-text-secondary)]">
              {message}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {token && resendState === 'idle' && (
          <button
            type="button"
            onClick={handleResend}
            disabled={isPending}
            className="stage-btn stage-btn-primary w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                Sending…
              </>
            ) : (
              <>
                Request a new link
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        )}

        {resendState === 'sent' && (
          <div className="stage-panel-nested stage-stripe-info px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-[var(--stage-text-primary)]">
              <Check
                className="size-4 text-[var(--color-unusonic-success)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>A new link is on its way to your inbox.</span>
            </div>
          </div>
        )}

        {resendState === 'error' && resendError && (
          <div className="stage-panel-nested stage-stripe-error px-4 py-3">
            <p role="alert" className="text-sm text-[var(--stage-text-primary)]">
              {resendError}
            </p>
          </div>
        )}

        <Link href="/login" className="stage-btn stage-btn-ghost w-full">
          Go to sign in
        </Link>
      </div>
    </motion.div>
  );
}
