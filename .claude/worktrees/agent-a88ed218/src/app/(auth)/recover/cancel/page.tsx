/**
 * Cancel recovery via magic link (no login).
 * Token in query is one-time; cancels the pending recovery and invalidates the link.
 */

import { createHash } from 'crypto';
import { getSystemClient } from '@/shared/api/supabase/system';
import Link from 'next/link';

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function RecoverCancelPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token?.trim();

  let cancelled = false;
  if (token) {
    const system = getSystemClient();
    const cancelTokenHash = hashToken(token);
    const { data } = await system
      .from('recovery_requests')
      .update({ status: 'cancelled', cancel_token_hash: null })
      .eq('cancel_token_hash', cancelTokenHash)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    cancelled = !!data;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="relative z-10 w-full max-w-md text-center">
        {cancelled ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-ceramic mb-2">
              Recovery cancelled
            </h1>
            <p className="text-mercury text-sm mb-6">
              The recovery process has been stopped. Your account is secure.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-neon/20 text-neon border border-neon/40 px-4 py-2.5 text-sm font-medium hover:bg-neon/30 transition-colors"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-ceramic mb-2">
              Link invalid or already used
            </h1>
            <p className="text-mercury text-sm mb-6">
              This cancel link has expired or was already used. If you didn’t request a recovery,
              sign in and cancel from Security settings.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-white/10 text-ceramic border border-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/15 transition-colors"
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
