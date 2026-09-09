'use client';

/**
 * The people at a ghost company, and the control that adds one.
 *
 * Lifted out of the company form, which had grown to 842 lines around a
 * 573-line function. Nothing here touches the form's fields or its Save --
 * adding a contact writes straight through `addContactToGhostOrg` -- so it
 * never belonged to that component's state in the first place.
 *
 * Distinct from the rail's TeamCard, which reads every affiliation and is
 * read-only. This is where the list is managed.
 *
 * @module app/network/entity/GhostOrgRoster
 */

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { addContactToGhostOrg } from '@/features/network-data';
import { displayableEmail } from '@/shared/lib/entity-attrs';
import type { NodeDetailCrewMember } from '@/features/network-data';

export function RosterSection({
  crew,
  sourceOrgId,
  ghostOrgId,
  onRefresh,
}: {
  crew: NodeDetailCrewMember[];
  sourceOrgId: string;
  ghostOrgId: string;
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const addRef = React.useRef<HTMLDivElement>(null);

  const handleAdd = async () => {
    const el = addRef.current;
    if (!el) return;
    const get = (n: string) => (el.querySelector(`[name="${n}"]`) as HTMLInputElement)?.value?.trim() ?? '';
    setSaving(true);
    const result = await addContactToGhostOrg(sourceOrgId, ghostOrgId, {
      firstName: get('ac_firstName') || 'Contact',
      lastName: get('ac_lastName'),
      email: get('ac_email') || undefined,
      role: get('ac_role') || undefined,
      jobTitle: get('ac_jobTitle') || undefined,
    });
    setSaving(false);
    if (result.ok) {
      setShowAdd(false);
      onRefresh();
    } else {
      toast.error(result.error ?? 'Failed to add contact');
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {crew.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] px-3 py-2">
            <div className="size-10 rounded-full bg-[var(--stage-surface-raised)] flex items-center justify-center overflow-hidden">
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : <span className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">{(m.name?.[0] ?? '?').toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">{m.name}</p>
              {(() => {
                const visibleEmail = displayableEmail(m.email);
                const subtitle = [m.jobTitle, visibleEmail].filter(Boolean).join(' · ');
                return subtitle ? (
                  <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] truncate">{subtitle}</p>
                ) : null;
              })()}
            </div>
          </li>
        ))}
      </ul>
      {!showAdd ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(true)} className="gap-2 border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)]">
          Add contact
        </Button>
      ) : (
        <div ref={addRef} className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input name="ac_firstName" placeholder="First name" className="bg-[var(--ctx-well)]" />
            <Input name="ac_lastName" placeholder="Last name" className="bg-[var(--ctx-well)]" />
          </div>
          <Input name="ac_email" type="email" placeholder="Email" className="bg-[var(--ctx-well)]" />
          <div className="grid grid-cols-2 gap-3">
            <Input name="ac_role" placeholder="Role" className="bg-[var(--ctx-well)]" />
            <Input name="ac_jobTitle" placeholder="Job title" className="bg-[var(--ctx-well)]" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving} className="border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)]">
              {saving ? 'Saving…' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
