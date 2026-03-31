'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, User, Briefcase, Star, Loader2, X, Plus, Trash2, Landmark } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { softDeleteGhostRelationship } from '@/features/network-data';
import { updatePreferredPerson } from '@/features/network-data/api/update-preferred-person';
import {
  getCrewSkillsForEntity,
  addCrewSkill,
  removeCrewSkill,
  updateCrewSkillProficiency,
} from '@/features/talent-management/api/crew-skill-actions';
import { listWorkspaceSkillPresets } from '@/features/talent-management/api/skill-preset-actions';
import {
  getEntityCapabilities,
  addEntityCapability,
  removeEntityCapability,
  listWorkspaceCapabilityPresets,
  type EntityCapabilityRow,
} from '@/features/talent-management/api/capability-actions';
import type { NodeDetail } from '@/features/network-data';
import type { PersonAttrs } from '@/shared/lib/entity-attrs';
import type { CrewSkillDTO } from '@/entities/talent';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

type SkillLevel = 'junior' | 'mid' | 'senior' | 'lead';

const PROFICIENCY_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid',    label: 'Mid'    },
  { value: 'senior', label: 'Senior' },
  { value: 'lead',   label: 'Lead'   },
];

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
    <motion.div
      className="stage-panel rounded-2xl overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[oklch(1_0_0_/_0.05)] transition-[background-color,filter] hover:brightness-[1.01]"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          <Icon className="size-3.5" />
          {label}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={SPRING}>
          <svg className="size-4 text-[var(--stage-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
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
    </motion.div>
  );
}

const LABEL = 'text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest';
const INPUT_BASE =
  'h-9 rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/50 focus-visible:border-[var(--stage-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--stage-accent)]/30 focus:outline-none shadow-xs transition-[color,box-shadow]';

interface FreelancerEntityFormProps {
  details: NodeDetail;
  sourceOrgId: string;
  initialAttrs: PersonAttrs | null;
  returnPath?: string;
}

