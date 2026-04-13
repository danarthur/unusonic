'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';

interface LearnedSummaryCardProps {
  text: string;
  rules: string[];
}

export function LearnedSummaryCard({ text, rules }: LearnedSummaryCardProps) {
  if (rules.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className="p-4 flex flex-col gap-2.5">
        <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
          Learned preferences
        </span>
        <ul className="flex flex-col gap-1.5">
          {rules.map((rule, idx) => (
            <li
              key={idx}
              className="text-sm text-[var(--stage-text-primary)] leading-relaxed flex items-start gap-2"
            >
              <span className="text-[var(--stage-text-tertiary)] mt-0.5 shrink-0">-</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </StagePanel>
    </motion.div>
  );
}
