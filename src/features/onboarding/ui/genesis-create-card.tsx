'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { createGenesisOrganization } from '@/features/onboarding/api/actions';
import { initializeOrganization } from '@/features/onboarding/actions/complete-setup';
import type { GenesisTierId } from '@/features/org-identity/ui/TierSelector';
import { Input } from '@/shared/ui/input';
import type { UserPersona } from '@/features/onboarding/model/subscription-types';
import type { OnboardingGenesisContext } from '@/features/onboarding/model/types';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

const GENESIS_TO_SUBSCRIPTION: Record<GenesisTierId, 'foundation' | 'growth' | 'studio'> = {
  scout: 'foundation',
  vanguard: 'growth',
  command: 'studio',
};

const PERSONA_TO_ORG_TYPE: Record<UserPersona, 'solo' | 'agency' | 'venue'> = {
  solo_professional: 'solo',
  agency_team: 'agency',
  venue_brand: 'venue',
};

export interface GenesisPrefill {
  name: string;
  tier: GenesisTierId;
}

interface GenesisCreateCardProps {
  slug: string;
  /** When set, uses initializeOrganization (first-time onboarding) instead of createGenesisOrganization */
  onboardingContext?: OnboardingGenesisContext;
  /** Pre-fill from name input or Aion website scout */
  prefill?: GenesisPrefill;
}

export function GenesisCreateCard({ slug, onboardingContext, prefill }: GenesisCreateCardProps) {
  const router = useRouter();
  const [name, setName] = React.useState(prefill?.name ?? '');
  // Bind tier to state so any future TierSelector UI can mutate it. Defaults
  // to the prefill value and re-syncs if prefill changes (e.g. Aion website
  // scout completes after the card mounts).
  const [tier, setTier] = React.useState<GenesisTierId>(prefill?.tier ?? 'scout');
  React.useEffect(() => {
    if (prefill?.tier) setTier(prefill.tier);
  }, [prefill?.tier]);

  const [state, submitAction, isPending] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, formData: FormData) => {
      if (onboardingContext) {
        const persona = (formData.get('persona') as UserPersona) || onboardingContext.persona;
        const result = await initializeOrganization({
          name: (formData.get('name') as string)?.trim() ?? '',
          type: PERSONA_TO_ORG_TYPE[persona],
          subscriptionTier: GENESIS_TO_SUBSCRIPTION[(formData.get('tier') as GenesisTierId) ?? 'scout'],
        });
        if (result.success) {
          router.push(result.redirectPath ?? '/');
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: result.error };
      }
      const result = await createGenesisOrganization(null, formData);
      if (result.ok) {
        router.push('/');
        router.refresh();
        return { ok: true };
      }
      return { ok: false, error: result.error };
    },
    null
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={STAGE_MEDIUM}
      className="w-full"
    >
      <form action={submitAction} className="flex flex-col gap-8 stage-panel rounded-[var(--stage-radius-panel,12px)] p-8 border border-[oklch(1_0_0/0.08)]">
        {/* Slug (read-only) */}
        <div>
          <span className="stage-label">
            Studio URL
          </span>
          <p className="mt-2 text-lg text-[var(--stage-text-primary)] font-mono">unusonic.events/{slug}</p>
        </div>

        {/* Name */}
        <section>
          <label
            htmlFor="genesis-name"
            className="mb-2 block stage-label"
          >
            Organization name
          </label>
          <Input
            id="genesis-name"
            name="name"
            type="text"
            placeholder="e.g. Luxe Productions"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-11 border-[oklch(1_0_0/0.08)] bg-[oklch(0.06_0_0/0.75)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-base rounded-xl px-4"
          />
        </section>

        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tier" value={tier} />
        {onboardingContext && (
          <input type="hidden" name="persona" value={onboardingContext.persona} />
        )}

        {state?.ok === false && state?.error && (
          <p className="text-sm text-unusonic-error -mt-2">{state.error}</p>
        )}

        <motion.button
          type="submit"
          disabled={isPending || !name.trim()}
          transition={STAGE_MEDIUM}
          className="stage-btn stage-btn-primary w-full py-3.5 rounded-full font-medium text-sm transition-colors disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Launching…
            </>
          ) : (
            'Launch workspace'
          )}
        </motion.button>
      </form>
    </motion.div>
  );
}