export function FreelancerEntityForm({ details, sourceOrgId, initialAttrs, returnPath = '/network' }: FreelancerEntityFormProps) {
  const router = useRouter();
  const entityId = details.subjectEntityId ?? '';
  const relationshipId = details.id;

  // ── Profile state ─────────────────────────────────────────────────────────
  const [firstName, setFirstName] = React.useState(initialAttrs?.first_name ?? '');
  const [lastName, setLastName] = React.useState(initialAttrs?.last_name ?? '');
  const [email, setEmail] = React.useState(initialAttrs?.email ?? '');
  const [phone, setPhone] = React.useState(initialAttrs?.phone ?? '');
  const [jobTitle, setJobTitle] = React.useState(initialAttrs?.job_title ?? '');

  // ── Skills state ──────────────────────────────────────────────────────────
  const [skills, setSkills] = React.useState<CrewSkillDTO[]>([]);
  const [skillPresets, setSkillPresets] = React.useState<string[]>([]);
  const [skillInput, setSkillInput] = React.useState('');
  const [addingSkill, setAddingSkill] = React.useState(false);
  const [removingSkillId, setRemovingSkillId] = React.useState<string | null>(null);

  // ── Capabilities state ──────────────────────────────────────────────────────
  const [capabilities, setCapabilities] = React.useState<EntityCapabilityRow[]>([]);
  const [capPresets, setCapPresets] = React.useState<string[]>([]);
  const [capLoading, setCapLoading] = React.useState(false);

  // ── Remove from preferred ─────────────────────────────────────────────────
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const [isPending, startTransition] = useTransition();

  // Load skills + presets + capabilities on mount
  React.useEffect(() => {
    if (!entityId) return;
    getCrewSkillsForEntity(entityId).then(setSkills);
    listWorkspaceSkillPresets().then(setSkillPresets);
    getEntityCapabilities(entityId).then(setCapabilities);
    listWorkspaceCapabilityPresets().then(setCapPresets);
  }, [entityId]);

  const handleSave = () => {
    if (!entityId) return;
    startTransition(async () => {
      const result = await updatePreferredPerson({
        entityId,
        firstName,
        lastName,
        email,
        phone,
        jobTitle,
      });
      if (result.success) {
        toast.success('Profile saved.');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleAddSkill = async () => {
    const tag = skillInput.trim();
    if (!tag || !entityId) return;
    setAddingSkill(true);
    const result = await addCrewSkill({ entity_id: entityId, skill_tag: tag });
    setAddingSkill(false);
    if (result.ok) {
      const updated = await getCrewSkillsForEntity(entityId);
      setSkills(updated);
      setSkillInput('');
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    setRemovingSkillId(skillId);
    const result = await removeCrewSkill({ crew_skill_id: skillId });
    setRemovingSkillId(null);
    if (result.ok) {
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
    } else {
      toast.error(result.error);
    }
  };

  const handleUpdateProficiency = async (skillId: string, proficiency: SkillLevel) => {
    const result = await updateCrewSkillProficiency({ crew_skill_id: skillId, proficiency });
    if (result.ok) {
      setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, proficiency } : s));
    } else {
      toast.error(result.error);
    }
  };

  // ── Capability handlers ─────────────────────────────────────────────────────
  const handleAddCapability = async (cap: string) => {
    if (!entityId || !cap) return;
    setCapLoading(true);
    const result = await addEntityCapability({ entity_id: entityId, capability: cap });
    setCapLoading(false);
    if (result.ok) {
      toast.success('Function added.');
      getEntityCapabilities(entityId).then(setCapabilities);
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

  const handleRemoveFromPreferred = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    const result = await softDeleteGhostRelationship(relationshipId, sourceOrgId);
    setRemoving(false);
    if (result.ok) {
      toast.success('Removed from preferred.');
      router.push(returnPath);
    } else {
      toast.error(result.error ?? 'Could not remove.');
    }
  };

  const filteredPresets = skillPresets.filter(
    (p) =>
      !skills.some((s) => s.skill_tag.toLowerCase() === p.toLowerCase()) &&
      (skillInput.trim() === '' || p.toLowerCase().includes(skillInput.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[oklch(1_0_0_/_0.08)]">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push(returnPath)}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight text-[var(--stage-text-primary)] truncate">
            {[firstName, lastName].filter(Boolean).join(' ') || details.identity.name}
          </h1>
          <p className="text-xs text-[var(--stage-text-secondary)]">Preferred partner</p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--stage-accent)]/30 bg-[var(--stage-accent)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[var(--stage-accent)]">
          Preferred
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 pb-32 space-y-3">

          {/* Profile */}
          <AccordionSection label="Profile" icon={User} defaultOpen>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={LABEL}>First name</label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className={INPUT_BASE}
                />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Last name</label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  className={INPUT_BASE}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={INPUT_BASE}
              />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className={INPUT_BASE}
              />
            </div>
          </AccordionSection>

          {/* Work */}
          <AccordionSection label="Work" icon={Briefcase} defaultOpen>
            <div className="space-y-1.5">
              <label className={LABEL}>Job title</label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. DJ, Lighting Tech"
                className={INPUT_BASE}
              />
            </div>
          </AccordionSection>

          {/* Skills */}
          <AccordionSection label="Skills" icon={Star} defaultOpen>
            {/* Skill rows */}
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {skills.map((skill) => (
                  <motion.div
                    key={skill.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={SPRING}
                    className="flex items-center gap-2 overflow-hidden"
                  >
                    <span className="flex-1 truncate text-sm text-[var(--stage-text-primary)]">{skill.skill_tag}</span>
                    <select
                      value={skill.proficiency ?? ''}
                      onChange={(e) => handleUpdateProficiency(skill.id, e.target.value as SkillLevel)}
                      className={cn(
                        'h-7 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-2 text-xs text-[var(--stage-text-secondary)]',
                        'focus-visible:border-[var(--stage-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--stage-accent)]/30 focus:outline-none shadow-xs transition-[color,box-shadow]'
                      )}
                    >
                      <option value="">Level</option>
                      {PROFICIENCY_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                    <motion.button
                      type="button"
                      onClick={() => handleRemoveSkill(skill.id)}
                      disabled={removingSkillId === skill.id}
                      className="p-1 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-[color,background-color,filter] enabled:hover:brightness-[1.06] disabled:opacity-40"
                      aria-label={`Remove ${skill.skill_tag}`}
                    >
                      {removingSkillId === skill.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <X className="size-3.5" />
                      }
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {skills.length === 0 && (
                <p className="text-xs text-[var(--stage-text-secondary)]/60">No skills yet.</p>
              )}
            </div>

            {/* Add skill input */}
            <div className="flex gap-2">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(); } }}
                placeholder="Add skill…"
                className={cn(INPUT_BASE, 'flex-1')}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSkill}
                disabled={addingSkill || !skillInput.trim()}
                className="h-9 rounded-xl border-[oklch(1_0_0_/_0.08)]"
              >
                {addingSkill ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
            </div>

            {/* Preset suggestions */}
            {filteredPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {filteredPresets.slice(0, 8).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={async () => {
                      if (!entityId) return;
                      setAddingSkill(true);
                      const result = await addCrewSkill({ entity_id: entityId, skill_tag: preset });
                      setAddingSkill(false);
                      if (result.ok) {
                        const updated = await getCrewSkillsForEntity(entityId);
                        setSkills(updated);
                      } else {
                        toast.error(result.error);
                      }
                    }}
                    className="rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-2.5 py-1 text-[11px] text-[var(--stage-text-secondary)] hover:border-[var(--stage-accent)]/40 hover:text-[var(--stage-text-primary)] transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            )}
          </AccordionSection>

          {/* Business Functions */}
          <AccordionSection label="Business functions" icon={Landmark} defaultOpen>
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
                      className="rounded-full border border-dashed border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] px-2.5 py-1 text-[11px] text-[var(--stage-text-secondary)] hover:border-[var(--stage-accent)]/40 hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-40"
                    >
                      + {preset}
                    </button>
                  ))}
              </div>
            )}
          </AccordionSection>

        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)] px-4 py-3 flex items-center justify-between gap-3">
        {/* Remove from preferred */}
        <AnimatePresence mode="wait">
          {confirmRemove ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={SPRING}
              className="flex items-center gap-2"
            >
              <span className="text-xs text-[var(--stage-text-secondary)]">Remove from preferred?</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveFromPreferred}
                disabled={removing}
                className="h-7 px-2.5 text-xs text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
              >
                {removing ? <Loader2 className="size-3 animate-spin" /> : 'Confirm'}
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
              transition={SPRING}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRemove(true)}
                className="h-8 gap-1.5 px-2.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
              >
                <Trash2 className="size-3.5" />
                Remove from preferred
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          onClick={handleSave}
          disabled={isPending}
          className="h-9 gap-2 rounded-xl bg-[var(--stage-accent)] px-4 text-sm font-medium text-[var(--stage-text-on-accent)] hover:bg-[var(--stage-accent)]/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
