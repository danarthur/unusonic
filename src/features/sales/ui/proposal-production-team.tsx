'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { CeramicSwitch } from '@/shared/ui/switch';
import { CrewRoleAssignmentRow } from './crew-role-assignment-row';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { ProposalBuilderLineItem } from '../model/types';
import type { RequiredRole } from '../api/package-types';

export interface ProposalProductionTeamProps {
  lineItems: ProposalBuilderLineItem[];
  sourceOrgId: string | null;
  onUpdateRoleAssignment: (lineIdx: number, roleIdx: number, entityId: string | null, name: string | null) => void;
  onUpdateTimeStart: (lineIdx: number, value: string | null) => void;
  onUpdateTimeEnd: (lineIdx: number, value: string | null) => void;
  onUpdateShowTimes: (lineIdx: number, value: boolean) => void;
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
  onUpdateTimeStart,
  onUpdateTimeEnd,
  onUpdateShowTimes,
}: ProposalProductionTeamProps) {
  // Group roles by their parent line item so time fields sit alongside crew
  const crewGroups: CrewLineGroup[] = [];
  lineItems.forEach((item, lineIdx) => {
    if (item.requiredRoles?.length) {
      crewGroups.push({
        lineIndex: lineIdx,
        itemName: item.name || 'Untitled',
        unitType: item.unitType,
        timeStart: item.timeStart,
        timeEnd: item.timeEnd,
        showTimesOnProposal: item.showTimesOnProposal,
        roles: item.requiredRoles.map((role, roleIdx) => ({
          role: role as RequiredRole,
          roleIndex: roleIdx,
        })),
      });
    }
  });

  const showSchedule = (g: CrewLineGroup) => g.unitType === 'hour' || g.unitType === 'day';

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
                  {showSchedule(group) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                        <Clock className="w-3.5 h-3.5" />
                        Schedule
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                            Start
                          </label>
                          <input
                            type="time"
                            value={group.timeStart ?? ''}
                            onChange={(e) => onUpdateTimeStart(group.lineIndex, e.target.value || null)}
                            className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2 text-sm text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus:border-[var(--stage-accent)] focus:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                            End
                          </label>
                          <input
                            type="time"
                            value={group.timeEnd ?? ''}
                            onChange={(e) => onUpdateTimeEnd(group.lineIndex, e.target.value || null)}
                            className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2 text-sm text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus:border-[var(--stage-accent)] focus:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
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
                  )}

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
