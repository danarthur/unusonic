/**
 * Onboarding Wizard – Aion conversation flow
 * Profile → Website (Aion lookup) → Genesis: feels like chatting with Aion
 * @module app/(auth)/onboarding/components/onboarding-wizard
 */

'use client';

import { useState, useTransition, useRef, useCallback, useEffect } from 'react';
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
}

const STEPS = 3;

export function OnboardingWizard({ initialState }: OnboardingWizardProps) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const computeInitialStep = () => {
    if (initialState.profile.fullName && initialState.hasWorkspace) return STEPS - 1;
    if (initialState.profile.fullName?.trim()) return Math.max(1, Math.min(initialState.profile.onboardingStep, STEPS - 1));
    return Math.min(initialState.profile.onboardingStep, STEPS - 1);
  };

  const minStep = initialState.profile.fullName?.trim() ? 1 : 0;

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
      await updateOnboardingStep(1);
      setProfileSubmitted(true);
      setTimeout(() => {
        setProfileSubmitted(false);
        goToStep(1, 0);
      }, 350);
    });
  };

  const handleUseScout = (payload: ScoutOnboardingPayload) => {
    setError(null);
    setScoutPayload(payload);
    const from = currentStep;
    startTransition(async () => {
      await updateOnboardingStep(2);
      goToStep(2, from);
    });
  };

  const handleSkipWebsite = () => {
    setError(null);
    setScoutPayload(null);
    const from = currentStep;
    startTransition(async () => {
      await updateOnboardingStep(2);
      goToStep(2, from);
    });
  };

  const handleBack = () => {
    if (currentStep > minStep) {
      goToStep(currentStep - 1, currentStep);
      setError(null);
    }
  };

  const onBack = currentStep > minStep ? handleBack : undefined;

  return (
    <AionOnboardingShell
      prompt={
        currentStep === 0
          ? 'What should we call you?'
          : currentStep === 1
            ? "Let's build your studio"
            : 'Name your workspace'
      }
      logoStatus={currentStep === 2 ? genesisLogoStatus : 'idle'}
      stepIndex={currentStep}
      stepTotal={STEPS}
      onBack={onBack}
      contentMaxWidth={currentStep === 1 ? '2xl' : 'lg'}
      hideStepIndicator
      footer={
        currentStep === 0 ? (
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
        {currentStep === 0 && (
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

        {currentStep === 1 && (
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

        {currentStep === 2 && (
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
