'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { claimOrganization } from '@/features/onboarding/api/actions';
import { acceptEmployeeInvite } from '@/features/team-invite/api/actions';
import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

interface ClaimViewProps {
  token: string;
  email: string;
  orgName: string;
  /** Caller may pass whether user is authenticated so we can show "Sign in to claim". */
  isAuthenticated?: boolean;
  /** When true, uses the employee invite claim flow (no org ownership transfer). */
  isEmployeeInvite?: boolean;
  /** The authenticated user's email (null if not authenticated). Used to detect email mismatch. */
  userEmail?: string | null;
}

export function ClaimView({
  token,
  email,
  orgName,
  isAuthenticated = false,
  isEmployeeInvite = false,
  userEmail = null,
}: ClaimViewProps) {
  const emailMismatch = isAuthenticated && userEmail && email
    && userEmail.toLowerCase() !== email.toLowerCase();
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
        transition={STAGE_MEDIUM}
        data-surface="surface"
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-top)] bg-[var(--stage-surface)] p-8 text-center"
      >
        <CheckCircle2 className="size-10 text-[var(--color-unusonic-success)]" strokeWidth={1.5} />
        <div>
          <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
            You're all set
          </h1>
          <p className="mt-2 text-sm text-[var(--stage-text-secondary)]">
            {isEmployeeInvite
              ? <>You've joined <span className="font-medium text-[var(--stage-text-primary)]">{orgName}</span>. View your schedule and assignments.</>
              : <>You now manage <span className="font-medium text-[var(--stage-text-primary)]">{orgName}</span>. Sign in to get started.</>}
          </p>
        </div>
        <Button asChild variant="default" size="lg" className="w-full sm:w-auto">
          <Link href={isEmployeeInvite ? '/portal/schedule' : '/lobby'}>
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
        transition={STAGE_MEDIUM}
        data-surface="surface"
        className="flex w-full max-w-md flex-col gap-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-top)] bg-[var(--stage-surface)] p-6 sm:p-8 text-center"
      >
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Welcome, {email}
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          <span className="font-medium text-[var(--stage-text-primary)]">{orgName}</span> has invited you to {isEmployeeInvite ? 'join their team' : 'manage their organization'}. Create an account with this email to get started.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="default" size="lg" className="w-full sm:w-auto">
            <Link href={`/signup?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`}>
              Create account
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/claim/${token}`)}`}>
              Already have an account
            </Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  if (emailMismatch) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
        data-surface="surface"
        className="flex w-full max-w-md flex-col gap-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-top)] bg-[var(--stage-surface)] p-6 sm:p-8 text-center"
      >
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Wrong account
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          This invite was sent to <span className="font-medium text-[var(--stage-text-primary)]">{email}</span>, but you are signed in as <span className="font-medium text-[var(--stage-text-primary)]">{userEmail}</span>.
        </p>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          Sign out and sign in with the correct email, or create a new account.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="default" size="lg" className="w-full sm:w-auto">
            <a href={`/signout?next=${encodeURIComponent(`/claim/${token}`)}`}>
              Sign out
            </a>
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
      transition={STAGE_MEDIUM}
      data-surface="surface"
      className="flex w-full max-w-md flex-col gap-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-top)] bg-[var(--stage-surface)] p-6 sm:p-8 text-center"
    >
      <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
        Welcome, {email}
      </h1>
      <p className="text-sm text-[var(--stage-text-secondary)]">
        <span className="font-medium text-[var(--stage-text-primary)]">{orgName}</span> has invited you to {isEmployeeInvite ? 'join their team' : 'manage their organization'}.
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
              <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
              Claiming…
            </>
          ) : (
            'Accept and claim'
          )}
        </Button>
        {state?.ok === false && state?.error && (
          <p role="alert" className="text-sm text-[var(--color-unusonic-error)]">{state.error}</p>
        )}
      </form>
    </motion.div>
  );
}
