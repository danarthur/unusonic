'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { claimOrganization } from '@/features/onboarding/api/actions';
import { acceptEmployeeInvite } from '@/features/team-invite/api/actions';
import { Button } from '@/shared/ui/button';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface ClaimViewProps {
  token: string;
  email: string;
  orgName: string;
  /** Caller may pass whether user is authenticated so we can show "Sign in to claim". */
  isAuthenticated?: boolean;
  /** When true, uses the employee invite claim flow (no org ownership transfer). */
  isEmployeeInvite?: boolean;
}

export function ClaimView({
  token,
  email,
  orgName,
  isAuthenticated = false,
  isEmployeeInvite = false,
}: ClaimViewProps) {
  const [state, submitClaim, isPending] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, formData: FormData) => {
      if (isEmployeeInvite) {
        const result = await acceptEmployeeInvite(formData.get('token') as string);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      const result = await claimOrganization(null, formData);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    null
  );

  const success = state?.ok === true;

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] p-8 text-center"
      >
        <CheckCircle2 className="size-14 text-[var(--color-unusonic-success)]" />
        <div>
          <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
            You're all set
          </h1>
          <p className="mt-2 text-sm text-[var(--stage-text-secondary)]">
            {isEmployeeInvite
              ? <>You've joined <strong className="text-[var(--stage-text-primary)]">{orgName}</strong>. View your schedule and assignments.</>
              : <>You now manage <strong className="text-[var(--stage-text-primary)]">{orgName}</strong>. Sign in to get started.</>}
          </p>
        </div>
        <Button asChild variant="default" size="lg" className="w-full sm:w-auto">
          <Link href={isEmployeeInvite ? '/portal' : '/lobby'}>
            {isEmployeeInvite ? 'Go to portal' : 'Go to dashboard'}
          </Link>
        </Button>
      </motion.div>
    );
  }

  if (!isAuthenticated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="flex w-full max-w-md flex-col gap-6 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] p-6 sm:p-8 text-center"
      >
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Welcome, {email}
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          <strong className="text-[var(--stage-text-primary)]">{orgName}</strong> has invited you to {isEmployeeInvite ? 'join their team' : 'manage their organization'}. Sign in or create an account with this email to accept.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="default" size="lg" className="w-full sm:w-auto">
            <Link href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`}>
              Sign in to claim
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href={`/signup?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`}>
              Create account
            </Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex w-full max-w-md flex-col gap-6 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] p-6 sm:p-8 text-center"
    >
      <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
        Welcome, {email}
      </h1>
      <p className="text-sm text-[var(--stage-text-secondary)]">
        <strong className="text-[var(--stage-text-primary)]">{orgName}</strong> has invited you to {isEmployeeInvite ? 'join their team' : 'manage their organization'}.
      </p>
      <form action={submitClaim} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <Button
          type="submit"
          variant="default"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Claiming…
            </>
          ) : (
            'Accept & Claim'
          )}
        </Button>
        {state?.ok === false && state?.error && (
          <p className="text-sm text-[var(--color-unusonic-error)]">{state.error}</p>
        )}
      </form>
    </motion.div>
  );
}
