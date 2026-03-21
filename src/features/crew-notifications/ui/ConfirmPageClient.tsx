'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Calendar, MapPin, Clock, User } from 'lucide-react';
import { consumeCrewToken } from '../api/confirm-crew-token';
import type { TokenDetails } from '../api/confirm-crew-token';
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';

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
        transition={UNUSONIC_PHYSICS}
        className="w-full max-w-md"
      >
        {/* Wordmark */}
        <p className="text-xs font-semibold tracking-[0.12em] uppercase text-white/30 mb-8">Signal</p>

        {/* Done state */}
        {status === 'done' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={UNUSONIC_PHYSICS}
            className="text-center"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
              isConfirmed ? 'bg-[var(--color-signal-success)]/15 border border-[var(--color-signal-success)]/30' : 'bg-white/5 border border-white/10'
            }`}>
              {isConfirmed
                ? <Check size={28} className="text-[var(--color-signal-success)]" />
                : <X size={28} className="text-white/40" />
              }
            </div>
            <h1 className="text-xl font-semibold text-white tracking-tight mb-2">
              {isConfirmed ? 'You\'re confirmed' : 'Declined'}
            </h1>
            <p className="text-sm text-white/50 leading-relaxed">
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
            <p className="text-white/80 font-medium mb-2">Something went wrong</p>
            <p className="text-sm text-white/40">{error}</p>
          </div>
        )}

        {/* Idle / loading — show event details + CTAs */}
        {(status === 'idle' || status === 'loading') && (
          <>
            <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">
              {details.eventTitle}
            </h1>
            <p className="text-sm text-white/50 mb-6">
              {details.workspaceName} has assigned you to this event.
            </p>

            {/* Details */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 mb-6 space-y-3">
              <div className="flex items-center gap-3">
                <User size={14} className="text-white/30 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Role</p>
                  <p className="text-sm font-semibold text-white">{details.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-white/30 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Date</p>
                  <p className="text-sm text-white/80">{details.eventDate}</p>
                </div>
              </div>
              {details.callTime && (
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-white/30 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Call time</p>
                    <p className="text-sm font-semibold text-white">{details.callTime}</p>
                  </div>
                </div>
              )}
              {details.venueName && (
                <div className="flex items-center gap-3">
                  <MapPin size={14} className="text-white/30 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Venue</p>
                    <p className="text-sm text-white/80">
                      {details.venueName}
                      {details.venueAddress && <span className="text-white/40"> · {details.venueAddress}</span>}
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
                className="flex-1 py-3 rounded-xl bg-[var(--color-signal-success)]/15 border border-[var(--color-signal-success)]/30 text-[var(--color-signal-success)] font-semibold text-sm hover:bg-[var(--color-signal-success)]/25 transition-colors focus:outline-none disabled:opacity-60"
              >
                {status === 'loading' ? '…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => handleAction('declined')}
                disabled={status === 'loading'}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 font-medium text-sm hover:bg-white/5 hover:text-white/70 transition-colors focus:outline-none disabled:opacity-60"
              >
                {status === 'loading' ? '…' : 'Decline'}
              </button>
            </div>

            <p className="text-xs text-white/25 text-center mt-4">
              No account required · Link expires 7 days after assignment
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
