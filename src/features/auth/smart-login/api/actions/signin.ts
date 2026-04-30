/**
 * Smart Login — sign-in / sign-out server actions.
 *
 * Owns: password sign-in (legacy path), session termination.
 *   - signInAction — useActionState form path, routes to /onboarding,
 *                    /lobby, or sanitized `next` based on profile state.
 *                    Trusted-device cookie + Phase-0 telemetry.
 *   - signOut     — non-redirect client-callable sign out.
 *
 * @module features/auth/smart-login/api/actions/signin
 */
'use server';

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
} from '@/shared/lib/constants';
import { loginSchema } from '../../model/schema';
import type { AuthState } from '../../model/types';
import { emitContinueResolved } from '../../lib/auth-telemetry';
import {
  readUserAgent,
  sanitizeRedirectPath,
  checkProfileStatus,
} from './_helpers';

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
  const started = Date.now();
  const userAgent = await readUserAgent();

  // Parse and validate input
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    // Malformed input: not a resolvable Continue press. Skip telemetry.
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
    // Mirror enumeration-safe classification: from the telemetry lens,
    // a failed password sign-in today looks equivalent to the new
    // card's "unknown" resolution (server declined to establish a
    // session). The `flag_snapshot` keeps this row interpretable.
    emitContinueResolved({
      email,
      resolution: 'unknown',
      latencyMs: Date.now() - started,
      userAgent,
    });
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

  if (sanitizedNext?.startsWith('/claim') || sanitizedNext?.startsWith('/confirm')) {
    // Employee invite claim flow — let them reach the claim page
    // even if onboarding isn't complete. Claim acceptance sets onboarding_completed.
    redirectPath = sanitizedNext;
  } else if (!profileStatus.exists || !profileStatus.onboardingCompleted) {
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

  // Emit before redirect() throws. A successful password sign-in in
  // Phase 0 shadow maps to `passkey` resolution — the user
  // authenticated directly, with no email fallback needed. The new
  // state machine routes the same "has credentials on file" cohort
  // through the passkey bucket.
  emitContinueResolved({
    email,
    resolution: 'passkey',
    latencyMs: Date.now() - started,
    userAgent,
  });

  redirect(redirectPath);
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
