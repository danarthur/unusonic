/**
 * Sign Up Page
 * Convenience route that shows the unified auth form in signup mode
 * @module app/(auth)/signup
 */

import Link from 'next/link';
import { SmartLoginForm } from '@/features/auth/smart-login';

export const metadata = {
  title: 'Create account | Unusonic',
  description: 'Set up your workspace',
};

interface SignUpPageProps {
  searchParams: Promise<{ redirect?: string; next?: string; email?: string }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { redirect, next, email } = await searchParams;
  const redirectTo = redirect || next;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-stage-void">
      {/* Spotlight / Cove Light — single light source from top, no colored orbs */}
      <div className="fixed inset-0 z-0 bg-[var(--stage-void)] pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        <SmartLoginForm redirectTo={redirectTo} defaultMode="signup" defaultEmail={email} />
        <p className="text-[11px] text-[var(--stage-text-secondary)]/55 max-w-sm text-center leading-relaxed">
          By creating an account you agree to our{' '}
          <Link
            href="/legal/terms"
            className="text-[var(--stage-text-secondary)]/85 hover:text-[var(--stage-text-primary)] transition-colors underline underline-offset-2 decoration-[oklch(1_0_0_/_0.18)]"
          >
            Terms
          </Link>
          {' '}and{' '}
          <Link
            href="/legal/privacy"
            className="text-[var(--stage-text-secondary)]/85 hover:text-[var(--stage-text-primary)] transition-colors underline underline-offset-2 decoration-[oklch(1_0_0_/_0.18)]"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
