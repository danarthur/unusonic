'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  User,
  Briefcase,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Contact,
  Instagram,
  Wrench,
  X,
  Landmark,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { updateEmployeeEntityAttrs } from '@/features/talent-management/api/update-employee-entity';
import { updateEntityAvatar } from '@/features/talent-management/api/update-entity-avatar';
import {
  addCrewSkill,
  removeCrewSkill,
  updateCrewSkillProficiency,
  getCrewSkillsForEntity,
} from '@/features/talent-management/api/crew-skill-actions';
import { listWorkspaceSkillPresets } from '@/features/talent-management/api/skill-preset-actions';
import {
  getEntityCapabilities,
  addEntityCapability,
  removeEntityCapability,
  listWorkspaceCapabilityPresets,
  type EntityCapabilityRow,
} from '@/features/talent-management/api/capability-actions';
import { AvatarUpload } from '@/features/team-invite/ui/AvatarUpload';
import { deployInvites } from '@/features/team-invite/api/actions';
import type { NodeDetail } from '@/features/network-data';
import type { PersonAttrs } from '@/shared/lib/entity-attrs';
import type { CrewSkillDTO, SkillLevel } from '@/entities/talent';
import { coiStatus } from '@/shared/lib/crew-profile';

// ─── Proficiency helpers ───────────────────────────────────────────────────────

const PROFICIENCY_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid',    label: 'Mid'    },
  { value: 'senior', label: 'Senior' },
  { value: 'lead',   label: 'Lead'   },
];

const FALLBACK_SKILL_PRESETS = [
  'Audio A1', 'Audio A2', 'DJ', 'Lighting', 'Video', 'Camera Op',
  'Stage Manager', 'Rigging', 'GrandMA3', 'Backline', 'Sales',
];

// ─── Spring constant ───────────────────────────────────────────────────────────

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

// ─── Label constant ────────────────────────────────────────────────────────────

const LABEL = 'text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest';

