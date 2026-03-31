/**
 * PersonaStep – Aion quick-reply suggestions
 * Compact glass cards that feel like chat options.
 * @module features/onboarding/ui/PersonaStep
 */

'use client';

import { motion } from 'framer-motion';
import { User, Building2, MapPin } from 'lucide-react';
import { PATHFINDING_PERSONAS, type UserPersona } from '../model/subscription-types';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

const ICONS: Record<UserPersona, typeof User> = {
  solo_professional: User,
  agency_team: Building2,
  venue_brand: MapPin,
};

interface PersonaStepProps {
  value: UserPersona | null;
  onChange: (persona: UserPersona) => void;
}

export function PersonaStep({ value, onChange }: PersonaStepProps) {
  return (
    <div className="w-full flex flex-col gap-3">
      {(Object.entries(PATHFINDING_PERSONAS) as [UserPersona, (typeof PATHFINDING_PERSONAS)[UserPersona]][]).map(
        ([key, cfg]) => {
          const Icon = ICONS[key];
          const isSelected = value === key;
          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              transition={STAGE_LIGHT}
              className={`
                relative w-full flex items-center gap-4 p-4 rounded-2xl text-left
                border transition-[border-color,background-color,filter] duration-300
                ${isSelected
                  ? 'border-[var(--stage-accent)]/50 bg-[var(--stage-accent)]/10 shadow-lg'
                  : 'border-[oklch(1_0_0_/_0.08)] hover:border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface-raised)] hover:bg-[var(--stage-surface-hover)] hover:brightness-[1.02]'
                }
              `}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]' : 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)]'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-base font-medium ${isSelected ? 'text-[var(--stage-accent)]' : 'text-[var(--stage-text-primary)]'}`}>{cfg.label}</p>
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5 font-light">{cfg.tierHint}</p>
              </div>
            </motion.button>
          );
        }
      )}
    </div>
  );
}
