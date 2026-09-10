/**
 * Team Management Component
 *
 * Who is in the workspace, and what role each of them holds. What a role can
 * do is decided in one place, /settings/roles, and read back through
 * `member_has_capability`.
 *
 * There used to be a per-member permissions grid and a department select here.
 * Both wrote to `public.workspace_members` columns that do not exist, so both
 * had been failing on every click; and the grid granted the same five
 * capabilities the role editor grants, which is a second source of truth for
 * the same question. Removing it is not a reduction -- the toggles never once
 * saved.
 *
 * @module app/(dashboard)/settings/components/team-management
 */

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { 
  Users, 
  Shield, 
  ChevronDown, 
  Check, 
  X, 
} from 'lucide-react';
import type { WorkspaceMemberData } from '@/app/actions/workspace';
import { WorkspaceRoleSelect } from '@/features/role-builder';
import { PortalProfileSelect } from '@/features/team-invite/ui/PortalProfileSelect';
import { updatePortalProfile } from '@/features/team-invite';
import { InviteTeamMemberSheet } from './InviteTeamMemberSheet';

// ============================================================================
// Types
// ============================================================================

interface TeamManagementProps {
  workspaceId: string;
  members: WorkspaceMemberData[];
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
}

// ============================================================================
// Constants
// ============================================================================

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-[var(--color-unusonic-warning)]/10 text-[var(--color-unusonic-warning)] border-[var(--color-unusonic-warning)]/20',
  admin: 'bg-[oklch(0.55_0.15_250)]/10 text-[oklch(0.65_0.15_250)] border-[oklch(0.55_0.15_250)]/20',
  member: 'bg-[var(--color-unusonic-success)]/10 text-[var(--color-unusonic-success)] border-[var(--color-unusonic-success)]/20',
  viewer: 'bg-[var(--stage-surface)]/10 text-[var(--stage-text-tertiary)] border-[var(--stage-surface)]/20',
  employee: 'bg-[oklch(0.55_0.12_280)]/10 text-[oklch(0.65_0.12_280)] border-[oklch(0.55_0.12_280)]/20',
};

// ============================================================================
// Component
// ============================================================================

export function TeamManagement({ workspaceId, members, currentUserRole }: TeamManagementProps) {
  const router = useRouter();
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const springConfig = STAGE_MEDIUM;

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';
  
  const handlePortalProfileChange = async (rosterEdgeId: string, profileKey: string | null) => {
    if (!canManage) return;
    setError(null);
    setSavingId(`${rosterEdgeId}-portal-profile`);
    startTransition(async () => {
      const result = await updatePortalProfile(workspaceId, rosterEdgeId, profileKey);
      if (!result.ok) {
        setError(result.error || 'Failed to update portal profile');
      }
      setSavingId(null);
      router.refresh();
    });
  };

  const toggleExpand = (memberId: string) => {
    setExpandedMember(expandedMember === memberId ? null : memberId);
  };
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
            <Users className="w-5 h-5 text-[var(--stage-text-secondary)]" />
          </div>
          <div>
            <h2 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">Team Members</h2>
            <p className="text-xs text-[var(--stage-text-secondary)]">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {canManage && <InviteTeamMemberSheet workspaceId={workspaceId} canManage={canManage} />}
          {!canManage && (
            <div className="px-3 py-1.5 rounded-lg bg-[var(--ctx-well)] border border-[var(--stage-border)]">
              <span className="text-xs text-[var(--stage-text-secondary)]">View only</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springConfig}
            className="p-3 rounded-xl bg-[var(--color-unusonic-error)]/5 border border-[var(--color-unusonic-error)]/15"
          >
            <p className="text-sm text-[var(--color-unusonic-error)]">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Members List */}
      <div className="space-y-3">
        {members.map((member) => {
          const isExpanded = expandedMember === member.userId;
          const isOwner = member.role === 'owner';
          const initials = member.fullName
            ? member.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : member.email[0].toUpperCase();
          
          return (
            <motion.div
              key={member.userId}
              layout
              className="rounded-xl border border-[var(--stage-border)] overflow-hidden bg-[var(--stage-surface-elevated)]"
            >
              {/* Member Header */}
              <button
                onClick={() => toggleExpand(member.userId)}
                disabled={isOwner || !canManage}
                className="stage-hover overflow-hidden w-full p-4 flex items-center gap-4 transition-colors disabled:cursor-default"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-[var(--ctx-well)] flex items-center justify-center shrink-0 ring-2 ring-[var(--stage-border)]">
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.fullName || 'Member'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-sm font-medium text-[var(--stage-text-primary)]">{initials}</span>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                      {member.fullName || member.email}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full stage-badge-text uppercase tracking-wider border ${ROLE_COLORS[member.role]}`}>
                      {member.roleName ?? member.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {member.fullName && (
                      <p className="text-xs text-[var(--stage-text-secondary)] truncate">{member.email}</p>
                    )}
                  </div>
                </div>
                
                {/* Expand Icon */}
                {!isOwner && canManage && (
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={springConfig}
                  >
                    <ChevronDown className="w-5 h-5 text-[var(--stage-text-secondary)]" />
                  </motion.div>
                )}
                
                {isOwner && (
                  <Shield className="w-5 h-5 text-[var(--color-unusonic-warning)]" />
                )}
              </button>
              
              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && !isOwner && canManage && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={springConfig}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--stage-border)] space-y-4">
                      {/* Role Select (workspace_roles: system + custom) */}
                      <WorkspaceRoleSelect
                        workspaceId={workspaceId}
                        userId={member.userId}
                        value={member.roleId}
                        disabled={isPending}
                        onSuccess={() => router.refresh()}
                      />
                      {/* Portal Profile Override (employees with roster edge only) */}
                      {member.rosterEdgeId && member.roleName?.toLowerCase() === 'employee' && (
                        <PortalProfileSelect
                          value={member.portalProfile}
                          onChange={(val) => handlePortalProfileChange(member.rosterEdgeId!, val)}
                          disabled={isPending && savingId === `${member.rosterEdgeId}-portal-profile`}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
      
      {/* Empty State */}
      {members.length === 0 && (
        <div className="p-8 text-center rounded-xl border-2 border-dashed border-[var(--stage-border)]">
          <Users className="w-10 h-10 text-[var(--stage-text-secondary)]/40 mx-auto mb-3" />
          <p className="text-sm text-[var(--stage-text-secondary)]">No team members yet</p>
          <p className="mt-1 text-xs text-[var(--stage-text-secondary)]">Use Invite team member to add someone to the roster and optionally grant Unusonic login.</p>
        </div>
      )}
    </div>
  );
}
