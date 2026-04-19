'use client';

/**
 * ClaimWizard — partner-summon claim flow (Handshake → Keys → Claim).
 *
 * Style aligned with the Phase 3 claim surface: `stage-panel`, `stage-input`,
 * `stage-btn` primitives, Stage motion springs. Logic unchanged from the
 * original widget — we still call `signUpForClaim` then `finishPartnerClaim`.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowRight } from 'lucide-react';
import { signUpForClaim, finishPartnerClaim } from '@/features/summoning';
import type { ClaimInvitation } from '@/features/summoning';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { STAGE_HEAVY, STAGE_MEDIUM } from '@/shared/lib/motion-constants';

type Step = 'handshake' | 'keys';

interface ClaimWizardProps {
  invitation: ClaimInvitation;
}

export function ClaimWizard({ invitation }: ClaimWizardProps) {
  const router = useRouter();
  const { email, originName, targetName, targetLogoUrl, payload, token } = invitation;
  const [step, setStep] = React.useState<Step>('handshake');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [orgName, setOrgName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [state, setState] = React.useState<{ ok: boolean; error?: string } | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  const passwordMatch = password === confirmPassword && password.length >= 8;
  const defaultOrgName =
    [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') ||
    targetName ||
    email.split('@')[0] ||
    'My Organization';
  const finalOrgName = orgName.trim() || defaultOrgName;
  const slug =
    finalOrgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 64) ||
    'org';

  const handleKeysSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordMatch || !password) return;
    setIsPending(true);
    setState(null);
    const signUpResult = await signUpForClaim(email, password);
    if (!signUpResult.ok) {
      setState({ ok: false, error: signUpResult.error });
      setIsPending(false);
      return;
    }
    const result = await finishPartnerClaim(token, finalOrgName, slug);
    setIsPending(false);
    if (result.ok) {
      router.push(result.redirectTo);
      return;
    }
    setState({ ok: false, error: result.error });
  };

  // payload.redirectTo is optional on ClaimInvitation — if we ever need it, read here.
  void payload;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={STAGE_HEAVY}
      className="stage-panel w-full max-w-md p-[var(--stage-padding)]"
      data-surface="surface"
    >
      <AnimatePresence mode="wait">
        {step === 'handshake' && (
          <motion.div
            key="handshake"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={STAGE_MEDIUM}
          >
            <WorkspaceLogo url={targetLogoUrl} />

            <h1 className="mt-6 text-center text-[length:22px] leading-tight font-medium tracking-tight text-[var(--stage-text-primary)]">
              <span className="font-semibold">{originName}</span> wants to connect with{' '}
              <span className="font-semibold">{targetName}</span>
            </h1>
            <p className="mt-3 text-center text-sm text-[var(--stage-text-secondary)]">
              Confirm your identity to view shared work and claim your organization on Unusonic.
            </p>
            <p className="mt-1 text-center text-sm text-[var(--stage-text-secondary)]">
              <span className="font-medium text-[var(--stage-text-primary)]">{email}</span>
            </p>

            <button
              type="button"
              onClick={() => setStep('keys')}
              className="stage-btn stage-btn-primary mt-6 w-full"
            >
              This is me
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </motion.div>
        )}

        {step === 'keys' && (
          <motion.form
            key="keys"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={STAGE_MEDIUM}
            onSubmit={handleKeysSubmit}
          >
            <h2 className="text-center text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
              Set up your account
            </h2>
            <p className="mt-2 text-center text-sm text-[var(--stage-text-secondary)]">
              You&apos;ll sign in with{' '}
              <span className="font-medium text-[var(--stage-text-primary)]">{email}</span>.
            </p>

            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="claim-first-name" className="mb-1.5 block stage-field-label">
                    First name
                  </label>
                  <input
                    id="claim-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First"
                    className="stage-input"
                  />
                </div>
                <div>
                  <label htmlFor="claim-last-name" className="mb-1.5 block stage-field-label">
                    Last name
                  </label>
                  <input
                    id="claim-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last"
                    className="stage-input"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="claim-org-name" className="mb-1.5 block stage-field-label">
                  Organization name
                </label>
                <input
                  id="claim-org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={defaultOrgName}
                  className="stage-input"
                />
              </div>
              <div>
                <label htmlFor="claim-password" className="mb-1.5 block stage-field-label">
                  Password
                </label>
                <input
                  id="claim-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                  className="stage-input"
                />
              </div>
              <div>
                <label htmlFor="claim-confirm-password" className="mb-1.5 block stage-field-label">
                  Confirm password
                </label>
                <input
                  id="claim-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  minLength={8}
                  className="stage-input"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p role="alert" className="mt-1.5 text-sm text-[var(--color-unusonic-error)]">
                    Passwords do not match.
                  </p>
                )}
              </div>
            </div>

            {state?.ok === false && state?.error && (
              <div className="stage-panel-nested stage-stripe-error mt-4 p-3">
                <p role="alert" className="text-sm text-[var(--stage-text-primary)]">
                  {state.error}
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('handshake')}
                className="stage-btn stage-btn-ghost flex-1"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isPending || !password || password.length < 8 || password !== confirmPassword}
                className="stage-btn stage-btn-primary flex-1"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    Claiming…
                  </>
                ) : (
                  <>
                    Claim &amp; continue
                    <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <p className="mt-5 text-center">
        <Link
          href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`}
          className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
        >
          Already have an account? Sign in
        </Link>
      </p>
    </motion.div>
  );
}

function WorkspaceLogo({ url }: { url: string | null }) {
  if (url) {
    return (
      <div className="mx-auto flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- workspace avatar URLs are remote and may not be whitelisted in next/image config; this is a pre-auth tokenized page */}
        <img src={url} alt="" className="size-full object-contain" aria-hidden />
      </div>
    );
  }
  return (
    <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]">
      <LivingLogo size="md" status="idle" />
    </div>
  );
}
