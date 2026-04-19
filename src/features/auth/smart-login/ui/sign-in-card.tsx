/**
 * Sign-In Card — Phase 4 state-machine implementation.
 *
 * Entry point for the `/login` surface. Flag-dispatches on
 * `authV2LoginCard`: OFF → delegates to {@link LegacySignInCard}
 * unchanged; ON → renders the new state-machine card spec'd in
 * `docs/reference/login-redesign-design.md` §3.
 *
 * ## The state machine
 *
 * Five states, plain `useReducer`:
 *
 *   - `idle`               — email field + Continue button, no prompts.
 *   - `checking`           — Continue pressed; `resolveContinueAction`
 *                            in flight. Continue button shows a
 *                            stage-skeleton pulse; jitter-floored at
 *                            ≥ 400ms on the server side.
 *   - `passkey`            — resolver said "passkey on file". Device-
 *                            aware CTA ("Confirm with Face ID" etc.) +
 *                            "Use magic link instead" fallback visible
 *                            from moment 1 (not reveal-on-fail).
 *   - `magic-link-sent`    — resolver said "magic-link". Copy:
 *                            "Check your email — we sent a link to
 *                            {email}" + Resend + "Use different email."
 *   - `session-expired`    — `showSessionExpiredMessage === true`.
 *                            Conditional mediation auto-fires on mount.
 *                            Same visual as `passkey` but with the
 *                            `sessionResumeTitle` copy.
 *
 * ## Non-negotiables
 *
 * - Never render "passkey" in user-facing copy. `getDeviceCopy()` maps
 *   the UA class to "Face ID" / "Touch ID" / "Windows Hello" / "your
 *   device".
 * - Magic-link fallback is present from moment the passkey state
 *   renders — not shown on failure, not after a timer.
 * - No client redirect to `/login`. Session-expired is a mount-time
 *   auto-trigger on this card; the escape hatch is handled by
 *   `SessionExpiredOverlay`.
 * - Only `stage-panel`, `stage-panel-nested`, `stage-input`, and
 *   `stage-btn stage-btn-*` primitives. No raw `oklch()` literals, no
 *   `ring-*`, no `/70` modifiers on secondary text.
 * - Lucide icons at `strokeWidth={1.5}` throughout.
 * - Weight-based springs (`STAGE_HEAVY`, `STAGE_MEDIUM`, `STAGE_LIGHT`).
 *
 * @module features/auth/smart-login/ui/sign-in-card
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';

import { authenticatePasskey } from '@/features/auth/passkey-authenticate/api/authenticate-passkey';
import { deviceCapabilityFromUserAgentClass, getDeviceCopy } from '@/shared/lib/auth/device-copy';
import { classifyUserAgent } from '@/shared/lib/auth/classify-user-agent';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import {
  GPU_STABILIZE,
  M3_CONTENT_EXIT_TRANSITION,
  M3_EASING_ENTER,
  STAGE_HEAVY,
  STAGE_LIGHT,
  STAGE_MEDIUM,
} from '@/shared/lib/motion-constants';

import { resolveContinueAction, sendMagicLinkAction } from '../api/actions';
import { sendSmsOtpAction, verifySmsOtpAction } from '../api/sms-actions';
import { useConditionalMediation } from '../lib/use-conditional-mediation';
import type { AuthMode } from '../model/types';
import { AuthErrorBlock } from './auth-error-block';
import { LegacySignInCard } from './sign-in-card-legacy';

interface SignInCardProps {
  email: string;
  setEmail: (v: string) => void;
  redirectTo?: string;
  showInactivityMessage: boolean;
  showSessionExpiredMessage: boolean;
  signinExiting: boolean;
  anticipating: boolean;
  isPending: boolean;
  prefersReducedMotion: boolean;
  onModeSwitch: (mode: AuthMode) => void;
  onPasskeyPendingChange: (pending: boolean) => void;
  /** Phase 4 flag. OFF → legacy render; ON → state machine. */
  authV2LoginCard?: boolean;
  /**
   * Phase 6 flag. When ON, the "Send SMS code instead" button appears
   * on the `magic-link-sent` state. When OFF, the SMS code paths are
   * entirely hidden and `sendSmsOtpAction` is a no-op (the action
   * still server-enforces the flag).
   */
  authV2Sms?: boolean;
}

