/**
 * Smart Login Feature - Server Actions
 * Production-grade authentication with state restoration
 * @module features/auth/smart-login/api/actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
} from '@/shared/lib/constants';
import { loginSchema, signupSchema, signupForPasskeySchema } from '../model/schema';
import type { AuthState, ProfileStatus } from '../model/types';

/** Generates a random password that satisfies schema (8+ chars, 1 upper, 1 number). */
function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
  s += upper[Math.floor(Math.random() * upper.length)];
  s += '3';
  return s.split('').sort(() => Math.random() - 0.5).join('');
}

const initialState: AuthState = {
  status: 'idle',
  message: null,
  error: null,
  redirect: null,
};

/**
 * Creates a new user account and redirects to onboarding
 * 
 * Flow:
 * 1. Validate input (email, password, name)
 * 2. Create user in Supabase Auth
 * 3. Profile is auto-created by database trigger
 * 4. Redirect to /onboarding
 */
export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  // Parse and validate input
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: null,
      error: parsed.error.issues[0]?.message || 'Invalid input',
      redirect: null,
    };
  }

  const { email, password, fullName } = parsed.data;

  // Create user in Supabase Auth
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (authError) {
    // Handle specific error cases
    if (authError.message.includes('already registered')) {
      return {
        status: 'error',
        message: null,
        error: 'An account with this email already exists. Try signing in instead.',
        redirect: null,
      };
    }
    
    return {
      status: 'error',
      message: null,
      error: authError.message || 'Failed to create account',
      redirect: null,
    };
  }

  if (!authData.user) {
    return {
      status: 'error',
      message: null,
      error: 'Failed to create account',
      redirect: null,
    };
  }

  // Note: Profile is automatically created by database trigger (handle_new_user)
  // The trigger populates: id, email, full_name from auth user metadata
  
  // Redirect to onboarding to complete setup
  redirect('/onboarding');
}

/**
 * Creates a new user account (programmatic) and redirects to onboarding.
 * For genesis-style sign-up flow.
 */
export async function signUpWithPayload(payload: {
  email: string;
  fullName: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }

  const { email, password, fullName } = parsed.data;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return {
        ok: false,
        error: 'An account with this email already exists. Try signing in instead.',
      };
    }
    return { ok: false, error: authError.message };
  }

  if (!authData.user) {
    return { ok: false, error: 'Failed to create account' };
  }

  redirect('/onboarding');
}

/**
 * Creates a new user account for passkey-only signup (random password, no redirect).
 * Client must then call registerPasskey() and redirect to /onboarding.
 */
export async function signUpForPasskey(payload: {
  email: string;
  fullName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = signupForPasskeySchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }

  const { email, fullName } = parsed.data;
  const password = randomPassword();
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return {
        ok: false,
        error: 'An account with this email already exists. Try signing in instead.',
      };
    }
    return { ok: false, error: authError.message };
  }

  if (!authData.user) {
    return { ok: false, error: 'Failed to create account' };
  }

  return { ok: true };
}

/**
 * Authenticates user and redirects based on onboarding status
 * 
 * Flow:
 * 1. Validate credentials
 * 2. Authenticate with Supabase
 * 3. Check profile.onboarding_completed
 * 4. Redirect to /onboarding or /dashboard
 */
export async function signInAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  // Parse and validate input
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: null,
      error: parsed.error.issues[0]?.message || 'Invalid input',
      redirect: null,
    };
  }

  const { email, password } = parsed.data;

  // Authenticate with Supabase
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return {
      status: 'error',
      message: null,
      error: authError?.message || 'Authentication failed',
      redirect: null,
    };
  }

  // Check profile status for routing
  const profileStatus = await checkProfileStatus(supabase, authData.user.id);

  // Determine redirect destination (support both 'redirect' and 'next' hidden fields)
  let redirectPath: string;
  const rawNext = (formData.get('redirect') ?? formData.get('next')) as string | null;
  const sanitizedNext = sanitizeRedirectPath(rawNext);

  if (!profileStatus.exists || !profileStatus.onboardingCompleted) {
    redirectPath = '/onboarding';
  } else if (sanitizedNext) {
    redirectPath = sanitizedNext;
  } else {
    redirectPath = '/lobby';
  }

  const trustDevice = formData.get('trustDevice');
  if (trustDevice === '1' || trustDevice === 'true') {
    const cookieStore = await cookies();
    cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, 'true', {
      path: '/',
      maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
    });
  }

  redirect(redirectPath);
}

/**
 * Sanitize redirect path: allow only relative paths (no protocol, no //).
 * Prevents open redirect vulnerabilities.
 */
function sanitizeRedirectPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (trimmed === '' || trimmed === '/login' || trimmed === '/signup') return null;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

/**
 * Checks if user profile exists and onboarding is complete
 */
async function checkProfileStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ProfileStatus> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('onboarding_completed, full_name')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return {
      exists: false,
      onboardingCompleted: false,
      fullName: null,
    };
  }

  return {
    exists: true,
    onboardingCompleted: profile.onboarding_completed || false,
    fullName: profile.full_name,
  };
}

/**
 * Non-redirect version for client-side use
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
