'use client';

/**
 * VenueSpecsCompactCard — read-only summary of a venue's load-bearing specs.
 *
 * Surfaces the fields a production owner needs at a glance before a show:
 * capacity, load-in window, power, stage, curfew, parking, union local, dock.
 * Full editing stays in the existing VenueSpecsEditor — this is a read surface
 * for the overview stack, parallel to how WorkingNotesCard is read-first.
 *
 * Hides entirely when nothing is populated (Day.ai pattern).
 *
 * Design: docs/reference/network-page-ia-redesign.md §6 (venue pattern).
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users2, Clock, Zap, Ruler, Car, MapPin, Shield, Truck } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import { getVenueSpecs, type VenueSpecs } from '../api/get-venue-specs';

export interface VenueSpecsCompactCardProps {
  workspaceId: string;
  entityId: string;
}

export function VenueSpecsCompactCard({ workspaceId, entityId }: VenueSpecsCompactCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.entities.venueSpecs(workspaceId, entityId),
    queryFn: () => getVenueSpecs(workspaceId, entityId),
    staleTime: 300_000,
    enabled: Boolean(workspaceId && entityId),
  });

  if (isLoading) return null;

  const specs = data && 'ok' in data && data.ok ? data.specs : null;
  if (!specs) return null;

  const rows = buildSpecRows(specs);
  if (rows.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="rounded-[var(--stage-radius-panel)] bg-[var(--ctx-card)] p-[var(--stage-padding)] space-y-3"
      data-surface="elevated"
    >
      <h3 className="stage-label text-[var(--stage-text-secondary)]">Venue specs</h3>
      <dl
        className={cn(
          'grid gap-x-5 gap-y-2.5',
          rows.length > 4 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-2">
            <row.Icon
              className="size-3.5 shrink-0 mt-0.5 text-[var(--stage-text-secondary)]"
              strokeWidth={1.5}
            />
            <div className="min-w-0">
              <dt className="stage-label text-[var(--stage-text-secondary)]">
                {row.label}
              </dt>
              <dd className="stage-readout leading-snug">
                {row.value}
              </dd>
              {row.sub && (
                <p className="text-[11px] text-[var(--stage-text-secondary)] mt-0.5">
                  {row.sub}
                </p>
              )}
              <ConfirmedOn iso={specs.confirmedOn[ATTR_BY_ROW[row.key] ?? '']} />
            </div>
          </div>
        ))}
      </dl>
    </motion.div>
  );
}

/**
 * Which stored attribute each row came from, so a row can show when its fact
 * was last confirmed. Rows with no entry are ones capture never dates.
 */
const ATTR_BY_ROW: Record<string, string> = {
  capacity: 'capacity',
  'load-in': 'load_in_notes',
  curfew: 'curfew',
  power: 'power_notes',
  parking: 'parking_notes',
  dock: 'dock_address',
  access: 'access_notes',
};

/** "Aug '24" — short enough to sit under a value without competing with it. */
function confirmedLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `confirmed ${month} '${String(d.getUTCFullYear()).slice(2)}`;
}

/**
 * A venue fact with no date is one you cannot act on. Rooms change hands, get
 * renovated, and get limiters fitted after a noise complaint, so the date is
 * what tells you whether to ring and check.
 */
function ConfirmedOn({ iso }: { iso: string | undefined }) {
  const label = confirmedLabel(iso);
  if (!label) return null;
  return (
    <p className="mt-0.5 stage-badge-text text-[var(--stage-text-tertiary)]">{label}</p>
  );
}

// ── Row building ─────────────────────────────────────────────────────────────

type SpecRow = {
  key: string;
  label: string;
  value: string;
  sub: string | null;
  Icon: typeof Users2;
};

function buildSpecRows(s: VenueSpecs): SpecRow[] {
  const rows: SpecRow[] = [];

  if (s.capacity != null && s.capacity !== '') {
    const n = typeof s.capacity === 'number' ? s.capacity : Number(s.capacity);
    rows.push({
      key: 'capacity',
      label: 'Capacity',
      value: Number.isFinite(n) ? n.toLocaleString() : String(s.capacity),
      sub: null,
      Icon: Users2,
    });
  }

  const loadInValue = s.loadInWindow || s.loadIn;
  if (loadInValue) {
    rows.push({
      key: 'load-in',
      label: 'Load-in',
      value: s.loadInWindow ?? '—',
      sub: s.loadIn && s.loadInWindow && s.loadIn !== s.loadInWindow ? s.loadIn : null,
      Icon: Clock,
    });
  } else if (s.loadIn) {
    rows.push({
      key: 'load-in',
      label: 'Load-in',
      value: s.loadIn,
      sub: null,
      Icon: Clock,
    });
  }

  if (s.loadOutWindow) {
    rows.push({
      key: 'load-out',
      label: 'Load-out',
      value: s.loadOutWindow,
      sub: null,
      Icon: Clock,
    });
  }

  if (s.curfew) {
    rows.push({
      key: 'curfew',
      label: 'Curfew',
      value: s.curfew,
      sub: null,
      Icon: Clock,
    });
  }

  if (s.power || s.housePowerAmps) {
    const ampsText = s.housePowerAmps ? `${s.housePowerAmps}A` : null;
    rows.push({
      key: 'power',
      label: 'Power',
      value: ampsText ?? (s.power ?? ''),
      sub: ampsText && s.power ? s.power : null,
      Icon: Zap,
    });
  }

  if (s.stage) {
    rows.push({
      key: 'stage',
      label: 'Stage',
      value: s.stage,
      sub: null,
      Icon: Ruler,
    });
  }

  if (s.parking) {
    rows.push({
      key: 'parking',
      label: 'Parking',
      value: s.parking,
      sub: null,
      Icon: Car,
    });
  }

  if (s.dockAddress || s.dockHours) {
    rows.push({
      key: 'dock',
      label: 'Dock',
      value: s.dockAddress ?? s.dockHours ?? '',
      sub: s.dockAddress && s.dockHours ? s.dockHours : null,
      Icon: Truck,
    });
  }

  if (s.unionLocal) {
    rows.push({
      key: 'union',
      label: 'Union',
      value: s.unionLocal,
      sub: null,
      Icon: Shield,
    });
  }

  if (s.accessNotes) {
    rows.push({
      key: 'access',
      label: 'Access',
      value: s.accessNotes,
      sub: null,
      Icon: MapPin,
    });
  }

  return rows;
}
