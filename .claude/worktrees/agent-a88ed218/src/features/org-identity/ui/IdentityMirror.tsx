'use client';

import * as React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { cn } from '@/shared/lib/utils';
import { colorWithAlpha } from '../lib/color';

export interface IdentityMirrorProps {
  /** Display name (live from form). */
  tempName: string;
  /** Oklch brand color (live from form). */
  tempColor: string | null;
  /** Logo URL or null (live from form/upload). */
  tempLogo: string | null;
  /** Public bio (live from form). */
  tempBio: string | null;
  /** When true, run "Flash Cure" (flash + harden) animation. */
  flash?: boolean;
  className?: string;
}

/**
 * The Mirror – Hero-state preview of the Organization Card.
 * 3D tilt (mouse parallax), floats in void. Shows exactly how you appear to the world.
 */
export function IdentityMirror({ tempName, tempColor, tempLogo, tempBio, flash, className }: IdentityMirrorProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-6, 6]);

  const [cureKey, setCureKey] = React.useState(0);
  React.useEffect(() => {
    if (flash) setCureKey((k) => k + 1);
  }, [flash]);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const normX = (e.clientX - centerX) / (rect.width / 2);
      const normY = (e.clientY - centerY) / (rect.height / 2);
      x.set(Math.max(-1, Math.min(1, normX)));
      y.set(Math.max(-1, Math.min(1, normY)));
    },
    [x, y]
  );

  const handleMouseLeave = React.useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  const displayName = tempName.trim() || 'Your organization';
  const accentBorder = colorWithAlpha(tempColor, 0.25);
  const accentBorderSubtle = colorWithAlpha(tempColor, 0.15);
  const accentStyle = tempColor ? { borderColor: accentBorder ?? tempColor, color: tempColor } : undefined;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('flex items-center justify-center p-8 perspective-[1000px]', className)}
    >
      <motion.div
        className="w-full max-w-md"
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <motion.div
          key={cureKey}
          className="relative overflow-hidden rounded-3xl border bg-[var(--color-glass-surface)] shadow-[0_24px_48px_-12px_oklch(0_0_0/0.4),inset_0_1px_0_0_var(--color-glass-highlight)] backdrop-blur-xl"
          style={{
            borderColor: accentBorder ?? 'var(--color-mercury)',
            transform: 'translateZ(20px)',
          }}
          initial={flash ? { opacity: 0.6, scale: 0.98 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28, duration: 0.25 }}
        >
          <div className="flex flex-col gap-6 p-8 sm:p-10">
            {/* Logo: same border as card (mercury or accent) */}
            <div className="flex justify-center">
              {tempLogo ? (
                <div
                  className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white/5"
                  style={{ borderColor: accentBorderSubtle ?? 'var(--color-mercury)' }}
                >
                  <img src={tempLogo} alt="" className="size-full object-cover" />
                </div>
              ) : (
                <div style={accentStyle}>
                  <LivingLogo status="idle" size="lg" />
                </div>
              )}
            </div>

            <div className="space-y-2 text-center">
              <h2 className="text-xl font-medium tracking-tight text-[var(--color-ink)] sm:text-2xl">
                {displayName}
              </h2>
              {tempBio?.trim() ? (
                <p className="text-sm font-light leading-relaxed text-[var(--color-ink-muted)] line-clamp-4">
                  {tempBio.trim()}
                </p>
              ) : (
                <p className="text-sm font-light italic text-[var(--color-ink-muted)]/60">
                  Add a public bio in the Forge
                </p>
              )}
            </div>

            {/* Subtle accent bar */}
            {tempColor && (
              <div
                className="h-1 w-16 rounded-full mx-auto opacity-80"
                style={{ backgroundColor: tempColor }}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
