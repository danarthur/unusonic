/**
 * Login Page
 * Post-Enterprise Materiality auth — obsidian void, liquid glass, grain overlay.
 * @module app/(auth)/login
 */

import dynamic from 'next/dynamic';

const SmartLoginForm = dynamic(
  () => import('@/features/auth/smart-login').then((m) => m.SmartLoginForm),
  {
    ssr: true,
    loading: () => (
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-12" aria-hidden>
        <div className="w-14 h-14 rounded-full bg-ink/10 animate-pulse" />
        <div className="h-4 w-32 rounded-full bg-ink/10 animate-pulse" />
        <div className="h-10 w-full max-w-[280px] rounded-xl bg-ink/10 animate-pulse" />
      </div>
    ),
  }
);

export const metadata = {
  title: 'Sign in | Signal',
  description: 'Sign in to your workspace',
};

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string; next?: string; reason?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = params.next ?? params.redirect;
  const showInactivityMessage = params.reason === 'inactivity';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      {/* Spotlight / Cove Light — single light source from top, no colored orbs */}
      <div className="fixed inset-0 z-0 bg-signal-void pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>

      <div className="relative z-10 w-full">
        <SmartLoginForm redirectTo={redirectTo} showInactivityMessage={showInactivityMessage} />
      </div>
    </div>
  );
}