export function SignInCard(props: SignInCardProps) {
  // Flag gate at the very top — with v2 off, render the legacy card
  // unchanged. The `authV2LoginCard` prop itself is dropped when
  // delegating so the legacy card signature stays untouched.
  if (!props.authV2LoginCard) {
    const { authV2LoginCard: _omit, authV2Sms: _smsOmit, ...rest } = props;
    void _omit;
    void _smsOmit;
    return <LegacySignInCard {...rest} />;
  }

  return <SignInCardV2 {...props} />;
}

// ────────────────────────────────────────────────────────────────────
// V2 — state machine card
// ────────────────────────────────────────────────────────────────────

type UiState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'passkey' }
  | { kind: 'magic-link-sent' }
  | { kind: 'sms-sent' }
  | { kind: 'session-expired' };

type UiEvent =
  | { type: 'continue-pressed' }
  | { type: 'resolved-passkey' }
  | { type: 'resolved-magic-link' }
  | { type: 'resolved-unknown' } // treated as magic-link-sent externally
  | { type: 'passkey-cancelled' }
  | { type: 'passkey-timeout' }
  | { type: 'resend' }
  | { type: 'sms-dispatched' }
  | { type: 'back-to-magic-link' }
  | { type: 'reset-to-idle' };

function reducer(state: UiState, event: UiEvent): UiState {
  switch (event.type) {
    case 'continue-pressed':
      if (state.kind === 'idle') return { kind: 'checking' };
      return state;
    case 'resolved-passkey':
      if (state.kind === 'checking') return { kind: 'passkey' };
      return state;
    case 'resolved-magic-link':
    case 'resolved-unknown':
      if (state.kind === 'checking') return { kind: 'magic-link-sent' };
      return state;
    case 'passkey-cancelled':
      // User-initiated dismissal — drop cleanly back to idle, per §3.
      if (state.kind === 'passkey' || state.kind === 'session-expired') {
        return { kind: 'idle' };
      }
      return state;
    case 'passkey-timeout':
      // 30s of no interaction on the passkey screen. Keep state but the
      // UI renders the fallback at elevated weight.
      return state;
    case 'resend':
      return { kind: 'checking' };
    case 'sms-dispatched':
      // Triggered from `magic-link-sent` after the user taps "Send SMS
      // code instead" and the server reports a successful dispatch.
      // Legal from either `magic-link-sent` or `checking` (the button
      // sets `isPending` so the resend/Continue buttons are disabled
      // during the round-trip, but the state itself stays put).
      if (state.kind === 'magic-link-sent' || state.kind === 'checking') {
        return { kind: 'sms-sent' };
      }
      return state;
    case 'back-to-magic-link':
      // User gives up on SMS and returns to the magic-link-sent pane.
      if (state.kind === 'sms-sent') return { kind: 'magic-link-sent' };
      return state;
    case 'reset-to-idle':
      return { kind: 'idle' };
    default:
      return state;
  }
}

