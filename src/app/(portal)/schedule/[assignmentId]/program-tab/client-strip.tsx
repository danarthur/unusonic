'use client';

/**
 * Client strip + dynamic-field renderer for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - ClientStrip — sticky top strip showing client display name +
 *     pronunciation, save status, share-with-client + show-mode toggles,
 *     and an expandable client-details card driven by CLIENT_FIELD_SCHEMAS.
 *   - DynamicField — renders a single FieldDef as input or textarea.
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Loader2, Check, ChevronDown, ChevronUp, Radio, Link } from 'lucide-react';
import type { ClientDetails, FieldDef } from '@/features/ops/lib/dj-prep-schema';
import { CLIENT_FIELD_SCHEMAS } from '@/features/ops/lib/dj-prep-schema';

export function ClientStrip({
  clientDetails,
  clientNotes,
  eventArchetype,
  expanded,
  onToggle,
  onUpdateDetails,
  onUpdateNotes,
  saveStatus,
  isSaving,
  showMode,
  onToggleShowMode,
  onShareWithClient,
  sharingLink,
}: {
  clientDetails: ClientDetails;
  clientNotes: string;
  eventArchetype: string | null;
  expanded: boolean;
  onToggle: () => void;
  onUpdateDetails: (updates: Partial<ClientDetails>) => void;
  onUpdateNotes: (notes: string) => void;
  saveStatus: 'idle' | 'saving' | 'saved';
  isSaving: boolean;
  showMode: boolean;
  onToggleShowMode: () => void;
  onShareWithClient: () => void;
  sharingLink: boolean;
}) {
  const group = clientDetails.archetype;
  const fields = CLIENT_FIELD_SCHEMAS[group] ?? CLIENT_FIELD_SCHEMAS.generic;

  // Derive display name for the collapsed strip
  const displayName = useMemo(() => {
    const d = clientDetails as Record<string, unknown>;
    if (group === 'wedding') {
      const a = (d.couple_name_a as string) || '';
      const b = (d.couple_name_b as string) || '';
      if (a && b) return `${a} & ${b}`;
      return a || b || 'Client name';
    }
    if (group === 'corporate') return (d.company_name as string) || (d.event_contact_name as string) || 'Client';
    if (group === 'social') return (d.honoree_name as string) || (d.primary_contact_name as string) || 'Client';
    if (group === 'performance') return (d.headliner as string) || (d.promoter_name as string) || 'Client';
    return (d.primary_contact_name as string) || 'Client name';
  }, [clientDetails, group]);

  const pronunciation = (clientDetails as Record<string, unknown>).pronunciation as string || '';

  return (
    <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-[var(--stage-void)] border-b border-[oklch(1_0_0/0.06)]">
      {/* Top row: names + pronunciation + show mode toggle + save status */}
      <div className="flex items-start justify-between gap-3">
        <button onClick={onToggle} className="flex flex-col gap-0.5 text-left min-w-0">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-[var(--stage-text-secondary)] shrink-0" />
            <span className={`font-semibold truncate ${showMode ? 'text-base text-[var(--stage-text-primary)]' : 'text-sm text-[var(--stage-text-primary)]'}`}>
              {displayName}
            </span>
            {!showMode && (expanded ? <ChevronUp className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" /> : <ChevronDown className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />)}
          </div>
          {pronunciation && (
            <span className={`text-[var(--stage-text-secondary)] ml-6 italic ${showMode ? 'text-sm' : 'text-xs'}`}>
              {pronunciation}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {/* Save status */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--stage-text-tertiary)]">
            {saveStatus === 'saving' && <><Loader2 className="size-3 animate-spin" /> Saving</>}
            {saveStatus === 'saved' && <><Check className="size-3" /> Saved</>}
          </div>

          {/* Share with client */}
          <button
            onClick={onShareWithClient}
            disabled={sharingLink}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
            title="Copy client link to clipboard"
          >
            {sharingLink ? <Loader2 className="size-3 animate-spin" /> : <Link className="size-3" />}
            Share
          </button>

          {/* Show mode toggle */}
          <button
            onClick={onToggleShowMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              showMode
                ? 'bg-[var(--stage-accent)] text-[var(--stage-void)]'
                : 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)]'
            }`}
          >
            <Radio className="size-3" />
            {showMode ? 'Live' : 'Show mode'}
          </button>
        </div>
      </div>

      {/* Expanded client card — dynamic fields from schema */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-[oklch(1_0_0/0.04)]">
              {fields.map((field) => (
                <DynamicField
                  key={field.key}
                  field={field}
                  value={(clientDetails as Record<string, unknown>)[field.key] as string ?? ''}
                  onChange={(v) => onUpdateDetails({ [field.key]: v } as Partial<ClientDetails>)}
                />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[oklch(1_0_0/0.04)]">
              <label htmlFor="program-client-notes" className="stage-label text-[var(--stage-text-tertiary)] mb-1.5 block">Notes</label>
              <textarea
                id="program-client-notes"
                value={clientNotes}
                onChange={(e) => onUpdateNotes(e.target.value)}
                rows={3}
                placeholder="Vibe, dress code, genres to lean into, curfew, sound restrictions..."
                className="w-full text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-2 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Renders a single field from the CLIENT_FIELD_SCHEMAS, as input or textarea. */
export function DynamicField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `client-${field.key}`;
  if (field.multiline) {
    return (
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor={id} className="stage-label text-[var(--stage-text-tertiary)]">{field.label}</label>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="w-full text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="stage-label text-[var(--stage-text-tertiary)]">{field.label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)]"
      />
    </div>
  );
}
