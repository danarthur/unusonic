/**
 * Client wrapper for sidebar that handles dynamic width
 * based on collapse state. Animates between 220px (expanded)
 * and 56px (icon rail).
 */

'use client';

import { motion } from 'framer-motion';
import { useSidebarStore } from './sidebar-store';
import { SidebarWithUser } from './SidebarWithUser';

import type { WorkspaceEntry } from './WorkspaceSwitcher';

interface SidebarContainerProps {
  user: {
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  workspaceName?: string | null;
  workspaces?: WorkspaceEntry[];
  activeWorkspaceId?: string | null;
}

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const collapseSpring = STAGE_MEDIUM;

export const SIDEBAR_EXPANDED = 220;
export const SIDEBAR_COLLAPSED = 56;

export function SidebarContainer({ user, workspaceName, workspaces, activeWorkspaceId }: SidebarContainerProps) {
  const collapsed = useSidebarStore((s) => s.collapsed);

  return (
    <motion.div
      className="hidden lg:flex shrink-0 h-full"
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
      transition={collapseSpring}
    >
      <SidebarWithUser user={user} workspaceName={workspaceName} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
    </motion.div>
  );
}
