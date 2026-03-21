'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IdentityForm } from './IdentityForm';
import { IdentityMirror } from './IdentityMirror';
import { colorWithAlpha } from '../lib/color';
import { Button } from '@/shared/ui/button';
import type { OrgDetails } from '@/entities/organization';

export interface IdentityArchitectProps {
  org: OrgDetails;
}

type MirrorValues = {
  name: string;
  slug: string;
  description: string | null;
  brand_color: string | null;
  logo_url: string | null;
};

/** True when org already has identity (re-edit: show Leave + Save changes). */
function hasExistingIdentity(org: OrgDetails): boolean {
  return !!(org.name?.trim() || org.slug?.trim());
}

/**
 * Forge & Preview – Split state holder. Left: form. Right: live mirror with brand glow.
 * Re-edit: Leave (back to network) and Resave (submit form).
 */
export function IdentityArchitect({ org }: IdentityArchitectProps) {
  const router = useRouter();
  const isReEdit = hasExistingIdentity(org);
  const [mirror, setMirror] = React.useState<MirrorValues>({
    name: org.name || '',
    slug: org.slug ?? '',
    description: org.description ?? null,
    brand_color: org.brand_color ?? null,
    logo_url: org.logo_url ?? null,
  });
  const [savingFlash, setSavingFlash] = React.useState(false);

  const flashTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const onSaving = () => {
      setSavingFlash(true);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setSavingFlash(false), 800);
    };
    document.addEventListener('signal:identity-saving', onSaving);
    return () => {
      document.removeEventListener('signal:identity-saving', onSaving);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const defaultValues: Pick<OrgDetails, 'name' | 'slug' | 'description' | 'brand_color' | 'logo_url'> = {
    name: org.name || '',
    slug: org.slug ?? null,
    description: org.description ?? null,
    brand_color: org.brand_color ?? null,
    logo_url: org.logo_url ?? null,
  };

  return (
    <>
      {/* LEFT: THE FORGE */}
      <div className="border-r border-white/5 p-8 overflow-y-auto lg:p-12 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-light tracking-tight text-[var(--color-ink)]">
            Establish Identity
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/network')}
            className="shrink-0 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] gap-1.5"
          >
            <ArrowLeft className="size-4" />
            Leave
          </Button>
        </div>
        <IdentityForm
          orgId={org.id}
          defaultValues={defaultValues}
          onValuesChange={setMirror}
          submitLabel={isReEdit ? 'Save changes' : 'Initialize System'}
        />
      </div>

      {/* RIGHT: THE MIRROR (fixed, with ambient glow from brand color) */}
      <div
        className="hidden lg:flex flex-col items-center justify-center relative overflow-hidden bg-[var(--color-obsidian)] min-h-0"
        style={
          mirror.brand_color
            ? { ['--color-brand-500' as string]: mirror.brand_color }
            : undefined
        }
      >
        {/* Background ambient glow (use hex with alpha so oklch presets work) */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={
            mirror.brand_color
              ? (() => {
                  const glowColor = colorWithAlpha(mirror.brand_color, 0.12);
                  return glowColor
                    ? {
                        background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${glowColor} 0%, transparent 60%)`,
                        filter: 'blur(40px)',
                      }
                    : undefined;
                })()
              : undefined
          }
        />
        <div className="relative z-10 w-full flex-1 flex items-center justify-center min-h-0">
          <IdentityMirror
            tempName={mirror.name}
            tempColor={mirror.brand_color}
            tempLogo={mirror.logo_url}
            tempBio={mirror.description}
            flash={savingFlash}
          />
        </div>
      </div>
    </>
  );
}