function SignInCardV2({
  email,
  setEmail,
  redirectTo,
  showInactivityMessage,
  showSessionExpiredMessage,
  signinExiting,
  anticipating,
  isPending: externalPending,
  prefersReducedMotion,
  onModeSwitch,
  onPasskeyPendingChange,
  authV2Sms = false,
}: SignInCardProps) {
  const initialUi: UiState = showSessionExpiredMessage
    ? { kind: 'session-expired' }
    : { kind: 'idle' };
  const [ui, dispatch] = useReducer(reducer, initialUi);
  const [isResolving, startResolve] = useTransition();
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [magicLinkElevated, setMagicLinkElevated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signInEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const exitDuration = prefersReducedMotion ? 0.3 : 0.28;
  const isPending =
    externalPending || isResolving || passkeyPending || ui.kind === 'checking';

  // Resolve device-aware copy once per render. UA lives on navigator.
  const deviceCopy = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return getDeviceCopy(deviceCapabilityFromUserAgentClass(classifyUserAgent(ua)));
  }, []);

  // Session-expired: auto-fire conditional mediation on mount. The
  // dedicated hook handles the 220ms delay + one-shot guard.
  useConditionalMediation({
    enabled: ui.kind === 'session-expired',
    redirectTo,
    autoFire: ui.kind === 'session-expired',
    onError: (err) => setLastError(err),
  });

  // Clear 30s passkey-timeout on unmount / state change.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const elevateFallbackAfterTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setMagicLinkElevated(true);
      dispatch({ type: 'passkey-timeout' });
    }, 30_000);
  }, []);

  const runPasskeyCeremony = useCallback(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setPasskeyPending(true);
    setLastError(null);
    onPasskeyPendingChange(true);
    elevateFallbackAfterTimeout();

    authenticatePasskey({ email: trimmed, redirectTo })
      .then((result) => {
        if (result.ok) return;
        // Cancellation shapes. Treat as user-initiated: drop back to idle,
        // no error banner. Any other shape we surface.
        const isCancel =
          /canceled|cancelled|NotAllowedError|AbortError|permission denied|user dismissed|user cancell?ed/i.test(
            result.error,
          );
        if (isCancel) {
          dispatch({ type: 'passkey-cancelled' });
          return;
        }
        setLastError(result.error);
      })
      .finally(() => {
        setPasskeyPending(false);
        onPasskeyPendingChange(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      });
  }, [email, redirectTo, onPasskeyPendingChange, elevateFallbackAfterTimeout]);

  const handleContinue = useCallback(() => {
    if (!signInEmailValid || isPending) return;
    const trimmed = email.trim().toLowerCase();
    setLastError(null);
    setMagicLinkElevated(false);
    dispatch({ type: 'continue-pressed' });

    startResolve(async () => {
      const result = await resolveContinueAction(trimmed);
      if (result.kind === 'passkey') {
        dispatch({ type: 'resolved-passkey' });
        // Kick off WebAuthn immediately after state transitions in — the
        // user expects a Face ID prompt, not another click.
        runPasskeyCeremony();
      } else if (result.kind === 'magic-link') {
        dispatch({ type: 'resolved-magic-link' });
      } else if (result.kind === 'unknown') {
        // Only reachable when the email failed schema validation — the
        // three post-validation branches all map to `magic-link`.
        dispatch({ type: 'resolved-unknown' });
      } else {
        // session-expired / other: treat as magic-link for safety.
        dispatch({ type: 'resolved-magic-link' });
      }
    });
  }, [email, signInEmailValid, isPending, runPasskeyCeremony]);

  const handleResend = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLastError(null);
    dispatch({ type: 'resend' });
    startResolve(async () => {
      const result = await sendMagicLinkAction(trimmed);
      if (!result.ok) {
        setLastError(result.error);
        dispatch({ type: 'reset-to-idle' });
        return;
      }
      dispatch({ type: 'resolved-magic-link' });
    });
  }, [email]);

  const handleUseDifferentEmail = useCallback(() => {
    setLastError(null);
    setEmail('');
    dispatch({ type: 'reset-to-idle' });
  }, [setEmail]);

  const handleUseMagicLinkInstead = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLastError(null);
    startResolve(async () => {
      const result = await sendMagicLinkAction(trimmed);
      if (!result.ok) {
        setLastError(result.error);
        return;
      }
      dispatch({ type: 'resolved-magic-link' });
    });
  }, [email]);

  // ── SMS code path (Phase 6) ─────────────────────────────────────
  const [smsCode, setSmsCode] = useState('');
  const [smsSubmitting, setSmsSubmitting] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);

  const handleUseSmsCodeInstead = useCallback(async () => {
    if (!authV2Sms) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLastError(null);
    setSmsError(null);
    setSmsCode('');
    startResolve(async () => {
      const result = await sendSmsOtpAction({ email: trimmed });
      if (!result.ok) {
        // Use the dedicated error surface on the SMS pane rather than
        // the global banner — the user is now on the SMS flow and the
        // error should sit next to the input.
        setSmsError(result.error);
        // Even on error, transition to the SMS pane so the user sees
        // the failure in context (matching the design language of
        // "you asked for SMS, here's what happened").
        dispatch({ type: 'sms-dispatched' });
        return;
      }
      dispatch({ type: 'sms-dispatched' });
    });
  }, [authV2Sms, email]);

  const handleSmsResend = useCallback(async () => {
    if (!authV2Sms) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSmsError(null);
    setSmsCode('');
    startResolve(async () => {
      const result = await sendSmsOtpAction({ email: trimmed });
      if (!result.ok) setSmsError(result.error);
    });
  }, [authV2Sms, email]);

  const handleSmsSubmit = useCallback(async () => {
    if (!authV2Sms) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    // Treat leading/trailing whitespace as user-friendly and strip any
    // spaces the SMS app may have auto-inserted between digit groups.
    const normalizedCode = smsCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
      setSmsError('Enter the 6-digit code.');
      return;
    }

    setSmsSubmitting(true);
    setSmsError(null);
    try {
      const result = await verifySmsOtpAction({ email: trimmed, code: normalizedCode });
      if (!result.ok) {
        setSmsError(result.error);
        return;
      }
      // On success, verifySmsOtpAction has already set cookies on this
      // request. Navigate to the redirect target (or /lobby) — middleware
      // Rule 4 routes portal and client roles to their correct home.
      window.location.href =
        redirectTo && redirectTo.startsWith('/') ? redirectTo : '/lobby';
    } finally {
      setSmsSubmitting(false);
    }
  }, [authV2Sms, email, redirectTo, smsCode]);

  const handleSmsBack = useCallback(() => {
    setSmsCode('');
    setSmsError(null);
    dispatch({ type: 'back-to-magic-link' });
  }, []);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key="signin"
        layout
        style={GPU_STABILIZE}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          prefersReducedMotion
            ? {
                opacity: 0,
                filter: 'blur(4px)',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 0,
                transition: { duration: exitDuration, ease: 'easeOut' },
              }
            : {
                opacity: 0,
                scale: 0.96,
                filter: 'blur(8px)',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 0,
                transition: STAGE_HEAVY,
              }
        }
        transition={STAGE_HEAVY}
        className={`w-full max-w-md mx-auto ${signinExiting || anticipating ? 'pointer-events-none' : ''}`}
      >
        <div
          className="stage-panel relative overflow-hidden p-[var(--stage-padding)]"
          style={{ viewTransitionName: 'auth-card' } as React.CSSProperties}
          data-surface="card"
        >
          <div className="relative z-10">
            {/* Logo + wordmark */}
            <div className="text-center mb-6">
              <motion.div
                layoutId="auth-logo"
                layout
                animate={anticipating ? { scale: 0.95 } : { scale: 1 }}
                transition={STAGE_HEAVY}
                style={{ ...GPU_STABILIZE, viewTransitionName: 'auth-logo' } as React.CSSProperties}
                className="mx-auto flex items-center justify-center overflow-visible isolate relative z-10"
              >
                <LivingLogo size="lg" status={isPending ? 'loading' : 'idle'} />
              </motion.div>
              <div className="mt-3 text-center">
                <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">
                  Unusonic
                </p>
              </div>
            </div>

            <motion.div
              animate={{ opacity: signinExiting || anticipating ? 0 : 1 }}
              transition={
                signinExiting ? M3_CONTENT_EXIT_TRANSITION : { duration: 0.2, ease: M3_EASING_ENTER }
              }
              className="gpu-accelerated"
            >
              {/* Reason banners */}
              {showInactivityMessage && (
                <div className="stage-panel-nested stage-stripe-info px-4 py-2.5 mb-4">
                  <p className="text-sm text-[var(--stage-text-secondary)] text-center">
                    You were signed out after a period of inactivity.
                  </p>
                </div>
              )}
              {showSessionExpiredMessage && !showInactivityMessage && (
                <div className="stage-panel-nested stage-stripe-info px-4 py-2.5 mb-4">
                  <p className="text-sm text-[var(--stage-text-secondary)] text-center">
                    {deviceCopy.sessionResumeTitle}.
                  </p>
                </div>
              )}

              {/* Main state machine body — flat dispatcher, no nested
                  ternary. `StateBody` is a plain component, not a hook
                  call, so ref-safety lint stays happy. */}
              <div className="space-y-3" data-testid="signin-card-body">
                <AnimatePresence mode="wait" initial={false}>
                  <StateBody
                    ui={ui}
                    email={email}
                    setEmail={setEmail}
                    signInEmailValid={signInEmailValid}
                    isPending={isPending}
                    deviceCopy={deviceCopy}
                    magicLinkElevated={magicLinkElevated}
                    handleContinue={handleContinue}
                    runPasskeyCeremony={runPasskeyCeremony}
                    handleUseMagicLinkInstead={handleUseMagicLinkInstead}
                    handleResend={handleResend}
                    handleUseDifferentEmail={handleUseDifferentEmail}
                    authV2Sms={authV2Sms}
                    handleUseSmsCodeInstead={handleUseSmsCodeInstead}
                    smsCode={smsCode}
                    setSmsCode={setSmsCode}
                    smsSubmitting={smsSubmitting}
                    smsError={smsError}
                    handleSmsSubmit={handleSmsSubmit}
                    handleSmsResend={handleSmsResend}
                    handleSmsBack={handleSmsBack}
                  />
                </AnimatePresence>

                {/* Error surface — suppressed when state is idle/checking
                    and error is a cancellation (see reducer). */}
                <AnimatePresence>
                  {lastError ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={STAGE_LIGHT}
                      className="overflow-hidden"
                    >
                      <div className="stage-panel-nested stage-stripe-error p-3">
                        <AuthErrorBlock error={lastError} />
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* Footer actions — always visible so the user has an
                    escape regardless of state. */}
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => onModeSwitch('signup')}
                    disabled={isPending}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed text-center"
                  >
                    Create account
                  </button>
                  <p className="text-center">
                    <a
                      href="/recover"
                      className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                    >
                      Can&apos;t sign in?
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────
// State-body dispatcher — flat, no nested ternary.
// ────────────────────────────────────────────────────────────────────

