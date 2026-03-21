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
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-obsidian text-center">
          <h1 className="text-xl font-medium tracking-tight text-ceramic mb-2">
            Supabase not configured
          </h1>
          <p className="text-sm text-mercury max-w-md mb-4 leading-relaxed">
            Add <code className="bg-white/10 px-1.5 py-0.5 rounded text-ceramic">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-ceramic">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-ceramic">.env.local</code> and restart the dev server.
          </p>
          <p className="text-xs text-mercury/80">{message}</p>
        </div>
      );
    }
    throw err;
  }

  if (user) redirect('/lobby');
  redirect('/login');
}