// ─── AccordionSection ──────────────────────────────────────────────────────────

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
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        transition={SPRING}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[oklch(1_0_0_/_0.04)] transition-[background-color,filter] duration-150 hover:brightness-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          <Icon className="size-3.5" />
          {label}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={SPRING}
        >
          <ChevronDown className="size-4 text-[var(--stage-text-secondary)]" />
        </motion.div>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[oklch(1_0_0_/_0.08)]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
    'bg-[oklch(1_0_0_/_0.10)]/20 text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.08)]/20';

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      transition={SPRING}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-[filter] hover:brightness-[1.04] active:brightness-[0.98]',
        active ? activeClass : inactiveClass
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </motion.button>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface EmployeeEntityFormProps {
  details: NodeDetail;
  sourceOrgId: string;
  initialAttrs: PersonAttrs | null;
  returnPath: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmployeeEntityForm({
  details,
  sourceOrgId,
  initialAttrs,
  returnPath,
}: EmployeeEntityFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

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

  // ── Skills state ──────────────────────────────────────────────────────────────
  const [crewSkills, setCrewSkills] = React.useState<CrewSkillDTO[]>([]);
  const [skillPresets, setSkillPresets] = React.useState<string[]>([]);
  const [addSkillTag, setAddSkillTag] = React.useState('');
  const [addSkillLevel, setAddSkillLevel] = React.useState<SkillLevel | ''>('');
  const [skillsLoading, setSkillsLoading] = React.useState(false);

  // ── Capabilities state ─────────────────────────────────────────────────────
  const [capabilities, setCapabilities] = React.useState<EntityCapabilityRow[]>([]);
  const [capPresets, setCapPresets] = React.useState<string[]>([]);
  const [capLoading, setCapLoading] = React.useState(false);

  const mark = () => setHasChanges(true);

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

  // ── Skills load ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!details.subjectEntityId) return;
    let cancelled = false;
    getCrewSkillsForEntity(details.subjectEntityId).then((s) => {
      if (!cancelled) setCrewSkills(s);
    });
    return () => { cancelled = true; };
  }, [details.subjectEntityId]);

  React.useEffect(() => {
    let cancelled = false;
    listWorkspaceSkillPresets().then((p) => {
      if (!cancelled) setSkillPresets(p.length > 0 ? p : FALLBACK_SKILL_PRESETS);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Capabilities load ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!details.subjectEntityId) return;
    let cancelled = false;
    getEntityCapabilities(details.subjectEntityId).then((c) => {
      if (!cancelled) setCapabilities(c);
    });
    listWorkspaceCapabilityPresets().then((p) => {
      if (!cancelled) setCapPresets(p);
    });
    return () => { cancelled = true; };
  }, [details.subjectEntityId]);

  const handleAddSkill = async () => {
    if (!details.subjectEntityId || !addSkillTag) return;
    setSkillsLoading(true);
    const result = await addCrewSkill({
      entity_id: details.subjectEntityId,
      skill_tag: addSkillTag,
      proficiency: addSkillLevel || undefined,
    });
    setSkillsLoading(false);
    if (result.ok) {
      toast.success('Skill added.');
      setAddSkillTag('');
      setAddSkillLevel('');
      getCrewSkillsForEntity(details.subjectEntityId).then(setCrewSkills);
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveSkill = async (id: string) => {
    if (!details.subjectEntityId) return;
    const result = await removeCrewSkill({ crew_skill_id: id });
    if (result.ok) {
      setCrewSkills((prev) => prev.filter((s) => s.id !== id));
    } else {
      toast.error(result.error);
    }
  };

  const handleUpdateProficiency = async (id: string, proficiency: SkillLevel) => {
    if (!details.subjectEntityId) return;
    const result = await updateCrewSkillProficiency({ crew_skill_id: id, proficiency });
    if (result.ok) {
      setCrewSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, proficiency } : s))
      );
    } else {
      toast.error(result.error);
    }
  };

  // ── Capability handlers ─────────────────────────────────────────────────────
  const handleAddCapability = async (cap: string) => {
    if (!details.subjectEntityId || !cap) return;
    setCapLoading(true);
    const result = await addEntityCapability({ entity_id: details.subjectEntityId, capability: cap });
    setCapLoading(false);
    if (result.ok) {
      toast.success('Function added.');
      getEntityCapabilities(details.subjectEntityId).then(setCapabilities);
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveCapability = async (id: string) => {
    const result = await removeEntityCapability({ capability_id: id });
    if (result.ok) {
      setCapabilities((prev) => prev.filter((c) => c.id !== id));
    } else {
      toast.error(result.error);
    }
  };

  // ── Ghost guard ───────────────────────────────────────────────────────────────
  if (!details.subjectEntityId) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 py-24">

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
          className="stage-panel rounded-2xl p-8 max-w-sm text-center space-y-4"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-[oklch(1_0_0_/_0.08)]/10 mx-auto">
            <User className="size-6 text-[var(--stage-text-secondary)]" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-[var(--stage-text-primary)]">Profile not linked</p>
            <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
              This member hasn't linked their profile yet. Once they join Unusonic, their full profile will be available here.
            </p>
          </div>
          <Button variant="ghost" onClick={() => router.push(returnPath)} className="gap-2 mt-2">
            <ArrowLeft className="size-4" />
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
        doNotRebook,
      });

      if (result.ok) {
        toast.success('Saved.');
        setHasChanges(false);
        router.refresh();
        router.push(returnPath);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="relative pb-24">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[var(--stage-surface-raised)]/80 border-b border-[oklch(1_0_0_/_0.08)]/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Roster member
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
              transition={SPRING}
              className="flex items-center gap-3"
            >
              <span className="hidden sm:block text-xs text-[var(--stage-text-secondary)]">Unsaved changes</span>
              <Button
                onClick={handleSave}
                disabled={isPending}
                variant="outline"
                size="sm"
                className="gap-2 border-[var(--stage-accent)]/40 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/10"
              >
                <Save className="size-4" />
                Save
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Invite banner ────────────────────────────────────────────────── */}
      {isGhostMember && (
        <div className="max-w-2xl mx-auto px-6 pt-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[oklch(1_0_0/0.08)] bg-[var(--stage-surface)] p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                {inviteSent ? 'Invite sent' : 'No portal access yet'}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
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
                <Send className="size-3.5 mr-1.5" />
                {inviteSending ? 'Sending...' : 'Send invite'}
              </Button>
            )}
            {inviteSent && (
              <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-[oklch(0.75_0.15_55/0.15)] text-[oklch(0.85_0.12_55)]">
                Pending
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        {/* 0 — Avatar */}
        <div className="stage-panel rounded-2xl flex flex-col items-center gap-3 py-6">
          <AvatarUpload
            orgId={sourceOrgId}
            value={avatarUrl || null}
            onChange={handleAvatarChange}
          />
          <p className="text-xs text-[var(--stage-text-secondary)]">Change photo</p>
        </div>

        {/* 1 — Identity */}
        <AccordionSection label="Identity" icon={User} defaultOpen>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First name</label>
              <Input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); mark(); }}
                className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Last name</label>
              <Input
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); mark(); }}
                className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <Input
              value={phone ?? ''}
              onChange={(e) => { setPhone(e.target.value); mark(); }}
              placeholder="+1 (555) 000-0000"
              className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
          <div>
            <label className={LABEL}>Market</label>
            <Input
              value={market ?? ''}
              onChange={(e) => { setMarket(e.target.value); mark(); }}
              placeholder="Nashville, TN"
              className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
          <div>
            <label className={LABEL}>Union status</label>
            <Input
              value={unionStatus ?? ''}
              onChange={(e) => { setUnionStatus(e.target.value); mark(); }}
              placeholder="e.g. IATSE Local 33 / Non-union"
              className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
        </AccordionSection>

        {/* 3 — Skills */}
        <AccordionSection label="Skills" icon={Wrench} defaultOpen>
          {/* Existing skills */}
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {crewSkills.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={SPRING}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 rounded-xl border border-[oklch(1_0_0_/_0.08)]/50 bg-[var(--stage-surface-raised)] px-3 py-2">
                    <span className="flex-1 text-sm text-[var(--stage-text-primary)]">{s.skill_tag}</span>
                    <select
                      value={s.proficiency ?? ''}
                      onChange={(e) => {
                        const val = e.target.value as SkillLevel;
                        if (val) handleUpdateProficiency(s.id, val);
                      }}
                      className="rounded-md border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-2 py-0.5 text-xs text-[var(--stage-text-secondary)] shadow-xs transition-[color,box-shadow] focus-visible:border-[var(--stage-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--stage-accent)]/30 focus:outline-none"
                    >
                      <option value="">Level</option>
                      {PROFICIENCY_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                    <motion.button
                      type="button"
                      onClick={() => handleRemoveSkill(s.id)}
                      transition={SPRING}
                      className="text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] transition-[color,filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-unusonic-error)] rounded"
                      aria-label={`Remove ${s.skill_tag}`}
                    >
                      <X className="size-3.5" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {crewSkills.length === 0 && (
            <p className="text-xs text-[var(--stage-text-secondary)]">No skills yet.</p>
          )}

          {/* Add form */}
          <div className="flex gap-2 pt-1">
            <select
              value={addSkillTag}
              onChange={(e) => setAddSkillTag(e.target.value)}
              className="flex-1 rounded-md border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-3 py-2 text-sm text-[var(--stage-text-primary)] shadow-xs transition-[color,box-shadow] focus-visible:border-[var(--stage-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--stage-accent)]/30 focus:outline-none"
            >
              <option value="">Add skill…</option>
              {skillPresets
                .filter((t) => !crewSkills.some((s) => s.skill_tag === t))
                .map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={addSkillLevel}
              onChange={(e) => setAddSkillLevel(e.target.value as SkillLevel | '')}
              className="rounded-md border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-2 py-2 text-sm text-[var(--stage-text-secondary)] shadow-xs transition-[color,box-shadow] focus-visible:border-[var(--stage-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--stage-accent)]/30 focus:outline-none"
            >
              <option value="">Level</option>
              {PROFICIENCY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              onClick={handleAddSkill}
              disabled={!addSkillTag || skillsLoading}
            >
              Add
            </Button>
          </div>
        </AccordionSection>

        {/* 3b — Business Functions (Capabilities) */}
        <AccordionSection label="Business functions" icon={Landmark} defaultOpen>
          {/* Assigned capabilities */}
          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {capabilities.map((cap) => (
                <motion.span
                  key={cap.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={SPRING}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(1_0_0_/_0.08)]/30 bg-[oklch(1_0_0_/_0.10)]/15 px-3 py-1 text-xs font-medium text-[var(--stage-text-secondary)]"
                >
                  {cap.capability}
                  <button
                    type="button"
                    onClick={() => handleRemoveCapability(cap.id)}
                    className="ml-0.5 text-[var(--stage-text-secondary)]/60 hover:text-[var(--color-unusonic-error)] transition-colors"
                    aria-label={`Remove ${cap.capability}`}
                  >
                    <X className="size-3" />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

          {/* Add capability from presets */}
          {capPresets.filter((p) => !capabilities.some((c) => c.capability === p)).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {capPresets
                .filter((p) => !capabilities.some((c) => c.capability === p))
                .map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddCapability(preset)}
                    disabled={capLoading}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[oklch(1_0_0_/_0.08)]/40 px-2.5 py-1 text-[11px] font-medium text-[var(--stage-text-secondary)]/60 hover:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.08)]/60 transition-colors disabled:opacity-40"
                  >
                    + {preset}
                  </button>
                ))}
            </div>
          )}

          {capabilities.length === 0 && capPresets.length === 0 && (
            <p className="text-xs text-[var(--stage-text-secondary)]/50">No business functions configured.</p>
          )}
        </AccordionSection>

        {/* 4 — Status */}
        <AccordionSection label="Status" icon={ShieldCheck} defaultOpen>
          {details.memberRole && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[oklch(1_0_0_/_0.08)]/50 bg-[oklch(1_0_0_/_0.10)]/20 px-3 py-1 text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wide">
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
                  transition={SPRING}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/10 px-3 py-2.5">
                    <AlertTriangle className="size-3.5 text-[var(--color-unusonic-warning)] flex-shrink-0" />
                    <p className="text-xs text-[var(--color-unusonic-warning)] flex-1">
                      This member won't appear in scheduling suggestions.
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
              <p className="text-xs text-[var(--color-unusonic-warning)]">
                Member will not appear in scheduling suggestions.
              </p>
            )}
          </div>
        </AccordionSection>

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
            <p className="text-[10px] text-[var(--stage-text-secondary)]/60 mt-0.5 mb-1.5">
              Certificate of Insurance expiry date — used for compliance tracking.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={coiExpiry ?? ''}
                onChange={(e) => { setCoiExpiry(e.target.value); mark(); }}
                className="bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
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
                      transition={SPRING}
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
                className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
              />
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <Input
                value={emergencyPhone}
                onChange={(e) => { setEmergencyPhone(e.target.value); mark(); }}
                placeholder="+1 (555) 000-0000"
                className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
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
              className="mt-1 bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]"
            />
          </div>
        </AccordionSection>

      </div>
    </div>
  );
}
