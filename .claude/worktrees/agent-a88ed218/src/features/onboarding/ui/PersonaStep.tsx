/**
 * PersonaStep – ION quick-reply suggestions
 * Compact glass cards that feel like chat options.
 * @module features/onboarding/ui/PersonaStep
 */

'use client';

import { motion } from 'framer-motion';
import { User, Building2, MapPin } from 'lucide-react';
import { PATHFINDING_PERSONAS, type UserPersona } from '../model/subscription-types';

const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;

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
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={springConfig}
              className={`
                relative w-full flex items-center gap-4 p-4 rounded-2xl text-left
                backdrop-blur-xl border transition-colors duration-300
                ${isSelected
                  ? 'border-neon-blue/50 bg-neon-blue/10 shadow-lg'
                  : 'border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] bg-glass-surface hover:bg-[var(--glass-bg-hover)]'
                }
              `}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-neon-blue/20 text-neon-blue' : 'bg-ink/5 text-ink-muted'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-base font-medium ${isSelected ? 'text-neon-blue' : 'text-ink'}`}>{cfg.label}</p>
                <p className="text-xs text-ink-muted mt-0.5 font-light">{cfg.tierHint}</p>
              </div>
            </motion.button>
          );
        }
      )}
    </div>
  );
}
