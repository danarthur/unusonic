import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Root: single auth entry point (Option B).
 * Authenticated → /lobby. Not authenticated → /login.
 * Marketing landing reserved for a future route.
 */
export default async function LandingPage() {
  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Supabase') || message.includes('NEXT_PUBLIC_SUPABASE')) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--stage-void)] text-center">
          <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)] mb-2">
            Supabase not configured
          </h1>
          <p className="text-sm text-[var(--stage-text-secondary)] max-w-md mb-4 leading-relaxed">
            Add <code className="bg-[oklch(1_0_0_/_0.10)] px-1.5 py-0.5 rounded text-[var(--stage-text-primary)]">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="bg-[oklch(1_0_0_/_0.10)] px-1.5 py-0.5 rounded text-[var(--stage-text-primary)]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
            <code className="bg-[oklch(1_0_0_/_0.10)] px-1.5 py-0.5 rounded text-[var(--stage-text-primary)]">.env.local</code> and restart the dev server.
          </p>
          <p className="text-xs text-[var(--stage-text-secondary)]/80">{message}</p>
        </div>
      );
    }
    throw err;
  }

  if (user) redirect('/lobby');
  redirect('/login');
}
