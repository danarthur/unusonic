'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Globe,
  Tag,
  DollarSign,
  Users,
  FileText,
  ArrowLeft,
  UserPlus,
} from 'lucide-react';
import { ScoutTrigger } from './ScoutTrigger';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  updateGhostProfile,
  updateRelationshipNotes,
  updateRelationshipMeta,
  updateGhostMember,
  addContactToGhostOrg,
  addScoutRosterToGhostOrg,
} from '@/features/network-data';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

const LABEL = 'text-[10px] font-medium text-[var(--color-ink-muted)] uppercase tracking-widest';

interface DossierEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  details: NodeDetail;
  sourceOrgId: string;
}

function AccordionSection({
  id,
  label,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  id: string;
  label: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--color-mercury)] bg-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          <Icon className="size-3.5" />
          {label}
        </span>
        <ChevronDown
          className={cn('size-4 text-[var(--color-ink-muted)] transition-transform', open && 'rotate-180')}
        />
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
            <div className="px-4 pb-4 pt-1 space-y-4 border-t border-[var(--color-mercury)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DossierEditor({ open, onOpenChange, details, sourceOrgId }: DossierEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ghostOrgId = details.targetOrgId ?? '';
  const relationshipId = details.relationshipId;
  const crew = details.crew ?? [];

  const ops = (details.orgOperationalSettings ?? {}) as Record<string, unknown>;
  const taxId = (ops.tax_id as string) ?? '';
  const paymentTerms = (ops.payment_terms as string) ?? '';
  const doingBusinessAs = (ops.doing_business_as as string) ?? '';
  const entityType = (ops.entity_type as string) ?? '';
  const phone = (ops.phone as string) ?? '';
  const addr = details.orgAddress ?? {};
  const tags = details.relationshipTags ?? [];

  const [brandColor, setBrandColor] = React.useState(details.orgBrandColor ?? '#1a1a1a');
  const [relType, setRelType] = React.useState(details.direction ?? 'vendor');
  const [lifecycle, setLifecycle] = React.useState(details.lifecycleStatus ?? 'active');
  const [blacklistReason, setBlacklistReason] = React.useState(details.blacklistReason ?? '');
  const [tagInput, setTagInput] = React.useState('');
  const [localTags, setLocalTags] = React.useState<string[]>(tags);
  const [showAddCrew, setShowAddCrew] = React.useState(false);
  const [editingMemberId, setEditingMemberId] = React.useState<string | null>(null);
  const [enrichmentPreview, setEnrichmentPreview] = React.useState<{
    logoUrl?: string | null;
    name?: string | null;
  } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const handleEnrich = React.useCallback(
    (data: import('@/features/intelligence').ScoutResult) => {
      const form = formRef.current;
      if (!form) return;
      const set = (name: string, v: string) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el && el instanceof HTMLInputElement) el.value = v;
      };
      const setSelect = (name: string, v: string) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el && el instanceof HTMLSelectElement) el.value = v;
      };
      if (data.name) set('name', data.name);
      if (data.website) set('website', data.website);
      if (data.logoUrl) set('logoUrl', data.logoUrl);
      if (data.doingBusinessAs) set('doingBusinessAs', data.doingBusinessAs);
      if (data.supportEmail) set('supportEmail', data.supportEmail);
      if (data.phone) set('phone', data.phone ?? '');
      if (data.entityType) setSelect('entityType', data.entityType);
      const mergedBrandColor = data.brandColor ?? brandColor;
      setBrandColor(mergedBrandColor);
      if (data.address) {
        set('address_street', data.address?.street ?? '');
        set('address_city', data.address?.city ?? '');
        set('address_state', data.address?.state ?? '');
        set('address_postal_code', data.address?.postal_code ?? '');
        set('address_country', data.address?.country ?? '');
      }
      const mergedTags = data.tags?.length ? data.tags : localTags;
      if (data.tags?.length) setLocalTags(data.tags);
      setEnrichmentPreview({ logoUrl: data.logoUrl ?? null, name: data.name ?? null });

      if (!ghostOrgId || !relationshipId) return;

      startTransition(async () => {
        const formData = new FormData(form);
        formData.set('brandColor', mergedBrandColor);
        formData.set('category', relType === 'client' ? 'client' : relType === 'partner' ? 'coordinator' : relType);

        const [profileResult, relResult, notesResult] = await Promise.all([
          updateGhostProfile(ghostOrgId, formData),
          updateRelationshipMeta(relationshipId, sourceOrgId, {
            type: (relType === 'client' ? 'client_company' : relType) as 'vendor' | 'venue' | 'client_company' | 'partner',
            lifecycleStatus: lifecycle as 'prospect' | 'active' | 'dormant' | 'blacklisted',
            blacklistReason: lifecycle === 'blacklisted' ? blacklistReason : null,
            tags: mergedTags.length ? mergedTags : null,
          }),
          updateRelationshipNotes(relationshipId, (formData.get('notes') as string) || null),
        ]);

        const err =
          profileResult.error ||
          (relResult.ok === false ? relResult.error : null) ||
          (notesResult.ok === false ? notesResult.error : null);
        if (err) {
          toast.error(err);
          return;
        }

        if (data.roster?.length) {
          const rosterResult = await addScoutRosterToGhostOrg(sourceOrgId, ghostOrgId, data.roster);
          if (rosterResult.error) {
            toast.error(rosterResult.error);
            return;
          }
          if (rosterResult.addedCount > 0) {
            toast.success(`Profile and roster updated. Added ${rosterResult.addedCount} team member(s).`);
          } else {
            toast.success('Profile updated from ION');
          }
        } else {
          toast.success('Profile updated from ION');
        }
        router.refresh();
      });
    },
    [ghostOrgId, sourceOrgId, relationshipId, brandColor, localTags, relType, lifecycle, blacklistReason]
  );

  React.useEffect(() => {
    if (open) {
      setBrandColor(details.orgBrandColor ?? '#1a1a1a');
      setRelType(details.direction ?? 'vendor');
      setLifecycle(details.lifecycleStatus ?? 'active');
      setBlacklistReason(details.blacklistReason ?? '');
      setLocalTags(details.relationshipTags ?? []);
      setEnrichmentPreview(null);
    }
  }, [open, details]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ghostOrgId) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('brandColor', brandColor);
    formData.set('category', relType === 'client' ? 'client' : relType === 'partner' ? 'coordinator' : relType);

    startTransition(async () => {
      const [profileResult, relResult, notesResult] = await Promise.all([
        updateGhostProfile(ghostOrgId, formData),
        updateRelationshipMeta(relationshipId!, sourceOrgId, {
          type: (relType === 'client' ? 'client_company' : relType) as 'vendor' | 'venue' | 'client_company' | 'partner',
          lifecycleStatus: lifecycle as 'prospect' | 'active' | 'dormant' | 'blacklisted',
          blacklistReason: lifecycle === 'blacklisted' ? blacklistReason : null,
          tags: localTags.length ? localTags : null,
        }),
        updateRelationshipNotes(relationshipId!, (formData.get('notes') as string) || null),
      ]);

      const err = profileResult.error || (relResult.ok === false ? relResult.error : null) || (notesResult.ok === false ? notesResult.error : null);
      if (err) {
        toast.error(err);
      } else {
        toast.success('Saved');
        onOpenChange(false);
        router.refresh();
      }
    });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !localTags.includes(t)) setLocalTags([...localTags, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => setLocalTags(localTags.filter((x) => x !== t));

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--color-mercury)]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="gap-1.5 text-[var(--color-ink-muted)]"
        >
          <ArrowLeft className="size-4" />
          Done
        </Button>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* ID Card — always visible */}
        <div className="liquid-card rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div
              className="relative size-14 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-[var(--color-mercury)]"
              style={{ backgroundColor: brandColor ? `${brandColor}20` : undefined }}
            >
              {(enrichmentPreview?.logoUrl ?? details.orgLogoUrl) ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(248,250,252,0.7) 0%, rgba(226,232,240,0.4) 50%, transparent 100%)',
                    }}
                    aria-hidden
                  />
                  <img
                    src={enrichmentPreview?.logoUrl ?? details.orgLogoUrl ?? ''}
                    alt=""
                    className="relative z-10 size-full object-contain p-2"
                  />
                </>
              ) : (
                <span className="text-2xl font-light text-[var(--color-ink-muted)]">
                  {((enrichmentPreview?.name ?? details.identity.name)?.[0] ?? '?').toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <label className={LABEL}>Name</label>
                <Input
                  name="name"
                  defaultValue={details.identity.name}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-[var(--color-ink)]"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Brand color</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="w-9 h-9 p-0 border-0 rounded overflow-hidden cursor-pointer bg-white/5"
                      aria-label="Brand color"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value || '#000000')}
                      className="flex-1 bg-white/5 border-[var(--color-mercury)] font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Logo URL</label>
                  <Input
                    name="logoUrl"
                    defaultValue={details.orgLogoUrl ?? ''}
                    className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Doing business as</label>
              <Input
                name="doingBusinessAs"
                defaultValue={doingBusinessAs}
                className="mt-1 bg-white/5 border-[var(--color-mercury)]"
                placeholder="e.g. NV Productions LLC"
              />
            </div>
            <div>
              <label className={LABEL}>Entity type</label>
              <select
                name="entityType"
                defaultValue={entityType || 'organization'}
                className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
              >
                <option value="organization">Organization</option>
                <option value="single_operator">Single operator</option>
              </select>
            </div>
          </div>
        </div>

        <input type="hidden" name="brandColor" value={brandColor} />

        <AccordionSection id="comm" label="Communication" icon={Globe} defaultOpen>
          <div className="space-y-4">
            <div>
              <label className={LABEL}>Website</label>
              <Input
                name="website"
                defaultValue={details.orgWebsite ?? ''}
                placeholder="https://example.com"
                className="mt-1 bg-white/5 border-[var(--color-mercury)] font-mono text-xs"
              />
              <p className="text-[10px] text-[var(--color-ink-muted)] mt-1.5">
                Paste a URL above, then use ION to auto-fill identity and contact details.
              </p>
              <div className="mt-3">
                <ScoutTrigger
                  getUrl={() => formRef.current?.querySelector<HTMLInputElement>('[name="website"]')?.value ?? ''}
                  onEnrich={handleEnrich}
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>General email</label>
              <Input
                name="supportEmail"
                defaultValue={details.orgSupportEmail ?? ''}
                type="email"
                placeholder="booking@example.com"
                className="mt-1 bg-white/5 border-[var(--color-mercury)]"
              />
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <Input
                name="phone"
                defaultValue={phone}
                placeholder="Main office line"
                className="mt-1 bg-white/5 border-[var(--color-mercury)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL}>Street</label>
                <Input
                  name="address_street"
                  defaultValue={(addr as { street?: string }).street ?? ''}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>City</label>
                <Input
                  name="address_city"
                  defaultValue={(addr as { city?: string }).city ?? ''}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>State</label>
                <Input
                  name="address_state"
                  defaultValue={(addr as { state?: string }).state ?? ''}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>Postal code</label>
                <Input
                  name="address_postal_code"
                  defaultValue={(addr as { postal_code?: string }).postal_code ?? ''}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Country</label>
              <Input
                name="address_country"
                defaultValue={(addr as { country?: string }).country ?? ''}
                className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
              />
            </div>
          </div>
        </AccordionSection>

        <AccordionSection id="class" label="Classification" icon={Tag} defaultOpen>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>Relationship role</label>
              <select
                value={relType}
                onChange={(e) => setRelType(e.target.value as 'vendor' | 'client' | 'partner')}
                className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
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
                onChange={(e) => setLifecycle(e.target.value as typeof lifecycle)}
                className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
              >
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="dormant">Dormant</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </div>
            {lifecycle === 'blacklisted' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="overflow-hidden"
              >
                <label className={LABEL}>Blacklist reason</label>
                <Input
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder="Reason for blacklisting"
                  className="mt-1 bg-white/5 border-[var(--color-mercury)]"
                />
              </motion.div>
            )}
            <div>
              <label className={LABEL}>Tags / capabilities</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {localTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-silk)]/15 text-[var(--color-silk)] px-2 py-0.5 text-xs"
                  >
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="hover:opacity-80" aria-label={`Remove ${t}`}>
                      ×
                    </button>
                  </span>
                ))}
                <div className="flex gap-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="Add tag"
                    className="w-24 bg-white/5 border-[var(--color-mercury)] text-xs h-7"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={addTag} className="h-7 px-2">
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {(relType === 'vendor' || relType === 'partner') && (
          <AccordionSection id="ledger" label="Financial" icon={DollarSign}>
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Tax ID (EIN/VAT)</label>
                <Input
                  name="taxId"
                  defaultValue={taxId}
                  placeholder="XX-XXXXXXX"
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] font-mono"
                />
              </div>
              <div>
                <label className={LABEL}>Default currency</label>
                <select
                  name="defaultCurrency"
                  defaultValue={details.orgDefaultCurrency ?? 'USD'}
                  className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Payment terms</label>
                <select
                  name="paymentTerms"
                  defaultValue={paymentTerms}
                  className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
                >
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

        <AccordionSection id="roster" label="Roster" icon={Users} defaultOpen>
          <DossierRosterSection
            crew={crew}
            sourceOrgId={sourceOrgId}
            ghostOrgId={ghostOrgId}
            onRefresh={() => router.refresh()}
            editingMemberId={editingMemberId}
            setEditingMemberId={setEditingMemberId}
            showAddCrew={showAddCrew}
            setShowAddCrew={setShowAddCrew}
          />
        </AccordionSection>

        <AccordionSection id="notes" label="Private notes" icon={FileText}>
          <div>
            <p className="text-[10px] text-[var(--color-ink-muted)] mb-2">Internal only. Auto-saves.</p>
            <Textarea
              name="notes"
              defaultValue={details.notes ?? ''}
              placeholder="Notes about this partner…"
              className="min-h-[100px] resize-y bg-white/5 border-[var(--color-mercury)] text-[var(--color-ink)]"
              rows={4}
            />
          </div>
        </AccordionSection>

        <div className="pt-4 flex justify-end">
          <Button
            type="submit"
            disabled={isPending}
            className="bg-[var(--color-silk)]/20 text-[var(--color-silk)] border-[var(--color-silk)]/40 hover:bg-[var(--color-silk)]/30"
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

function DossierRosterSection({
  crew,
  sourceOrgId,
  ghostOrgId,
  onRefresh,
  editingMemberId,
  setEditingMemberId,
  showAddCrew,
  setShowAddCrew,
}: {
  crew: NodeDetailCrewMember[];
  sourceOrgId: string;
  ghostOrgId: string;
  onRefresh: () => void;
  editingMemberId: string | null;
  setEditingMemberId: (id: string | null) => void;
  showAddCrew: boolean;
  setShowAddCrew: (v: boolean) => void;
}) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const addCrewRef = React.useRef<HTMLDivElement>(null);

  const handleAddCrew = async () => {
    const el = addCrewRef.current;
    if (!el) return;
    const get = (name: string) => (el.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value?.trim() ?? '';
    const firstName = get('addCrew_firstName') || 'Contact';
    const lastName = get('addCrew_lastName');
    const email = get('addCrew_email') || undefined;
    const role = get('addCrew_role') || undefined;
    const jobTitle = get('addCrew_jobTitle') || undefined;
    setError(null);
    setStatus('loading');
    const result = await addContactToGhostOrg(sourceOrgId, ghostOrgId, {
      firstName,
      lastName,
      email: email || null,
      role: role || null,
      jobTitle: jobTitle || null,
    });
    if (result.ok) {
      setStatus('success');
      el.querySelectorAll('input').forEach((i) => (i.value = ''));
      setShowAddCrew(false);
      onRefresh();
    } else {
      setError(result.error ?? 'Could not add contact.');
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {crew.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2"
          >
            <div className="size-10 shrink-0 rounded-full bg-[var(--color-glass-surface)] border border-[var(--color-mercury)] flex items-center justify-center overflow-hidden">
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-sm text-[var(--color-ink-muted)]">
                  {(m.name?.[0] ?? '?').toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-ink)]">{m.name}</p>
              {(m.email || m.role || m.jobTitle) && (
                <p className="text-xs text-[var(--color-ink-muted)] truncate">
                  {[m.jobTitle, m.role, m.email].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingMemberId(editingMemberId === m.id ? null : m.id)}
              className="text-[var(--color-silk)]"
            >
              Edit
            </Button>
          </li>
        ))}
      </ul>

      {editingMemberId && (
        <CrewMemberEditor
          member={crew.find((c) => c.id === editingMemberId)!}
          sourceOrgId={sourceOrgId}
          onSaved={() => {
            setEditingMemberId(null);
            onRefresh();
          }}
          onCancel={() => setEditingMemberId(null)}
        />
      )}

      {!showAddCrew ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddCrew(true)}
          className="gap-2 border-[var(--color-silk)]/40 text-[var(--color-silk)]"
        >
          <UserPlus className="size-4" />
          Add contact
        </Button>
      ) : (
        <motion.div
          ref={addCrewRef}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="overflow-hidden rounded-xl border border-[var(--color-mercury)] bg-white/5 p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="addCrew_firstName"
              placeholder="First name"
              className="bg-white/5 border-[var(--color-mercury)]"
            />
            <Input name="addCrew_lastName" placeholder="Last name" className="bg-white/5 border-[var(--color-mercury)]" />
          </div>
          <Input name="addCrew_email" type="email" placeholder="Email (optional)" className="bg-white/5 border-[var(--color-mercury)]" />
          <div className="grid grid-cols-2 gap-3">
            <Input name="addCrew_role" placeholder="Role (e.g. admin)" className="bg-white/5 border-[var(--color-mercury)]" />
            <Input name="addCrew_jobTitle" placeholder="Job title" className="bg-white/5 border-[var(--color-mercury)]" />
          </div>
          {error && <p className="text-xs text-[var(--color-signal-error)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={status === 'loading'} onClick={handleAddCrew} className="bg-[var(--color-silk)]/20 text-[var(--color-silk)]">
              {status === 'loading' ? 'Adding…' : 'Add contact'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddCrew(false)}>
              Cancel
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function CrewMemberEditor({
  member,
  sourceOrgId,
  onSaved,
  onCancel,
}: {
  member: NodeDetailCrewMember;
  sourceOrgId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [avatarUrl, setAvatarUrl] = React.useState(member.avatarUrl ?? '');
  const [role, setRole] = React.useState(member.role ?? 'member');
  const [jobTitle, setJobTitle] = React.useState(member.jobTitle ?? '');
  const [phone, setPhone] = React.useState(member.phone ?? '');
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGhostMember(sourceOrgId, member.id, {
        avatarUrl: avatarUrl || null,
        role: role || null,
        jobTitle: jobTitle || null,
        phone: phone || null,
      });
      if (result.ok) onSaved();
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-[var(--color-mercury)] bg-white/5 p-4 space-y-3"
    >
      <p className="text-xs font-medium text-[var(--color-ink-muted)]">Edit {member.name}</p>
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-full bg-[var(--color-glass-surface)] border border-[var(--color-mercury)] overflow-hidden flex items-center justify-center">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-lg text-[var(--color-ink-muted)]">{(member.name?.[0] ?? '?').toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1">
          <label className={LABEL}>Avatar URL</label>
          <Input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Job title</label>
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Production Manager"
            className="mt-1 bg-white/5 border-[var(--color-mercury)]"
          />
        </div>
      </div>
      <div>
        <label className={LABEL}>Phone</label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Direct line"
          className="mt-1 bg-white/5 border-[var(--color-mercury)]"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={pending} className="bg-[var(--color-silk)]/20 text-[var(--color-silk)]">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}
