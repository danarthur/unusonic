'use client';

/**
 * Business functions (capabilities) for one person.
 *
 * Same reasoning as [[CrewSkillsSection]]: adding or removing a function
 * writes immediately, so it has no business in the record form's dirty state.
 * It was also a verbatim copy in two form files, which is how the two drifted.
 *
 * @module app/network/entity/BusinessFunctionsSection
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Landmark, X } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  getEntityCapabilities,
  addEntityCapability,
  removeEntityCapability,
  listWorkspaceCapabilityPresets,
  type EntityCapabilityRow,
} from '@/features/talent-management/api/capability-actions';
import { AccordionSection } from './entity-studio-panels';

export function BusinessFunctionsSection({ entityId }: { entityId: string }) {
  const [capabilities, setCapabilities] = React.useState<EntityCapabilityRow[]>([]);
  const [capPresets, setCapPresets] = React.useState<string[]>([]);
  const [capLoading, setCapLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getEntityCapabilities(entityId).then((c) => {
      if (!cancelled) setCapabilities(c);
    });
    listWorkspaceCapabilityPresets().then((p) => {
      if (!cancelled) setCapPresets(p);
    });
    return () => { cancelled = true; };
  }, [entityId]);

  const handleAddCapability = async (cap: string) => {
    if (!cap) return;
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

  return (
  <AccordionSection label="Business functions" icon={Landmark} defaultOpen>
    {/* Assigned capabilities */}
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
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--stage-edge-subtle)]/40 px-2.5 py-1 text-field-label font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:border-[var(--stage-edge-subtle)]/60 transition-colors duration-[80ms] disabled:opacity-45"
            >
              + {preset}
            </button>
          ))}
      </div>
    )}

    {capabilities.length === 0 && capPresets.length === 0 && (
      <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-tertiary)]">No business functions configured.</p>
    )}
  </AccordionSection>
  );
}
