// ⚠️ SECURITY WARNING:
// This client uses the SERVICE_ROLE_KEY. It bypasses ALL Row Level Security.
// It should ONLY be used in secure API routes (server-side), never in the browser.
//
// TODO(guardian-l6): re-add `import 'server-only'` once the triggers module
// is split. Today, `src/shared/lib/triggers/registry.ts` eagerly imports
// every primitive at module load (including `enroll-follow-up.ts`, which
// imports this file). Any client that imports `@/shared/lib/triggers` —
// `pipeline-editor.tsx` and `prism.tsx` today — transitively pulls this
// module into its bundle. Adding `server-only` here makes that a hard
// build error. The fix is to split trigger metadata (client-safe) from
// `run()` functions (server-only), or to lazy-load the primitives. See
// docs/audits/login-redesign-build-2026-04-19.md Guardian L-6.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cachedClient: SupabaseClient<Database> | null = null;

export function getSystemClient(): SupabaseClient<Database> {
  if (cachedClient) {
    return cachedClient;
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  cachedClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false, // We don't need to maintain a session for the system bot
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}
