/**
 * Client portal sign-in — request a magic link by email.
 *
 * Route: /client/sign-in
 *
 * Flow:
 *   1. User enters email + Turnstile runs in background
 *   2. POST /api/client-portal/magic-link
 *   3a. Claimed entity → magic-link email → user clicks → /client/auth/confirm
 *   3b. Ghost entity → OTP email → redirect to /client/sign-in/verify
 *
 * See: docs/audits/event-walkthrough-2026-04-11-fix-plan.md §1 Phase E
 */
import { SignInForm } from './sign-in-form';

export default function ClientPortalSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <SignInForm searchParamsPromise={searchParams} />;
}
