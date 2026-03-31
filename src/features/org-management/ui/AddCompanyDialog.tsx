'use client';

import * as React from 'react';
import { Building2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { cn } from '@/shared/lib/utils';
import { createGhostOrg } from '@/entities/organization';
import { createOrgRelationship } from '@/entities/network';
import type { RelationshipType } from '@/entities/network';

const RELATIONSHIP_TYPES: { value: RelationshipType; label: string }[] = [
  { value: 'vendor', label: 'Vendor' },
  { value: 'venue', label: 'Venue' },
  { value: 'client_company', label: 'Client' },
  { value: 'partner', label: 'Partner' },
];

interface AddCompanyDialogProps {
  sourceOrgId: string;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/** Create a Ghost Org + link (Rolodex "Add Connection" → "Create New"). */
export function AddCompanyDialog({
  sourceOrgId,
  workspaceId,
  open,
  onOpenChange,
  onSuccess,
}: AddCompanyDialogProps) {
  const [name, setName] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [type, setType] = React.useState<RelationshipType>('vendor');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setCity('');
      setState('');
      setType('vendor');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim()) {
      setError('Name and City are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ghost = await createGhostOrg({
        workspace_id: workspaceId,
        name: name.trim(),
        city: city.trim(),
        state: state.trim() || undefined,
        type,
      });
      if (!ghost.ok) {
        setError(ghost.error);
        return;
      }
      const link = await createOrgRelationship(sourceOrgId, ghost.id, type);
      if (!link.ok) {
        setError(link.error);
        return;
      }
      onSuccess();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-[oklch(0_0_0_/_0.5)]"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Add company"
        className={cn(
          'fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-void)] p-6 shadow-2xl'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[oklch(1_0_0_/_0.10)] pb-4">
          <h3 className="flex items-center gap-2 text-lg font-medium text-[var(--stage-text-primary)]">
            <Building2 className="size-5 text-[var(--stage-text-secondary)]" />
            Add connection
          </h3>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>
        <p className="mt-2 text-sm text-[var(--stage-text-secondary)]">
          Create a new company (vendor/venue) — it becomes a Ghost Org until they join Unusonic.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <FloatingLabelInput
            label="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.05)]"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <FloatingLabelInput
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="rounded-lg border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.05)]"
              required
            />
            <FloatingLabelInput
              label="State / Region"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="rounded-lg border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.05)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--stage-text-secondary)]">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RelationshipType)}
              className="w-full rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2 text-sm text-[var(--stage-text-primary)]"
            >
              {RELATIONSHIP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-[var(--color-unusonic-error)]">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add company'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
