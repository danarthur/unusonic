'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LivingLogo, type LivingLogoStatus } from '@/shared/ui/branding/living-logo';
import { OnboardingChatInput } from './onboarding-chat-input';
import { GhostClaimCard } from './ghost-claim-card';
import { GenesisCreateCard } from './genesis-create-card';
import { checkNexusAvailability } from '@/features/onboarding/api/actions';
import type { NexusResult, OnboardingGenesisContext } from '@/features/onboarding/model/types';
import { ArrowRight } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function nameToSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || '';
}

interface GenesisOrchestratorProps {
  /** When set, GenesisCreateCard uses initializeOrganization (first-time onboarding). scoutData pre-fills name/logo/tier. */
  onboardingContext?: OnboardingGenesisContext;
  /** When true, render only input + feedback + cards (no LivingLogo, prompt, or outer wrapper). Parent provides shell. */
  contentOnly?: boolean;
  /** Called when logo status changes (for parent to control LivingLogo when contentOnly) */
  onLogoStatusChange?: (status: LivingLogoStatus) => void;
}

export function GenesisOrchestrator({
  onboardingContext,
  contentOnly = false,
  onLogoStatusChange,
}: GenesisOrchestratorProps) {
  const isEmbedded = !!onboardingContext;
  const scoutName = onboardingContext?.scoutData?.name?.trim() ?? '';
  const initialSlug = nameToSlug(scoutName);
  const hasScoutPrefill = !!(onboardingContext?.scoutData && initialSlug.length >= 2);
  const [name, setName] = useState(scoutName);
  const [slug, setSlug] = useState(initialSlug);
  const [logoStatus, setLogoStatus] = useState<LivingLogoStatus>('idle');
  const [result, setResult] = useState<NexusResult | null>(hasScoutPrefill ? { type: 'VOID' as const } : null);
  const [showCreateForm, setShowCreateForm] = useState(hasScoutPrefill);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDebounceSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setLogoStatus('idle');
      setResult(null);
      return;
    }
    setLogoStatus('thinking');
    const apiResult = await checkNexusAvailability(term);
    setResult(apiResult);
    if (apiResult.type === 'TAKEN') setLogoStatus('error');
    else if (apiResult.type === 'GHOST') setLogoStatus('success');
    else setLogoStatus('idle');
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawName = e.target.value;
      setName(rawName);
      const generatedSlug = nameToSlug(rawName);
      setSlug(generatedSlug);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onDebounceSearch(generatedSlug);
      }, 350);
    },
    [onDebounceSearch]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    onLogoStatusChange?.(logoStatus);
  }, [logoStatus, onLogoStatusChange]);

  const handleSubmit = useCallback(() => {
    if (result?.type === 'VOID' && slug.length >= 2) {
      setShowCreateForm(true);
    }
  }, [result?.type, slug.length]);

  const content = (
    <>
      {/* Natural language input (dashboard chat input) */}
      {!showCreateForm && (
        <div className="w-full max-w-lg text-center relative">
          {!contentOnly && (
            <h1 className="text-sm font-medium uppercase tracking-widest text-ceramic/50 mb-4">
              Name your workspace
            </h1>
          )}

          <OnboardingChatInput
              value={name}
              onChange={handleInput}
              onSubmit={handleSubmit}
              placeholder="Company or Team Name"
              isLoading={logoStatus === 'thinking'}
            />

            {/* Handle feedback (the tech layer) */}
            <div className="mt-6 min-h-[2rem]">
              <AnimatePresence mode="wait">
                {slug.length > 0 && (
                  <motion.div
                    key="handle"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-wrap justify-center items-center gap-2"
                  >
                    <span className="rounded bg-neon-blue/5 px-2 py-1 font-mono text-sm text-neon-blue/80">
                      signal.events/{slug}
                    </span>
                    {logoStatus === 'thinking' && (
                      <span className="animate-pulse text-sm text-ceramic/40">Checking…</span>
                    )}
                    {result?.type === 'TAKEN' && (
                      <span className="text-xs text-signal-error">Taken</span>
                    )}
                    {result?.type === 'VOID' && slug.length >= 2 && (
                      <span className="text-xs text-signal-success">✓ Available</span>
                    )}
                  </motion.div>
                )}
                {slug.length === 0 && name.length > 0 && (
                  <motion.p
                    key="typing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-ceramic/30"
                  >
                    We&apos;ll create a handle from your name.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* TAKEN message (full width) */}
            {result?.type === 'TAKEN' && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-signal-error"
              >
                {name.trim() ? `"${name.trim()}"` : slug} is already taken. Try another.
              </motion.p>
            )}
          </div>
        )}

        {/* Cards */}
        <AnimatePresence mode="wait">
          {result?.type === 'GHOST' && !showCreateForm && (
            <GhostClaimCard key="ghost" data={result.data} />
          )}

          {result?.type === 'VOID' && slug.length >= 2 && !showCreateForm && (
            <motion.div
              key="void"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex w-full flex-col items-center gap-4"
            >
              <p className="rounded-full border border-signal-success/20 bg-signal-success/10 px-3 py-1 text-sm text-signal-success">
                ✓ Available
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="group flex items-center gap-3 rounded-full border border-neon-blue/50 bg-neon-blue/10 px-8 py-3 text-neon-blue transition-all duration-300 hover:bg-neon-blue hover:text-obsidian"
              >
                <span className="font-medium tracking-wide">
                  Create &quot;{name.trim() || slug}&quot;
                </span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {showCreateForm && slug.length >= 2 && (
            <GenesisCreateCard
              key="create"
              slug={slug}
              onboardingContext={onboardingContext}
              prefill={
                onboardingContext?.scoutData
                  ? {
                      name: (onboardingContext.scoutData.name ?? name.trim()) || slug,
                      logoUrl: onboardingContext.scoutData.logoUrl ?? '',
                      brandColor: onboardingContext.scoutData.brandColor ?? null,
                      tier: onboardingContext.suggestedTier ?? 'scout',
                    }
                  : undefined
              }
            />
          )}
        </AnimatePresence>
    </>
  );

  if (contentOnly) {
    return <div className="w-full max-w-lg flex flex-col items-center gap-6">{content}</div>;
  }

  return (
    <div
      className={
        isEmbedded
          ? 'relative w-full flex flex-col items-center justify-center text-ceramic font-sans'
          : 'relative min-h-screen w-full flex flex-col items-center justify-center bg-obsidian text-ceramic font-sans overflow-hidden'
      }
    >
      {!isEmbedded && (
        <div className="fixed inset-0 pointer-events-none grain-overlay -z-10" aria-hidden />
      )}
      <div
        className={
          isEmbedded
            ? 'z-10 w-full max-w-lg flex flex-col items-center gap-6 relative'
            : 'z-10 w-full max-w-lg flex flex-col items-center gap-10 relative px-4'
        }
      >
        <motion.div animate={{ scale: 1, opacity: 1 }} transition={spring}>
          <LivingLogo status={logoStatus} size="xl" className="text-ceramic" />
        </motion.div>
        {content}
      </div>
    </div>
  );
}
