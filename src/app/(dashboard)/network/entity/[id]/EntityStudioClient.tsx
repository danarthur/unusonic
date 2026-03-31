'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Globe,
  Tag,
  DollarSign,
  Users,
  FileText,
  ChevronDown,
  RotateCcw,
  Trash2,
  Calendar,
  Briefcase,
  Receipt,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  updateGhostProfile,
  updateRelationshipNotes,
  updateRelationshipMeta,
  addContactToGhostOrg,
  addScoutRosterToGhostOrg,
  softDeleteGhostRelationship,
} from '@/features/network-data';
import { updateIndividualEntity } from '@/app/(dashboard)/(features)/crm/actions/update-individual-entity';
import { updateCoupleEntity } from '@/app/(dashboard)/(features)/crm/actions/update-couple-entity';
import { reclassifyClientEntity } from '@/app/(dashboard)/(features)/crm/actions/reclassify-client-entity';
import type { IndividualAttrs, CoupleAttrs, PersonAttrs } from '@/shared/lib/entity-attrs';
import { EmployeeEntityForm } from './EmployeeEntityForm';
import { FreelancerEntityForm } from './FreelancerEntityForm';
import { ColorTuner } from '@/features/org-identity';
import { AionScoutInput } from '@/widgets/network-detail/ui/AionScoutInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shared/ui/dialog';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';
import {
  getEntityDeals,
  getEntityFinancialSummary,
  updateVenueTechnicalSpecs,
  type EntityDeal,
  type EntityInvoiceSummary,
  type VenueTechSpecs,
} from '@/features/network-data/api/entity-context-actions';
import { getEntityCrewSchedule, getEntityCrewHistory, type CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

const LABEL = 'text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest';

function AccordionSection({
  label,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="stage-panel rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          <Icon className="size-3.5" />
          {label}
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[oklch(1_0_0_/_0.08)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Context panels (assignments, deals, finance) ─────────────────────────────

function AssignmentRow({ entry, muted = false }: { entry: CrewScheduleEntry; muted?: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium truncate', muted ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--stage-text-primary)]')}>
          {entry.event_title ?? 'Untitled event'}
        </p>
        <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
          {entry.role}
          {entry.starts_at ? ` · ${new Date(entry.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          {entry.venue_name ? ` · ${entry.venue_name}` : ''}
        </p>
      </div>
      <span className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        muted
          ? 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)]/60'
          : entry.status === 'confirmed'
            ? 'bg-[oklch(0.65_0.18_145)]/15 text-[oklch(0.65_0.18_145)]'
            : entry.status === 'dispatched'
              ? 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)]'
              : 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
      )}>
        {entry.status}
      </span>
    </li>
  );
}

function AssignmentsPanel({ entityId }: { entityId: string }) {
  const [upcoming, setUpcoming] = React.useState<CrewScheduleEntry[] | null>(null);
  const [history, setHistory] = React.useState<CrewScheduleEntry[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showPast, setShowPast] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      getEntityCrewSchedule(entityId),
      getEntityCrewHistory(entityId),
    ]).then(([upcomingData, historyData]) => {
      setUpcoming(upcomingData);
      setHistory(historyData);
      setLoading(false);
    });
  }, [entityId]);

  if (loading) return (
    <AccordionSection label="Assignments" icon={Calendar}>
      <div className="space-y-2">
        <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
        <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
      </div>
    </AccordionSection>
  );
  if ((!upcoming || upcoming.length === 0) && (!history || history.length === 0)) return null;

  return (
    <AccordionSection label="Assignments" icon={Calendar}>
      <div className="space-y-4">
        {upcoming && upcoming.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
              Upcoming
            </p>
            <ul className="space-y-2">
              {upcoming.map((entry) => (
                <AssignmentRow key={entry.assignment_id} entry={entry} />
              ))}
            </ul>
          </div>
        )}

        {history && history.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowPast((p) => !p)}
              className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              <ChevronDown className={cn('size-3 transition-transform', showPast && 'rotate-180')} />
              {showPast ? 'Hide history' : `Show history (${history.length})`}
            </button>
            {showPast && (
              <ul className="space-y-2">
                {history.map((entry) => (
                  <AssignmentRow key={entry.assignment_id} entry={entry} muted />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AccordionSection>
  );
}

function DealsPanel({ entityId }: { entityId: string }) {
  const [data, setData] = React.useState<EntityDeal[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    getEntityDeals(entityId).then((d) => { setData(d); setLoading(false); });
  }, [entityId]);

  if (loading) return (
    <AccordionSection label="Related deals" icon={Briefcase}>
      <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
    </AccordionSection>
  );
  if (!data || data.length === 0) return null;

  return (
    <AccordionSection label="Related deals" icon={Briefcase}>
      <ul className="space-y-2">
        {data.map((deal) => (
          <li key={deal.id} className="flex items-center gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--stage-text-primary)] capitalize">
                {deal.event_archetype?.replace(/_/g, ' ') ?? 'Deal'}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                {new Date(deal.proposed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {deal.budget_estimated ? ` · $${deal.budget_estimated.toLocaleString()}` : ''}
              </p>
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              deal.status === 'confirmed' && 'bg-[oklch(0.65_0.18_145)]/15 text-[oklch(0.65_0.18_145)]',
              deal.status === 'signed' && 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)]',
              deal.status === 'prospect' && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
              !['confirmed','signed','prospect'].includes(deal.status) && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
            )}>
              {deal.status}
            </span>
          </li>
        ))}
      </ul>
    </AccordionSection>
  );
}

function FinancePanel({ entityId }: { entityId: string }) {
  const [data, setData] = React.useState<EntityInvoiceSummary[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    getEntityFinancialSummary(entityId).then((d) => { setData(d); setLoading(false); });
  }, [entityId]);

  if (loading) return (
    <AccordionSection label="Financial obligations" icon={Receipt}>
      <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
    </AccordionSection>
  );
  if (!data || data.length === 0) return null;

  const totalOutstanding = data
    .filter((inv) => inv.status !== 'paid' && inv.status !== 'void')
    .reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0);

  return (
    <AccordionSection label="Financial obligations" icon={Receipt}>
      {totalOutstanding > 0 && (
        <div className="rounded-lg bg-[oklch(0.75_0.15_60)]/10 border border-[oklch(0.75_0.15_60)]/20 px-3 py-2 mb-3">
          <p className="text-xs text-[var(--stage-text-secondary)]">Outstanding</p>
          <p className="text-lg font-semibold text-[oklch(0.75_0.15_60)]">
            ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}
      <ul className="space-y-2">
        {data.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                ${(inv.total_amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {inv.due_date && (
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                  Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              inv.status === 'paid' && 'bg-[oklch(0.65_0.18_145)]/15 text-[oklch(0.65_0.18_145)]',
              inv.status === 'overdue' && 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]',
              inv.status === 'sent' && 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)]',
              !['paid','overdue','sent'].includes(inv.status ?? '') && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
            )}>
              {inv.status ?? 'draft'}
            </span>
          </li>
        ))}
      </ul>
    </AccordionSection>
  );
}

// ─── Venue technical specs card ───────────────────────────────────────────────

function VenueTechSpecsCard({
  entityId,
  initialSpecs,
}: {
  entityId: string;
  initialSpecs: NonNullable<import('@/features/network-data').NodeDetail['orgVenueSpecs']>;
}) {
  const [capacity, setCapacity] = React.useState<string>(
    initialSpecs.capacity != null ? String(initialSpecs.capacity) : ''
  );
  const [loadInNotes, setLoadInNotes] = React.useState(initialSpecs.load_in_notes ?? '');
  const [powerNotes, setPowerNotes] = React.useState(initialSpecs.power_notes ?? '');
  const [stageNotes, setStageNotes] = React.useState(initialSpecs.stage_notes ?? '');
  const [saving, startSave] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);

  function handleSave() {
    setSaveError(null);
    startSave(async () => {
      const specs: VenueTechSpecs = {
        capacity: capacity !== '' ? Math.max(0, parseInt(capacity, 10)) || null : null,
        load_in_notes: loadInNotes || null,
        power_notes: powerNotes || null,
        stage_notes: stageNotes || null,
      };
      const result = await updateVenueTechnicalSpecs(entityId, specs);
      if (!result.ok) setSaveError(result.error);
    });
  }

  return (
    <div className="rounded-2xl bg-[var(--stage-surface-elevated)] p-5">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Technical Specs</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Capacity</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-full rounded-lg bg-[var(--stage-surface-raised)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/40"
            placeholder="e.g. 500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Load-in notes</label>
          <textarea
            value={loadInNotes}
            onChange={(e) => setLoadInNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg bg-[var(--stage-surface-raised)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/40"
            placeholder="Dock access, elevator, stairs..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Power notes</label>
          <input
            type="text"
            value={powerNotes}
            onChange={(e) => setPowerNotes(e.target.value)}
            className="w-full rounded-lg bg-[var(--stage-surface-raised)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/40"
            placeholder="200A 3-phase, 4× 20A circuits..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--stage-text-secondary)]">Stage dimensions</label>
          <input
            type="text"
            value={stageNotes}
            onChange={(e) => setStageNotes(e.target.value)}
            className="w-full rounded-lg bg-[var(--stage-surface-raised)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/40"
            placeholder="40ft W × 30ft D × 20ft H"
          />
        </div>
      </div>
      {saveError && (
        <p className="mt-2 text-xs text-[var(--color-unusonic-error)]">{saveError}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-[var(--stage-accent)]/10 py-2 text-sm font-medium text-[var(--stage-accent)] transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save specs'}
      </button>
    </div>
  );
}

// ─── Person entity form ───────────────────────────────────────────────────────

function PersonEntityForm({
  details,
  initialAttrs,
  returnPath,
}: {
  details: NodeDetail;
  initialAttrs: IndividualAttrs;
  returnPath: string;
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
      <header className="sticky top-0 z-20 bg-[var(--stage-void)]/80  border-b border-[oklch(1_0_0_/_0.08)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Entity Studio — Individual
            </p>
            <h1 className="text-xl font-light text-[var(--stage-text-primary)] tracking-tight">
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
          <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest border-b border-[oklch(1_0_0_/_0.08)] pb-4">
            Contact details
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setHasChanges(true); }}
              placeholder="+1 (555) 000-0000"
              className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
        </section>

        {details.subjectEntityId && (
          <>
            <DealsPanel entityId={details.subjectEntityId} />
            <FinancePanel entityId={details.subjectEntityId} />
          </>
        )}

        <section className="rounded-2xl border border-[oklch(1_0_0_/_0.08)]/80 bg-[oklch(1_0_0_/_0.02)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(1_0_0_/_0.08)]">
            <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest">
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
                className="border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
              >
                Change to Couple
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reclassifyPending}
                onClick={() => handleReclassify('company')}
                className="border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
              >
                Change to Company
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Couple entity form ───────────────────────────────────────────────────────

function CoupleEntityForm({
  details,
  initialAttrs,
  returnPath,
}: {
  details: NodeDetail;
  initialAttrs: CoupleAttrs;
  returnPath: string;
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
      <header className="sticky top-0 z-20 bg-[var(--stage-void)]/80  border-b border-[oklch(1_0_0_/_0.08)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Entity Studio — Couple
            </p>
            <h1 className="text-xl font-light text-[var(--stage-text-primary)] tracking-tight">
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
          <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest border-b border-[oklch(1_0_0_/_0.08)] pb-4">
            Partner A
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={partnerAFirst}
                onChange={(e) => { setPartnerAFirst(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={partnerALast}
                onChange={(e) => { setPartnerALast(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
        </section>

        <section className="stage-panel rounded-2xl p-6 space-y-5">
          <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest border-b border-[oklch(1_0_0_/_0.08)] pb-4">
            Partner B
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={partnerBFirst}
                onChange={(e) => { setPartnerBFirst(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={partnerBLast}
                onChange={(e) => { setPartnerBLast(e.target.value); setHasChanges(true); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
        </section>

        {details.subjectEntityId && (
          <>
            <DealsPanel entityId={details.subjectEntityId} />
            <FinancePanel entityId={details.subjectEntityId} />
          </>
        )}

        <section className="rounded-2xl border border-[oklch(1_0_0_/_0.08)]/80 bg-[oklch(1_0_0_/_0.02)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(1_0_0_/_0.08)]">
            <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest">
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
                onClick={() => handleReclassify('person')}
                className="border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
              >
                Change to Individual
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reclassifyPending}
                onClick={() => handleReclassify('company')}
                className="border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
              >
                Change to Company
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface EntityStudioClientProps {
  details: NodeDetail;
  sourceOrgId: string;
  returnPath?: string;
  /** Present when entityDirectoryType === 'person'. Populated from directory.entities.attributes. */
  initialPersonAttrs?: IndividualAttrs | null;
  /** Present when entityDirectoryType === 'couple'. Populated from directory.entities.attributes. */
  initialCoupleAttrs?: CoupleAttrs | null;
  /** Present when kind === 'internal_employee'. Parsed as PersonAttrs from directory.entities.attributes. */
  initialEmployeeAttrs?: PersonAttrs | null;
}

/**
 * Route dispatcher — renders one of three form components based on entity type.
 * Hooks must not be called here; each sub-component manages its own hook lifecycle.
 */
export function EntityStudioClient({ details, sourceOrgId, returnPath = '/network', initialPersonAttrs, initialCoupleAttrs, initialEmployeeAttrs }: EntityStudioClientProps) {
  const dirType = details.entityDirectoryType;

  if (details.kind === 'internal_employee' || details.kind === 'extended_team') {
    return (
      <EmployeeEntityForm
        details={details}
        sourceOrgId={sourceOrgId}
        initialAttrs={initialEmployeeAttrs ?? null}
        returnPath={returnPath ?? '/network'}
      />
    );
  }

  if (details.kind === 'external_partner' && dirType === 'person') {
    return (
      <FreelancerEntityForm
        details={details}
        sourceOrgId={sourceOrgId}
        initialAttrs={initialEmployeeAttrs ?? null}
        returnPath={returnPath ?? '/network'}
      />
    );
  }

  if (dirType === 'person' && initialPersonAttrs !== undefined) {
    return (
      <PersonEntityForm
        details={details}
        initialAttrs={initialPersonAttrs ?? { first_name: '', last_name: '', email: undefined, phone: undefined, category: undefined }}
        returnPath={returnPath}
      />
    );
  }
  if (dirType === 'couple' && initialCoupleAttrs !== undefined) {
    return (
      <CoupleEntityForm
        details={details}
        initialAttrs={initialCoupleAttrs ?? { partner_a_first_name: '', partner_a_last_name: '', partner_a_email: undefined, partner_b_first_name: '', partner_b_last_name: '', partner_b_email: undefined, category: undefined }}
        returnPath={returnPath}
      />
    );
  }
  return <CompanyEntityForm details={details} sourceOrgId={sourceOrgId} returnPath={returnPath} />;
}

function CompanyEntityForm({ details, sourceOrgId, returnPath = '/network' }: { details: NodeDetail; sourceOrgId: string; returnPath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hasChanges, setHasChanges] = React.useState(false);

  const ghostOrgId = details.targetOrgId ?? '';
  const relationshipId = details.relationshipId ?? '';
  const ops = (details.orgOperationalSettings ?? {}) as Record<string, unknown>;
  const addr = details.orgAddress ?? {};
  const tags = details.relationshipTags ?? [];

  const [name, setName] = React.useState(details.identity.name ?? '');
  const [website, setWebsite] = React.useState(details.orgWebsite ?? '');
  const [brandColor, setBrandColor] = React.useState(details.orgBrandColor ?? '#1a1a1a');
  const [logoUrl, setLogoUrl] = React.useState(details.orgLogoUrl ?? '');
  const [doingBusinessAs, setDoingBusinessAs] = React.useState((ops.doing_business_as as string) ?? '');
  const [entityType, setEntityType] = React.useState<string>((ops.entity_type as string) ?? 'organization');
  const [supportEmail, setSupportEmail] = React.useState(details.orgSupportEmail ?? '');
  const [phone, setPhone] = React.useState((ops.phone as string) ?? '');
  const [address, setAddress] = React.useState({
    street: (addr as { street?: string }).street ?? '',
    city: (addr as { city?: string }).city ?? '',
    state: (addr as { state?: string }).state ?? '',
    postal_code: (addr as { postal_code?: string }).postal_code ?? '',
    country: (addr as { country?: string }).country ?? '',
  });
  const [relType, setRelType] = React.useState(details.relationshipTypeRaw ?? details.direction ?? 'vendor');
  const [lifecycle, setLifecycle] = React.useState(details.lifecycleStatus ?? 'active');
  const [blacklistReason, setBlacklistReason] = React.useState(details.blacklistReason ?? '');
  const [localTags, setLocalTags] = React.useState<string[]>(tags);
  const [notes, setNotes] = React.useState(details.notes ?? '');
  const [taxId, setTaxId] = React.useState((ops.tax_id as string) ?? '');
  const [paymentTerms, setPaymentTerms] = React.useState((ops.payment_terms as string) ?? '');
  const [defaultCurrency, setDefaultCurrency] = React.useState(details.orgDefaultCurrency ?? 'USD');
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const markChanged = React.useCallback(() => setHasChanges(true), []);

  const resetToEmpty = React.useCallback(() => {
    setName('');
    setWebsite('');
    setBrandColor('#1a1a1a');
    setLogoUrl('');
    setDoingBusinessAs('');
    setEntityType('organization');
    setSupportEmail('');
    setPhone('');
    setAddress({ street: '', city: '', state: '', postal_code: '', country: '' });
    setLocalTags([]);
    setNotes('');
    setTaxId('');
    setPaymentTerms('');
    setDefaultCurrency('USD');
    setHasChanges(true);
    setResetConfirmOpen(false);
  }, []);

  const handleDelete = React.useCallback(() => {
    if (!relationshipId || !sourceOrgId) return;
    startTransition(async () => {
      const result = await softDeleteGhostRelationship(relationshipId, sourceOrgId);
      setDeleteConfirmOpen(false);
      if (result.ok) {
        toast.success('Connection deleted. You can restore it within 30 days from the Network page.');
        router.push(returnPath);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }, [relationshipId, sourceOrgId, router]);

  const handleEnrich = React.useCallback(
    (data: ScoutResult) => {
      const mergedName = data.name ?? name;
      const mergedWebsite = data.website ?? website;
      const mergedLogoUrl = data.logoUrl ?? logoUrl;
      const mergedDoingBusinessAs = data.doingBusinessAs ?? doingBusinessAs;
      const mergedEntityType = data.entityType ?? entityType;
      const mergedSupportEmail =
        data.supportEmail != null && data.supportEmail !== '' ? String(data.supportEmail) : supportEmail;
      const mergedPhone = data.phone != null && data.phone !== '' ? String(data.phone) : phone;
      const mergedBrandColor = data.brandColor ?? brandColor;
      const mergedAddress = data.address
        ? {
            street: data.address?.street ?? '',
            city: data.address?.city ?? '',
            state: data.address?.state ?? '',
            postal_code: data.address?.postal_code ?? '',
            country: data.address?.country ?? '',
          }
        : address;
      const mergedTags = data.tags?.length ? data.tags : localTags;

      setName(mergedName);
      setWebsite(mergedWebsite);
      setLogoUrl(mergedLogoUrl);
      setDoingBusinessAs(mergedDoingBusinessAs);
      setEntityType(mergedEntityType);
      setSupportEmail(mergedSupportEmail);
      setPhone(mergedPhone);
      setBrandColor(mergedBrandColor);
      setAddress(mergedAddress);
      setLocalTags(mergedTags);
      setHasChanges(true);

      if (!ghostOrgId) return;

      startTransition(async () => {
        const formData = new FormData();
        formData.set('name', mergedName);
        formData.set('website', mergedWebsite);
        formData.set('brandColor', mergedBrandColor);
        formData.set('logoUrl', mergedLogoUrl);
        formData.set('doingBusinessAs', mergedDoingBusinessAs);
        formData.set('entityType', mergedEntityType);
        formData.set('supportEmail', mergedSupportEmail);
        formData.set('phone', mergedPhone);
        formData.set('address_street', mergedAddress.street);
        formData.set('address_city', mergedAddress.city);
        formData.set('address_state', mergedAddress.state);
        formData.set('address_postal_code', mergedAddress.postal_code);
        formData.set('address_country', mergedAddress.country);
        formData.set('category', relType === 'client' ? 'client' : relType === 'partner' ? 'coordinator' : relType);
        formData.set('taxId', taxId);
        formData.set('paymentTerms', paymentTerms);
        formData.set('defaultCurrency', defaultCurrency);

        const [profileResult, relResult, notesResult] = await Promise.all([
          updateGhostProfile(ghostOrgId, formData),
          updateRelationshipMeta(relationshipId, sourceOrgId, {
            type: (relType === 'client' ? 'client_company' : relType) as 'vendor' | 'venue' | 'client_company' | 'partner',
            lifecycleStatus: lifecycle as 'prospect' | 'active' | 'dormant' | 'blacklisted',
            blacklistReason: lifecycle === 'blacklisted' ? blacklistReason : null,
            tags: mergedTags.length ? mergedTags : null,
          }),
          updateRelationshipNotes(relationshipId, notes),
        ]);

        const err =
          profileResult.error ||
          (relResult.ok === false ? relResult.error : null) ||
          (notesResult.ok === false ? notesResult.error : null);
        if (err) {
          toast.error(err);
          return;
        }

        if (data.roster?.length && sourceOrgId) {
          const rosterResult = await addScoutRosterToGhostOrg(sourceOrgId, ghostOrgId, data.roster);
          if (rosterResult.error) {
            toast.error(rosterResult.error);
            return;
          }
          if (rosterResult.addedCount > 0) {
            toast.success(`Profile and roster updated. Added ${rosterResult.addedCount} team member(s).`);
          } else {
            toast.success('Profile updated from Aion');
          }
        } else {
          toast.success('Profile updated from Aion');
        }
        setHasChanges(false);
        router.refresh();
      });
    },
    [
      ghostOrgId,
      sourceOrgId,
      relationshipId,
      name,
      website,
      logoUrl,
      doingBusinessAs,
      entityType,
      supportEmail,
      phone,
      brandColor,
      address,
      localTags,
      relType,
      lifecycle,
      blacklistReason,
      notes,
      taxId,
      paymentTerms,
      defaultCurrency,
    ]
  );

  const handleSave = () => {
    if (!ghostOrgId) {
      toast.error('This profile is managed by its owner and cannot be edited here.');
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set('name', name);
      formData.set('website', website);
      formData.set('brandColor', brandColor);
      formData.set('logoUrl', logoUrl);
      formData.set('doingBusinessAs', doingBusinessAs);
      formData.set('entityType', entityType);
      formData.set('supportEmail', supportEmail);
      formData.set('phone', phone);
      formData.set('address_street', address.street);
      formData.set('address_city', address.city);
      formData.set('address_state', address.state);
      formData.set('address_postal_code', address.postal_code);
      formData.set('address_country', address.country);
      formData.set('category', relType === 'client' ? 'client' : relType === 'partner' ? 'coordinator' : relType);
      formData.set('taxId', taxId);
      formData.set('paymentTerms', paymentTerms);
      formData.set('defaultCurrency', defaultCurrency);

      const [profileResult, relResult, notesResult] = await Promise.all([
        updateGhostProfile(ghostOrgId, formData),
        updateRelationshipMeta(relationshipId, sourceOrgId, {
          type: (relType === 'client' ? 'client_company' : relType) as 'vendor' | 'venue' | 'client_company' | 'partner',
          lifecycleStatus: lifecycle as 'prospect' | 'active' | 'dormant' | 'blacklisted',
          blacklistReason: lifecycle === 'blacklisted' ? blacklistReason : null,
          tags: localTags.length ? localTags : null,
        }),
        updateRelationshipNotes(relationshipId, notes),
      ]);

      const err = profileResult.error || (relResult.ok === false ? relResult.error : null) || (notesResult.ok === false ? notesResult.error : null);
      if (err) {
        toast.error(err);
      } else {
        toast.success('Saved');
        setHasChanges(false);
        router.push(returnPath);
        router.refresh();
      }
    });
  };

  const addTag = () => {
    const t = (document.getElementById('tag-input') as HTMLInputElement)?.value?.trim();
    if (t && !localTags.includes(t)) {
      setLocalTags([...localTags, t]);
      (document.getElementById('tag-input') as HTMLInputElement).value = '';
    }
    markChanged();
  };

  return (
    <div className="min-h-screen bg-[var(--stage-void)] pb-32">
      <header className="sticky top-0 z-20 bg-[var(--stage-void)]/80  border-b border-[oklch(1_0_0_/_0.08)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Entity Studio
            </p>
            <h1 className="text-xl font-light text-[var(--stage-text-primary)] tracking-tight">
              {name || 'Untitled Entity'}
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

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Column A: Identity (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <section className="stage-panel rounded-2xl p-6 space-y-6">
            <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest border-b border-[oklch(1_0_0_/_0.08)] pb-4">
              Core Identity
            </h3>
            <div className="flex items-center gap-4">
              <div
                className="relative size-16 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-[oklch(1_0_0_/_0.08)]"
                style={{ backgroundColor: brandColor && !logoUrl ? `${brandColor}20` : undefined }}
              >
                {logoUrl ? (
                  <>
                    {/* Cool neutral light base for dark logos — avoids warm/brown tint */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, oklch(0.97 0 0 / 0.7) 0%, oklch(0.91 0.01 250 / 0.4) 50%, transparent 100%)',
                      }}
                      aria-hidden
                    />
                    <img
                      src={logoUrl}
                      alt=""
                      className="relative z-10 size-full object-contain p-2"
                    />
                  </>
                ) : (
                  <span className="text-2xl font-light text-[var(--stage-text-secondary)]">
                    {(name?.[0] ?? '?').toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <label className={LABEL}>Name</label>
                  <Input
                    value={name}
                    onChange={(e) => { setName(e.target.value); markChanged(); }}
                    className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
                  />
                </div>
                <div>
                  <label className={LABEL}>Logo URL</label>
                  <Input
                    value={logoUrl}
                    onChange={(e) => { setLogoUrl(e.target.value); markChanged(); }}
                    placeholder="https://..."
                    className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] text-xs"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className={LABEL}>Doing business as</label>
              <Input
                value={doingBusinessAs}
                onChange={(e) => { setDoingBusinessAs(e.target.value); markChanged(); }}
                placeholder="e.g. NV Productions LLC"
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Entity type</label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); markChanged(); }}
                className="mt-1 w-full rounded-lg bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                <option value="organization">Organization</option>
                <option value="single_operator">Single operator</option>
              </select>
            </div>
            <ColorTuner value={brandColor} onChange={(v) => { setBrandColor(v); markChanged(); }} />
          </section>
        </div>

        {/* Column B: Intelligence + Classification (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <section className="stage-panel rounded-2xl p-6 space-y-6">
            <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest border-b border-[oklch(1_0_0_/_0.08)] pb-4">
              Digital Intelligence
            </h3>
            <AionScoutInput
              value={website}
              onChange={(v) => { setWebsite(v); markChanged(); }}
              onEnrich={handleEnrich}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>General email</label>
                <Input
                  value={supportEmail}
                  onChange={(e) => { setSupportEmail(e.target.value); markChanged(); }}
                  placeholder="booking@example.com"
                  className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
                />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); markChanged(); }}
                  placeholder="Main office line"
                  className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Street</label>
                <Input
                  value={address.street}
                  onChange={(e) => { setAddress((a) => ({ ...a, street: e.target.value })); markChanged(); }}
                  className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>City</label>
                <Input
                  value={address.city}
                  onChange={(e) => { setAddress((a) => ({ ...a, city: e.target.value })); markChanged(); }}
                  className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>State</label>
                <Input
                  value={address.state}
                  onChange={(e) => { setAddress((a) => ({ ...a, state: e.target.value })); markChanged(); }}
                  className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>Postal code</label>
                <Input
                  value={address.postal_code}
                  onChange={(e) => { setAddress((a) => ({ ...a, postal_code: e.target.value })); markChanged(); }}
                  className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] text-xs"
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Country</label>
              <Input
                value={address.country}
                onChange={(e) => { setAddress((a) => ({ ...a, country: e.target.value })); markChanged(); }}
                className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)] text-xs"
              />
            </div>
          </section>

          <AccordionSection label="Classification" icon={Tag} defaultOpen>
            <div className="space-y-4">
              <div>
                <label className={LABEL}>Relationship role</label>
                <select
                  value={relType}
                  onChange={(e) => { setRelType(e.target.value as 'vendor' | 'partner' | 'client'); markChanged(); }}
                  className="mt-1 w-full rounded-lg bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  <option value="vendor">Vendor</option>
                  <option value="client">Client</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Lifecycle</label>
                <select
                  value={lifecycle}
                  onChange={(e) => { setLifecycle(e.target.value as 'prospect' | 'active' | 'dormant' | 'blacklisted'); markChanged(); }}
                  className="mt-1 w-full rounded-lg bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="dormant">Dormant</option>
                  <option value="blacklisted">Blacklisted</option>
                </select>
              </div>
              {lifecycle === 'blacklisted' && (
                <div>
                  <label className={LABEL}>Blacklist reason</label>
                  <Input
                    value={blacklistReason}
                    onChange={(e) => { setBlacklistReason(e.target.value); markChanged(); }}
                    className="mt-1 bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
                  />
                </div>
              )}
              <div>
                <label className={LABEL}>Tags</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {localTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] px-2 py-0.5 text-xs"
                    >
                      {t}
                      <button type="button" onClick={() => { setLocalTags(localTags.filter((x) => x !== t)); markChanged(); }}>×</button>
                    </span>
                  ))}
                  <div className="flex gap-1">
                    <Input id="tag-input" placeholder="Add tag" className="w-24 h-8 text-xs bg-[oklch(1_0_0_/_0.05)]" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
                    <Button type="button" variant="ghost" size="sm" onClick={addTag}>Add</Button>
                  </div>
                </div>
              </div>
            </div>
          </AccordionSection>

          {(relType === 'vendor' || relType === 'partner') && (
            <AccordionSection label="Financial" icon={DollarSign}>
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>Tax ID</label>
                  <Input value={taxId} onChange={(e) => { setTaxId(e.target.value); markChanged(); }} className="mt-1 bg-[oklch(1_0_0_/_0.05)]" />
                </div>
                <div>
                  <label className={LABEL}>Currency</label>
                  <select value={defaultCurrency} onChange={(e) => { setDefaultCurrency(e.target.value); markChanged(); }} className="mt-1 w-full rounded-lg bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Payment terms</label>
                  <select value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); markChanged(); }} className="mt-1 w-full rounded-lg bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]">
                    <option value="">—</option>
                    <option value="immediate">Immediate</option>
                    <option value="net_15">Net 15</option>
                    <option value="net_30">Net 30</option>
                    <option value="50_deposit">50% deposit</option>
                  </select>
                </div>
              </div>
            </AccordionSection>
          )}

          <AccordionSection label="Private notes" icon={FileText} defaultOpen>
            <Textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); markChanged(); }}
              placeholder="Internal notes about this partner…"
              className="min-h-[100px] resize-y bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
              rows={4}
            />
          </AccordionSection>

          <section className="rounded-2xl border border-[oklch(1_0_0_/_0.08)]/80 bg-[oklch(1_0_0_/_0.02)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[oklch(1_0_0_/_0.08)]">
              <h3 className="text-xs font-bold text-[var(--stage-text-secondary)] uppercase tracking-widest">
                Danger zone
              </h3>
            </div>
            <div className="px-5 py-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                className="gap-2 border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]"
              >
                <RotateCcw className="size-4" />
                Reset all fields
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                className="gap-2 border-[var(--color-unusonic-error)]/50 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
              >
                <Trash2 className="size-4" />
                Delete connection
              </Button>
            </div>
          </section>

          <AccordionSection label="Roster" icon={Users}>
            <RosterSection
              crew={details.crew ?? []}
              sourceOrgId={sourceOrgId}
              ghostOrgId={ghostOrgId}
              onRefresh={() => router.refresh()}
            />
          </AccordionSection>

          {/* Cross-module context panels — use subjectEntityId (directory.entities.id),
              NOT details.id which is the cortex relationship edge ID */}
          {details.subjectEntityId && (
            <>
              <AssignmentsPanel entityId={details.subjectEntityId} />
              <DealsPanel entityId={details.subjectEntityId} />
              <FinancePanel entityId={details.subjectEntityId} />
            </>
          )}

          {details.entityDirectoryType === 'venue' && details.subjectEntityId && details.orgVenueSpecs && (
            <VenueTechSpecsCard
              entityId={details.subjectEntityId}
              initialSpecs={details.orgVenueSpecs}
            />
          )}
        </div>
      </div>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset all fields?</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <p className="px-6 pb-6 text-sm text-[var(--stage-text-secondary)]">
            This will clear every field on this form. You can save afterward to persist the reset, or leave without saving to keep existing data.
          </p>
          <div className="flex gap-3 px-6 pb-6">
            <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={resetToEmpty} className="flex-1 bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] border border-[var(--stage-accent)]/40">
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this connection?</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <p className="px-6 pb-6 text-sm text-[var(--stage-text-secondary)]">
            This connection will be removed from your network. You can restore it within 30 days from the Network page. After that it may be permanently deleted.
          </p>
          <div className="flex gap-3 px-6 pb-6">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
              className="flex-1 border-[var(--color-unusonic-error)]/50 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RosterSection({
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
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2">
            <div className="size-10 rounded-full bg-[var(--stage-surface-raised)] flex items-center justify-center overflow-hidden">
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : <span className="text-sm text-[var(--stage-text-secondary)]">{(m.name?.[0] ?? '?').toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">{m.name}</p>
              {(() => {
                const visibleEmail = m.email && !m.email.startsWith('ghost-') && !m.email.endsWith('.local') ? m.email : null;
                const subtitle = [m.jobTitle, visibleEmail].filter(Boolean).join(' · ');
                return subtitle ? (
                  <p className="text-xs text-[var(--stage-text-secondary)] truncate">{subtitle}</p>
                ) : null;
              })()}
            </div>
          </li>
        ))}
      </ul>
      {!showAdd ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(true)} className="gap-2 border-[var(--stage-accent)]/40 text-[var(--stage-accent)]">
          Add contact
        </Button>
      ) : (
        <div ref={addRef} className="rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input name="ac_firstName" placeholder="First name" className="bg-[oklch(1_0_0_/_0.05)]" />
            <Input name="ac_lastName" placeholder="Last name" className="bg-[oklch(1_0_0_/_0.05)]" />
          </div>
          <Input name="ac_email" type="email" placeholder="Email" className="bg-[oklch(1_0_0_/_0.05)]" />
          <div className="grid grid-cols-2 gap-3">
            <Input name="ac_role" placeholder="Role" className="bg-[oklch(1_0_0_/_0.05)]" />
            <Input name="ac_jobTitle" placeholder="Job title" className="bg-[oklch(1_0_0_/_0.05)]" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving} className="bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]">
              {saving ? 'Saving…' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
