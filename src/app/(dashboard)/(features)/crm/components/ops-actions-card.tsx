'use client';

/**
 * Ops Next Actions — post-handoff equivalent of NextActionsCard.
 * Tracks production readiness: crew confirmed, gear pulled, logistics checked, etc.
 * Mirrors the design pattern of the Deal tab's NextActionsCard.
 */

import { motion } from 'framer-motion';
import { CheckCircle2, Circle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { DealCrewRow } from '../actions/deal-crew';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';
import { normalizeGearItems, normalizeLogistics, GEAR_LIFECYCLE_ORDER, GEAR_BRANCH_STATES } from './flight-checks/types';

type OpsActionsCardProps = {
  crewRows: DealCrewRow[];
  runOfShowData: RunOfShowData | null;
  eventStartsAt: string | null;
  hasVenue: boolean;
};

type ActionItem = {
  label: string;
  done: boolean;
  detail?: string;
};

export function OpsActionsCard({
  crewRows,
  runOfShowData,
  eventStartsAt,
  hasVenue,
}: OpsActionsCardProps) {
  const gearItems = normalizeGearItems(runOfShowData);
  const logistics = normalizeLogistics(runOfShowData);

  const assignedCrew = crewRows.filter((r) => r.entity_id);
  const confirmedCrew = assignedCrew.filter((r) => r.confirmed_at);
  // "Pulled" means at least index 1 (pulled) in lifecycle, or in a branch state (handled)
  const gearPulled = gearItems.filter((g) =>
    GEAR_BRANCH_STATES.includes(g.status) || GEAR_LIFECYCLE_ORDER.indexOf(g.status) >= 1
  );
  // "Loaded" means at least index 3 (loaded) in lifecycle
  const gearLoaded = gearItems.filter((g) =>
    GEAR_LIFECYCLE_ORDER.indexOf(g.status) >= 3
  );

  const callTimeSlots = runOfShowData?.call_time_slots;
  const hasCallTimes = Array.isArray(callTimeSlots) && callTimeSlots.length > 0;

  const actions: ActionItem[] = [
    {
      label: 'Confirm all crew',
      done: assignedCrew.length > 0 && confirmedCrew.length === assignedCrew.length,
      detail: assignedCrew.length > 0 ? `${confirmedCrew.length}/${assignedCrew.length} confirmed` : undefined,
    },
    {
      label: 'Set call times',
      done: hasCallTimes,
      detail: hasCallTimes ? `${callTimeSlots!.length} slot${callTimeSlots!.length > 1 ? 's' : ''}` : undefined,
    },
    {
      label: 'Confirm venue access',
      done: !!logistics.venue_access_confirmed,
    },
  ];

  // Gear actions only if gear exists
  if (gearItems.length > 0) {
    actions.push({
      label: 'Pull all gear',
      done: gearPulled.length === gearItems.length,
      detail: `${gearPulled.length}/${gearItems.length} pulled`,
    });
    actions.push({
      label: 'Load truck',
      done: !!logistics.truck_loaded && gearLoaded.length === gearItems.length,
      detail: gearLoaded.length > 0 ? `${gearLoaded.length}/${gearItems.length} loaded` : undefined,
    });
  } else {
    actions.push({
      label: 'Load truck',
      done: !!logistics.truck_loaded,
    });
  }

  // Crew dispatch (only if crew is confirmed)
  if (confirmedCrew.length > 0) {
    const dispatched = crewRows.filter((r) => r.dispatch_status === 'en_route' || r.dispatch_status === 'on_site' || r.dispatch_status === 'wrapped');
    actions.push({
      label: 'Dispatch crew',
      done: dispatched.length === confirmedCrew.length,
      detail: dispatched.length > 0 ? `${dispatched.length}/${confirmedCrew.length} dispatched` : undefined,
    });
  }

  const doneCount = actions.filter((a) => a.done).length;
  const allDone = doneCount === actions.length;
  const progress = actions.length > 0 ? (doneCount / actions.length) * 100 : 0;

  return (
    <StagePanel elevated className="h-full p-5 flex flex-col rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          Production checklist
        </h3>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {doneCount}/{actions.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[oklch(1_0_0_/_0.04)] mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: allDone ? 'var(--color-unusonic-success)' : 'var(--stage-text-secondary)' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="flex flex-col gap-1.5 flex-1">
        {actions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...STAGE_LIGHT, delay: i * 0.03 }}
            className="flex items-start gap-2.5 py-1"
          >
            {action.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-[var(--color-unusonic-success)] mt-0.5" />
            ) : (
              <Circle className="size-4 shrink-0 text-[var(--stage-text-tertiary)] mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm tracking-tight leading-tight ${action.done ? 'text-[var(--stage-text-tertiary)] line-through' : 'text-[var(--stage-text-primary)]'}`}>
                {action.label}
              </p>
              {action.done && action.detail && (
                <p className="text-[10px] text-[var(--stage-text-tertiary)] mt-0.5 truncate">{action.detail}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </StagePanel>
  );
}
