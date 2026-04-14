import type { AionConfig } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import type { AionPageContext } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';

/**
 * Shared context passed to each tool module.
 * All tools close over these values from the route handler.
 */
export type AionToolContext = {
  workspaceId: string;
  userId: string;
  userName: string;
  userRole: string;
  pageContext: AionPageContext | null;
  getConfig: () => AionConfig;
  refreshConfig: () => Promise<void>;
  canWrite: boolean;
  setConfigUpdates: (updates: Partial<AionConfig>) => void;
};

export const WRITE_DENIED = {
  error: 'You do not have permission to perform this action. Only owners, admins, and members can make changes.',
} as const;
