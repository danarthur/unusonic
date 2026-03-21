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
import { ColorTuner } from '@/features/org-identity';
import { SignalScoutInput } from '@/widgets/network-detail/ui/SignalScoutInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shared/ui/dialog';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

const LABEL = 'text-[10px] font-medium text-[var(--color-ink-muted)] uppercase tracking-widest';

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
    <div className="rounded-2xl border border-[var(--color-mercury)] bg-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
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
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[var(--color-mercury)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface EntityStudioClientProps {
  details: NodeDetail;
  sourceOrgId: string;
}

export function EntityStudioClient({ details, sourceOrgId }: EntityStudioClientProps) {
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
  const [relType, setRelType] = React.useState(details.direction ?? 'vendor');
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
        router.push('/network');
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

        let err =
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
            toast.success('Profile updated from ION');
          }
        } else {
          toast.success('Profile updated from ION');
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
    if (!ghostOrgId) return;
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
        router.push(`/network?nodeId=${details.id}&kind=external_partner`);
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
    <div className="min-h-screen bg-[var(--color-obsidian)] pb-32">
      <header className="sticky top-0 z-20 bg-[var(--color-obsidian)]/80 backdrop-blur-xl border-b border-[var(--color-mercury)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/network')} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-medium text-[var(--color-ink-muted)] uppercase tracking-widest">
              Entity Studio
            </p>
            <h1 className="text-xl font-light text-[var(--color-ink)] tracking-tight">
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
              <span className="text-xs text-[var(--color-ink-muted)]">Unsaved changes</span>
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="gap-2 bg-[var(--color-silk)]/20 text-[var(--color-silk)] border-[var(--color-silk)]/40 hover:bg-[var(--color-silk)]/30"
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
          <section className="liquid-card rounded-2xl p-6 space-y-6">
            <h3 className="text-xs font-bold text-[var(--color-ink-muted)] uppercase tracking-widest border-b border-[var(--color-mercury)] pb-4">
              Core Identity
            </h3>
            <div className="flex items-center gap-4">
              <div
                className="relative size-16 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-[var(--color-mercury)]"
                style={{ backgroundColor: brandColor && !logoUrl ? `${brandColor}20` : undefined }}
              >
                {logoUrl ? (
                  <>
                    {/* Cool neutral light base for dark logos — avoids warm/brown tint */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(248,250,252,0.7) 0%, rgba(226,232,240,0.4) 50%, transparent 100%)',
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
                  <span className="text-2xl font-light text-[var(--color-ink-muted)]">
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
                    className="mt-1 bg-white/5 border-[var(--color-mercury)]"
                  />
                </div>
                <div>
                  <label className={LABEL}>Logo URL</label>
                  <Input
                    value={logoUrl}
                    onChange={(e) => { setLogoUrl(e.target.value); markChanged(); }}
                    placeholder="https://..."
                    className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
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
                className="mt-1 bg-white/5 border-[var(--color-mercury)]"
              />
            </div>
            <div>
              <label className={LABEL}>Entity type</label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); markChanged(); }}
                className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
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
          <section className="liquid-card rounded-2xl p-6 space-y-6">
            <h3 className="text-xs font-bold text-[var(--color-ink-muted)] uppercase tracking-widest border-b border-[var(--color-mercury)] pb-4">
              Digital Intelligence
            </h3>
            <SignalScoutInput
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
                  className="mt-1 bg-white/5 border-[var(--color-mercury)]"
                />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); markChanged(); }}
                  placeholder="Main office line"
                  className="mt-1 bg-white/5 border-[var(--color-mercury)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Street</label>
                <Input
                  value={address.street}
                  onChange={(e) => { setAddress((a) => ({ ...a, street: e.target.value })); markChanged(); }}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>City</label>
                <Input
                  value={address.city}
                  onChange={(e) => { setAddress((a) => ({ ...a, city: e.target.value })); markChanged(); }}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>State</label>
                <Input
                  value={address.state}
                  onChange={(e) => { setAddress((a) => ({ ...a, state: e.target.value })); markChanged(); }}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>Postal code</label>
                <Input
                  value={address.postal_code}
                  onChange={(e) => { setAddress((a) => ({ ...a, postal_code: e.target.value })); markChanged(); }}
                  className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Country</label>
              <Input
                value={address.country}
                onChange={(e) => { setAddress((a) => ({ ...a, country: e.target.value })); markChanged(); }}
                className="mt-1 bg-white/5 border-[var(--color-mercury)] text-xs"
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
                  onChange={(e) => { setLifecycle(e.target.value as 'prospect' | 'active' | 'dormant' | 'blacklisted'); markChanged(); }}
                  className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm text-[var(--color-ink)]"
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
                    className="mt-1 bg-white/5 border-[var(--color-mercury)]"
                  />
                </div>
              )}
              <div>
                <label className={LABEL}>Tags</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {localTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-silk)]/15 text-[var(--color-silk)] px-2 py-0.5 text-xs"
                    >
                      {t}
                      <button type="button" onClick={() => { setLocalTags(localTags.filter((x) => x !== t)); markChanged(); }}>×</button>
                    </span>
                  ))}
                  <div className="flex gap-1">
                    <Input id="tag-input" placeholder="Add tag" className="w-24 h-8 text-xs bg-white/5" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
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
                  <Input value={taxId} onChange={(e) => { setTaxId(e.target.value); markChanged(); }} className="mt-1 bg-white/5" />
                </div>
                <div>
                  <label className={LABEL}>Currency</label>
                  <select value={defaultCurrency} onChange={(e) => { setDefaultCurrency(e.target.value); markChanged(); }} className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Payment terms</label>
                  <select value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); markChanged(); }} className="mt-1 w-full rounded-lg bg-white/5 border border-[var(--color-mercury)] px-3 py-2 text-sm">
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
              className="min-h-[100px] resize-y bg-white/5 border-[var(--color-mercury)]"
              rows={4}
            />
          </AccordionSection>

          <section className="rounded-2xl border border-[var(--color-mercury)]/80 bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-mercury)]">
              <h3 className="text-xs font-bold text-[var(--color-ink-muted)] uppercase tracking-widest">
                Danger zone
              </h3>
            </div>
            <div className="px-5 py-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                className="gap-2 border-[var(--color-mercury)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-white/5"
              >
                <RotateCcw className="size-4" />
                Reset all fields
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                className="gap-2 border-[var(--color-signal-error)]/50 text-[var(--color-signal-error)] hover:bg-[var(--color-signal-error)]/10"
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
        </div>
      </div>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset all fields?</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <p className="px-6 pb-6 text-sm text-[var(--color-ink-muted)]">
            This will clear every field on this form. You can save afterward to persist the reset, or leave without saving to keep existing data.
          </p>
          <div className="flex gap-3 px-6 pb-6">
            <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={resetToEmpty} className="flex-1 bg-[var(--color-silk)]/20 text-[var(--color-silk)] border border-[var(--color-silk)]/40">
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
          <p className="px-6 pb-6 text-sm text-[var(--color-ink-muted)]">
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
              className="flex-1 border-[var(--color-signal-error)]/50 text-[var(--color-signal-error)] hover:bg-[var(--color-signal-error)]/10"
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
  const addRef = React.useRef<HTMLDivElement>(null);

  const handleAdd = async () => {
    const el = addRef.current;
    if (!el) return;
    const get = (n: string) => (el.querySelector(`[name="${n}"]`) as HTMLInputElement)?.value?.trim() ?? '';
    const result = await addContactToGhostOrg(sourceOrgId, ghostOrgId, {
      firstName: get('ac_firstName') || 'Contact',
      lastName: get('ac_lastName'),
      email: get('ac_email') || undefined,
      role: get('ac_role') || undefined,
      jobTitle: get('ac_jobTitle') || undefined,
    });
    if (result.ok) {
      setShowAdd(false);
      onRefresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {crew.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2">
            <div className="size-10 rounded-full bg-[var(--color-glass-surface)] flex items-center justify-center overflow-hidden">
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="size-full object-cover" /> : <span className="text-sm text-[var(--color-ink-muted)]">{(m.name?.[0] ?? '?').toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-ink)]">{m.name}</p>
              <p className="text-xs text-[var(--color-ink-muted)] truncate">{[m.jobTitle, m.role, m.email].filter(Boolean).join(' · ')}</p>
            </div>
          </li>
        ))}
      </ul>
      {!showAdd ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(true)} className="gap-2 border-[var(--color-silk)]/40 text-[var(--color-silk)]">
          Add contact
        </Button>
      ) : (
        <div ref={addRef} className="rounded-xl border border-[var(--color-mercury)] bg-white/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input name="ac_firstName" placeholder="First name" className="bg-white/5" />
            <Input name="ac_lastName" placeholder="Last name" className="bg-white/5" />
          </div>
          <Input name="ac_email" type="email" placeholder="Email" className="bg-white/5" />
          <div className="grid grid-cols-2 gap-3">
            <Input name="ac_role" placeholder="Role" className="bg-white/5" />
            <Input name="ac_jobTitle" placeholder="Job title" className="bg-white/5" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} className="bg-[var(--color-silk)]/20 text-[var(--color-silk)]">Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
