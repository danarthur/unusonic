/**
 * Client wrapper for sidebar that handles dynamic width
 * based on collapse state. Animates between 220px (expanded)
 * and 56px (icon rail).
 */

'use client';

import { motion } from 'framer-motion';
import { useSidebarStore } from './sidebar-store';
import { SidebarWithUser } from './SidebarWithUser';

interface SidebarContainerProps {
  user: {
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  workspaceName?: string | null;
}

const collapseSpring = { type: 'spring', stiffness: 300, damping: 30 } as const;

export const SIDEBAR_EXPANDED = 220;
export const SIDEBAR_COLLAPSED = 56;

export function SidebarContainer({ user, workspaceName }: SidebarContainerProps) {
  const collapsed = useSidebarStore((s) => s.collapsed);

  return (
    <motion.div
      className="hidden lg:flex shrink-0 h-full"
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
      transition={collapseSpring}
    >
      <SidebarWithUser user={user} workspaceName={workspaceName} />
    </motion.div>
  );
}