interface StateBodyProps {
  ui: UiState;
  email: string;
  setEmail: (v: string) => void;
  signInEmailValid: boolean;
  isPending: boolean;
  deviceCopy: ReturnType<typeof getDeviceCopy>;
  magicLinkElevated: boolean;
  handleContinue: () => void;
  runPasskeyCeremony: () => void;
  handleUseMagicLinkInstead: () => void;
  handleResend: () => void;
  handleUseDifferentEmail: () => void;
  /** Phase 6 — client flag mirror; gates the "Send SMS code" button. */
  authV2Sms: boolean;
  handleUseSmsCodeInstead: () => void;
  smsCode: string;
  setSmsCode: (v: string) => void;
  smsSubmitting: boolean;
  smsError: string | null;
  handleSmsSubmit: () => void;
  handleSmsResend: () => void;
  handleSmsBack: () => void;
}

function StateBody(a: StateBodyProps): React.ReactNode {
  const motionProps = {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: STAGE_MEDIUM,
    className: 'space-y-3',
  } as const;

  if (a.ui.kind === 'idle' || a.ui.kind === 'checking') {
    return (
      <motion.div key="idle-checking" {...motionProps}>
        <IdleOrCheckingView
          email={a.email}
          setEmail={a.setEmail}
          signInEmailValid={a.signInEmailValid}
          isPending={a.isPending}
          isChecking={a.ui.kind === 'checking'}
          onContinue={a.handleContinue}
          deviceCopy={a.deviceCopy}
        />
      </motion.div>
    );
  }
  if (a.ui.kind === 'passkey' || a.ui.kind === 'session-expired') {
    return (
      <motion.div key="passkey" {...motionProps}>
        <PasskeyView
          email={a.email}
          deviceCopy={a.deviceCopy}
          magicLinkElevated={a.magicLinkElevated}
          isPending={a.isPending}
          sessionResume={a.ui.kind === 'session-expired'}
          onRetry={a.runPasskeyCeremony}
          onUseMagicLinkInstead={a.handleUseMagicLinkInstead}
        />
      </motion.div>
    );
  }
  if (a.ui.kind === 'sms-sent') {
    return (
      <motion.div key="sms-sent" {...motionProps}>
        <SmsSentView
          email={a.email}
          isPending={a.isPending || a.smsSubmitting}
          code={a.smsCode}
          setCode={a.setSmsCode}
          error={a.smsError}
          onSubmit={a.handleSmsSubmit}
          onResend={a.handleSmsResend}
          onBack={a.handleSmsBack}
        />
      </motion.div>
    );
  }
  return (
    <motion.div key="magic-link-sent" {...motionProps}>
      <MagicLinkSentView
        email={a.email}
        isPending={a.isPending}
        onResend={a.handleResend}
        onUseDifferentEmail={a.handleUseDifferentEmail}
        authV2Sms={a.authV2Sms}
        onUseSmsCodeInstead={a.handleUseSmsCodeInstead}
      />
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-views (kept in-file so the state machine is one readable unit)
// ────────────────────────────────────────────────────────────────────

function IdleOrCheckingView(props: {
  email: string;
  setEmail: (v: string) => void;
  signInEmailValid: boolean;
  isPending: boolean;
  isChecking: boolean;
  onContinue: () => void;
  deviceCopy: ReturnType<typeof getDeviceCopy>;
}) {
  const { email, setEmail, signInEmailValid, isPending, isChecking, onContinue } = props;

  return (
    <>
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username webauthn"
        aria-label="Email address"
        required
        disabled={isPending}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && signInEmailValid && !isPending) {
            e.preventDefault();
            onContinue();
          }
        }}
        className="stage-input"
        placeholder="you@example.com"
        data-testid="signin-email-input"
      />

      <motion.button
        type="button"
        onClick={onContinue}
        disabled={!signInEmailValid || isPending}
        transition={STAGE_HEAVY}
        className={`stage-btn stage-btn-primary w-full flex items-center justify-center gap-2 ${isChecking ? 'stage-skeleton' : ''}`}
        data-testid="signin-continue-button"
        aria-busy={isChecking}
      >
        {isChecking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" strokeWidth={1.5} />
            Checking…
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </>
        )}
      </motion.button>
    </>
  );
}

