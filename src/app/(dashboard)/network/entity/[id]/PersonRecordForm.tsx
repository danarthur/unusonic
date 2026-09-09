'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Briefcase,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Contact,
  Instagram,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { updateEmployeeEntityAttrs } from '@/features/talent-management/api/update-employee-entity';
import { updateEntityAvatar } from '@/features/talent-management/api/update-entity-avatar';
import { AvatarUpload } from '@/features/team-invite/ui/AvatarUpload';
import { deployInvites } from '@/features/team-invite/api/actions';
import { softDeleteGhostRelationship } from '@/features/network-data';
import type { NodeDetail } from '@/features/network-data';
import type { PersonAttrs } from '@/shared/lib/entity-attrs';
import { AccordionSection } from './entity-studio-panels';
import { CrewSkillsSection } from './CrewSkillsSection';
import { BusinessFunctionsSection } from './BusinessFunctionsSection';
import { EntityOverviewCards } from '@/widgets/network-detail/ui/EntityOverviewCards';
import { EntityRecordShell } from './EntityRecordShell';
import { coiStatus } from '@/shared/lib/crew-profile';

// ─── Proficiency helpers ───────────────────────────────────────────────────────

// ─── Spring constant ───────────────────────────────────────────────────────────


// ─── Label constant ────────────────────────────────────────────────────────────

const LABEL = 'stage-label';


// ─── TogglePill ────────────────────────────────────────────────────────────────

