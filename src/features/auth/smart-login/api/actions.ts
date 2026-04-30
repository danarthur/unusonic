/**
 * Smart Login Feature — Server Actions barrel.
 *
 * Implementation lives in ./actions/* siblings (Phase 0.5-style split,
 * 2026-04-28). External callers historically imported everything from
 * './actions', so this file re-exports the full surface.
 *
 * NOT a `'use server'` file — Next.js requires every export from a 'use
 * server' module to be a directly-defined async function, which forbids
 * the `export { x } from './sib'` re-exports below. The siblings carry
 * `'use server'`, so the actions remain server actions when imported here.
 *
 * Splits:
 *   - _helpers.ts        — sync + async non-action helpers (UA/IP read,
 *                          random password, redirect sanitizer, profile
 *                          status). NOT a 'use server' file.
 *   - signup.ts          — signUpAction, signUpWithPayload, signUpForPasskey
 *   - signin.ts          — signInAction, signOut
 *   - otp.ts             — sendOtpAction, verifyOtpAction
 *   - magic-link.ts      — sendMagicLinkAction (Phase 2 entry)
 *   - resolve-continue.ts — resolveContinueAction (Phase 4 dispatcher)
 *
 * @module features/auth/smart-login/api/actions
 */

export { signUpAction, signUpWithPayload, signUpForPasskey } from './actions/signup';
export { signInAction, signOut } from './actions/signin';
export { sendOtpAction, verifyOtpAction } from './actions/otp';
export { sendMagicLinkAction } from './actions/magic-link';
export { resolveContinueAction } from './actions/resolve-continue';
