/**
 * Smart Login — sign-up server actions.
 *
 * Owns: account creation flows.
 *   - signUpAction          — form-based signup (useActionState), redirects on success
 *   - signUpWithPayload     — programmatic signup, redirects on success
 *   - signUpForPasskey      — passkey-only signup with random password,
 *                             does NOT redirect (caller registers passkey first)
 *
 * @module features/auth/smart-login/api/actions/signup
 */
'use server';

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { signupSchema, signupForPasskeySchema } from '../../model/schema';
import type { AuthState } from '../../model/types';
import { randomPassword } from './_helpers';

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
  const redirectTo = (formData.get('redirectTo') as string)?.trim() || null;

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

  // If a redirectTo is specified (e.g. /claim/[token] for employee invites),
  // go there instead of onboarding. The claim flow handles workspace setup.
  const destination = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/onboarding';
  redirect(destination);
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
