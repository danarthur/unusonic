/**
 * Lightweight inline persona picker for Genesis step (when website scout is skipped).
 * Three radio-style options: Solo / Agency / Venue.
 * @module features/onboarding/ui/persona-inline-picker
 */

'use client';

import { motion } from 'framer-motion';
import { User, Users, Building2 } from 'lucide-react';
import type { UserPersona } from '../model/subscription-types';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

const OPTIONS: { value: UserPersona; label: string; description: string; icon: typeof User }[] = [
  {
    value: 'solo_professional',
    label: 'Solo',
    description: 'Independent planner or freelancer',
    icon: User,
  },
  {
    value: 'agency_team',
    label: 'Agency',
    description: 'Team with crew and dispatch',
    icon: Users,
  },
  {
    value: 'venue_brand',
    label: 'Venue',
    description: 'Multi-location or venue management',
    icon: Building2,
  },
];

interface PersonaInlinePickerProps {
  value: UserPersona;
  onChange: (persona: UserPersona) => void;
}

export function PersonaInlinePicker({ value, onChange }: PersonaInlinePickerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="w-full"
    >
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-3">
        What best describes you?
      </p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 text-center ${
                isSelected
                  ? 'border-[oklch(1_0_0/0.20)] bg-[oklch(1_0_0/0.06)]'
                  : 'border-[oklch(1_0_0/0.06)] bg-transparent hover:border-[oklch(1_0_0/0.12)] hover:bg-[oklch(1_0_0/0.03)]'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isSelected ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'
                }`}
              />
              <span
                className={`text-xs font-medium transition-colors ${
                  isSelected ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'
                }`}
              >
                {opt.label}
              </span>
              <span className="text-[10px] text-[var(--stage-text-tertiary)] leading-tight">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
