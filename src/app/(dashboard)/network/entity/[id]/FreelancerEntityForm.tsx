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
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { EntityDocumentsCard } from '@/entities/directory/ui/entity-documents-card';
import { AccordionSection } from './entity-studio-panels';
import { EntityOverviewCards } from '@/widgets/network-detail/ui/EntityOverviewCards';
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


type SkillLevel = 'junior' | 'mid' | 'senior' | 'lead';

const PROFICIENCY_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid',    label: 'Mid'    },
  { value: 'senior', label: 'Senior' },
  { value: 'lead',   label: 'Lead'   },
];

const LABEL = 'stage-label';
const INPUT_BASE =
  'h-9 rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] px-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus-visible:border-[var(--stage-accent)] focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)] focus-visible:outline-none shadow-xs transition-[color,box-shadow]';

interface FreelancerEntityFormProps {
  details: NodeDetail;
  sourceOrgId: string;
  initialAttrs: PersonAttrs | null;
  returnPath?: string;
  workspaceId?: string;
}

export function FreelancerEntityForm({ details, sourceOrgId, initialAttrs, returnPath = '/network', workspaceId }: FreelancerEntityFormProps) {
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
    <div className="min-h-screen bg-[var(--stage-void)]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--stage-void)] border-b border-[var(--stage-edge-subtle)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(returnPath)} aria-label="Back">
            <ArrowLeft className="size-5" strokeWidth={1.5} />
          </Button>
          <div>
            <p className="stage-label">
              Preferred freelancer
            </p>
            <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight">
              {[firstName, lastName].filter(Boolean).join(' ') || details.identity.name}
            </h1>
          </div>
        </div>
        <AnimatePresence>
          {isPending && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STAGE_MEDIUM}
              className="flex items-center gap-3"
            >
              <span className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Saving...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-2xl px-6 py-8 pb-32 space-y-3">

          {/* Overview cards — Brief, Working notes, Captures, Productions */}
          {workspaceId && entityId && (
            <EntityOverviewCards
              workspaceId={workspaceId}
              entityId={entityId}
              entityType="person"
              entityName={details.identity.name ?? null}
              density="page"
            />
          )}

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
                    transition={STAGE_MEDIUM}
                    className="flex items-center gap-2 overflow-hidden"
                  >
                    <span className="flex-1 truncate text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{skill.skill_tag}</span>
                    <select
                      value={skill.proficiency ?? ''}
                      onChange={(e) => handleUpdateProficiency(skill.id, e.target.value as SkillLevel)}
                      className="stage-input h-7 px-2 text-xs"
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
                      className="p-1 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-[color,background-color] duration-[80ms] disabled:opacity-45"
                      aria-label={`Remove ${skill.skill_tag}`}
                    >
                      {removingSkillId === skill.id
                        ? <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                        : <X className="size-3.5" strokeWidth={1.5} />
                      }
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {skills.length === 0 && (
                <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">No skills yet.</p>
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
                className="h-9 rounded-xl border-[var(--stage-edge-subtle)]"
              >
                {addingSkill ? <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} /> : <Plus className="size-3.5" strokeWidth={1.5} />}
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
                    className="rounded-full border border-[var(--stage-edge-subtle)] bg-[oklch(1_0_0/0.08)] px-2.5 py-1 text-field-label text-[var(--stage-text-secondary)] hover:border-[var(--stage-edge-subtle)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms]"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            )}
          </AccordionSection>

          {/* Documents */}
          {entityId && workspaceId && (
            <EntityDocumentsCard
              entityId={entityId}
              entityType="person"
              workspaceId={workspaceId}
            />
          )}

          {/* Business Functions */}
          <AccordionSection label="Business functions" icon={Landmark} defaultOpen>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {capabilities.map((cap) => (
                  <motion.span
                    key={cap.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={STAGE_MEDIUM}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stage-edge-subtle)]/30 bg-[oklch(1_0_0_/_0.10)]/15 px-3 py-1 text-xs font-medium text-[var(--stage-text-secondary)]"
                  >
                    {cap.capability}
                    <button
                      type="button"
                      onClick={() => handleRemoveCapability(cap.id)}
                      className="ml-0.5 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] transition-colors duration-[80ms]"
                      aria-label={`Remove ${cap.capability}`}
                    >
                      <X className="size-3" strokeWidth={1.5} />
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
                      className="rounded-full border border-dashed border-[var(--stage-edge-subtle)] bg-[oklch(1_0_0/0.08)] px-2.5 py-1 text-field-label text-[var(--stage-text-secondary)] hover:border-[var(--stage-edge-subtle)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] disabled:opacity-45"
                    >
                      + {preset}
                    </button>
                  ))}
              </div>
            )}
          </AccordionSection>

        </div>

      {/* Footer */}
      <div className="border-t border-[var(--stage-edge-subtle)] bg-[var(--stage-void)] px-6 py-4 flex items-center justify-between gap-3">
        {/* Remove from preferred */}
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
              <span className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Remove from preferred?</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveFromPreferred}
                disabled={removing}
                className="h-7 px-2.5 text-xs text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
              >
                {removing ? <Loader2 className="size-3 animate-spin" strokeWidth={1.5} /> : 'Confirm'}
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

        <Button
          onClick={handleSave}
          disabled={isPending}
          className="h-9 gap-2 rounded-xl px-4 text-sm font-medium stage-btn stage-btn-primary disabled:opacity-[0.45]"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : <Save className="size-4" strokeWidth={1.5} />}
          Save
        </Button>
      </div>
    </div>
  );
}
