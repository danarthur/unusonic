'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

interface ClaimErrorProps {
  title?: string;
  message: string;
}

export function ClaimError({
  title = 'Link invalid or expired',
  message,
}: ClaimErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="w-full max-w-md rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-6 sm:p-8 text-center"
    >
      <div className="flex justify-center mb-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-unusonic-error)]/15 border border-[var(--color-unusonic-error)]/30">
          <AlertCircle className="size-7 text-[var(--color-unusonic-error)]" strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>
      <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--stage-text-secondary)]">
        {message}
      </p>
      <Button asChild className="mt-6 w-full" size="lg">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </motion.div>
  );
}
