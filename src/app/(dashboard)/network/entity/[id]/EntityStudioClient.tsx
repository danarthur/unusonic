'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  AtSign,
  Tag,
  DollarSign,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  updateGhostProfile,
  updateRelationshipMeta,
  addScoutRosterToGhostOrg,
} from '@/features/network-data';
import type { IndividualAttrs, CoupleAttrs, PersonAttrs, VenueAttrs } from '@/shared/lib/entity-attrs';
import { PersonRecordForm } from './PersonRecordForm';
import { PersonEntityForm } from './PersonEntityForm';
import { AccordionSection } from './entity-studio-panels';
import { EntityRecordShell } from './EntityRecordShell';
import { EntityKnowledgeCards } from './EntityKnowledgeCards';
import { useConnectionDelete } from './use-connection-delete';
import { RosterSection } from './GhostOrgRoster';
import { VenueSpecsEditor } from './VenueSpecsEditor';
import { ColorTuner } from '@/features/org-identity';
import { AionScoutInput } from '@/widgets/network-detail/ui/AionScoutInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shared/ui/dialog';
import type { NodeDetail } from '@/features/network-data';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';

const LABEL = 'stage-label';

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
  /** Present when entityDirectoryType === 'venue'. Full parsed venue attributes. */
  initialVenueAttrs?: VenueAttrs | null;
  /** Resolved workspace ID for document operations. */
  workspaceId?: string | null;
  /** Names this person is linked to. Read on the server; see page.tsx. */
  linkedNames?: string[];
}

/**
 * Route dispatcher — renders one of three form components based on entity type.
 * Hooks must not be called here; each sub-component manages its own hook lifecycle.
 */
export function EntityStudioClient({ details, sourceOrgId, returnPath = '/network', initialPersonAttrs, initialCoupleAttrs, initialEmployeeAttrs, initialVenueAttrs, workspaceId, linkedNames }: EntityStudioClientProps) {
  const dirType = details.entityDirectoryType;

  if (details.kind === 'internal_employee' || details.kind === 'extended_team') {
    return (
      <PersonRecordForm
        details={details}
        sourceOrgId={sourceOrgId}
        initialAttrs={initialEmployeeAttrs ?? null}
        returnPath={returnPath ?? '/network'}
        workspaceId={workspaceId ?? undefined}
      />
    );
  }

  // People we BOOK share the roster body: same fields, same skills, same
  // compliance -- the edge decides only whether employment applies. It stays
  // scoped to PARTNER, the freelancer edge (summonPersonGhost), because a
  // VENDOR is an outside party and a coordinator on a vendor edge should not
  // be offered a skill list as though she were crew.
  if (
    details.kind === 'external_partner' &&
    dirType === 'person' &&
    details.relationshipTypeRaw === 'partner'
  ) {
    return (
      <PersonRecordForm
        details={details}
        sourceOrgId={sourceOrgId}
        initialAttrs={initialEmployeeAttrs ?? null}
        returnPath={returnPath ?? '/network'}
        workspaceId={workspaceId ?? undefined}
      />
    );
  }

  if (dirType === 'person' && initialPersonAttrs !== undefined) {
    return (
      <PersonEntityForm
        details={details}
        sourceOrgId={sourceOrgId}
        linkedNames={linkedNames}
        initialAttrs={initialPersonAttrs ?? { first_name: '', last_name: '', email: undefined, phone: undefined, category: undefined }}
        returnPath={returnPath}
        workspaceId={workspaceId ?? undefined}
      />
    );
  }
  /*
    A legacy `type='couple'` row, shown as the person it mostly is.

    Nothing creates these any more -- production holds none, and the three
    reclassify doors that could mint one are closed. But the type column has no
    constraint, so a row could still arrive by restore or direct write, and
    falling through to the company form would render it as something it is not.

    Partner A's fields become the person's. Partner B's strings stay untouched in
    the JSONB: nothing here writes them, and the way to bring that person back is
    to add them as their own record and link the two, which is what every couple
    created since the show flow already looks like.
  */
  if (dirType === 'couple') {
    const a = initialCoupleAttrs;
    return (
      <PersonEntityForm
        details={details}
        sourceOrgId={sourceOrgId}
        linkedNames={linkedNames}
        initialAttrs={{
          first_name: a?.partner_a_first_name ?? '',
          last_name: a?.partner_a_last_name ?? '',
          email: a?.partner_a_email,
          phone: undefined,
          category: a?.category,
        }}
        returnPath={returnPath}
        workspaceId={workspaceId ?? undefined}
      />
    );
  }
  return <CompanyEntityForm details={details} sourceOrgId={sourceOrgId} returnPath={returnPath} workspaceId={workspaceId ?? undefined} initialVenueAttrs={initialVenueAttrs ?? undefined} />;
}