function PasskeyView(props: {
  email: string;
  deviceCopy: ReturnType<typeof getDeviceCopy>;
  magicLinkElevated: boolean;
  isPending: boolean;
  sessionResume: boolean;
  onRetry: () => void;
  onUseMagicLinkInstead: () => void;
}) {
  const {
    email,
    deviceCopy,
    magicLinkElevated,
    isPending,
    sessionResume,
    onRetry,
    onUseMagicLinkInstead,
  } = props;

  return (
    <>
      <div className="stage-panel-nested px-4 py-3">
        <p className="text-sm text-[var(--stage-text-secondary)] text-center">
          {sessionResume ? deviceCopy.sessionResumeTitle : deviceCopy.pendingStatus}
        </p>
        {email ? (
          <p className="text-xs text-[var(--stage-text-secondary)] text-center mt-1">
            {email}
          </p>
        ) : null}
      </div>

      <motion.button
        type="button"
        onClick={onRetry}
        disabled={isPending}
        transition={STAGE_HEAVY}
        className="stage-btn stage-btn-primary w-full flex items-center justify-center gap-2"
        data-testid="signin-passkey-button"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" strokeWidth={1.5} />
            {deviceCopy.pendingStatus}
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
            {deviceCopy.signInPrimaryCta}
          </>
        )}
      </motion.button>

      {/* Magic-link fallback — visible from moment 1, elevates after 30s timeout. */}
      <button
        type="button"
        onClick={onUseMagicLinkInstead}
        disabled={isPending}
        className={
          magicLinkElevated
            ? 'stage-btn stage-btn-secondary w-full flex items-center justify-center gap-2'
            : 'w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed text-center'
        }
        data-testid="signin-use-magic-link-instead"
      >
        {magicLinkElevated ? (
          <>
            <Mail className="w-4 h-4" strokeWidth={1.5} />
            Use magic link instead
          </>
        ) : (
          'Use magic link instead'
        )}
      </button>
    </>
  );
}

