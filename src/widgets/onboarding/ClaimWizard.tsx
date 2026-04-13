'use client';

/**
 * The Airlock – Handshake → Keys → Claim. Liquid Glass, 3D depth.
 * Partner summon flow: confirm identity, set password, claim account.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { signUpForClaim, finishPartnerClaim } from '@/features/summoning';
import type { ClaimInvitation } from '@/features/summoning';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

type Step = 'handshake' | 'keys' | 'claim';

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
  const defaultOrgName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || targetName || email.split('@')[0] || 'My Organization';
  const finalOrgName = orgName.trim() || defaultOrgName;
  const slug = finalOrgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 64) || 'org';

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

  const redirectTo = payload?.redirectTo ?? '/network';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      data-surface="surface"
      className="w-full max-w-md flex flex-col gap-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] p-6 sm:p-8"
    >
      <AnimatePresence mode="wait">
        {step === 'handshake' && (
          <motion.div
            key="handshake"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={STAGE_MEDIUM}
            className="text-center space-y-6"
          >
            {targetLogoUrl ? (
              <div className="flex justify-center">
                <div className="relative size-20 rounded-2xl overflow-hidden bg-[var(--ctx-well)] border border-[var(--stage-edge-top)]">
                  { }
                  <img src={targetLogoUrl} alt="" className="size-full object-contain" />
                </div>
              </div>
            ) : (
              <div className="flex size-20 items-center justify-center rounded-2xl bg-[var(--ctx-well)] border border-[var(--stage-edge-top)] mx-auto" />
            )}
            <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
              {originName} wants to connect with {targetName}.
            </h1>
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Confirm your identity to view shared work and claim your organization on Unusonic.
            </p>
            <p className="text-xs text-[var(--stage-text-secondary)]">{email}</p>
            <Button type="button" onClick={() => setStep('keys')} className="w-full" size="lg">
              This is me
            </Button>
          </motion.div>
        )}

        {step === 'keys' && (
          <motion.form
            key="keys"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={STAGE_MEDIUM}
            className="space-y-4"
            onSubmit={handleKeysSubmit}
          >
            <h2 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
              The Keys
            </h2>
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Set a password and your name. You’ll sign in with {email}.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                  First name
                </label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className="stage-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                  Last name
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  className="stage-input"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                Organization name
              </label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Neon Velvet"
                className="stage-input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
                className="stage-input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                Confirm password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                className="stage-input"
              />
              {confirmPassword && password !== confirmPassword && (
                <p role="alert" className="mt-1 text-xs text-[var(--color-unusonic-error)]">Passwords do not match.</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep('handshake')} className="flex-1">
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending || !password || password.length < 8 || password !== confirmPassword}
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                    Claiming…
                  </>
                ) : (
                  'Claim & continue'
                )}
              </Button>
            </div>
            {state?.ok === false && state?.error && (
              <p role="alert" className="text-sm text-[var(--color-unusonic-error)]">{state.error}</p>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      <p className="text-center">
        <Link
          href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`}
          className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:underline"
        >
          Already have an account? Sign in
        </Link>
      </p>
    </motion.div>
  );
}