function CompanyEntityForm({ details, sourceOrgId, returnPath = '/network', workspaceId, initialVenueAttrs }: { details: NodeDetail; sourceOrgId: string; returnPath: string; workspaceId?: string; initialVenueAttrs?: VenueAttrs }) {
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
  const [brandColor, setBrandColor] = React.useState(details.orgBrandColor ?? 'oklch(0.12 0 0)');
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
  const [w9Status, setW9Status] = React.useState(Boolean(ops.w9_status ?? false));
  const [coiExpiry, setCoiExpiry] = React.useState((ops.coi_expiry as string) ?? '');
  const [taxId, setTaxId] = React.useState((ops.tax_id as string) ?? '');
  const [paymentTerms, setPaymentTerms] = React.useState((ops.payment_terms as string) ?? '');
  const [defaultCurrency, setDefaultCurrency] = React.useState(details.orgDefaultCurrency ?? 'USD');
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);

  const markChanged = React.useCallback(() => setHasChanges(true), []);

  const resetToEmpty = React.useCallback(() => {
    setName('');
    setWebsite('');
    setBrandColor('oklch(0.12 0 0)');
    setLogoUrl('');
    setDoingBusinessAs('');
    setEntityType('organization');
    setSupportEmail('');
    setPhone('');
    setAddress({ street: '', city: '', state: '', postal_code: '', country: '' });
    setLocalTags([]);
    setTaxId('');
    setPaymentTerms('');
    setDefaultCurrency('USD');
    setHasChanges(true);
    setResetConfirmOpen(false);
  }, []);

  const handleDelete = useConnectionDelete({
    relationshipId: relationshipId || null,
    sourceOrgId,
    returnPath,
    name: name || details.identity.name || 'Connection',
  });

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
        formData.set('w9Status', String(w9Status));
      formData.set('coiExpiry', coiExpiry);
      formData.set('taxId', taxId);
        formData.set('paymentTerms', paymentTerms);
        formData.set('defaultCurrency', defaultCurrency);

        const [profileResult, relResult] = await Promise.all([
          updateGhostProfile(ghostOrgId, formData),
          updateRelationshipMeta(relationshipId, sourceOrgId, {
            type: (relType === 'client' ? 'client_company' : relType) as 'vendor' | 'venue' | 'client_company' | 'partner',
            lifecycleStatus: lifecycle as 'prospect' | 'active' | 'dormant' | 'blacklisted',
            blacklistReason: lifecycle === 'blacklisted' ? blacklistReason : null,
            tags: mergedTags.length ? mergedTags : null,
          }),
        ]);

        const err =
          profileResult.error ||
          (relResult.ok === false ? relResult.error : null);
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
      taxId,
      paymentTerms,
      defaultCurrency,
      // Enrich rebuilds the whole FormData, compliance included. Leaving these
      // out meant a scout run after editing the W-9 would post the values the
      // page loaded with.
      w9Status,
      coiExpiry,
      router,
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
      formData.set('w9Status', String(w9Status));
      formData.set('coiExpiry', coiExpiry);
      formData.set('taxId', taxId);
      formData.set('paymentTerms', paymentTerms);
      formData.set('defaultCurrency', defaultCurrency);

      const [profileResult, relResult] = await Promise.all([
        updateGhostProfile(ghostOrgId, formData),
        updateRelationshipMeta(relationshipId, sourceOrgId, {
          type: (relType === 'client' ? 'client_company' : relType) as 'vendor' | 'venue' | 'client_company' | 'partner',
          lifecycleStatus: lifecycle as 'prospect' | 'active' | 'dormant' | 'blacklisted',
          blacklistReason: lifecycle === 'blacklisted' ? blacklistReason : null,
          tags: localTags.length ? localTags : null,
        }),
      ]);

      const err = profileResult.error || (relResult.ok === false ? relResult.error : null);
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
    <EntityRecordShell
      entityId={details.subjectEntityId ?? null}
      entityType={(details.entityDirectoryType as 'person' | 'company' | 'venue' | null) ?? 'company'}
      workspaceId={workspaceId ?? null}
      name={name || details.identity.name || ''}
      eyebrow={details.identity.label}
      avatarUrl={details.identity.avatarUrl}
      avatarType={details.entityDirectoryType as 'person' | 'company' | 'venue' | 'couple' | undefined}
      returnPath={returnPath}
      sourceOrgId={sourceOrgId}
      doNotRebook={details.doNotRebook}
      dirty={hasChanges}
      saving={isPending}
      onSave={handleSave}
      actions={[
        { label: 'Reset all fields', onSelect: () => setResetConfirmOpen(true) },
        ...(handleDelete
          ? [{ label: 'Remove connection', onSelect: handleDelete, critical: true }]
          : []),
      ]}
    >
          {/* What we know, above what you edit -- the same column order the
              person pages carry. This page had none of it: no brief, no
              captures, and a Notes accordion that was a second editor for the
              relationship note the capture panel already composes. */}
          {details.subjectEntityId && workspaceId && (
            <EntityKnowledgeCards
              workspaceId={workspaceId}
              entityId={details.subjectEntityId}
              entityType={(details.entityDirectoryType as 'company' | 'venue') ?? 'company'}
              entityName={name || details.identity.name || null}
              relationshipId={details.relationshipId}
              relationshipNotes={details.notes}
            />
          )}

          <AccordionSection label="Classification" icon={Tag} defaultOpen>
            <div className="space-y-2">
              <div>
                <label className={LABEL}>Relationship role</label>
                <select
                  value={relType}
                  onChange={(e) => { setRelType(e.target.value as 'vendor' | 'partner' | 'client'); markChanged(); }}
                  className="stage-input mt-1 w-full"
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
                  className="stage-input mt-1 w-full"
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
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
                  />
                </div>
              )}
              <div>
                <label className={LABEL}>Tags</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {localTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)] px-2 py-0.5 text-xs"
                    >
                      {t}
                      <button type="button" onClick={() => { setLocalTags(localTags.filter((x) => x !== t)); markChanged(); }}>×</button>
                    </span>
                  ))}
                  <div className="flex gap-1">
                    <Input id="tag-input" placeholder="Add tag" className="w-24 h-8 text-xs bg-[var(--ctx-well)]" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
                    <Button type="button" variant="ghost" size="sm" onClick={addTag}>Add</Button>
                  </div>
                </div>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection label="Identity" icon={Building2} defaultOpen>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div
                  className="relative size-16 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-[var(--stage-edge-subtle)]"
                  style={{ backgroundColor: brandColor && !logoUrl ? `${brandColor}20` : undefined }}
                >
                  {logoUrl ? (
                    <>
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
                    <span className="text-2xl font-medium text-[var(--stage-text-secondary)]">
                      {(name?.[0] ?? '?').toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <label className={LABEL}>Name</label>
                    <Input
                      value={name}
                      onChange={(e) => { setName(e.target.value); markChanged(); }}
                      className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Logo URL</label>
                    <Input
                      value={logoUrl}
                      onChange={(e) => { setLogoUrl(e.target.value); markChanged(); }}
                      placeholder="https://..."
                      className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)] text-xs"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <label className={LABEL}>Doing business as</label>
                  <Input
                    value={doingBusinessAs}
                    onChange={(e) => { setDoingBusinessAs(e.target.value); markChanged(); }}
                    placeholder="e.g. NV Productions LLC"
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
                  />
                </div>
                <div>
                  <label className={LABEL}>Entity type</label>
                  <select
                    value={entityType}
                    onChange={(e) => { setEntityType(e.target.value); markChanged(); }}
                    className="stage-input mt-1 w-full"
                  >
                    <option value="organization">Organization</option>
                    <option value="single_operator">Single operator</option>
                  </select>
                </div>
              </div>
              <ColorTuner value={brandColor} onChange={(v) => { setBrandColor(v); markChanged(); }} />
            </div>
          </AccordionSection>

          {/* Was "Intelligence", which names the scout box at the top and
              nothing else in here. Everything under it is how you reach them:
              email, phone, address. A label that describes one control and
              hides the other six is a label people learn to skip. */}
          <AccordionSection label="Contact" icon={AtSign} defaultOpen>
            <div className="space-y-3">
              <AionScoutInput
                value={website}
                onChange={(v) => { setWebsite(v); markChanged(); }}
                onEnrich={handleEnrich}
              />
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <label className={LABEL}>General email</label>
                  <Input
                    value={supportEmail}
                    onChange={(e) => { setSupportEmail(e.target.value); markChanged(); }}
                    placeholder="booking@example.com"
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
                  />
                </div>
                <div>
                  <label className={LABEL}>Phone</label>
                  <Input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); markChanged(); }}
                    placeholder="Main office line"
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
                  />
                </div>
              </div>
              <div className="h-px bg-[var(--stage-edge-subtle)]" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <label className={LABEL}>Street</label>
                  <Input
                    value={address.street}
                    onChange={(e) => { setAddress((a) => ({ ...a, street: e.target.value })); markChanged(); }}
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)] text-xs"
                  />
                </div>
                <div>
                  <label className={LABEL}>City</label>
                  <Input
                    value={address.city}
                    onChange={(e) => { setAddress((a) => ({ ...a, city: e.target.value })); markChanged(); }}
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)] text-xs"
                  />
                </div>
                <div>
                  <label className={LABEL}>State</label>
                  <Input
                    value={address.state}
                    onChange={(e) => { setAddress((a) => ({ ...a, state: e.target.value })); markChanged(); }}
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)] text-xs"
                  />
                </div>
                <div>
                  <label className={LABEL}>Postal code</label>
                  <Input
                    value={address.postal_code}
                    onChange={(e) => { setAddress((a) => ({ ...a, postal_code: e.target.value })); markChanged(); }}
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)] text-xs"
                  />
                </div>
                <div>
                  <label className={LABEL}>Country</label>
                  <Input
                    value={address.country}
                    onChange={(e) => { setAddress((a) => ({ ...a, country: e.target.value })); markChanged(); }}
                    className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)] text-xs"
                  />
                </div>
              </div>
            </div>
          </AccordionSection>

          {/* Compliance. The add-connection sheet asks a vendor for a W-9 and a
              COI expiry at the moment you know them, and this page had nowhere
              to show either -- so they were collected and never seen again. */}
          {(relType === 'vendor' || relType === 'partner') && (
            <AccordionSection label="Compliance" icon={ShieldCheck}>
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={w9Status}
                    onChange={(e) => { setW9Status(e.target.checked); markChanged(); }}
                    className="size-4 rounded border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]"
                  />
                  <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
                    W-9 on file
                  </span>
                </label>
                <div>
                  <label className={LABEL}>COI expiry</label>
                  <p className="stage-label text-[var(--stage-text-tertiary)] mt-0.5 mb-1.5">
                    Certificate of Insurance expiry date — used for compliance tracking.
                  </p>
                  <Input
                    type="date"
                    value={coiExpiry}
                    onChange={(e) => { setCoiExpiry(e.target.value); markChanged(); }}
                    className="bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
                  />
                </div>
              </div>
            </AccordionSection>
          )}

          {(relType === 'vendor' || relType === 'partner') && (
            <AccordionSection label="Financial" icon={DollarSign}>
              <div className="space-y-2">
                <div>
                  <label className={LABEL}>Tax ID</label>
                  <Input value={taxId} onChange={(e) => { setTaxId(e.target.value); markChanged(); }} className="mt-1 bg-[var(--ctx-well)]" />
                </div>
                <div>
                  <label className={LABEL}>Currency</label>
                  <select value={defaultCurrency} onChange={(e) => { setDefaultCurrency(e.target.value); markChanged(); }} className="stage-input mt-1 w-full">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Payment terms</label>
                  <select value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); markChanged(); }} className="stage-input mt-1 w-full">
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

          {details.entityDirectoryType === 'venue' && details.subjectEntityId && initialVenueAttrs && (
            <VenueSpecsEditor
              entityId={details.subjectEntityId}
              initialAttributes={initialVenueAttrs}
            />
          )}

          <AccordionSection label="Roster" icon={Users}>
            <RosterSection
              crew={details.crew ?? []}
              sourceOrgId={sourceOrgId}
              ghostOrgId={ghostOrgId}
              onRefresh={() => router.refresh()}
            />
          </AccordionSection>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset all fields?</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <p className="px-6 pb-6 text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
            This will clear every field on this form. You can save afterward to persist the reset, or leave without saving to keep existing data.
          </p>
          <div className="flex gap-3 px-6 pb-6">
            <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={resetToEmpty} className="flex-1 bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)] border border-[var(--color-unusonic-warning)]/30 hover:bg-[var(--color-unusonic-warning)]/25">
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </EntityRecordShell>
  );
}
