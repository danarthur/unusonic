'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { CeramicSwitch } from '@/shared/ui/switch';
import { TimePicker } from '@/shared/ui/time-picker';
import { computeHoursBetween } from '@/shared/lib/parse-time';
import { CrewRoleAssignmentRow } from './crew-role-assignment-row';
import { CrewBudgetAlert } from './crew-budget-alert';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { estimatedRoleCost } from '../api/package-types';
import type { ProposalBuilderLineItem } from '../model/types';
import type { RequiredRole } from '../api/package-types';

export interface ProposalProductionTeamProps {
  lineItems: ProposalBuilderLineItem[];
  sourceOrgId: string | null;
  onUpdateRoleAssignment: (lineIdx: number, roleIdx: number, entityId: string | null, name: string | null) => void;
  onAddRole?: (lineIdx: number) => void;
  onUpdateTimeStart: (lineIdx: number, value: string | null) => void;
  onUpdateTimeEnd: (lineIdx: number, value: string | null) => void;
  onUpdateShowTimes: (lineIdx: number, value: boolean) => void;
  dealEventStartTime?: string | null;
  dealEventEndTime?: string | null;
  /** Actual crew cost from ops.deal_crew (if available). Drives the over-budget alert. */
  actualCrewCost?: number | null;
}

/** A line item that has crew roles, with its index and time data. */
interface CrewLineGroup {
  lineIndex: number;
  itemName: string;
  unitType: string | null | undefined;
  timeStart: string | null | undefined;
  timeEnd: string | null | undefined;
  showTimesOnProposal: boolean | null | undefined;
  roles: { role: RequiredRole; roleIndex: number }[];
}

export function ProposalProductionTeam({
  lineItems,
  sourceOrgId,
  onUpdateRoleAssignment,
  onAddRole,
  onUpdateTimeStart,
  onUpdateTimeEnd,
  onUpdateShowTimes,
  dealEventStartTime,
  dealEventEndTime,
  actualCrewCost,
}: ProposalProductionTeamProps) {
  // Group roles by their parent line item so time fields sit alongside crew.
  // Include service/talent items even if they have no pre-configured roles —
  // the PM should be able to add a role slot from the production team panel.
  const crewGroups: CrewLineGroup[] = [];
  lineItems.forEach((item, lineIdx) => {
    const hasRoles = item.requiredRoles && item.requiredRoles.length > 0;
    const isCrewCategory = item.category === 'service' || item.category === 'talent';
    if (hasRoles || isCrewCategory) {
      crewGroups.push({
        lineIndex: lineIdx,
        itemName: item.name || 'Untitled',
        unitType: item.unitType,
        timeStart: item.timeStart,
        timeEnd: item.timeEnd,
        showTimesOnProposal: item.showTimesOnProposal,
        roles: (item.requiredRoles ?? []).map((role, roleIdx) => ({
          role: role as RequiredRole,
          roleIndex: roleIdx,
        })),
      });
    }
  });

  const showSchedule = (g: CrewLineGroup) => g.unitType === 'hour' || g.unitType === 'day';

  // Compute estimated crew cost from all required roles across line items
  const estimatedCrewCost = React.useMemo(() => {
    let total = 0;
    for (const group of crewGroups) {
      for (const { role } of group.roles) {
        total += estimatedRoleCost(role);
      }
    }
    return total;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- crewGroups is derived from lineItems; use lineItems as stable dep
  }, [lineItems]);

  return (
    <AnimatePresence>
      {crewGroups.length > 0 && (
        <motion.div
          key="production-team"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={STAGE_MEDIUM}
        >
          <StagePanel elevated data-surface="elevated" className="p-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)]">
            <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Production team
            </h2>

            {/* Crew cost overage alert */}
            {actualCrewCost != null && estimatedCrewCost > 0 && (
              <div className="mb-4">
                <CrewBudgetAlert
                  estimatedCrewCost={estimatedCrewCost}
                  actualCrewCost={actualCrewCost}
                />
              </div>
            )}

            <div className="space-y-5">
              {crewGroups.map((group) => (
                <div key={group.lineIndex} className="space-y-3">
                  {/* Line item name as section label (only when multiple groups) */}
                  {crewGroups.length > 1 && (
                    <p className="text-xs font-medium text-[var(--stage-text-primary)] tracking-tight">
                      {group.itemName}
                    </p>
                  )}

                  {/* Time range — only for hourly/daily items */}
                  {showSchedule(group) && (() => {
                    const isEventTimes = !!(dealEventStartTime && dealEventEndTime
                      && group.timeStart === dealEventStartTime && group.timeEnd === dealEventEndTime);
                    const hours = group.timeStart && group.timeEnd
                      ? computeHoursBetween(group.timeStart, group.timeEnd)
                      : null;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                          <Clock className="w-3.5 h-3.5" />
                          Schedule
                          {isEventTimes && (
                            <span className="normal-case tracking-normal font-normal text-[var(--stage-text-tertiary)] italic">
                              · Event times
                            </span>
                          )}
                          {hours != null && hours > 0 && group.unitType === 'hour' && (
                            <span className="ml-auto normal-case tracking-tight font-medium tabular-nums text-[var(--stage-text-primary)]">
                              {hours}h
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                              Start
                            </label>
                            <TimePicker
                              value={group.timeStart ?? null}
                              onChange={(v) => onUpdateTimeStart(group.lineIndex, v)}
                              placeholder="Start"
                              context="evening"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                              End
                            </label>
                            <TimePicker
                              value={group.timeEnd ?? null}
                              onChange={(v) => onUpdateTimeEnd(group.lineIndex, v)}
                              placeholder="End"
                              context="evening"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <CeramicSwitch
                            checked={group.showTimesOnProposal ?? true}
                            onCheckedChange={(checked) => onUpdateShowTimes(group.lineIndex, checked)}
                          />
                          <span className="text-xs text-[var(--stage-text-secondary)]">
                            Show times on proposal
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Crew roles */}
                  {group.roles.map(({ role, roleIndex }) => (
                    <CrewRoleAssignmentRow
                      key={`${group.lineIndex}-${roleIndex}`}
                      role={role}
                      roleIndex={roleIndex}
                      sourceOrgId={sourceOrgId}
                      onAssign={(rIdx, entityId, name) => onUpdateRoleAssignment(group.lineIndex, rIdx, entityId, name)}
                      onClear={(rIdx) => onUpdateRoleAssignment(group.lineIndex, rIdx, null, null)}
                    />
                  ))}

                  {/* Add crew role button */}
                  {onAddRole && (
                    <button
                      type="button"
                      onClick={() => onAddRole(group.lineIndex)}
                      className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] rounded-[var(--stage-radius-input)] px-2 py-1.5 transition-colors w-fit"
                    >
                      + Add crew role
                    </button>
                  )}

                  {/* Divider between groups */}
                  {crewGroups.length > 1 && group !== crewGroups[crewGroups.length - 1] && (
                    <div className="border-b border-[var(--stage-edge-subtle)]" />
                  )}
                </div>
              ))}
            </div>
          </StagePanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
