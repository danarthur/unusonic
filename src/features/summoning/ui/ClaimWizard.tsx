'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { signUpForClaim, finishPartnerClaim } from '../api/actions';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const spring = STAGE_MEDIUM;

type Step = 'hook' | 'identity' | 'keys';

interface ClaimWizardProps {
  token: string;
  email: string;
  payload: { redirectTo?: string } | null;
}

export function ClaimWizard({ token, email, payload }: ClaimWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('hook');
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [password, setPassword] = React.useState('');

  const [state, setState] = React.useState<{ ok: boolean; error?: string } | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  const handleKeysSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsPending(true);
    setState(null);
    const signUpResult = await signUpForClaim(email, password);
    if (!signUpResult.ok) {
      setState({ ok: false, error: signUpResult.error });
      setIsPending(false);
      return;
    }
    const result = await finishPartnerClaim(token, name, slug || undefined);
    setIsPending(false);
    if (result.ok) {
      router.push(result.redirectTo);
      return;
    }
    setState({ ok: false, error: result.error });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="w-full max-w-md flex flex-col gap-6 rounded-2xl border border-[var(--stage-edge-subtle,oklch(1_0_0/0.03))] bg-[var(--stage-surface)] p-6 sm:p-8 shadow-xl"
    >
      <AnimatePresence mode="wait">
        {step === 'hook' && (
          <motion.div
            key="hook"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={spring}
            className="text-center space-y-6"
          >
            <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
              You’re invited to connect
            </h1>
            <p className="text-sm text-[var(--stage-text-secondary)]">
              A partner has sent you a link to collaborate on Unusonic. Confirm your identity to view shared work and claim your organization.
            </p>
            <p className="text-xs text-[var(--stage-text-secondary)]">{email}</p>
            <Button type="button" onClick={() => setStep('identity')} className="w-full" size="lg">
              Continue
            </Button>
          </motion.div>
        )}

        {step === 'identity' && (
          <motion.div
            key="identity"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={spring}
            className="space-y-4"
          >
            <h2 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
              Confirm your business details
            </h2>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                Organization name
              </label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 64));
                }}
                placeholder="e.g. Neon Velvet"
                className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
                Slug (public URL)
              </label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="neon-velvet"
                className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] font-mono text-sm"
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep('hook')} className="flex-1">
                Back
              </Button>
              <Button type="button" onClick={() => setStep('keys')} className="flex-1" disabled={!name.trim()}>
                Next
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'keys' && (
          <motion.form
            key="keys"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={spring}
            className="space-y-4"
            onSubmit={handleKeysSubmit}
          >
            <h2 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
              Set your password
            </h2>
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Create a password to secure your account. You’ll sign in with {email}.
            </p>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="slug" value={slug} />
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
                className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <p className="text-label text-[var(--stage-text-secondary)]">
              We’ll create your account and then link your organization.
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep('identity')} className="flex-1">
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending || !name.trim()}
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Claiming…
                  </>
                ) : (
                  'Claim & continue'
                )}
              </Button>
            </div>
            {state?.ok === false && state?.error && (
              <p className="text-sm text-[var(--color-unusonic-error)]">{state.error}</p>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      <p className="text-center">
        <Link href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`} className="text-xs text-[var(--stage-accent)] hover:underline">
          Already have an account? Sign in
        </Link>
      </p>
    </motion.div>
  );
}
