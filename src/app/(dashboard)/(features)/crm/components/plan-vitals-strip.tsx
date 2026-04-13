'use client';

import { Users, Truck, Zap, Wrench } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';

type PlanVitalsStripProps = {
  guestCountExpected: number | null;
  guestCountActual: number | null;
  techRequirements: Record<string, unknown> | null;
  logisticsDockInfo: string | null;
  logisticsPowerInfo: string | null;
};

/** Format tech requirements JSONB into displayable lines. */
function formatTechRequirements(tech: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(tech)) {
    if (value == null || value === '' || value === false) continue;
    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (typeof value === 'boolean') {
      lines.push(label);
    } else if (typeof value === 'string') {
      lines.push(`${label}: ${value}`);
    } else {
      lines.push(`${label}: ${String(value)}`);
    }
  }
  return lines;
}

export function PlanVitalsStrip({
  guestCountExpected,
  guestCountActual,
  techRequirements,
  logisticsDockInfo,
  logisticsPowerInfo,
}: PlanVitalsStripProps) {
  const hasGuestCount = guestCountExpected != null || guestCountActual != null;
  const techLines = techRequirements ? formatTechRequirements(techRequirements) : [];
  const hasTech = techLines.length > 0;
  const hasDock = !!logisticsDockInfo;
  const hasPower = !!logisticsPowerInfo;

  // Don't render if nothing to show
  if (!hasGuestCount && !hasTech && !hasDock && !hasPower) return null;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      {/* Header */}
      <p
        className="stage-label"
        style={{
          marginBottom: 'var(--stage-gap-wide, 12px)',
        }}
      >
        Event vitals
      </p>

      <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 8px)' }}>
        {/* Guest count */}
        {hasGuestCount && (
          <VitalRow icon={<Users size={14} />} label="Guests">
            <span className="tabular-nums">
              {guestCountExpected != null && (
                <span>{guestCountExpected.toLocaleString()} expected</span>
              )}
              {guestCountExpected != null && guestCountActual != null && (
                <span style={{ color: 'var(--stage-text-tertiary)' }}> / </span>
              )}
              {guestCountActual != null && (
                <span>{guestCountActual.toLocaleString()} actual</span>
              )}
            </span>
          </VitalRow>
        )}

        {/* Dock / load-in info */}
        {hasDock && (
          <VitalRow icon={<Truck size={14} />} label="Dock">
            <span>{logisticsDockInfo}</span>
          </VitalRow>
        )}

        {/* Power info */}
        {hasPower && (
          <VitalRow icon={<Zap size={14} />} label="Power">
            <span>{logisticsPowerInfo}</span>
          </VitalRow>
        )}

        {/* Tech requirements */}
        {hasTech && (
          <VitalRow icon={<Wrench size={14} />} label="Tech">
            <div className="flex flex-col gap-0.5">
              {techLines.map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </div>
          </VitalRow>
        )}
      </div>
    </StagePanel>
  );
}

function VitalRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="shrink-0 mt-0.5"
        style={{ color: 'var(--stage-text-tertiary)' }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="stage-label"
          style={{ color: 'var(--stage-text-tertiary)' }}
        >
          {label}
        </p>
        <div
          className="stage-readout leading-relaxed"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
