'use client';

import { ChatInterface } from '@/app/(dashboard)/(features)/aion/components/ChatInterface';
import { useRequiredWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

export default function AionPage() {
  const workspaceId = useRequiredWorkspace();

  return (
    <div className="flex flex-col h-full" data-surface="void">
      <ChatInterface viewState="chat" workspaceId={workspaceId} />
    </div>
  );
}
