'use client';

/**
 * Roles and skills for one person.
 *
 * Self-contained on purpose: every control here commits the moment you use it,
 * so none of it belongs to the page's dirty state or its Save. Lifting it out
 * of the record form is what lets one body serve a roster member and a
 * preferred freelancer without that body running to nine hundred lines.
 *
 * Canonical roles drive the feasibility chip's pool counts, which is why they
 * get their own optgroup rather than sitting anonymously among the presets.
 *
 * @module app/network/entity/CrewSkillsSection
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  getCrewSkillsForEntity,
  addCrewSkill,
  removeCrewSkill,
  updateCrewSkillProficiency,
} from '@/features/talent-management/api/crew-skill-actions';
import {
  listWorkspaceSkillPresets,
  listWorkspaceCanonicalRoles,
} from '@/features/talent-management/api/skill-preset-actions';
import type { CrewSkillDTO, SkillLevel } from '@/entities/talent';
import { AccordionSection } from './entity-studio-panels';

const PROFICIENCY_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid',    label: 'Mid'    },
  { value: 'senior', label: 'Senior' },
  { value: 'lead',   label: 'Lead'   },
];

// Used only when the workspace has no vocabulary seeded yet.
const FALLBACK_SKILL_PRESETS = [
  'Audio A1', 'Audio A2', 'DJ', 'Lighting', 'Video', 'Camera Op',
  'Stage Manager', 'Rigging', 'GrandMA3', 'Backline', 'Sales',
];

export function CrewSkillsSection({ entityId }: { entityId: string }) {
  const [crewSkills, setCrewSkills] = React.useState<CrewSkillDTO[]>([]);
  const [skillPresets, setSkillPresets] = React.useState<string[]>([]);
  const [canonicalRoles, setCanonicalRoles] = React.useState<string[]>([]);
  const [addSkillTag, setAddSkillTag] = React.useState('');
  const [addSkillLevel, setAddSkillLevel] = React.useState<SkillLevel | ''>('');
  const [skillsLoading, setSkillsLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getCrewSkillsForEntity(entityId).then((s) => {
      if (!cancelled) setCrewSkills(s);
    });
    return () => { cancelled = true; };
  }, [entityId]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([listWorkspaceSkillPresets(), listWorkspaceCanonicalRoles()]).then(([presets, roles]) => {
      if (cancelled) return;
      setSkillPresets(presets.length > 0 ? presets : FALLBACK_SKILL_PRESETS);
      setCanonicalRoles(roles);
    });
    return () => { cancelled = true; };
  }, []);

  const handleAddSkill = async () => {
    if (!addSkillTag) return;
    setSkillsLoading(true);
    const result = await addCrewSkill({
      entity_id: entityId,
      skill_tag: addSkillTag,
      proficiency: addSkillLevel || undefined,
    });
    setSkillsLoading(false);
    if (result.ok) {
      toast.success('Skill added.');
      setAddSkillTag('');
      setAddSkillLevel('');
      getCrewSkillsForEntity(entityId).then(setCrewSkills);
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveSkill = async (id: string) => {
    const result = await removeCrewSkill({ crew_skill_id: id });
    if (result.ok) {
      setCrewSkills((prev) => prev.filter((s) => s.id !== id));
    } else {
      toast.error(result.error);
    }
  };

  const handleUpdateProficiency = async (id: string, proficiency: SkillLevel) => {
    const result = await updateCrewSkillProficiency({ crew_skill_id: id, proficiency });
    if (result.ok) {
      setCrewSkills((prev) => prev.map((s) => (s.id === id ? { ...s, proficiency } : s)));
    } else {
      toast.error(result.error);
    }
  };

  return (
  <AccordionSection label="Roles & skills" icon={Wrench} defaultOpen>
    <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-tertiary)] -mt-2 mb-2 leading-relaxed">
      Crew roles drive the feasibility chip&rsquo;s pool counts. Other skills are granular technical capabilities (gear, software, certifications).
    </p>

    {/* Existing skills */}
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {crewSkills.map((s) => {
          const isCanonicalRole = canonicalRoles.some(
            (r) => r.toLowerCase() === s.skill_tag.toLowerCase(),
          );
          return (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={STAGE_MEDIUM}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-xl border border-[var(--stage-edge-subtle)]/50 bg-[var(--ctx-card)] px-3 py-2">
                <span className="flex-1 flex items-baseline gap-2 min-w-0">
                  <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] truncate">{s.skill_tag}</span>
                  {isCanonicalRole && (
                    <span
                      className="text-[10px] uppercase tracking-[0.05em] text-[var(--stage-text-tertiary)] shrink-0"
                      title="This skill is a canonical crew role and drives feasibility chip pool counts."
                    >
                      Role
                    </span>
                  )}
                </span>
                <select
                  value={s.proficiency ?? ''}
                  onChange={(e) => {
                    const val = e.target.value as SkillLevel;
                    if (val) handleUpdateProficiency(s.id, val);
                  }}
                  className="stage-input px-2 py-0.5 text-xs"
                >
                  <option value="">Level</option>
                  {PROFICIENCY_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <motion.button
                  type="button"
                  onClick={() => handleRemoveSkill(s.id)}
                  transition={STAGE_MEDIUM}
                  className="text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] transition-colors duration-[80ms] hover:bg-[oklch(1_0_0/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-unusonic-error)] ring-offset-2 ring-offset-[var(--stage-void)] rounded"
                  aria-label={`Remove ${s.skill_tag}`}
                >
                  <X className="size-3.5" strokeWidth={1.5} />
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>

    {crewSkills.length === 0 && (
      <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Nothing tagged yet.</p>
    )}

    {/* Add form */}
    <div className="flex gap-2 pt-1">
      <select
        value={addSkillTag}
        onChange={(e) => setAddSkillTag(e.target.value)}
        className="stage-input flex-1"
      >
        <option value="">Add role or skill…</option>
        {(() => {
          const taken = new Set(crewSkills.map((s) => s.skill_tag.toLowerCase()));
          // Canonical roles first (drives chip), then other skill presets
          // that aren't already canonical roles. Both filtered to exclude
          // tags the user has already added.
          const rolesToShow = canonicalRoles.filter((r) => !taken.has(r.toLowerCase()));
          const canonicalLower = new Set(canonicalRoles.map((r) => r.toLowerCase()));
          const otherToShow = skillPresets.filter(
            (s) => !taken.has(s.toLowerCase()) && !canonicalLower.has(s.toLowerCase()),
          );
          return (
            <>
              {rolesToShow.length > 0 && (
                <optgroup label="Crew roles · drives feasibility chip">
                  {rolesToShow.map((t) => <option key={`role-${t}`} value={t}>{t}</option>)}
                </optgroup>
              )}
              {otherToShow.length > 0 && (
                <optgroup label="Other skills">
                  {otherToShow.map((t) => <option key={`skill-${t}`} value={t}>{t}</option>)}
                </optgroup>
              )}
            </>
          );
        })()}
      </select>
      <select
        value={addSkillLevel}
        onChange={(e) => setAddSkillLevel(e.target.value as SkillLevel | '')}
        className="stage-input px-2"
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
  );
}
