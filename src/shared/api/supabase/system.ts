// ⚠️ SECURITY WARNING:
// This client uses the SERVICE_ROLE_KEY. It bypasses ALL Row Level Security.
// It should ONLY be used in secure API routes (server-side), never in the browser.
// The `server-only` import below enforces this at build time — any client
// component that imports this module will fail to compile. See Guardian L-6
// in docs/audits/login-redesign-build-2026-04-19.md.
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
