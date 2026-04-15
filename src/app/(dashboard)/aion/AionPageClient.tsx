'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/app/(dashboard)/(features)/aion/components/ChatInterface';
import { useRequiredWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { useSession } from '@/shared/ui/providers/SessionContext';

/**
 * Phase 3.3 re-query handler. When the Lobby PinnedAnswersWidget routes a pin
 * click to `/aion?openPin=<pinId>`, we dispatch a synthetic `[open-pin] <id>`
 * user message into the active chat session. The chat route short-circuits
 * that pattern, re-runs callMetric with the pin's stored metric_id + args, and
 * streams an analytics_result block back with `pinId` set — so the resulting
 * card renders with the "Update pin" affordance active.
 */
function PinOpenDispatcher({ workspaceId }: { workspaceId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { sendChatMessage } = useSession();
  const dispatchedFor = useRef<string | null>(null);

  useEffect(() => {
    const pinId = params.get('openPin');
    if (!pinId) return;
    // Guard against double-dispatch on re-render.
    if (dispatchedFor.current === pinId) return;
    dispatchedFor.current = pinId;

    void sendChatMessage({ text: `[open-pin] ${pinId}`, workspaceId });

    // Clean the URL so a browser reload doesn't redispatch.
    router.replace('/aion');
  }, [params, workspaceId, sendChatMessage, router]);

  return null;
}

export function AionPageClient() {
  const workspaceId = useRequiredWorkspace();

  return (
    <div className="flex flex-col h-full" data-surface="void">
      <PinOpenDispatcher workspaceId={workspaceId} />
      <ChatInterface viewState="chat" workspaceId={workspaceId} />
    </div>
  );
}