function MagicLinkSentView(props: {
  email: string;
  isPending: boolean;
  onResend: () => void;
  onUseDifferentEmail: () => void;
  /**
   * Phase 6. When true, renders the "Send SMS code instead" ghost
   * button below the primary actions. Only exposed on this state
   * (post enumeration-safe "check your email" response) to avoid
   * leaking workspace opt-in status on the idle/checking screens.
   */
  authV2Sms: boolean;
  onUseSmsCodeInstead: () => void;
}) {
  const {
    email,
    isPending,
    onResend,
    onUseDifferentEmail,
    authV2Sms,
    onUseSmsCodeInstead,
  } = props;
  return (
    <>
      <div className="stage-panel-nested px-4 py-3 text-center space-y-1">
        <p className="text-sm text-[var(--stage-text-primary)] flex items-center justify-center gap-2">
          <Mail className="w-4 h-4" strokeWidth={1.5} />
          Check your email
        </p>
        {email ? (
          <p className="text-xs text-[var(--stage-text-secondary)]">
            We sent a link to {email}.
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onResend}
          disabled={isPending}
          className="stage-btn stage-btn-secondary flex-1 flex items-center justify-center gap-2"
          data-testid="signin-resend-button"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
          )}
          Resend
        </button>
        <button
          type="button"
          onClick={onUseDifferentEmail}
          disabled={isPending}
          className="stage-btn stage-btn-ghost flex-1"
          data-testid="signin-different-email-button"
        >
          Use different email
        </button>
      </div>

      {authV2Sms ? (
        <button
          type="button"
          onClick={onUseSmsCodeInstead}
          disabled={isPending}
          className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed text-center flex items-center justify-center gap-2"
          data-testid="signin-use-sms-instead"
        >
          <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
          Send SMS code instead
        </button>
      ) : null}
    </>
  );
}

