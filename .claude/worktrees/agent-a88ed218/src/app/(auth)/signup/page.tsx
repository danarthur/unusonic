/**
 * Sign Up Page
 * Convenience route that shows the unified auth form in signup mode
 * @module app/(auth)/signup
 */

import { SmartLoginForm } from '@/features/auth/smart-login';

export const metadata = {
  title: 'Create account | Signal',
  description: 'Set up your workspace',
};

interface SignUpPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { redirect } = await searchParams;
  
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      {/* Spotlight / Cove Light — single light source from top, no colored orbs */}
      <div className="fixed inset-0 z-0 bg-signal-void pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>

      <div className="relative z-10 w-full">
        <SmartLoginForm redirectTo={redirect} defaultMode="signup" />
      </div>
    </div>
  );
}
