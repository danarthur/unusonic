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
          'gap-2 rounded-2xl border-[var(--color-mercury)] bg-white/5 text-[var(--color-ink-muted)] hover:border-[var(--color-silk)]/40 hover:bg-white/10 hover:text-[var(--color-ink)]',
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
