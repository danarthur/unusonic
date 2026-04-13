'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Calendar, MapPin, Clock, User } from 'lucide-react';
import { consumeCrewToken } from '../api/confirm-crew-token';
import type { TokenDetails } from '../api/confirm-crew-token';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

type ConfirmPageClientProps = {
  details: TokenDetails;
  initialAction?: 'confirmed' | 'declined' | null;
};

export function ConfirmPageClient({ details, initialAction }: ConfirmPageClientProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    details.alreadyUsed ? 'done' : 'idle'
  );
  const [action, setAction] = useState<'confirmed' | 'declined' | null>(
    details.alreadyUsed ? details.actionTaken : initialAction ?? null
  );
  const [error, setError] = useState<string | null>(null);

  // If a ?action= param was passed (user clicked CTA in email), auto-submit on first render
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  if (initialAction && status === 'idle' && !autoSubmitted) {
    setAutoSubmitted(true);
    consumeCrewToken(details.token, initialAction).then((result) => {
      if (result.success) {
        setAction(result.action);
        setStatus('done');
      } else {
        setError(result.error);
        setStatus('error');
      }
    });
  }

  const handleAction = async (a: 'confirmed' | 'declined') => {
    setStatus('loading');
    setError(null);
    const result = await consumeCrewToken(details.token, a);
    if (result.success) {
      setAction(result.action);
      setStatus('done');
    } else {
      setError(result.error);
      setStatus('error');
    }
  };

  const isConfirmed = action === 'confirmed';
  const isDeclined = action === 'declined';

  return (
    <div className="min-h-dvh bg-[oklch(0.12_0_0)] flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_LIGHT}
        className="w-full max-w-md"
      >
        {/* Wordmark */}
        <p className="text-xs font-medium tracking-[0.12em] uppercase text-[oklch(1_0_0)]/30 mb-8">Unusonic</p>

        {/* Done state */}
        {status === 'done' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={STAGE_LIGHT}
            className="text-center"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
              isConfirmed ? 'bg-[var(--color-unusonic-success)]/15 border border-[var(--color-unusonic-success)]/30' : 'bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.10)]'
            }`}>
              {isConfirmed
                ? <Check size={28} className="text-[var(--color-unusonic-success)]" />
                : <X size={28} className="text-[oklch(1_0_0)]/40" />
              }
            </div>
            <h1 className="text-xl font-semibold text-[oklch(1_0_0)] tracking-tight mb-2">
              {isConfirmed ? 'You\'re confirmed' : 'Declined'}
            </h1>
            <p className="text-sm text-[oklch(1_0_0)]/50 leading-relaxed">
              {isConfirmed
                ? `See you at ${details.eventTitle}. The organiser has been notified.`
                : `No problem. The organiser has been notified you can't make it.`
              }
            </p>
          </motion.div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="text-center">
            <p className="text-[oklch(1_0_0)]/80 font-medium mb-2">An error occurred</p>
            <p className="text-sm text-[oklch(1_0_0)]/40">{error}</p>
          </div>
        )}

        {/* Idle / loading — show event details + CTAs */}
        {(status === 'idle' || status === 'loading') && (
          <>
            <h1 className="text-2xl font-semibold text-[oklch(1_0_0)] tracking-tight mb-1">
              {details.eventTitle}
            </h1>
            <p className="text-sm text-[oklch(1_0_0)]/50 mb-6">
              {details.workspaceName} has assigned you to this event.
            </p>

            {/* Details */}
            <div className="rounded-2xl border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.04)] p-5 mb-6 space-y-3">
              <div className="flex items-center gap-3">
                <User size={14} className="text-[oklch(1_0_0)]/30 shrink-0" />
                <div>
                  <p className="stage-label text-[oklch(1_0_0)]/30 mb-0.5">Role</p>
                  <p className="text-sm font-medium text-[oklch(1_0_0)]">{details.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-[oklch(1_0_0)]/30 shrink-0" />
                <div>
                  <p className="stage-label text-[oklch(1_0_0)]/30 mb-0.5">Date</p>
                  <p className="text-sm text-[oklch(1_0_0)]/80">{details.eventDate}</p>
                </div>
              </div>
              {details.callTime && (
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-[oklch(1_0_0)]/30 shrink-0" />
                  <div>
                    <p className="stage-label text-[oklch(1_0_0)]/30 mb-0.5">Call time</p>
                    <p className="text-sm font-medium text-[oklch(1_0_0)]">{details.callTime}</p>
                  </div>
                </div>
              )}
              {details.venueName && (
                <div className="flex items-center gap-3">
                  <MapPin size={14} className="text-[oklch(1_0_0)]/30 shrink-0" />
                  <div>
                    <p className="stage-label text-[oklch(1_0_0)]/30 mb-0.5">Venue</p>
                    <p className="text-sm text-[oklch(1_0_0)]/80">
                      {details.venueName}
                      {details.venueAddress && <span className="text-[oklch(1_0_0)]/40"> · {details.venueAddress}</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleAction('confirmed')}
                disabled={status === 'loading'}
                className="flex-1 py-3 rounded-xl bg-[var(--color-unusonic-success)]/15 border border-[var(--color-unusonic-success)]/30 text-[var(--color-unusonic-success)] font-medium text-sm hover:bg-[var(--color-unusonic-success)]/25 transition-colors focus:outline-none disabled:opacity-45"
              >
                {status === 'loading' ? '…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => handleAction('declined')}
                disabled={status === 'loading'}
                className="flex-1 py-3 rounded-xl border border-[oklch(1_0_0_/_0.10)] text-[oklch(1_0_0)]/50 font-medium text-sm hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[oklch(1_0_0)]/70 transition-colors focus:outline-none disabled:opacity-45"
              >
                {status === 'loading' ? '…' : 'Decline'}
              </button>
            </div>

            <p className="text-xs text-[oklch(1_0_0)]/25 text-center mt-4">
              No account required · Link expires 7 days after assignment
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
