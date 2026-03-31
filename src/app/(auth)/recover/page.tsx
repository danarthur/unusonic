/**
 * Request recovery (unauthenticated).
 * User enters email → we create recovery request and send veto email to owner + orchestrate guardians.
 * No login required.
 */

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { RecoverRequestForm } from './RecoverRequestForm';

export const metadata = {
  title: 'Recover access | Unusonic',
  description: 'Start account recovery with your Safety Net guardians',
};

export const dynamic = 'force-dynamic';

export default async function RecoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="relative z-10 w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--stage-text-primary)] mb-1 text-center">
          Recover access
        </h1>
        <p className="text-[var(--stage-text-secondary)] text-sm text-center mb-8">
          Enter the email for your account. We’ll send you a link to cancel if this wasn’t you, and
          your Safety Net guardians will be notified.
        </p>
        <RecoverRequestForm />
        <p className="text-[var(--stage-text-secondary)]/80 text-xs text-center mt-6">
          <a href="/login" className="underline hover:text-[var(--stage-text-primary)]">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
