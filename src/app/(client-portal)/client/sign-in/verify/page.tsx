/**
 * OTP verification page for ghost entity client portal sign-in.
 *
 * Route: /client/sign-in/verify
 *
 * User enters the 6-digit code they received via email. On success,
 * the API mints a session cookie and the client redirects to /client/home.
 *
 * See: docs/audits/event-walkthrough-2026-04-11-fix-plan.md §1 Phase E
 */
import { VerifyOtpForm } from './verify-otp-form';

export default function VerifyOtpPage() {
  return <VerifyOtpForm />;
}
