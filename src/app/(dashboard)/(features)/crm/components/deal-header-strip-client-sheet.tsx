'use client';

/**
 * Contact picker sheet used by the deal header strip when the selected
 * client is a company — lets the PM pick which person at the company is
 * the bill-to contact (or skip to "org only").
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetBody, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import type { NetworkSearchOrg } from '@/features/network-data';
import type { OrgRosterContact } from '../actions/deal-stakeholders';

export function ClientContactPickerSheet({
  open,
  onOpenChange,
  pendingClientOrg,
  roster,
  rosterLoading,
  adding,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingClientOrg: NetworkSearchOrg | null;
  roster: OrgRosterContact[];
  rosterLoading: boolean;
  adding: boolean;
  onConfirm: (org: NetworkSearchOrg, contactEntityId: string | null) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetClose />
          <SheetTitle>Who&apos;s your contact at {pendingClientOrg?.name}?</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {rosterLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-[var(--stage-text-tertiary)]" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {roster.map((c) => (
                <button
                  key={c.entity_id}
                  type="button"
                  disabled={adding}
                  onClick={() => pendingClientOrg && onConfirm(pendingClientOrg, c.entity_id)}
                  className="w-full text-left border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.03)] px-4 py-3 text-sm hover:bg-[var(--stage-accent-muted)] transition-colors focus:outline-none"
                  style={{ borderRadius: 'var(--stage-radius-panel)' }}
                >
                  <span className="stage-readout">{c.display_name}</span>
                  {c.email && (
                    <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">{c.email}</p>
                  )}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={adding}
                onClick={() => pendingClientOrg && onConfirm(pendingClientOrg, null)}
                className="mt-2 text-[var(--stage-text-secondary)]"
              >
                {adding ? 'Adding…' : 'Skip — add org only'}
              </Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
