'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Building2, Settings, Users, X, Palette, MapPin, Globe, Network, Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { listOrgMembers } from '@/entities/organization';
import type { OrgMemberRosterItem, OrgDetails, OrgAddress } from '@/entities/organization';
import { MemberDetailSheet } from '@/features/talent-management';
import { getOrgDetails, updateOrg } from '@/features/org-management/api';
import { OrgLogoUpload, BrandColorPicker, AddCompanyDialog } from '@/features/org-management/ui';
import { NetworkList } from './NetworkList';
import type { NetworkOrganization } from '@/features/network/model/types';

type TabId = 'identity' | 'operations' | 'team' | 'network';

interface OrgDashboardSheetProps {
  org: NetworkOrganization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RosterList({
  orgId,
  roster,
  loading,
  onMemberClick,
}: {
  orgId: string;
  roster: OrgMemberRosterItem[];
  loading: boolean;
  onMemberClick: (memberId: string) => void;
}) {
  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-[var(--color-ink-muted)]">Loading roster…</p>
    );
  }
  if (roster.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--color-ink-muted)]">
        No people in this organization yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {roster.map((member) => {
        const isGhost = !member.profile_id;
        return (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => onMemberClick(member.id)}
              className={cn(
                'flex w-full flex-wrap items-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-left transition-colors',
                'bg-white/5 hover:bg-white/10',
                isGhost && 'opacity-90'
              )}
            >
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full border-2',
                  isGhost ? 'border-white/20 bg-transparent border-dashed' : 'border-transparent bg-white/10'
                )}
              >
                <User className="size-5 text-[var(--color-ink-muted)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium tracking-tight text-[var(--color-ink)]">
                  {member.display_name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {member.job_title && (
                    <span className="text-xs text-[var(--color-ink-muted)]">{member.job_title}</span>
                  )}
                  <Badge
                    variant={isGhost ? 'outline' : 'secondary'}
                    className={cn(
                      'text-[10px] font-medium',
                      isGhost && 'border-white/20 text-[var(--color-ink-muted)]'
                    )}
                  >
                    {isGhost ? 'Pending' : 'Active'}
                  </Badge>
                </div>
                {member.skill_tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {member.skill_tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                    {member.skill_tags.length > 4 && (
                      <span className="text-[10px] text-[var(--color-ink-muted)]">
                        +{member.skill_tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Full-screen Glass Cockpit — Identity, Operations, Team. visionOS-style segmented dashboard. */
export function OrgDashboardSheet({ org, open, onOpenChange }: OrgDashboardSheetProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>('identity');
  const [details, setDetails] = React.useState<OrgDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [roster, setRoster] = React.useState<OrgMemberRosterItem[]>([]);
  const [rosterLoading, setRosterLoading] = React.useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [addCompanyOpen, setAddCompanyOpen] = React.useState(false);
  const [networkListKey, setNetworkListKey] = React.useState(0);

  // Client state for Identity form (real-time brand_color on Save button)
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [brandColor, setBrandColor] = React.useState<string | null>(null);
  const [website, setWebsite] = React.useState('');
  const [supportEmail, setSupportEmail] = React.useState('');
  const [defaultCurrency, setDefaultCurrency] = React.useState('');
  const [address, setAddress] = React.useState<OrgAddress>({});

  React.useEffect(() => {
    if (open && org) setTab('identity');
  }, [open, org]);

  React.useEffect(() => {
    if (!open || !org?.id) {
      setDetails(null);
      return;
    }
    setDetailsLoading(true);
    getOrgDetails(org.id)
      .then((d) => {
        setDetails(d ?? null);
        if (d) {
          setName(d.name);
          setDescription(d.description ?? '');
          setBrandColor(d.brand_color ?? null);
          setWebsite(d.website ?? '');
          setSupportEmail(d.support_email ?? '');
          setDefaultCurrency(d.default_currency ?? '');
          setAddress(d.address ?? {});
        }
      })
      .finally(() => setDetailsLoading(false));
  }, [open, org?.id]);

  React.useEffect(() => {
    if (!open || !org?.id) {
      setRoster([]);
      return;
    }
    setRosterLoading(true);
    listOrgMembers(org.id)
      .then(setRoster)
      .finally(() => setRosterLoading(false));
  }, [open, org?.id]);

  const [saveState, saveAction, savePending] = useActionState(
    async (
      _prev: { ok: boolean; error?: string } | null,
      formData: FormData
    ): Promise<{ ok: boolean; error?: string } | null> => {
      const org_id = formData.get('org_id') as string;
      if (!org_id) return { ok: false, error: 'Missing org.' };
      const result = await updateOrg({
        org_id,
        name: (formData.get('name') as string) || undefined,
        description: (formData.get('description') as string) || undefined,
        brand_color: (formData.get('brand_color') as string) || undefined,
        website: (formData.get('website') as string) || undefined,
        support_email: (formData.get('support_email') as string) || undefined,
        default_currency: (formData.get('default_currency') as string) || undefined,
        address: {
          street: (formData.get('address_street') as string) || undefined,
          city: (formData.get('address_city') as string) || undefined,
          state: (formData.get('address_state') as string) || undefined,
          postal_code: (formData.get('address_postal_code') as string) || undefined,
          country: (formData.get('address_country') as string) || undefined,
        },
      });
      if (result.ok) {
        getOrgDetails(org_id).then(setDetails);
        router.refresh();
      }
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    null
  );

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'identity', label: 'Profile', icon: <Palette className="size-4" /> },
    { id: 'operations', label: 'Operations', icon: <Globe className="size-4" /> },
    { id: 'team', label: 'Team', icon: <Users className="size-4" /> },
    { id: 'network', label: 'Network', icon: <Network className="size-4" /> },
  ];
  const accentColor = brandColor ?? 'var(--color-silk)';

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              role="presentation"
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={() => onOpenChange(false)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal
              aria-label={`Organization: ${org?.name ?? 'Dashboard'}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={cn(
                'fixed inset-4 z-50 flex flex-col overflow-hidden rounded-3xl',
                'bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl',
                'md:inset-6 lg:inset-8'
              )}
              style={{ ['--dashboard-accent' as string]: accentColor }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header — breadcrumb style */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-4 md:px-8">
                <div className="flex min-w-0 items-center gap-3">
                  {details?.logo_url ? (
                    <img
                      src={details.logo_url}
                      alt=""
                      className="size-10 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Building2 className="size-5 text-[var(--color-ink-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--color-ink-muted)]">Network</p>
                    <h2 className="truncate text-xl font-medium tracking-tight text-[var(--color-ink)]">
                      {org?.name ?? details?.name ?? 'Organization'}
                    </h2>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                >
                  <X className="size-5" />
                </Button>
              </div>

              {/* Tabs — active tab uses brand color accent */}
              <div className="flex shrink-0 gap-1 border-b border-white/10 px-6 md:px-8">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                      tab === t.id
                        ? 'text-[var(--color-ink)] border-b-2'
                        : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] border-b-2 border-transparent'
                    )}
                    style={tab === t.id ? { borderBottomColor: accentColor } : undefined}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
                <div className="mx-auto max-w-2xl space-y-6">
                  {tab === 'identity' && org && (
                    <>
                      {detailsLoading ? (
                        <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
                      ) : (
                        <form action={saveAction} className="space-y-6">
                          <input type="hidden" name="org_id" value={org.id} />
                          <div className="space-y-4">
                            <h3 className="text-sm font-medium text-[var(--color-ink-muted)]">
                              Logo & Brand
                            </h3>
                            <OrgLogoUpload
                              orgId={org.id}
                              logoUrl={details?.logo_url ?? null}
                              onSuccess={(url) => setDetails((d) => (d ? { ...d, logo_url: url } : null))}
                            />
                            <div>
                              <p className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">
                                Brand Signal (avatar accent)
                              </p>
                              <BrandColorPicker
                                value={brandColor}
                                onChange={setBrandColor}
                              />
                              <input type="hidden" name="brand_color" value={brandColor ?? ''} />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <h3 className="text-sm font-medium text-[var(--color-ink-muted)]">
                              Name & Description
                            </h3>
                            <FloatingLabelInput
                              label="Organization name"
                              name="name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              className="rounded-lg border-white/10 bg-white/5"
                            />
                            <div className="relative">
                              <Textarea
                                name="description"
                                placeholder=" "
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="min-h-[100px] resize-y rounded-lg border-white/10 bg-white/5 pt-5"
                                rows={3}
                              />
                              <label className="pointer-events-none absolute left-3 top-3 text-sm text-[var(--color-ink-muted)]">
                                Description
                              </label>
                            </div>
                          </div>
                          {saveState?.error && (
                            <p className="text-xs text-[var(--color-signal-error)]">{saveState.error}</p>
                          )}
                          <Button
                            type="submit"
                            disabled={savePending}
                            className="transition-colors"
                            style={
                              brandColor
                                ? { backgroundColor: brandColor, color: 'oklch(0.98 0 0)', borderColor: 'transparent' }
                                : undefined
                            }
                          >
                            {savePending ? 'Saving…' : 'Save'}
                          </Button>
                        </form>
                      )}
                    </>
                  )}

                  {tab === 'operations' && org && (
                    <form action={saveAction} className="space-y-6">
                      <input type="hidden" name="org_id" value={org.id} />
                      <input type="hidden" name="name" value={name} />
                      <input type="hidden" name="description" value={description} />
                      <input type="hidden" name="brand_color" value={brandColor ?? ''} />
                      <div className="space-y-4">
                        <h3 className="text-sm font-medium text-[var(--color-ink-muted)]">
                          Contact & Web
                        </h3>
                        <FloatingLabelInput
                          label="Website"
                          name="website"
                          type="url"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="rounded-lg border-white/10 bg-white/5"
                        />
                        <FloatingLabelInput
                          label="Support email"
                          name="support_email"
                          type="email"
                          value={supportEmail}
                          onChange={(e) => setSupportEmail(e.target.value)}
                          className="rounded-lg border-white/10 bg-white/5"
                        />
                        <FloatingLabelInput
                          label="Default currency (e.g. USD)"
                          name="default_currency"
                          value={defaultCurrency}
                          onChange={(e) => setDefaultCurrency(e.target.value)}
                          className="rounded-lg border-white/10 bg-white/5"
                          maxLength={3}
                        />
                      </div>
                      <div className="space-y-4">
                        <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink-muted)]">
                          <MapPin className="size-4" />
                          Address
                        </h3>
                        <FloatingLabelInput
                          label="Street"
                          name="address_street"
                          value={address.street ?? ''}
                          onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                          className="rounded-lg border-white/10 bg-white/5"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <FloatingLabelInput
                            label="City"
                            name="address_city"
                            value={address.city ?? ''}
                            onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                            className="rounded-lg border-white/10 bg-white/5"
                          />
                          <FloatingLabelInput
                            label="State / Region"
                            name="address_state"
                            value={address.state ?? ''}
                            onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                            className="rounded-lg border-white/10 bg-white/5"
                          />
                        </div>
                        <FloatingLabelInput
                          label="Postal code"
                          name="address_postal_code"
                          value={address.postal_code ?? ''}
                          onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))}
                          className="rounded-lg border-white/10 bg-white/5"
                        />
                        <FloatingLabelInput
                          label="Country"
                          name="address_country"
                          value={address.country ?? ''}
                          onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                          className="rounded-lg border-white/10 bg-white/5"
                        />
                      </div>
                      {saveState?.error && (
                        <p className="text-xs text-[var(--color-signal-error)]">{saveState.error}</p>
                      )}
                      <Button type="submit" disabled={savePending}>
                        {savePending ? 'Saving…' : 'Save'}
                      </Button>
                    </form>
                  )}

                  {tab === 'team' && org && (
                    <RosterList
                      orgId={org.id}
                      roster={roster}
                      loading={rosterLoading}
                      onMemberClick={(id) => {
                        setSelectedMemberId(id);
                        setMemberSheetOpen(true);
                      }}
                    />
                  )}

                  {tab === 'network' && org && details && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-[var(--color-ink-muted)]">
                          Vendors, venues, and partners. Ghost orgs become network nodes when they join.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setAddCompanyOpen(true)}
                          className="flex items-center gap-2"
                        >
                          <Plus className="size-4" />
                          Add connection
                        </Button>
                      </div>
                      <NetworkList key={networkListKey} sourceOrgId={org.id} />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {org && details && (
        <AddCompanyDialog
          sourceOrgId={org.id}
          workspaceId={details.workspace_id}
          open={addCompanyOpen}
          onOpenChange={setAddCompanyOpen}
          onSuccess={() => setNetworkListKey((k) => k + 1)}
        />
      )}
      <MemberDetailSheet
        orgMemberId={selectedMemberId}
        open={memberSheetOpen}
        onOpenChange={setMemberSheetOpen}
        onSuccess={() => {
          router.refresh();
          if (org?.id) listOrgMembers(org.id).then(setRoster);
        }}
      />
    </>
  );
}
