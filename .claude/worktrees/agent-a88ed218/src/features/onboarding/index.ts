/**
 * Signal Onboarding – Public API
 * @module features/onboarding
 */

export { PersonaStep } from './ui/PersonaStep';
export { IonOnboardingShell } from './ui/ion-onboarding-shell';
export { OnboardingChatInput } from './ui/onboarding-chat-input';
export { TierStep } from './ui/TierStep';
export { GenesisOrchestrator } from './ui/genesis-orchestrator';
export { WebsiteStep } from './ui/website-step';
export type { ScoutOnboardingPayload } from './ui/website-step';
export { NexusInput } from './ui/nexus-input';
export { GhostClaimCard } from './ui/ghost-claim-card';
export { GenesisCreateCard } from './ui/genesis-create-card';
export { scoutCompanyForOnboarding } from './actions/scout-for-onboarding';
export type { ScoutForOnboardingResult } from './actions/scout-for-onboarding';
export { initializeOrganization } from './actions/complete-setup';
export type { InitializeOrganizationInput, InitializeOrganizationResult, OrganizationType } from './actions/complete-setup';
export { processCortexCompletion, getInitialOnboardingContext } from './actions/process-cortex-completion';
export type { ProcessCortexCompletionResult, InitialOnboardingContext } from './actions/process-cortex-completion';
export type { NexusResult, GhostOrgPreview, OnboardingGenesisContext } from './model/types';
export * from './model/subscription-types';
export * from './model/schema';
