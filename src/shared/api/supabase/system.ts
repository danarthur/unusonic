// ⚠️ SECURITY WARNING:
// This client uses the SERVICE_ROLE_KEY. It bypasses ALL Row Level Security.
// It should ONLY be used in secure API routes (server-side), never in the browser.
//
// The `import 'server-only'` guard makes any accidental client import a hard
// build error — previously blocked by the triggers registry's eager primitive
// load (Guardian L-6, docs/audits/login-redesign-build-2026-04-19.md). That
// split landed in `src/shared/lib/triggers/registry-server.ts` + `./metadata.ts`
// (Phase 3 §3.12 A3 / project_triggers_module_leak memory): client imports
// now go through the client-safe barrel, the server runtime is isolated.
import 'server-only';

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
