'use client';

/**
 * "What is this?" — the way out of the Unsorted lane.
 *
 * Unsorted is where entities land with no role edge: reached through a deal, a
 * capture or an import, but never classified. Google Contacts does the same
 * thing with auto-captured addresses, keeping them in a separate Other contacts
 * bucket rather than styling them differently in the main list -- a lane, not a
 * look. What that pattern needs to work, and what this section did not have, is
 * a way out. Without one the lane only ever grows.
 *
 * Options are constrained by what the entity is: a room cannot be a client, and
 * a person is not a venue. Offering a choice that cannot be right is how a
 * one-tap control becomes a thing to think about.
 *
 * @module widgets/network-stream/ui/FileContactControl
 */

import * as React from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover';
import { fileContact, type FileableRole } from '@/features/network-data/api/file-contact';
import type { NetworkNode } from '@/entities/network';

type Choice = { role: FileableRole; label: string };

const CLIENT: Choice = { role: 'CLIENT', label: 'Client' };
const VENDOR: Choice = { role: 'VENDOR', label: 'Vendor' };
const VENUE: Choice = { role: 'VENUE_PARTNER', label: 'Venue' };
/** PARTNER, not ROSTER_MEMBER: the house rule is that roster means employed. */
const FREELANCER: Choice = { role: 'PARTNER', label: 'Freelancer' };

function choicesFor(node: NetworkNode): Choice[] {
  switch (node.identity.entityType) {
    case 'venue':
      return [VENUE, VENDOR];
    case 'company':
      return [CLIENT, VENDOR, VENUE];
    default:
      return [CLIENT, VENDOR, FREELANCER];
  }
}

export function FileContactControl({ node }: { node: NetworkNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const file = async (choice: Choice) => {
    setSaving(true);
    const result = await fileContact(node.entityId, choice.role);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    setOpen(false);
    toast.success(`Filed as ${choice.label.toLowerCase()}.`);
    router.refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The row itself opens the contact; this must not.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'shrink-0 rounded-full border border-[var(--stage-edge-subtle)] px-2.5 py-1',
            'stage-badge-text text-[var(--stage-text-secondary)] transition-colors duration-[80ms]',
            'hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-primary)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          )}
        >
          File
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1" onClick={(e) => e.stopPropagation()}>
        {choicesFor(node).map((choice) => (
          <button
            key={choice.role}
            type="button"
            disabled={saving}
            onClick={() => file(choice)}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-[80ms]',
              'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-primary)]',
              'disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            )}
          >
            {choice.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
