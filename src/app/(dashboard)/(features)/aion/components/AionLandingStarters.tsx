'use client';

/**
 * Aion landing-pane starter CTAs (Phase 3 post-Sprint-2, design doc §3.4).
 *
 * Replaces the generic chip row on the /aion landing pane's empty state.
 * Inventory-first canonical-voice starter prompts — specific, not generic.
 * Each CTA maps to a tool chain built in Sprint 2. Tapping fires the
 * natural-language query as a fresh user turn; the retrieval envelope's
 * substrate-citation discipline (§3.13) handles empty-state rendering
 * honestly when the workspace has no matching data.
 *
 * Why full-width CTAs instead of chips:
 *   • Teaches capability through specificity. "What's urgent" is generic.
 *     "Your three oldest proposals awaiting reply" is a demonstration.
 *   • Matches the Navigator recommendation for the /aion landing-pane
 *     empty state — the single highest-leverage investment in this
 *     greeting rewrite.
 *   • Stays visually distinct from the inline suggestion chips that
 *     appear below the warm greeting message.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

export type AionStarter = {
  label: string;
  value: string;
};

// Four starters — two fewer than the design-doc max keeps the pane feeling
// like a suggestion, not a menu. Ordered by highest-value-for-any-workspace:
// stale proposals and overdue replies apply to most configured workspaces;
// money state and "catch me up" are universal.
//
// Phrasing is inventory-first: the CTA names the thing, not the capability.
// "Recent replies that need a response" — not "Ask about replies." The
// owner sees what they could learn, not what Aion can do.
const DEFAULT_STARTERS: AionStarter[] = [
  { label: 'Your three oldest proposals awaiting reply', value: 'Show me my three oldest proposals that are awaiting a reply from the client.' },
  { label: 'Recent client messages that need a response', value: 'Show me recent client messages that need a response from me.' },
  { label: 'Deposits owed or overdue',                    value: 'Which deposits are owed or overdue right now?' },
  { label: 'Catch me up on this week',                    value: "Catch me up on what's happening this week." },
];

const NEW_WORKSPACE_STARTERS: AionStarter[] = [
  { label: 'Draft a first message to a client', value: 'Help me draft a first message to a client.' },
  { label: 'Walk me through adding a deal',     value: 'Walk me through adding a new deal.' },
  { label: 'Tell me what you can do',           value: 'What can you do for me?' },
];

export interface AionLandingStartersProps {
  /** Fires the value as a fresh user turn via the chat send path. */
  onStart: (value: string) => void;
  /**
   * When true, render new-workspace-tuned starters ("draft a first message").
   * Defaults to false — the common path for an established workspace.
   */
  isNewWorkspace?: boolean;
  className?: string;
}

export function AionLandingStarters({
  onStart,
  isNewWorkspace = false,
  className,
}: AionLandingStartersProps) {
  const starters = isNewWorkspace ? NEW_WORKSPACE_STARTERS : DEFAULT_STARTERS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className={[
        'flex flex-col gap-1.5 w-full max-w-2xl mt-6',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {starters.map((starter) => (
        <button
          key={starter.label}
          type="button"
          onClick={() => onStart(starter.value)}
          className={[
            'flex items-center justify-between',
            'px-4 py-2.5',
            'text-left text-[13px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
            'border border-[oklch(1_0_0_/_0.06)] hover:border-[oklch(1_0_0_/_0.12)]',
            'bg-transparent hover:bg-[oklch(1_0_0_/_0.02)]',
            'transition-colors duration-[80ms]',
            'group',
          ].join(' ')}
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        >
          <span className="truncate">{starter.label}</span>
          <ChevronRight
            size={12}
            className="shrink-0 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors"
            aria-hidden
          />
        </button>
      ))}
      <p className="text-[11px] text-[var(--stage-text-tertiary)] mt-2 text-center">
        Or ask anything.
      </p>
    </motion.div>
  );
}
