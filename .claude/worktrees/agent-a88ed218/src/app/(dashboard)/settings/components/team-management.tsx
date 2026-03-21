/**
 * Team Management Component
 * Manage workspace members, departments, and permissions
 * @module app/(dashboard)/settings/components/team-management
 */

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Shield, 
  ChevronDown, 
  ChevronUp,
  Check, 
  X, 
  Loader2,
  User,
  Building,
  Eye,
  EyeOff,
  Calendar,
  Wallet,
  ClipboardList,
  MapPin,
} from 'lucide-react';
import { 
  updateMemberPermissions, 
  updateMemberDepartment,
  type WorkspaceMemberData,
  type WorkspacePermissions,
} from '@/app/actions/workspace';
import { WorkspaceRoleSelect } from '@/features/role-builder';
import { InviteTeamMemberSheet } from './InviteTeamMemberSheet';

// ============================================================================
// Types
// ============================================================================

interface TeamManagementProps {
  workspaceId: string;
  members: WorkspaceMemberData[];
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
}

interface PermissionConfig {
  key: keyof WorkspacePermissions;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const PERMISSION_CONFIGS: PermissionConfig[] = [
  {
    key: 'view_finance',
    label: 'View Finance',
    description: 'Access financial reports and QuickBooks data',
    icon: Wallet,
  },
  {
    key: 'view_planning',
    label: 'View Planning',
    description: 'Access event planning and scheduling',
    icon: Calendar,
  },
  {
    key: 'view_ros',
    label: 'View Run of Show',
    description: 'Access production run-of-show documents',
    icon: ClipboardList,
  },
  {
    key: 'manage_team',
    label: 'Lead Team',
    description: 'Add/remove members and fix permissions',
    icon: Users,
  },
  {
    key: 'manage_locations',
    label: 'Tune Locations',
    description: 'Add and fix office locations',
    icon: MapPin,
  },
];

const DEPARTMENTS = [
  'Executive',
  'Operations',
  'DJ',
  'Sales',
  'Marketing',
  'Finance',
  'Production',
  'Logistics',
  'Other',
];

const ROLE_COLORS = {
  owner: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  admin: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  member: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  viewer: 'bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20',
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

  const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';
  
  const handleTogglePermission = async (
    memberId: string,
    permissionKey: keyof WorkspacePermissions,
    currentValue: boolean
  ) => {
    if (!canManage) return;
    
    setError(null);
    setSavingId(`${memberId}-${permissionKey}`);
    
    startTransition(async () => {
      const result = await updateMemberPermissions(workspaceId, memberId, {
        [permissionKey]: !currentValue,
      });
      
      if (!result.success) {
        setError(result.error || 'Failed to update permission');
      }
      
      setSavingId(null);
    });
  };
  
  const handleDepartmentChange = async (memberId: string, department: string) => {
    if (!canManage) return;
    
    setError(null);
    setSavingId(`${memberId}-department`);
    
    startTransition(async () => {
      const result = await updateMemberDepartment(workspaceId, memberId, department);
      
      if (!result.success) {
        setError(result.error || 'Failed to update department');
      }
      
      setSavingId(null);
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
          <div className="w-10 h-10 rounded-xl bg-ink/5 flex items-center justify-center">
            <Users className="w-5 h-5 text-ink-muted" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-ink">Team Members</h2>
            <p className="text-xs text-ink-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {canManage && <InviteTeamMemberSheet workspaceId={workspaceId} canManage={canManage} />}
          {!canManage && (
            <div className="px-3 py-1.5 rounded-lg bg-ink/5 border border-[var(--glass-border)]">
              <span className="text-xs text-ink-muted">View only</span>
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
            className="p-3 rounded-xl bg-red-500/5 border border-red-500/15"
          >
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Members List */}
      <div className="space-y-3">
        {members.map((member) => {
          const isExpanded = expandedMember === member.id;
          const isOwner = member.role === 'owner';
          const initials = member.fullName
            ? member.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : member.email[0].toUpperCase();
          
          return (
            <motion.div
              key={member.id}
              layout
              className="rounded-xl border border-[var(--glass-border)] overflow-hidden bg-ink/[0.02]"
            >
              {/* Member Header */}
              <button
                onClick={() => toggleExpand(member.id)}
                disabled={isOwner || !canManage}
                className="w-full p-4 flex items-center gap-4 hover:bg-ink/[0.02] transition-colors disabled:cursor-default"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-ink/10 flex items-center justify-center shrink-0 ring-2 ring-[var(--glass-border)]">
                  {member.avatarUrl ? (
                    <img 
                      src={member.avatarUrl} 
                      alt={member.fullName || 'Member'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-ink">{initials}</span>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink truncate">
                      {member.fullName || member.email}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${ROLE_COLORS[member.role]}`}>
                      {member.roleName ?? member.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {member.fullName && (
                      <p className="text-xs text-ink-muted truncate">{member.email}</p>
                    )}
                    {member.department && (
                      <>
                        <span className="text-ink-muted/30">•</span>
                        <span className="text-xs text-ink-muted">{member.department}</span>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Expand Icon */}
                {!isOwner && canManage && (
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={springConfig}
                  >
                    <ChevronDown className="w-5 h-5 text-ink-muted" />
                  </motion.div>
                )}
                
                {isOwner && (
                  <Shield className="w-5 h-5 text-amber-500" />
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
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--glass-border)] space-y-4">
                      {/* Role Select (workspace_roles: system + custom) */}
                      <WorkspaceRoleSelect
                        workspaceId={workspaceId}
                        memberId={member.id}
                        value={member.roleId}
                        disabled={isPending}
                        onSuccess={() => router.refresh()}
                      />
                      {/* Department Select */}
                      <div>
                        <label className="block text-[10px] font-medium text-ink-muted uppercase tracking-[0.15em] mb-2">
                          Department
                        </label>
                        <div className="relative">
                          <select
                            value={member.department || ''}
                            onChange={(e) => handleDepartmentChange(member.id, e.target.value)}
                            disabled={isPending && savingId === `${member.id}-department`}
                            className="w-full px-3 py-2.5 rounded-xl appearance-none
                              bg-ink/[0.03] border border-[var(--glass-border)]
                              text-ink text-sm
                              focus:outline-none focus:border-walnut/40 focus:ring-2 focus:ring-walnut/10
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-all duration-300"
                          >
                            <option value="">Select department...</option>
                            {DEPARTMENTS.map((dept) => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                          {isPending && savingId === `${member.id}-department` && (
                            <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-walnut animate-spin" />
                          )}
                        </div>
                      </div>
                      
                      {/* Permissions Grid */}
                      <div>
                        <label className="block text-[10px] font-medium text-ink-muted uppercase tracking-[0.15em] mb-3">
                          Permissions
                        </label>
                        <div className="space-y-2">
                          {PERMISSION_CONFIGS.map((perm) => {
                            const Icon = perm.icon;
                            const isEnabled = member.permissions[perm.key];
                            const isSaving = isPending && savingId === `${member.id}-${perm.key}`;
                            
                            return (
                              <button
                                key={perm.key}
                                onClick={() => handleTogglePermission(member.id, perm.key, isEnabled)}
                                disabled={isSaving}
                                className={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all duration-200
                                  ${isEnabled 
                                    ? 'bg-emerald-500/5 border-emerald-500/20' 
                                    : 'bg-ink/[0.02] border-[var(--glass-border)] hover:border-[var(--glass-border-hover)]'
                                  }
                                  disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                                  ${isEnabled ? 'bg-emerald-500/10' : 'bg-ink/5'}`}>
                                  <Icon className={`w-4 h-4 ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-muted'}`} />
                                </div>
                                
                                <div className="flex-1 text-left">
                                  <p className={`text-sm font-medium ${isEnabled ? 'text-ink' : 'text-ink-muted'}`}>
                                    {perm.label}
                                  </p>
                                  <p className="text-[11px] text-ink-muted/70">{perm.description}</p>
                                </div>
                                
                                {isSaving ? (
                                  <Loader2 className="w-5 h-5 text-walnut animate-spin" />
                                ) : isEnabled ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5 text-white" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full border-2 border-ink/20" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
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
        <div className="p-8 text-center rounded-xl border-2 border-dashed border-[var(--glass-border)]">
          <Users className="w-10 h-10 text-ink-muted/40 mx-auto mb-3" />
          <p className="text-sm text-ink-muted">No team members yet</p>
          <p className="mt-1 text-xs text-ink-muted">Use Invite team member to add someone to the roster and optionally grant Signal login.</p>
        </div>
      )}
    </div>
  );
}