function TogglePill({
  active,
  onToggle,
  label,
  icon: Icon,
  variant = 'compliance',
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  icon: React.ElementType;
  variant?: 'warning' | 'compliance';
}) {
  const activeClass =
    variant === 'warning'
      ? 'bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)] border-[var(--color-unusonic-warning)]/30'
      : 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] border-[var(--color-unusonic-success)]/30';
  const inactiveClass =
    'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)] border-[var(--stage-edge-subtle)]/20';

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      transition={STAGE_MEDIUM}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-[80ms] hover:bg-[oklch(1_0_0/0.08)]',
        active ? activeClass : inactiveClass
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.5} />
      {label}
    </motion.button>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface PersonRecordFormProps {
  details: NodeDetail;
  sourceOrgId: string;
  initialAttrs: PersonAttrs | null;
  returnPath: string;
  workspaceId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PersonRecordForm({
  details,
  sourceOrgId,
  initialAttrs,
  returnPath,
  workspaceId,
}: PersonRecordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  /*
    One body, two edges. A roster member and a preferred freelancer are the
    same record with the same fields -- name, skills, compliance, emergency
    contact -- and the freelancer's page was simply the shorter of two copies.
    That short copy is why a freelancer, the person most likely to need a W-9
    and a COI on file, had nowhere to record either.

    What actually differs is employment, so that is the only thing gated:
    portal access and do-not-rebook belong to the roster, and removing someone
    from preferred belongs to the partner edge.
  */
  const isRosterMember =
    details.kind === 'internal_employee' || details.kind === 'extended_team';

  // ── Field state ──────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = React.useState(initialAttrs?.first_name ?? '');
  const [lastName, setLastName] = React.useState(initialAttrs?.last_name ?? '');
  const [email, setEmail] = React.useState(initialAttrs?.email ?? '');
  const [phone, setPhone] = React.useState(initialAttrs?.phone ?? '');
  const [jobTitle, setJobTitle] = React.useState(initialAttrs?.job_title ?? '');
  const [market, setMarket] = React.useState(initialAttrs?.market ?? '');
  const [unionStatus, setUnionStatus] = React.useState(initialAttrs?.union_status ?? '');
  const [cdl, setCdl] = React.useState(initialAttrs?.cdl ?? false);
  const [w9Status, setW9Status] = React.useState(initialAttrs?.w9_status ?? false);
  const [coiExpiry, setCoiExpiry] = React.useState(initialAttrs?.coi_expiry ?? '');
  const [emergencyName, setEmergencyName] = React.useState(
    initialAttrs?.emergency_contact?.name ?? ''
  );
  const [emergencyPhone, setEmergencyPhone] = React.useState(
    initialAttrs?.emergency_contact?.phone ?? ''
  );
  const [instagram, setInstagram] = React.useState(initialAttrs?.instagram ?? '');
  const [doNotRebook, setDoNotRebook] = React.useState(details.doNotRebook ?? false);
  const [dnrConfirmPending, setDnrConfirmPending] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState(details.identity.avatarUrl ?? '');
  const [hasChanges, setHasChanges] = React.useState(false);

  // ── Invite state ─────────────────────────────────────────────────────────────
  const [inviteSending, setInviteSending] = React.useState(false);
  const [inviteSent, setInviteSent] = React.useState(details.inviteStatus === 'invited');
  const isGhostMember = details.inviteStatus === 'ghost' || details.inviteStatus === 'invited';

  const handleSendInvite = async () => {
    setInviteSending(true);
    const result = await deployInvites(sourceOrgId, [details.id]);
    setInviteSending(false);
    if (result.ok && result.sent > 0) {
      setInviteSent(true);
      toast.success('Invite sent.');
    } else if (result.ok && result.sent === 0) {
      toast.error('No invite to send. Check the email address.');
    } else if (!result.ok) {
      toast.error(result.error);
    }
  };

  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const mark = () => setHasChanges(true);

  const handleRemoveFromPreferred = async () => {
    setRemoving(true);
    const result = await softDeleteGhostRelationship(details.id, sourceOrgId);
    setRemoving(false);
    if (result.ok) {
      toast.success('Removed from preferred.');
      router.push(returnPath);
    } else {
      toast.error(result.error ?? 'Could not remove.');
    }
  };

  // ── Avatar handler ────────────────────────────────────────────────────────────
  const handleAvatarChange = React.useCallback(async (url: string) => {
    if (!details.subjectEntityId) return;
    setAvatarUrl(url);
    const result = await updateEntityAvatar({ entityId: details.subjectEntityId, avatarUrl: url });
    if (result.ok) {
      toast.success('Photo updated.');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }, [details.subjectEntityId, router]);

  // ── Ghost guard ───────────────────────────────────────────────────────────────
  if (!details.subjectEntityId) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 py-24">

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_MEDIUM}
          className="stage-panel rounded-2xl p-8 max-w-sm text-center space-y-4" data-surface="surface"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-[oklch(1_0_0_/_0.08)] mx-auto">
            <User className="size-6 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">Profile not linked</p>
            <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] leading-relaxed">
              This member hasn&apos;t linked their profile yet. Once they join Unusonic, their full profile will be available here.
            </p>
          </div>
          <Button variant="ghost" onClick={() => router.push(returnPath)} className="gap-2 mt-2">
            <ArrowLeft className="size-4" strokeWidth={1.5} />
            Back to network
          </Button>
        </motion.div>
      </div>
    );
  }

  const entityId = details.subjectEntityId;
  const relationshipId = details.id;
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || details.identity.name || 'Team member';

  // ── Save handler ─────────────────────────────────────────────────────────────
  const handleSave = () => {
    startTransition(async () => {
      const result = await updateEmployeeEntityAttrs({
        relationshipId,
        entityId,
        sourceOrgId,
        first_name: firstName,
        last_name: lastName || undefined,
        email: email || null,
        phone: phone || null,
        job_title: jobTitle || null,
        market: market || null,
        union_status: unionStatus || null,
        cdl,
        w9_status: w9Status,
        coi_expiry: coiExpiry || null,
        emergency_contact:
          emergencyName || emergencyPhone
            ? { name: emergencyName || null, phone: emergencyPhone || null }
            : null,
        instagram: instagram || null,
        // Only the ROSTER_MEMBER edge stores this. Sending it on a PARTNER
        // edge would silently no-op, which is worse than not offering it.
        doNotRebook: isRosterMember ? doNotRebook : undefined,
      });

      if (result.ok) {
        toast.success('Saved.');
        setHasChanges(false);
        // Stay on the record. The two forms disagreed here -- one navigated
        // back to /network on save, the other stayed -- and you save a profile
        // to keep working on it, not to leave it.
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <EntityRecordShell
      entityId={entityId}
      entityType="person"
      workspaceId={workspaceId ?? null}
      name={displayName}
      eyebrow={isRosterMember ? 'Roster member' : 'Preferred freelancer'}
      avatarUrl={avatarUrl || details.identity.avatarUrl}
      avatarType="person"
      returnPath={returnPath}
      dirty={hasChanges}
      saving={isPending}
      onSave={handleSave}
      banner={
        isRosterMember && isGhostMember ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] p-4">
            <div className="min-w-0">
              <p className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">
                {inviteSent ? 'Invite sent' : 'No portal access yet'}
              </p>
              <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-0.5">
                {inviteSent
                  ? 'Waiting for them to accept and set up their account.'
                  : 'Send an invite so they can access their schedule and profile.'}
              </p>
            </div>
            {!inviteSent && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSendInvite}
                disabled={inviteSending}
                className="shrink-0"
              >
                <Send className="size-3.5 mr-1.5" strokeWidth={1.5} />
                {inviteSending ? 'Sending...' : 'Send invite'}
              </Button>
            )}
            {inviteSent && (
              <span className="shrink-0 stage-badge-text px-2.5 py-1 rounded-full bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]">
                Pending
              </span>
            )}
          </div>
        ) : null
      }
    >

        {/* 0a — Overview cards (Brief, Working notes, Captures, Productions) */}
        {workspaceId && (
          <EntityOverviewCards
            workspaceId={workspaceId}
            entityId={entityId}
            entityType="person"
            entityName={displayName || null}
            density="page"
          />
        )}

        {/* 0 — Avatar */}
        <div className="stage-panel rounded-2xl flex flex-col items-center gap-3 py-6" data-surface="surface">
          <AvatarUpload
            orgId={sourceOrgId}
            value={avatarUrl || null}
            onChange={handleAvatarChange}
          />
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Change photo</p>
        </div>

        {/* 1 — Identity */}
        <AccordionSection label="Identity" icon={User} defaultOpen>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); mark(); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); mark(); }}
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <Input
              type="email"
              value={email ?? ''}
              onChange={(e) => { setEmail(e.target.value); mark(); }}
              placeholder="crew@example.com"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <Input
              value={phone ?? ''}
              onChange={(e) => { setPhone(e.target.value); mark(); }}
              placeholder="+1 (555) 000-0000"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
        </AccordionSection>

        {/* 2 — Work info */}
        <AccordionSection label="Work info" icon={Briefcase} defaultOpen>
          <div>
            <label className={LABEL}>Job title</label>
            <Input
              value={jobTitle ?? ''}
              onChange={(e) => { setJobTitle(e.target.value); mark(); }}
              placeholder="Audio Engineer"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
          <div>
            <label className={LABEL}>Market</label>
            <Input
              value={market ?? ''}
              onChange={(e) => { setMarket(e.target.value); mark(); }}
              placeholder="Nashville, TN"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
          <div>
            <label className={LABEL}>Union status</label>
            <Input
              value={unionStatus ?? ''}
              onChange={(e) => { setUnionStatus(e.target.value); mark(); }}
              placeholder="e.g. IATSE Local 33 / Non-union"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
        </AccordionSection>

        {/* Both commit on use, so neither belongs to this form's Save. */}
        <CrewSkillsSection entityId={entityId} />
        <BusinessFunctionsSection entityId={entityId} />

        {/* 4 — Status. Employment, so roster only: the member role comes from
            workspace_members and do-not-rebook writes to the ROSTER_MEMBER
            edge. A freelancer's equivalent is being preferred at all, which is
            the control at the foot of the page. */}
        {isRosterMember && (
        <AccordionSection label="Status" icon={ShieldCheck} defaultOpen>
          {details.memberRole && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[var(--stage-edge-subtle)]/50 bg-[oklch(1_0_0_/_0.10)]/20 px-3 py-1 text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wide">
                {details.memberRole}
              </span>
            </div>
          )}
          <div className="space-y-3 pt-1">
            <TogglePill
              active={doNotRebook}
              onToggle={() => {
                if (!doNotRebook) {
                  setDnrConfirmPending(true);
                } else {
                  setDoNotRebook(false);
                  setDnrConfirmPending(false);
                  mark();
                }
              }}
              label="Do not rebook"
              icon={AlertTriangle}
              variant="warning"
            />
            <AnimatePresence>
              {dnrConfirmPending && (
                <motion.div
                  initial={{ opacity: 0, y: -4, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border-l-[3px] border-l-[var(--color-unusonic-warning)] bg-[var(--stage-surface)] px-3 py-2.5">
                    <AlertTriangle className="size-3.5 text-[var(--color-unusonic-warning)] flex-shrink-0" strokeWidth={1.5} />
                    <p className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-warning)] flex-1">
                      This member won&apos;t appear in scheduling suggestions.
                    </p>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDoNotRebook(true);
                          setDnrConfirmPending(false);
                          mark();
                        }}
                        className="h-7 px-2 text-xs text-[var(--color-unusonic-warning)] hover:bg-[var(--color-unusonic-warning)]/15"
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setDnrConfirmPending(false)}
                        className="h-7 px-2 text-xs text-[var(--stage-text-secondary)]"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {doNotRebook && !dnrConfirmPending && (
              <p className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-warning)]">
                Member will not appear in scheduling suggestions.
              </p>
            )}
          </div>
        </AccordionSection>
        )}

        {/* 5 — Compliance */}
        <AccordionSection label="Compliance" icon={ShieldCheck}>
          <div className="flex flex-wrap gap-3">
            <TogglePill
              active={cdl}
              onToggle={() => { setCdl(!cdl); mark(); }}
              label="CDL"
              icon={CheckCircle2}
              variant="compliance"
            />
            <TogglePill
              active={w9Status}
              onToggle={() => { setW9Status(!w9Status); mark(); }}
              label="W-9 on file"
              icon={CheckCircle2}
              variant="compliance"
            />
          </div>
          <div>
            <label className={LABEL}>COI expiry</label>
            <p className="stage-label text-[var(--stage-text-tertiary)] mt-0.5 mb-1.5">
              Certificate of Insurance expiry date — used for compliance tracking.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={coiExpiry ?? ''}
                onChange={(e) => { setCoiExpiry(e.target.value); mark(); }}
                className="bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
              <AnimatePresence>
                {(() => {
                  if (!coiExpiry) return null;
                  const status = coiStatus(coiExpiry);
                  if (status === 'none') return null;
                  const dotColor = {
                    green: 'bg-[var(--color-unusonic-success)]',
                    amber: 'bg-[var(--color-unusonic-warning)]',
                    red: 'bg-[var(--color-unusonic-error)]',
                  }[status as 'green' | 'amber' | 'red'];
                  return (
                    <motion.span
                      key={status}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={STAGE_MEDIUM}
                      className={cn('size-2 rounded-full flex-shrink-0', dotColor)}
                      aria-label={`COI status: ${status}`}
                    />
                  );
                })()}
              </AnimatePresence>
            </div>
          </div>
        </AccordionSection>

        {/* 6 — Emergency contact */}
        <AccordionSection label="Emergency contact" icon={Contact}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Name</label>
              <Input
                value={emergencyName}
                onChange={(e) => { setEmergencyName(e.target.value); mark(); }}
                placeholder="Full name"
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <Input
                value={emergencyPhone}
                onChange={(e) => { setEmergencyPhone(e.target.value); mark(); }}
                placeholder="+1 (555) 000-0000"
                className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
              />
            </div>
          </div>
        </AccordionSection>

        {/* 7 — Social */}
        <AccordionSection label="Social" icon={Instagram}>
          <div>
            <label className={LABEL}>Instagram</label>
            <Input
              value={instagram ?? ''}
              onChange={(e) => { setInstagram(e.target.value); mark(); }}
              placeholder="handle (without @)"
              className="mt-1 bg-[var(--ctx-well)] border-[var(--stage-edge-subtle)]"
            />
          </div>
        </AccordionSection>

        {/* Removing them from preferred is not a form field, so it sits below
            the form rather than inside it. */}
        {!isRosterMember && (
          <div className="flex items-center gap-3 pt-2">
            <AnimatePresence mode="wait">
              {confirmRemove ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={STAGE_MEDIUM}
                  className="flex items-center gap-2"
                >
                  <span className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
                    Remove from preferred?
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFromPreferred}
                    disabled={removing}
                    className="h-7 px-2.5 text-xs text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
                  >
                    {removing ? 'Removing…' : 'Confirm'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRemove(false)}
                    className="h-7 px-2.5 text-xs text-[var(--stage-text-secondary)]"
                  >
                    Cancel
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_MEDIUM}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRemove(true)}
                    className="h-8 gap-1.5 px-2.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.5} />
                    Remove from preferred
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

    </EntityRecordShell>
  );
}
