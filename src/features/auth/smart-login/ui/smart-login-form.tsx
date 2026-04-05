/**
 * Smart Login Form — Orchestrator
 * Composes SignInCard and SignUpFlow with shared layout transitions.
 * @module features/auth/smart-login/ui/smart-login-form
 */

'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { SignInCard } from './sign-in-card';
import { SignUpFlow } from './sign-up-flow';
import type { AuthMode } from '../model/types';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

interface SmartLoginFormProps {
  redirectTo?: string;
  defaultMode?: AuthMode;
  defaultEmail?: string;
  showInactivityMessage?: boolean;
  showSessionExpiredMessage?: boolean;
}

export function SmartLoginForm({
  redirectTo,
  defaultMode = 'signin',
  defaultEmail,
  showInactivityMessage = false,
  showSessionExpiredMessage = false,
}: SmartLoginFormProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [fullName, setFullName] = useState('');

  // Transition animation state
  const [signinExiting, setSigninExiting] = useState(false);
  const [signupExiting, setSignupExiting] = useState(false);
  const [anticipating, setAnticipating] = useState(false);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  const [fromSignIn, setFromSignIn] = useState(defaultMode !== 'signup');

  // Respect prefers-reduced-motion via useSyncExternalStore (no setState in effect)
  const prefersReducedMotion = useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false, // server snapshot
  );

  // Anticipation: 100ms scale-down before Sign In exits and logo morphs
  useEffect(() => {
    if (!anticipating) return;
    const id = setTimeout(() => {
      setSigninExiting(true);
      setAnticipating(false);
    }, 100);
    return () => clearTimeout(id);
  }, [anticipating]);

  const handleModeSwitch = useCallback((newMode: AuthMode) => {
    if (newMode === 'signin') {
      setFullName('');
      setSigninExiting(false);
      setAnticipating(false);
      if (mode === 'signup') {
        setSignupExiting(true);
      } else {
        setMode('signin');
      }
    } else {
      setSignupExiting(false);
      setFromSignIn(true);
      setAnticipating(true);
      setMode('signup');
    }
  }, [mode]);

  const handleSignupExitComplete = useCallback(() => {
    setSignupExiting(false);
    setMode('signin');
  }, []);

  const showSignIn = mode === 'signin' || signinExiting || anticipating || signupExiting;
  const showSignUp = mode === 'signup' || signupExiting;

  return (
    <LayoutGroup>
      <motion.div
        layout
        transition={STAGE_HEAVY}
        className="relative w-full min-h-screen flex items-center justify-center"
      >
        {showSignUp && (
          <SignUpFlow
            email={email}
            setEmail={setEmail}
            fullName={fullName}
            setFullName={setFullName}
            redirectTo={redirectTo}
            defaultMode={defaultMode}
            fromSignIn={fromSignIn}
            signupExiting={signupExiting}
            onExitComplete={handleSignupExitComplete}
            onModeSwitch={handleModeSwitch}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}
        {showSignIn && (
          <SignInCard
            email={email}
            setEmail={setEmail}
            redirectTo={redirectTo}
            showInactivityMessage={showInactivityMessage}
            showSessionExpiredMessage={showSessionExpiredMessage}
            signinExiting={signinExiting}
            anticipating={anticipating}
            isPending={isPasskeyPending}
            prefersReducedMotion={prefersReducedMotion}
            onModeSwitch={handleModeSwitch}
            onPasskeyPendingChange={setIsPasskeyPending}
          />
        )}
      </motion.div>
    </LayoutGroup>
  );
}