function SmsSentView(props: {
  email: string;
  isPending: boolean;
  code: string;
  setCode: (v: string) => void;
  error: string | null;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const { email, isPending, code, setCode, error, onSubmit, onResend, onBack } = props;
  return (
    <>
      <div className="stage-panel-nested px-4 py-3 text-center space-y-1">
        <p className="text-sm text-[var(--stage-text-primary)] flex items-center justify-center gap-2">
          <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
          Check your phone
        </p>
        {email ? (
          <p className="text-xs text-[var(--stage-text-secondary)]">
            If {email} has SMS sign-in enabled, we sent a 6-digit code.
          </p>
        ) : null}
      </div>

      <label htmlFor="sms-code" className="sr-only">
        Six-digit SMS code
      </label>
      <input
        id="sms-code"
        name="sms-code"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
        disabled={isPending}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isPending && code.length === 6) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="stage-input text-center tracking-widest"
        placeholder="000000"
        data-testid="signin-sms-code-input"
      />

      {error ? (
        <p
          className="text-sm text-[var(--color-unusonic-error)] text-center"
          role="alert"
          data-testid="signin-sms-error"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending || code.length !== 6}
        className="stage-btn stage-btn-primary w-full flex items-center justify-center gap-2"
        data-testid="signin-sms-verify-button"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" strokeWidth={1.5} />
            Verifying…
          </>
        ) : (
          <>
            Verify code
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </>
        )}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onResend}
          disabled={isPending}
          className="stage-btn stage-btn-secondary flex-1 flex items-center justify-center gap-2"
          data-testid="signin-sms-resend-button"
        >
          <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
          Resend code
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="stage-btn stage-btn-ghost flex-1"
          data-testid="signin-sms-back-button"
        >
          Use email instead
        </button>
      </div>
    </>
  );
}
