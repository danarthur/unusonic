'use client';

import { LivingLogo } from '@/shared/ui/branding/living-logo';

/**
 * Conscious loader: full-screen overlay with LivingLogo.
 * Use for global suspense so the system feels like it's "thinking," not "waiting."
 */
export function SystemLoader() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-obsidian"
      aria-label="System loading"
    >
      <LivingLogo size="lg" status="loading" />
      <p className="text-sm font-medium tracking-tight text-ink-muted">
        Waking…
      </p>
    </div>
  );
}
