'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { InviteTalentDialog } from './InviteTalentDialog';

interface NetworkInviteTriggerProps {
  orgId: string;
  className?: string;
}

export function NetworkInviteTrigger({ orgId, className }: NetworkInviteTriggerProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          'gap-2 rounded-2xl border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)] hover:border-[var(--stage-accent)]/40 hover:bg-[oklch(1_0_0_/_0.10)] hover:text-[var(--stage-text-primary)]',
          className
        )}
      >
        <UserPlus className="size-4" />
        Add talent
      </Button>
      <InviteTalentDialog
        open={open}
        onOpenChange={setOpen}
        orgId={orgId}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
