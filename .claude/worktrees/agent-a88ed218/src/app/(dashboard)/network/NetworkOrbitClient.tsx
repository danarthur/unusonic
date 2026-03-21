'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { OmniSearch } from '@/widgets/network-stream';

interface NetworkOrbitClientProps {
  orgId: string;
  /** Controlled: when provided, OmniSearch open state is controlled by parent (e.g. Genesis "Summon Partner"). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When user chooses "Add" for a new ghost, open the Ghost Forge sheet with this name. */
  onOpenForge?: (name: string) => void;
}

/**
 * Button to open OmniSearch (add partner). Cmd+K is handled globally by CommandSpine;
 * when on this page, the palette shows the "Network" section with the same search.
 */
export function NetworkOrbitClient({ orgId, open: controlledOpen, onOpenChange, onOpenForge }: NetworkOrbitClientProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 rounded-2xl border-[var(--color-mercury)] bg-white/5 text-[var(--color-ink-muted)] hover:border-[var(--color-silk)]/40 hover:bg-white/10 hover:text-[var(--color-ink)]"
      >
        <Search className="size-4" />
        Seek Network
        <kbd className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>
      <OmniSearch sourceOrgId={orgId} open={open} onOpenChange={setOpen} onOpenForge={onOpenForge} />
    </>
  );
}
