'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createGenesisOrganization } from '@/features/onboarding/api/actions';
import { initializeOrganization } from '@/features/onboarding/actions/complete-setup';
import { TierSelector, type GenesisTierId } from '@/features/org-identity/ui/TierSelector';
import { ColorTuner } from '@/features/org-identity/ui/ColorTuner';
import { LogoField } from '@/features/org-identity/ui/LogoField';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import type { UserPersona } from '@/features/onboarding/model/subscription-types';
import type { OnboardingGenesisContext } from '@/features/onboarding/model/types';

const GENESIS_TO_SUBSCRIPTION: Record<GenesisTierId, 'foundation' | 'growth' | 'venue_os'> = {
  scout: 'foundation',
  vanguard: 'growth',
  command: 'venue_os',
};

const PERSONA_TO_ORG_TYPE: Record<UserPersona, 'solo' | 'agency' | 'venue'> = {
  solo_professional: 'solo',
  agency_team: 'agency',
  venue_brand: 'venue',
};

export interface GenesisPrefill {
  name: string;
  logoUrl: string;
  brandColor: string | null;
  tier: GenesisTierId;
}

interface GenesisCreateCardProps {
  slug: string;
  /** When set, uses initializeOrganization (first-time onboarding) instead of createGenesisOrganization */
  onboardingContext?: OnboardingGenesisContext;
  /** Pre-fill from ION website scout (onboarding) */
  prefill?: GenesisPrefill;
}

export function GenesisCreateCard({ slug, onboardingContext, prefill }: GenesisCreateCardProps) {
  const router = useRouter();
  const [name, setName] = React.useState(prefill?.name ?? '');
  const [tier, setTier] = React.useState<GenesisTierId>(prefill?.tier ?? 'scout');
  const [brandColor, setBrandColor] = React.useState<string | null>(prefill?.brandColor ?? null);
  const [logoUrl, setLogoUrl] = React.useState(prefill?.logoUrl ?? '');

  const [state, submitAction, isPending] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, formData: FormData) => {
      if (onboardingContext) {
        const result = await initializeOrganization({
          name: (formData.get('name') as string)?.trim() ?? '',
          type: PERSONA_TO_ORG_TYPE[onboardingContext.persona],
          subscriptionTier: GENESIS_TO_SUBSCRIPTION[(formData.get('tier') as GenesisTierId) ?? 'scout'],
        });
        if (result.success) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: result.error };
      }
      const result = await createGenesisOrganization(null, formData);
      if (result.ok) {
        router.refresh();
        return { ok: true };
      }
      return { ok: false, error: result.error };
    },
    null
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-full"
    >
      <form action={submitAction} className="flex flex-col gap-8 liquid-card glass-panel rounded-3xl p-8 border border-mercury">
        {/* Slug (read-only) */}
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Signal frequency
          </span>
          <p className="mt-2 text-lg text-ceramic font-mono">signal.events/{slug}</p>
        </div>

        {/* Name */}
        <section>
          <label
            htmlFor="genesis-name"
            className="mb-2 block text-xs font-medium uppercase tracking-widest text-ink-muted"
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
            className="h-11 border-mercury bg-obsidian/50 text-ceramic placeholder:text-ink-muted/60 text-base rounded-xl px-4"
          />
        </section>

        {/* Brand */}
        <section className="space-y-5">
          <span className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Brand
          </span>
          <ColorTuner value={brandColor} onChange={setBrandColor} />
          <LogoField
            value={logoUrl}
            onChange={setLogoUrl}
            brandColor={brandColor}
            label="Logo"
          />
        </section>

        {/* Tier */}
        <section>
          <TierSelector value={tier} onChange={setTier} label="Commission level" />
        </section>

        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tier" value={tier} />
        <input type="hidden" name="brand_color" value={brandColor ?? ''} />
        <input type="hidden" name="logo_url" value={logoUrl} />

        {state?.ok === false && state?.error && (
          <p className="text-sm text-signal-error -mt-2">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className={cn(
            'liquid-levitation mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-medium transition-all duration-300',
            'border border-mercury h-12',
            'bg-neon-blue/15 text-neon-blue',
            'hover:bg-neon-blue/25 hover:border-neon-blue/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian',
            'disabled:pointer-events-none disabled:opacity-50',
            'shadow-[0_0_0_1px_var(--color-mercury),inset_0_1px_0_0_var(--color-glass-highlight)]'
          )}
        >
          {isPending ? (
            <span className="text-ink-muted">Launching…</span>
          ) : (
            <>
              <svg
                className="size-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span>Launch organization</span>
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
