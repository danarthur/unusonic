'use client';

/**
 * The `+` that adds the second person — new, or one you already have.
 *
 * One control doing both jobs, which is the whole point. 17hats' `+` opens a
 * single modal offering "a new, or existing contact" with autocomplete; NPSP's
 * Manage Household does the same. Split them and you get Dubsado's answer to a
 * partner who already has a record: re-type them as a second client entry, and
 * now the same human is in the directory twice with nothing joining the copies.
 *
 * Searching first is not a nicety. NPSP's duplicate rules match the same person
 * twice, not two people in one household — no vendor ships household detection,
 * so the moment the link is made is the only cheap moment to prevent it.
 *
 * Design: docs/couples-and-linked-people.md §C4.
 *
 * @module entities/network/ui/AddLinkedPerson
 */

import * as React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import {
  searchLinkablePeople,
  linkPartner,
  type LinkablePerson,
  type Pairing,
} from '../api/link-partner';
import { EntityAvatar } from '@/entities/network/ui/EntityAvatar';

const PAIRING_OPTIONS: { value: Pairing; label: string }[] = [
  { value: 'romantic', label: 'Partner' },
  { value: 'co_host', label: 'Co-host' },
  { value: 'family', label: 'Family' },
];

export interface AddLinkedPersonProps {
  entityId: string;
  sourceOrgId: string;
  onLinked: () => void;
}

export function AddLinkedPerson({ entityId, sourceOrgId, onLinked }: AddLinkedPersonProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<LinkablePerson[]>([]);
  const [pairing, setPairing] = React.useState<Pairing>('romantic');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchLinkablePeople(trimmed, entityId).then((found) => {
        if (!cancelled) setResults(found);
      });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, open, entityId]);

  const commit = async (partner: { existingEntityId: string } | { name: string }) => {
    setSaving(true);
    const result = await linkPartner(entityId, partner, pairing, sourceOrgId);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    setQuery('');
    setResults([]);
    onLinked();
    toast.success('Linked.');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Link another person"
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1',
          'stage-badge-text text-[var(--stage-text-tertiary)]',
          'hover:bg-[oklch(1_0_0/0.06)] hover:text-[var(--stage-text-primary)]',
          'transition-colors duration-[80ms]',
        )}
      >
        <Plus className="size-3" strokeWidth={1.5} />
        Link someone
      </button>
    );
  }

  const typed = query.trim();
  return (
    <div className="w-full max-w-sm space-y-2 rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] p-3" data-surface="elevated">
      <div className="flex gap-1">
        {PAIRING_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPairing(option.value)}
            className={cn(
              'rounded-full px-2.5 py-1 stage-badge-text transition-colors duration-[80ms]',
              pairing === option.value
                ? 'bg-[oklch(1_0_0/0.12)] text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.06)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
        placeholder="Search people, or type a new name"
        aria-label="Search people, or type a new name"
        className="h-8 bg-[var(--ctx-well)]"
      />

      {/* Existing people first, always. The create option is last and explicit,
          so the cheap path is the one that does not make a second copy. */}
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {results.map((person) => (
          <button
            key={person.entityId}
            type="button"
            disabled={saving}
            onClick={() => void commit({ existingEntityId: person.entityId })}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[oklch(1_0_0/0.06)] disabled:opacity-50"
          >
            <EntityAvatar name={person.name} avatarUrl={person.avatarUrl} entityType="person" sizeClassName="size-6" />
            <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
              {person.name}
            </span>
            {person.subtitle && (
              <span className="stage-badge-text text-[var(--stage-text-tertiary)]">{person.subtitle}</span>
            )}
          </button>
        ))}

        {typed.length >= 2 && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void commit({ name: typed })}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[oklch(1_0_0/0.06)] disabled:opacity-50"
          >
            {saving
              ? <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
              : <Plus className="size-3.5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />}
            <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
              Add <span className="text-[var(--stage-text-primary)]">{typed}</span> as a new person
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
