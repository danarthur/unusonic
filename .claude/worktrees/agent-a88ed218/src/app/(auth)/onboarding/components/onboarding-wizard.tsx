/**
 * Onboarding Wizard – ION conversation flow
 * Profile → Website (ION lookup) → Genesis: feels like chatting with ION
 * @module app/(auth)/onboarding/components/onboarding-wizard
 */

'use client';

import { useState, useTransition, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Camera, Loader2, X, ArrowRight } from 'lucide-react';
import {
  updateProfile,
  updateOnboardingStep,
  uploadAvatar,
} from '@/features/identity-hydration';
import { GenesisOrchestrator } from '@/features/onboarding';
import { IonOnboardingShell } from '@/features/onboarding/ui/ion-onboarding-shell';
import { OnboardingChatInput } from '@/features/onboarding/ui/onboarding-chat-input';
import { WebsiteStep } from '@/features/onboarding/ui/website-step';
import type { ScoutOnboardingPayload } from '@/features/onboarding/ui/website-step';
import type { LivingLogoStatus } from '@/shared/ui/branding/living-logo';

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
const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };

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
  const [fullName, setFullName] = useState(initialState.profile.fullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialState.profile.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [scoutPayload, setScoutPayload] = useState<ScoutOnboardingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genesisLogoStatus, setGenesisLogoStatus] = useState<LivingLogoStatus>('idle');

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
      setCurrentStep(1);
    });
  };

  const handleUseScout = (payload: ScoutOnboardingPayload) => {
    setError(null);
    setScoutPayload(payload);
    startTransition(async () => {
      await updateOnboardingStep(2);
      setCurrentStep(2);
    });
  };

  const handleSkipWebsite = () => {
    setError(null);
    setScoutPayload(null);
    startTransition(async () => {
      await updateOnboardingStep(2);
      setCurrentStep(2);
    });
  };

  const handleBack = () => {
    if (currentStep > minStep) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const onBack = currentStep > minStep ? handleBack : undefined;

  return (
    <IonOnboardingShell
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
      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={springConfig}
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-24 h-24 rounded-2xl border-2 border-dashed border-[var(--glass-border)]
                  hover:border-walnut/40 bg-ink/[0.02] flex items-center justify-center overflow-hidden"
              >
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-ink/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-5 h-5 text-ceramic" />
                    </div>
                  </>
                ) : avatarUploading ? (
                  <Loader2 className="w-6 h-6 text-ink-muted animate-spin" />
                ) : (
                  <User className="w-8 h-8 text-ink-muted/50" />
                )}
              </motion.button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setAvatarUrl(null); }}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-signal-error text-ceramic flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-ceramic/40">{initialState.user.email}</p>
            {error && (
              <p className="text-sm text-signal-error">{error}</p>
            )}
          </motion.div>
        )}

        {currentStep === 1 && (
          <motion.div
            key="website"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={springConfig}
            className="w-full"
          >
            <WebsiteStep onUseScout={handleUseScout} onSkip={handleSkipWebsite} />
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div
            key="genesis"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={springConfig}
            className="w-full"
          >
            <GenesisOrchestrator
              onboardingContext={{
                persona: scoutPayload?.suggestedPersona ?? 'solo_professional',
                suggestedTier: scoutPayload?.suggestedTier,
                scoutData: scoutPayload?.data,
              }}
              contentOnly
              onLogoStatusChange={setGenesisLogoStatus}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </IonOnboardingShell>
  );
}
