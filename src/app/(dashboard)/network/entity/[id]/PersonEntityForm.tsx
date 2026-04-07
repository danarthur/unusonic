'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { updateIndividualEntity } from '@/app/(dashboard)/(features)/crm/actions/update-individual-entity';
import { reclassifyClientEntity } from '@/app/(dashboard)/(features)/crm/actions/reclassify-client-entity';
import type { IndividualAttrs } from '@/shared/lib/entity-attrs';
import type { NodeDetail } from '@/features/network-data';
import { DealsPanel, FinancePanel } from './entity-studio-panels';
import { EntityDocumentsCard } from '@/entities/directory/ui/entity-documents-card';
import { toast } from 'sonner';

const LABEL = 'text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest';

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
    <div className="min-h-screen bg-[var(--stage-void)] pb-32">
      <header className="sticky top-0 z-20 bg-[var(--stage-void)] border-b border-[oklch(1_0_0_/_0.08)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Individual profile
            </p>
            <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight">
              {displayName || 'Individual Client'}
            </h1>
          </div>
        </div>
        <AnimatePresence>
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-3"
            >
              <span className="text-xs text-[var(--stage-text-secondary)]">Unsaved changes</span>
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="gap-2 bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] border-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent)]/30"
              >
                <Save className="size-4" />
                Save
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <section className="stage-panel rounded-2xl p-6 space-y-5">
          <h3 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest border-b border-[oklch(1_0_0_/_0.08)] pb-4">
            Contact details
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[var(--ctx-well)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[var(--ctx-well)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setHasChanges(true); }}
              placeholder="+1 (555) 000-0000"
              className="mt-1 bg-[var(--ctx-well)] border-[oklch(1_0_0_/_0.08)]"
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

        <section className="rounded-2xl border border-[oklch(1_0_0_/_0.08)]/80 bg-[var(--stage-surface)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(1_0_0_/_0.08)]">
            <h3 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Reclassify
            </h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-[var(--stage-text-secondary)]">
              Change this client record type. Existing field data from the old type will be cleared.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reclassifyPending}
                onClick={() => handleReclassify('couple')}
                className="border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--ctx-well)]"
              >
                Change to couple
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reclassifyPending}
                onClick={() => handleReclassify('company')}
                className="border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--ctx-well)]"
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
