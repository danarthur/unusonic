'use client';

import * as React from 'react';
import { StreamLayout } from '@/widgets/network-stream';
import { GenesisCard } from '@/widgets/network';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';

const noopUnpin = async () => ({ ok: true } as const);

/**
 * When user has no org (getCurrentOrgId() null), show the same 3-card Genesis view
 * so refresh doesn’t drop them to the single “Initialize Command Center” card.
 * Card 1 “Establish Identity” opens the create-org form in a sheet.
 */
export function NetworkGenesisNoOrg() {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-6 p-6">
      <header className="shrink-0">
        <h1 className="text-2xl font-light tracking-tight text-[var(--color-ink)]">
          Network
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Your team and partners.
        </p>
        <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--color-silk)]/90" role="status">
          No organization linked. Create one to begin.
        </p>
      </header>
      <div className="flex flex-1 min-h-0">
        <StreamLayout
          nodes={[]}
          onUnpin={noopUnpin}
          hasIdentity={false}
          brandColor={null}
          onOpenProfile={() => setSheetOpen(true)}
        />
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex flex-col max-w-md">
          <SheetHeader>
            <SheetTitle>Create organization</SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody>
            <GenesisCard />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
