'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createGenesisOrganization } from '@/features/onboarding/api/actions';
import { SlugInput } from '@/features/org-identity/ui/SlugInput';
import { TierSelector, type GenesisTierId } from '@/features/org-identity/ui/TierSelector';
import { ColorTuner } from '@/features/org-identity/ui/ColorTuner';
import { LogoField } from '@/features/org-identity/ui/LogoField';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'organization';
}

export function GenesisCard() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [slugOverride, setSlugOverride] = React.useState('');
  const [tier, setTier] = React.useState<GenesisTierId>('scout');
  const [brandColor, setBrandColor] = React.useState<string | null>(null);
  const [logoUrl, setLogoUrl] = React.useState('');

  const derivedSlug = React.useMemo(() => slugify(name), [name]);
  const displaySlug = slugOverride || derivedSlug;

  const [state, submitAction, isPending] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, formData: FormData) => {
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-full"
    >
      <form action={submitAction} className="flex flex-col gap-8">
        {/* 1. Identity: Name + Unusonic frequency (slug) */}
        <section className="space-y-4">
          <div>
            <label
              htmlFor="genesis-name"
              className="mb-2 block text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]"
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
              className="h-11 border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/60 text-base rounded-xl px-4"
            />
          </div>
          <SlugInput
            nameValue={name}
            value={slugOverride || derivedSlug}
            onChange={(val) => setSlugOverride(val)}
            label="Your Unusonic URL"
            prefix="unusonic.com/"
          />
        </section>

        {/* 2. Visuals: Brand color + logo (upload or link) */}
        <section className="space-y-5">
          <span className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
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

        {/* 3. Capacity: Commission level */}
        <section>
          <TierSelector value={tier} onChange={setTier} label="Plan" />
        </section>

        {/* Hidden fields for form submission */}
        <input type="hidden" name="slug" value={displaySlug} />
        <input type="hidden" name="tier" value={tier} />
        <input type="hidden" name="brand_color" value={brandColor ?? ''} />

        {state?.ok === false && state?.error && (
          <p className="text-sm text-unusonic-error -mt-2">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-medium transition-all duration-300',
            'border border-[oklch(1_0_0_/_0.08)] h-12',
            'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)]',
            'hover:bg-[var(--stage-accent)]/25 hover:border-[var(--stage-accent)]/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
            'disabled:pointer-events-none disabled:opacity-50',
            'shadow-[0_0_0_1px_var(--stage-edge-subtle),inset_0_1px_0_0_var(--stage-edge-top)]'
          )}
        >
          {isPending ? (
            <span className="text-[var(--stage-text-secondary)]">Setting up…</span>
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
              <span>Create studio</span>
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
