'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { toggleEquipmentVerification } from '@/features/talent-management/api/crew-equipment-actions';

interface Props {
  initialEnabled: boolean;
}

export function EquipmentVerificationToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const result = await toggleEquipmentVerification(next);
      if (!result.ok) {
        setEnabled(!next); // revert
        toast.error(result.error);
      }
    });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={handleToggle}
      disabled={isPending}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-45"
      style={{
        background: enabled
          ? 'var(--stage-accent, oklch(0.88 0 0))'
          : 'oklch(1 0 0 / 0.12)',
      }}
    >
      <span
        className="pointer-events-none inline-block size-3.5 rounded-full transition-transform duration-200 ease-in-out"
        style={{
          transform: enabled ? 'translateX(18px)' : 'translateX(3px)',
          background: enabled
            ? 'var(--stage-surface-base, oklch(0.13 0 0))'
            : 'var(--stage-text-tertiary, oklch(0.45 0 0))',
        }}
      />
    </button>
  );
}
