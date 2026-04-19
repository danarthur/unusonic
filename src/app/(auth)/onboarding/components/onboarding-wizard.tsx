/**
 * Onboarding Wizard – Aion conversation flow
 * Profile → Website (Aion lookup) → Genesis: feels like chatting with Aion
 * @module app/(auth)/onboarding/components/onboarding-wizard
 */

'use client';

import { useState, useTransition, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Sentry from '@sentry/nextjs';
import { User, Camera, Loader2, X, Check } from 'lucide-react';
import {
  updateProfile,
  updateOnboardingStep,
  uploadAvatar,
  claimGhostEntities,
} from '@/features/identity-hydration';
import { GenesisOrchestrator } from '@/features/onboarding';
import { AionOnboardingShell } from '@/features/onboarding/ui/aion-onboarding-shell';
import { OnboardingChatInput } from '@/features/onboarding/ui/onboarding-chat-input';
import { WebsiteStep } from '@/features/onboarding/ui/website-step';
import { GuardianSetupStep, type GuardianStepDecision } from '@/features/onboarding/ui/guardian-setup-step';
import type { ScoutOnboardingPayload } from '@/features/onboarding/ui/website-step';
import type { UserPersona } from '@/features/onboarding/model/subscription-types';
import type { LivingLogoStatus } from '@/shared/ui/branding/living-logo';
import { M3_EASING_ENTER, M3_EASING_EXIT, STAGE_HEAVY } from '@/shared/lib/motion-constants';

interface OnboardingState {
  user: { id: string; email: string };
  profile: {
    fullName: string;
    avatarUrl: string | null;
    onboardingStep: number;
  };
  hasWorkspace: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
}

interface OnboardingWizardProps {
  initialState: OnboardingState;
  /**
   * When true (Phase 5), a non-skippable guardian setup step is inserted
   * between the website step and workspace genesis. Resolved on the server
   * from the `AUTH_V2_GUARDIAN_GATE` flag so we don't need to expose the
   * flag via NEXT_PUBLIC_*.
   */
  guardianGateEnabled?: boolean;
}

type StepId = 'profile' | 'website' | 'guardian' | 'genesis';

export function OnboardingWizard({
  initialState,
  guardianGateEnabled = false,
}: OnboardingWizardProps) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ordered step list. Guardian gate is a true gate: when the flag is on, the
  // step exists between website and genesis, and the wizard's state machine
  // refuses to advance past it without an explicit decision. When the flag is
  // off, the list collapses to the legacy three-step flow byte-for-byte.
  const stepIds = useMemo<StepId[]>(
    () => (guardianGateEnabled ? ['profile', 'website', 'guardian', 'genesis'] : ['profile', 'website', 'genesis']),
    [guardianGateEnabled],
  );

  const indexOf = useCallback(
    (id: StepId) => stepIds.indexOf(id),
    [stepIds],
  );

  const [guardianDecided, setGuardianDecided] = useState(false);

  const computeInitialStep = () => {
    const last = stepIds.length - 1;
    if (initialState.profile.fullName && initialState.hasWorkspace) return last;
    const cap = guardianGateEnabled ? Math.min(last - 1, indexOf('guardian')) : last;
    const websiteIdx = indexOf('website');
    if (initialState.profile.fullName?.trim()) {
      return Math.max(websiteIdx, Math.min(initialState.profile.onboardingStep, cap));
    }
    return Math.min(initialState.profile.onboardingStep, cap);
  };

  const minStep = initialState.profile.fullName?.trim() ? indexOf('website') : 0;

  const [currentStep, setCurrentStep] = useState(computeInitialStep);
  const [slideX, setSlideX] = useState(24);

  const goToStep = useCallback((next: number, prev: number) => {
    if (prev !== next) {
      setSlideX((next > prev ? 1 : -1) * 24);
    }
    setCurrentStep(next);
  }, []);

  // Silent ghost entity claim — fire-and-forget on mount.
  // If this user's email matches any ghost CLIENT entities, claim them and
  // create workspace memberships. The workspaces appear in the switcher
  // after onboarding completes. No UI interruption (Phase 2).
  useEffect(() => {
    claimGhostEntities().catch((err: unknown) => {
      Sentry.captureException(err, { tags: { area: 'onboarding.ghost-claim' } });
    });
  }, []);

  const [fullName, setFullName] = useState(initialState.profile.fullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialState.profile.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [scoutPayload, setScoutPayload] = useState<ScoutOnboardingPayload | null>(null);
  const [manualPersona, setManualPersona] = useState<UserPersona>('solo_professional');
  const [error, setError] = useState<string | null>(null);
  const [genesisLogoStatus, setGenesisLogoStatus] = useState<LivingLogoStatus>('idle');
  const [profileSubmitted, setProfileSubmitted] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('avatar', file);
    const result = await uploadAvatar(formData);
    if (result.success && result.avatarUrl) setAvatarUrl(result.avatarUrl);
    else setError(result.error || 'Failed to upload avatar');
    setAvatarUploading(false);
  };

  const handleProfileSubmit = () => {
    setError(null);
    if (!fullName.trim()) {
      setError('Enter your name');
      return;
    }
    startTransition(async () => {
      const result = await updateProfile({ fullName: fullName.trim() });
      if (!result.success) {
        setError(result.error || 'Could not save profile');
        return;
      }
      const next = indexOf('website');
      await updateOnboardingStep(next);
      setProfileSubmitted(true);
      setTimeout(() => {
        setProfileSubmitted(false);
        goToStep(next, currentStep);
      }, 350);
    });
  };

  // After the website step, advance to the next step in the list \u2014 that\u2019s
  // the guardian gate when Phase 5 is on, otherwise genesis. The wizard
  // refuses to advance past the guardian gate without a recorded decision
  // (see `handleGuardianDecision`).
  const advanceFromWebsite = (payload: ScoutOnboardingPayload | null) => {
    setError(null);
    setScoutPayload(payload);
    const from = currentStep;
    const nextId: StepId = guardianGateEnabled ? 'guardian' : 'genesis';
    const next = indexOf(nextId);
    startTransition(async () => {
      await updateOnboardingStep(next);
      goToStep(next, from);
    });
  };

  const handleUseScout = (payload: ScoutOnboardingPayload) => {
    advanceFromWebsite(payload);
  };

  const handleSkipWebsite = () => {
    advanceFromWebsite(null);
  };

  // Guardian gate resolution. Both outcomes advance to genesis; the only
  // difference is the recorded deferral flag (owned by the server action).
  // No third exit: the step itself blocks any attempt to move on without a
  // decision, and the wizard's state machine refuses to increment past the
  // guardian index until this runs.
  const handleGuardianDecision = useCallback(
    (_decision: GuardianStepDecision) => {
      setGuardianDecided(true);
      const from = currentStep;
      const next = indexOf('genesis');
      startTransition(async () => {
        await updateOnboardingStep(next);
        goToStep(next, from);
      });
    },
    [currentStep, indexOf, goToStep],
  );

  const handleBack = () => {
    // Block rewinding past the guardian gate once a decision has been
    // recorded. The user can still go forward (genesis) but cannot reopen
    // the gate they already answered. Back from the guardian step itself
    // to the website step is always allowed \u2014 no decision yet.
    const currentId = stepIds[currentStep];
    if (currentId === 'genesis' && guardianDecided) return;
    if (currentStep > minStep) {
      goToStep(currentStep - 1, currentStep);
      setError(null);
    }
  };

  const canGoBack = (() => {
    if (currentStep <= minStep) return false;
    const currentId = stepIds[currentStep];
    if (currentId === 'genesis' && guardianDecided) return false;
    return true;
  })();

  const onBack = canGoBack ? handleBack : undefined;

  const currentId = stepIds[currentStep] ?? 'profile';
  const prompt =
    currentId === 'profile'
      ? 'What should we call you?'
      : currentId === 'website'
        ? "Let's build your studio"
        : currentId === 'guardian'
          ? 'Set up recovery guardians'
          : 'Name your workspace';

  return (
    <AionOnboardingShell
      prompt={prompt}
      logoStatus={currentId === 'genesis' ? genesisLogoStatus : 'idle'}
      stepIndex={currentStep}
      stepTotal={stepIds.length}
      onBack={onBack}
      contentMaxWidth={currentId === 'website' ? '2xl' : 'lg'}
      hideStepIndicator
      footer={
        currentId === 'profile' ? (
          <div className="w-full space-y-4">
            <OnboardingChatInput
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onSubmit={handleProfileSubmit}
              placeholder="Your name"
              isLoading={isPending}
            />
          </div>
        ) : undefined
      }
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {currentId === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER } }}
            exit={{ opacity: 0, x: -slideX, transition: { duration: 0.18, ease: M3_EASING_EXIT } }}
            className="w-full max-w-lg flex flex-col items-center gap-6"
          >
            {/* Avatar */}
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <motion.button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="w-24 h-24 rounded-2xl border-2 border-dashed border-[oklch(1_0_0_/_0.12)]
                  hover:border-[oklch(1_0_0_/_0.20)] bg-[oklch(1_0_0_/_0.03)] transition-[border-color] flex items-center justify-center overflow-hidden"
              >
                {avatarUrl ? (
                  <>
                    <img
                      src={avatarUrl}
                      alt=""
                      loading="lazy"
                      onError={() => setAvatarUrl(null)}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-[oklch(0.10_0_0_/_0.50)] opacity-40 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-5 h-5 text-[var(--stage-text-primary)]" />
                    </div>
                  </>
                ) : avatarUploading ? (
                  <Loader2 className="w-6 h-6 text-[var(--stage-text-secondary)] animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <User className="w-7 h-7 text-[var(--stage-text-secondary)]/50" />
                    <Camera className="w-4 h-4 text-[var(--stage-text-secondary)]/40 group-hover:text-[var(--stage-text-secondary)]/80 transition-colors" />
                  </div>
                )}
              </motion.button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setAvatarUrl(null); }}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[var(--color-unusonic-error)] text-[var(--stage-text-primary)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--stage-text-primary)]/40">{initialState.user.email}</p>
            {error && (
              <p className="text-sm text-unusonic-error">{error}</p>
            )}
            <AnimatePresence mode="wait">
              {profileSubmitted && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.2, 1], opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={STAGE_HEAVY}
                  className="flex items-center justify-center"
                >
                  <Check className="w-6 h-6 text-[var(--color-unusonic-success)]" strokeWidth={1.5} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {currentId === 'website' && (
          <motion.div
            key="website"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER } }}
            exit={{ opacity: 0, x: -slideX, transition: { duration: 0.18, ease: M3_EASING_EXIT } }}
            className="w-full"
          >
            <WebsiteStep onUseScout={handleUseScout} onSkip={handleSkipWebsite} />
          </motion.div>
        )}

        {currentId === 'guardian' && (
          <motion.div
            key="guardian"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER } }}
            exit={{ opacity: 0, x: -slideX, transition: { duration: 0.18, ease: M3_EASING_EXIT } }}
            className="w-full"
          >
            <GuardianSetupStep onDecision={handleGuardianDecision} />
          </motion.div>
        )}

        {currentId === 'genesis' && (
          <motion.div
            key="genesis"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER } }}
            exit={{ opacity: 0, x: -slideX, transition: { duration: 0.18, ease: M3_EASING_EXIT } }}
            className="w-full"
          >
            <GenesisOrchestrator
              onboardingContext={{
                persona: scoutPayload?.suggestedPersona ?? manualPersona,
                suggestedTier: scoutPayload?.suggestedTier,
                scoutData: scoutPayload?.data,
              }}
              contentOnly
              onLogoStatusChange={setGenesisLogoStatus}
              onPersonaChange={setManualPersona}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AionOnboardingShell>
  );
}
