'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { updateCoupleEntity } from '@/app/(dashboard)/(features)/events/actions/update-couple-entity';
import { reclassifyClientEntity } from '@/app/(dashboard)/(features)/events/actions/reclassify-client-entity';
import type { CoupleAttrs } from '@/shared/lib/entity-attrs';
import type { NodeDetail } from '@/features/network-data';
import { EntityKnowledgeCards } from './EntityKnowledgeCards';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api/query-keys';
import { getLinkedPeople } from '@/features/network-data/api/get-linked-people';
import { EntityRecordShell } from './EntityRecordShell';
import { useConnectionDelete } from './use-connection-delete';
import { toast } from 'sonner';

const LABEL = 'stage-label';

export function CoupleEntityForm({
  details,
  initialAttrs,
  returnPath,
  workspaceId,
  sourceOrgId,
}: {
  details: NodeDetail;
  initialAttrs: CoupleAttrs;
  returnPath: string;
  workspaceId?: string;
  /** The caller's own org. softDeleteGhostRelationship authorises against it. */
  sourceOrgId: string;
}) {
  const router = useRouter();
  const [partnerAFirst, setPartnerAFirst] = React.useState(initialAttrs.partner_a_first_name ?? '');
  const [partnerALast, setPartnerALast] = React.useState(initialAttrs.partner_a_last_name ?? '');
  const [partnerAEmail, setPartnerAEmail] = React.useState(initialAttrs.partner_a_email ?? '');
  const [partnerBFirst, setPartnerBFirst] = React.useState(initialAttrs.partner_b_first_name ?? '');
  const [partnerBLast, setPartnerBLast] = React.useState(initialAttrs.partner_b_last_name ?? '');
  const [partnerBEmail, setPartnerBEmail] = React.useState(initialAttrs.partner_b_email ?? '');
  const [hasChanges, setHasChanges] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [reclassifyPending, startReclassify] = React.useTransition();

  const entityId = details.subjectEntityId ?? '';

  const displayName = React.useMemo(() => {
    const a = [partnerAFirst, partnerALast].filter(Boolean).join(' ');
    const b = [partnerBFirst, partnerBLast].filter(Boolean).join(' ');
    if (a && b) return `${a} & ${b}`;
    return a || b || details.identity.name;
  }, [partnerAFirst, partnerALast, partnerBFirst, partnerBLast, details.identity.name]);

  const handleSave = () => {
    if (!entityId) return;
    startTransition(async () => {
      const result = await updateCoupleEntity({
        entityId,
        partnerAFirst,
        partnerALast,
        partnerAEmail: partnerAEmail || null,
        partnerBFirst,
        partnerBLast,
        partnerBEmail: partnerBEmail || null,
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

  const { data: linked } = useQuery({
    queryKey: queryKeys.entities.linkedPeople(workspaceId ?? '', details.subjectEntityId ?? ''),
    queryFn: () => getLinkedPeople(details.subjectEntityId ?? ''),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && details.subjectEntityId),
  });
  // Former links still block it: the edge is what would be orphaned, and it
  // survives the pair ending on purpose.
  const linkedTo = linked && linked.length > 0
    ? linked.map((p) => p.name).join(' and ')
    : null;

  const handleRemove = useConnectionDelete({
    relationshipId: details.relationshipId,
    sourceOrgId,
    returnPath,
    name: details.identity.name || 'Client',
  });

  const handleReclassify = (newType: 'person' | 'company') => {
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
      name={displayName}
      eyebrow="Couple profile"
      avatarUrl={details.identity.avatarUrl}
      avatarType="couple"
      returnPath={returnPath}
      dirty={hasChanges}
      saving={isPending}
      onSave={handleSave}
      actions={
        handleRemove
          ? [{ label: 'Remove connection', onSelect: handleRemove, critical: true }]
          : undefined
      }
    >
      {details.subjectEntityId && workspaceId && (
          <EntityKnowledgeCards
            workspaceId={workspaceId}
            entityId={details.subjectEntityId}
            entityType="couple"
            entityName={details.identity.name ?? null}
          />
        )}

        <section className="stage-panel rounded-2xl p-6 space-y-5" data-surface="surface">
          <h3 className="stage-label border-b border-[var(--stage-edge-subtle)] pb-4">
            Partner A
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={partnerAFirst}
                onChange={(e) => { setPartnerAFirst(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={partnerALast}
                onChange={(e) => { setPartnerALast(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <Input
              type="email"
              value={partnerAEmail}
              onChange={(e) => { setPartnerAEmail(e.target.value); setHasChanges(true); }}
              placeholder="partner@example.com"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
        </section>

        <section className="stage-panel rounded-2xl p-6 space-y-5" data-surface="surface">
          <h3 className="stage-label border-b border-[var(--stage-edge-subtle)] pb-4">
            Partner B
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={partnerBFirst}
                onChange={(e) => { setPartnerBFirst(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={partnerBLast}
                onChange={(e) => { setPartnerBLast(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <Input
              type="email"
              value={partnerBEmail}
              onChange={(e) => { setPartnerBEmail(e.target.value); setHasChanges(true); }}
              placeholder="partner@example.com"
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
          {/*
            Somebody who is already linked to another person IS a couple --
            two nodes and an edge, which is what the show flow writes. Offering
            to "change to couple" said the opposite, and taking it would have
            cleared their name, email and phone, filled in nothing in their
            place, and left the other partner pointing at a nameless shell.
          */}
          {linkedTo ? (
            <div className="px-5 py-4">
              <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
                Linked to {linkedTo}. Two people who are linked are already a couple —
                remove the link before changing what this record is.
              </p>
            </div>
          ) : (
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
                onClick={() => handleReclassify('person')}
                className="border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--ctx-well)]"
              >
                Change to individual
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
          )}
        </section>
    </EntityRecordShell>
  );
}
