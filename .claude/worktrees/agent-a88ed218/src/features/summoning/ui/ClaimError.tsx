'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

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
      transition={spring}
      className="w-full max-w-md rounded-3xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] p-6 sm:p-8 shadow-xl backdrop-blur-xl text-center"
    >
      <div className="flex justify-center mb-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-surface-error)] border border-[var(--color-signal-error)]/30">
          <AlertCircle className="size-7 text-[var(--color-signal-error)]" />
        </div>
      </div>
      <h1 className="text-xl font-medium tracking-tight text-[var(--color-ink)]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        {message}
      </p>
      <Button asChild className="mt-6 w-full" size="lg">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </motion.div>
  );
}
