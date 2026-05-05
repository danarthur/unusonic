'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { User, Building2, Heart, Users, Music, MapPin, Wallet } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { HostKind } from '../../actions/deal-model';
import type { PersonHostFormState, CompanyClientSelection } from './host-cast-forms';

const PAIRING_ICON: Record<'romantic' | 'co_host' | 'family', typeof Heart> = {
  romantic: Heart,
  co_host: Users,
  family: Users,
};

const PAIRING_LABEL: Record<'romantic' | 'co_host' | 'family', string> = {
  romantic: 'Couple',
  co_host: 'Co-hosts',
  family: 'Family',
};

const HOST_KIND_ICON: Record<HostKind, typeof User> = {
  individual: User,
  couple: Heart,
  company: Building2,
  venue_concert: Music,
};

export interface CastSummaryProps {
  hostKind: HostKind;
  individualForm: PersonHostFormState;
  partnerA: PersonHostFormState;
  partnerB: PersonHostFormState;
  pairing: 'romantic' | 'co_host' | 'family';
  companyClient: CompanyClientSelection | null;
  pocChoice:
    | { kind: 'host'; hostIndex: 1 | 2 }
    | { kind: 'planner' }
    | { kind: 'venue' }
    | { kind: 'separate' }
    | null;
  pocSeparateForm: PersonHostFormState;
  plannerSelected: { id: string; name: string; subtitle?: string | null } | null;
  selectedVenue: { id: string; name: string; address?: string | null } | null;
  venueQuery: string;
  budgetEstimated: number | undefined;
}

interface CastChip {
  key: string;
  icon: typeof User;
  label: string;
  badge?: string;
  tone?: 'primary' | 'secondary';
}

function fullName(p: PersonHostFormState): string {
  return [p.firstName.trim(), p.lastName.trim()].filter(Boolean).join(' ');
}

function coupleDisplayName(a: PersonHostFormState, b: PersonHostFormState): string {
  const aF = a.firstName.trim();
  const aL = a.lastName.trim();
  const bF = b.firstName.trim();
  const bL = b.lastName.trim();
  if (!aF && !bF) return '';
  const sameLast = aL && bL && aL.toLowerCase() === bL.toLowerCase();
  if (sameLast) return `${aF} & ${bF} ${aL}`.trim();
  const a2 = [aF, aL].filter(Boolean).join(' ');
  const b2 = [bF, bL].filter(Boolean).join(' ');
  return [a2, b2].filter(Boolean).join(' & ');
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function CastSummary(props: CastSummaryProps) {
  const {
    hostKind, individualForm, partnerA, partnerB, pairing, companyClient,
    pocChoice, pocSeparateForm, plannerSelected,
    selectedVenue, venueQuery, budgetEstimated,
  } = props;

  const chips: CastChip[] = [];

  // (Archetype is reflected in the modal title "New wedding" / "New corporate
  // gala" / etc. — no chip here to avoid duplication.)

  // Hosts
  if (hostKind === 'individual') {
    const name = fullName(individualForm);
    if (name) chips.push({ key: 'host', icon: User, label: name, tone: 'primary' });
  } else if (hostKind === 'couple') {
    const name = coupleDisplayName(partnerA, partnerB);
    if (name) {
      const Icon = PAIRING_ICON[pairing];
      chips.push({ key: 'hosts', icon: Icon, label: name, badge: PAIRING_LABEL[pairing], tone: 'primary' });
    }
  } else {
    const name = companyClient?.name ?? '';
    if (name) {
      chips.push({
        key: 'host',
        icon: HOST_KIND_ICON[hostKind],
        label: name,
        badge: hostKind === 'venue_concert' ? 'Venue / promoter' : undefined,
        tone: 'primary',
      });
    }
  }

  // POC — only when a separate person beyond the host/planner/venue is chosen.
  if (pocChoice?.kind === 'separate') {
    const name = fullName(pocSeparateForm);
    if (name) chips.push({ key: 'poc', icon: User, label: name, badge: 'POC', tone: 'secondary' });
  }

  // Planner — only when set. Carries a combined badge when serving as POC too.
  const plannerName = plannerSelected?.name ?? '';
  if (plannerName) {
    const plannerIsPoc = pocChoice?.kind === 'planner';
    chips.push({
      key: 'planner',
      icon: User,
      label: plannerName,
      badge: plannerIsPoc ? 'Planner · POC' : 'Planner',
      tone: 'secondary',
    });
  }

  // Venue. Carries a combined badge when serving as POC too.
  const venueLabel = selectedVenue?.name || venueQuery.trim();
  if (venueLabel) {
    const venueIsPoc = pocChoice?.kind === 'venue';
    chips.push({
      key: 'venue',
      icon: MapPin,
      label: venueLabel,
      badge: venueIsPoc ? 'Venue · POC' : undefined,
      tone: 'secondary',
    });
  }

  // Budget
  if (typeof budgetEstimated === 'number' && budgetEstimated > 0) {
    chips.push({ key: 'budget', icon: Wallet, label: currency.format(budgetEstimated), tone: 'secondary' });
  }

  const hasAny = chips.length > 0;

  return (
    <div
      data-surface="elevated"
      className="rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] px-3 py-2.5 min-w-0"
    >
      <AnimatePresence mode="popLayout">
        {hasAny ? (
          <motion.div
            key="filled"
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STAGE_LIGHT}
            className="flex flex-wrap items-center gap-1.5 min-w-0"
          >
            {chips.map((c) => (
              <motion.span
                layout
                key={c.key}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={STAGE_LIGHT}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[var(--stage-radius-input,6px)] px-2 py-1 min-w-0',
                  c.tone === 'primary'
                    ? 'bg-[oklch(1_0_0/0.05)] text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-secondary)]'
                )}
              >
                <c.icon size={12} className="shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="stage-readout truncate">{c.label}</span>
                {c.badge && (
                  <span className="text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)] uppercase tracking-wide shrink-0">
                    {c.badge}
                  </span>
                )}
              </motion.span>
            ))}
          </motion.div>
        ) : (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_LIGHT}
            className="stage-readout text-[var(--stage-text-tertiary)]"
          >
            The cast will form here as you fill in the details.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
