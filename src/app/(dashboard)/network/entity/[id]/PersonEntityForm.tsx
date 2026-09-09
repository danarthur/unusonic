'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { updateIndividualEntity } from '@/app/(dashboard)/(features)/events/actions/update-individual-entity';
import { reclassifyClientEntity } from '@/app/(dashboard)/(features)/events/actions/reclassify-client-entity';
import type { IndividualAttrs } from '@/shared/lib/entity-attrs';
import type { NodeDetail } from '@/features/network-data';
import { EntityKnowledgeCards } from './EntityKnowledgeCards';
import { EntityRecordShell } from './EntityRecordShell';
import { toast } from 'sonner';

const LABEL = 'stage-label';

export function PersonEntityForm({
  details,
  initialAttrs,
  returnPath,
  workspaceId,
}: {
  details: NodeDetail;
  initialAttrs: IndividualAttrs;
  returnPath: string;
  workspaceId?: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState(initialAttrs.first_name ?? '');
  const [lastName, setLastName] = React.useState(initialAttrs.last_name ?? '');
  const [email, setEmail] = React.useState(initialAttrs.email ?? '');
  const [phone, setPhone] = React.useState(initialAttrs.phone ?? '');
  const [hasChanges, setHasChanges] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [reclassifyPending, startReclassify] = React.useTransition();

  const entityId = details.subjectEntityId ?? '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || details.identity.name;

  const handleSave = () => {
    if (!entityId) return;
    startTransition(async () => {
      const result = await updateIndividualEntity({
        entityId,
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        displayName,
      });
      if (result.success) {
        toast.success('Saved');
        setHasChanges(false);
        router.push(returnPath);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleReclassify = (newType: 'couple' | 'company') => {
    if (!entityId) return;
    startReclassify(async () => {
      const result = await reclassifyClientEntity(entityId, newType);
      if (result.success) {
        toast.success(`Reclassified to ${newType}`);
        router.push(returnPath);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <EntityRecordShell
      entityId={details.subjectEntityId ?? null}
      entityType="person"
      workspaceId={workspaceId ?? null}
      name={displayName || 'Individual Client'}
      eyebrow="Individual profile"
      avatarUrl={details.identity.avatarUrl}
      avatarType="person"
      returnPath={returnPath}
      dirty={hasChanges}
      saving={isPending}
      onSave={handleSave}
    >
      {details.subjectEntityId && workspaceId && (
          <EntityKnowledgeCards
            workspaceId={workspaceId}
            entityId={details.subjectEntityId}
            entityType="person"
            entityName={displayName || null}
          />
        )}

        <section className="stage-panel rounded-2xl p-6 space-y-5" data-surface="surface">
          <h3 className="stage-label border-b border-[var(--stage-edge-subtle)] pb-4">
            Contact details
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setHasChanges(true); }}
              placeholder="client@example.com"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setHasChanges(true); }}
              placeholder="+1 (555) 000-0000"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
        </section>

        <section className="stage-panel rounded-2xl overflow-hidden" data-surface="surface">
          <div className="px-5 py-4 border-b border-[var(--stage-edge-subtle)]">
            <h3 className="stage-label">
              Reclassify
            </h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
              Change this client record type. Existing field data from the old type will be cleared.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reclassifyPending}
                onClick={() => handleReclassify('couple')}
                className="border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--ctx-well)]"
              >
                Change to couple
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reclassifyPending}
                onClick={() => handleReclassify('company')}
                className="border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--ctx-well)]"
              >
                Change to company
              </Button>
            </div>
          </div>
        </section>
    </EntityRecordShell>
  );
}
