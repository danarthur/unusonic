/**
 * Hook: sign-up step state machine (name → email → passkey).
 * Tracks step index, direction, and transition phase for animations.
 * @module features/auth/smart-login/lib/use-signup-steps
 */

import { useState, useCallback } from 'react';

export type SignupTransitionPhase = 'welcome' | 'name' | null;

export function useSignupSteps(defaultMode: 'signin' | 'signup') {
  const [signupStep, _setSignupStep] = useState(defaultMode === 'signup' ? 1 : 0);
  const [signupTransitionPhase, setSignupTransitionPhase] = useState<SignupTransitionPhase>(null);
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward');

  const isTransitionName = signupTransitionPhase === 'name';

  // Wrapper that auto-tracks direction
  const setSignupStep = useCallback((updater: number | ((prev: number) => number)) => {
    _setSignupStep((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setStepDirection(next > prev ? 'forward' : 'back');
      return next;
    });
  }, []);

  return {
    signupStep,
    setSignupStep,
    signupTransitionPhase,
    setSignupTransitionPhase,
    stepDirection,
    isTransitionName,
  };
}
