'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import {
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';

const META = METRICS['lobby.client_concentration'];

// ── Types ───────────────────────────────────────────────────────────────────

export interface ClientConcentrationData {
  clients: { name: string; revenue: number; percentage: number }[];
}

interface ClientConcentrationWidgetProps {
  data: ClientConcentrationData;
  loading?: boolean;
}

const MAX_CLIENTS = 5;
const HIGH_CONCENTRATION_THRESHOLD = 40;

// ── Component ───────────────────────────────────────────────────────────────

export function ClientConcentrationWidget({
  data,
  loading = false,
}: ClientConcentrationWidgetProps) {
  const clients = data.clients.slice(0, MAX_CLIENTS);
  const hasData = clients.length > 0;
  const highConcentration = clients.some(
    (c) => c.percentage >= HIGH_CONCENTRATION_THRESHOLD,
  );

  return (
    <WidgetShell
      icon={Users}
      label={META.title}
      loading={loading}
      empty={!loading && !hasData}
      emptyMessage={META.emptyState.body}
      skeletonRows={3}
    >
      <div className="flex flex-col gap-1 h-full">
        {/* Concentration warning */}
        {highConcentration && (
          <motion.div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md mb-1"
            style={{ background: 'var(--color-surface-warning)' }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={STAGE_MEDIUM}
          >
            <span
              className="text-label font-medium"
              style={{ color: 'var(--color-unusonic-warning)' }}
            >
              High concentration risk
            </span>
          </motion.div>
        )}

        {/* Client list */}
        <div className="flex flex-col gap-2 flex-1 justify-evenly">
          {clients.map((client, i) => (
            <motion.div
              key={client.name}
              className="flex items-center gap-2"
              variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
              transition={{
                ...STAGE_MEDIUM,
                delay: i * STAGE_STAGGER_CHILDREN,
              }}
            >
              {/* Rank number */}
              <span
                className="text-label font-medium tabular-nums w-3 shrink-0 text-right"
                style={{ color: 'var(--stage-text-secondary)' }}
              >
                {i + 1}
              </span>

              {/* Name */}
              <span
                className="text-label font-medium truncate shrink-0 w-14"
                style={{ color: 'var(--stage-text-primary)' }}
              >
                {client.name}
              </span>

              {/* Bar track */}
              <div
                className="flex-1 h-3.5 relative rounded-sm overflow-hidden"
                style={{ background: 'var(--ctx-well)' }}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    background: 'var(--stage-accent, oklch(0.88 0 0))',
                    opacity: i === 0 ? 1 : 0.5,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${client.percentage}%` }}
                  transition={{
                    ...STAGE_MEDIUM,
                    delay: i * STAGE_STAGGER_CHILDREN,
                  }}
                />
              </div>

              {/* Percentage */}
              <span
                className="text-label font-medium tabular-nums shrink-0 w-8 text-right"
                style={{ color: 'var(--stage-text-secondary)' }}
              >
                {client.percentage}%
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
