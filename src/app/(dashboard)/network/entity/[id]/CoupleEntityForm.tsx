'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { updateCoupleEntity } from '@/app/(dashboard)/(features)/events/actions/update-couple-entity';
import { reclassifyClientEntity } from '@/app/(dashboard)/(features)/events/actions/reclassify-client-entity';
import type { CoupleAttrs } from '@/shared/lib/entity-attrs';
import type { NodeDetail } from '@/features/network-data';
import { DealsPanel, FinancePanel } from './entity-studio-panels';
import { EntityDocumentsCard } from '@/features/network-data/ui/entity-documents-card';
import { EntityOverviewCards } from '@/widgets/network-detail/ui/EntityOverviewCards';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { toast } from 'sonner';

const LABEL = 'stage-label';

export function CoupleEntityForm({
  details,
  initialAttrs,
  returnPath,
  workspaceId,
}: {
  details: NodeDetail;
  initialAttrs: CoupleAttrs;
  returnPath: string;
  workspaceId?: string;
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
    <div className="min-h-screen bg-[var(--stage-void)] pb-32">
      <header className="sticky top-0 z-20 bg-[var(--stage-void)] border-b border-[var(--stage-edge-subtle)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" strokeWidth={1.5} />
          </Button>
          <div>
            <p className="stage-label">
              Couple profile
            </p>
            <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight">
              {displayName}
            </h1>
          </div>
        </div>
        <AnimatePresence>
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STAGE_MEDIUM}
              className="flex items-center gap-3"
            >
              <span className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Unsaved changes</span>
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="gap-2 stage-btn stage-btn-primary"
              >
                <Save className="size-4" strokeWidth={1.5} />
                Save
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {details.subjectEntityId && workspaceId && (
          <EntityOverviewCards
            workspaceId={workspaceId}
            entityId={details.subjectEntityId}
            entityType="couple"
            entityName={details.identity.name ?? null}
            density="page"
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

        {details.subjectEntityId && (
          <>
            <DealsPanel entityId={details.subjectEntityId} />
            <FinancePanel entityId={details.subjectEntityId} />
          </>
        )}

        {details.subjectEntityId && workspaceId && (
          <EntityDocumentsCard
            entityId={details.subjectEntityId}
            entityType="person"
            workspaceId={workspaceId}
          />
        )}

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
        </section>
      </div>
    </div>
  );
}
