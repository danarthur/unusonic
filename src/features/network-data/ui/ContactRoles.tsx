'use client';

/**
 * What this contact is to us — all of it, and a way to add one.
 *
 * A freelance DJ is crew when you book him and a payee when you pay him. The
 * industry is split on which list he belongs in: QuickBooks files 1099
 * individuals under vendors, LASSO and Rentman file them under crew, and the
 * criterion both sides share is the engagement rather than the person. So the
 * answer is not to pick a section for him — it is to let him hold both roles
 * and appear in both.
 *
 * The graph has always allowed this and `fileContact` has always been able to
 * write it. The offer only ever appeared in the Unsorted lane, so a contact who
 * already had one role could never gain a second. NN/g's finding is the cost:
 * a person missing from where someone looks reads as absent from the system,
 * and the next thing that happens is a duplicate record.
 *
 * Design: docs/roster-vendors-and-the-word-crew.md §R3.
 *
 * @module entities/network/ui/ContactRoles
 */

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { getEntityRoles } from '../api/get-entity-roles';
import { fileContact, type FileableRole } from '../api/file-contact';

/**
 * The words the directory uses, not the edge names. PARTNER is the freelancer
 * edge and reads as "business partner" to anyone who has not seen the schema.
 */
const ROLE_LABEL: Record<FileableRole, string> = {
  CLIENT: 'Client',
  PARTNER: 'Crew',
  VENDOR: 'Vendor',
  VENUE_PARTNER: 'Venue',
};

const ADDABLE: FileableRole[] = ['CLIENT', 'PARTNER', 'VENDOR', 'VENUE_PARTNER'];

export interface ContactRolesProps {
  entityId: string;
  className?: string;
}

export function ContactRoles({ entityId, className }: ContactRolesProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const { data: roles } = useQuery({
    queryKey: ['entity-roles', entityId],
    queryFn: () => getEntityRoles(entityId),
    staleTime: 60_000,
    enabled: Boolean(entityId),
  });

  const held = roles ?? [];
  const available = ADDABLE.filter((role) => !held.includes(role));

  const add = async (role: FileableRole) => {
    setSaving(true);
    const result = await fileContact(entityId, role);
    setSaving(false);
    setOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['entity-roles', entityId] });
    toast.success(`Also filed as ${ROLE_LABEL[role].toLowerCase()}.`);
  };

  if (held.length === 0 && available.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {held.map((role) => (
        <span
          key={role}
          className="inline-flex items-center rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text text-[var(--stage-text-secondary)]"
        >
          {ROLE_LABEL[role]}
        </span>
      ))}

      {available.length > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Also file this contact as another role"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 stage-badge-text text-[var(--stage-text-tertiary)] transition-colors duration-[80ms] hover:bg-[oklch(1_0_0/0.06)] hover:text-[var(--stage-text-primary)]"
        >
          <Plus className="size-3" strokeWidth={1.5} />
          Also file as
        </button>
      )}

      {open && (
        <span className="inline-flex flex-wrap items-center gap-1">
          {available.map((role) => (
            <button
              key={role}
              type="button"
              disabled={saving}
              onClick={() => void add(role)}
              className="rounded-full border border-[var(--stage-edge-subtle)] px-2.5 py-0.5 stage-badge-text text-[var(--stage-text-secondary)] transition-colors duration-[80ms] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] disabled:opacity-50"
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1.5 stage-badge-text text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
          >
            Cancel
          </button>
        </span>
      )}
    </div>
  );
}
