'use client';

import { Building2, User, Users, Music } from 'lucide-react';
import { Command } from 'cmdk';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { cn } from '@/shared/lib/utils';
import type { OmniResult } from '../../actions/lookup';
import type { HostKind } from '../../actions/deal-model';

// ---------------------------------------------------------------------------
// Q1 — Who is this show for?
// ---------------------------------------------------------------------------

interface Q1PillsProps {
  hostKind: HostKind;
  onChange: (k: HostKind) => void;
  pillBase: string;
  pillActive: string;
  pillInactive: string;
}

export function Q1HostKindPills({ hostKind, onChange, pillBase, pillActive, pillInactive }: Q1PillsProps) {
  const opts: Array<{ value: HostKind; label: string; full: string; Icon: typeof User }> = [
    { value: 'individual', label: 'Individual', full: 'Individual host', Icon: User },
    { value: 'couple', label: 'Pair', full: 'Two hosts — couple, family, or co-hosts', Icon: Users },
    { value: 'company', label: 'Company', full: 'Corporate or organisational client', Icon: Building2 },
    { value: 'venue_concert', label: 'Performers', full: 'Performers playing a venue (concert / festival — venue or promoter is the client)', Icon: Music },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 p-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)]">
      {opts.map(({ value, label, full, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          title={full}
          aria-label={full}
          className={cn(pillBase, hostKind === value ? pillActive : pillInactive, 'justify-center min-w-0')}
        >
          <Icon className="inline-block size-3 mr-1.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual host form
// ---------------------------------------------------------------------------

export interface PersonHostFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export const EMPTY_PERSON: PersonHostFormState = { firstName: '', lastName: '', email: '', phone: '' };

interface IndividualHostFormProps {
  form: PersonHostFormState;
  setForm: (updater: (prev: PersonHostFormState) => PersonHostFormState) => void;
}

export function IndividualHostForm({ form, setForm }: IndividualHostFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FloatingLabelInput
          label="First name"
          value={form.firstName}
          onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
        />
        <FloatingLabelInput
          label="Last name"
          value={form.lastName}
          onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
        />
      </div>
      <FloatingLabelInput
        label="Email (optional)"
        type="email"
        value={form.email}
        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
      />
      <FloatingLabelInput
        label="Phone (optional)"
        type="tel"
        value={form.phone}
        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Couple host form (two partners → two person Nodes)
// ---------------------------------------------------------------------------

interface CoupleHostFormProps {
  partnerA: PersonHostFormState;
  setPartnerA: (updater: (prev: PersonHostFormState) => PersonHostFormState) => void;
  partnerB: PersonHostFormState;
  setPartnerB: (updater: (prev: PersonHostFormState) => PersonHostFormState) => void;
  pairing: 'romantic' | 'co_host' | 'family';
  setPairing: (v: 'romantic' | 'co_host' | 'family') => void;
}

export function CoupleHostForm({ partnerA, setPartnerA, partnerB, setPartnerB, pairing, setPairing }: CoupleHostFormProps) {
  const pairingOpts: Array<{ value: typeof pairing; label: string }> = [
    { value: 'romantic', label: 'Couple' },
    { value: 'family', label: 'Family' },
    { value: 'co_host', label: 'Co-hosts' },
  ];
  return (
    <div className="space-y-4">
      {/* Partner A */}
      <div>
        <p className="stage-label mb-2">Partner A</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FloatingLabelInput
              label="First name"
              value={partnerA.firstName}
              onChange={(e) => setPartnerA((p) => ({ ...p, firstName: e.target.value }))}
            />
            <FloatingLabelInput
              label="Last name"
              value={partnerA.lastName}
              onChange={(e) => setPartnerA((p) => ({ ...p, lastName: e.target.value }))}
            />
          </div>
          <FloatingLabelInput
            label="Email (optional)"
            type="email"
            value={partnerA.email}
            onChange={(e) => setPartnerA((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
      </div>

      {/* Partner B */}
      <div>
        <p className="stage-label mb-2">Partner B</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FloatingLabelInput
              label="First name"
              value={partnerB.firstName}
              onChange={(e) => setPartnerB((p) => ({ ...p, firstName: e.target.value }))}
            />
            <FloatingLabelInput
              label="Last name"
              value={partnerB.lastName}
              onChange={(e) => setPartnerB((p) => ({ ...p, lastName: e.target.value }))}
            />
          </div>
          <FloatingLabelInput
            label="Email (optional)"
            type="email"
            value={partnerB.email}
            onChange={(e) => setPartnerB((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
      </div>

      {/* Pairing kind */}
      <div>
        <p className="stage-label mb-1.5">Pairing</p>
        <div className="flex gap-1 p-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)]">
          {pairingOpts.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPairing(opt.value)}
              className={cn(
                'flex-1 rounded-[var(--stage-radius-input,6px)] px-3 py-1.5 text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                pairing === opt.value
                  ? 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.12)] shadow-sm'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] border border-transparent'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company host picker (existing OmniSearch flow, unchanged in spirit)
// ---------------------------------------------------------------------------

export interface CompanyClientSelection {
  type: 'org' | 'contact';
  id: string;
  name: string;
  organizationId?: string | null;
}

interface CompanyHostPickerProps {
  query: string;
  setQuery: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  results: OmniResult[];
  loading: boolean;
  selected: CompanyClientSelection | null;
  setSelected: (v: CompanyClientSelection | null) => void;
  setResults: (v: OmniResult[]) => void;
  /** When true, prompt mentions performers. */
  performerVariant?: boolean;
}

export function CompanyHostPicker({
  query, setQuery, open, setOpen, results, loading,
  selected, setSelected, setResults, performerVariant = false,
}: CompanyHostPickerProps) {
  return (
    <div className="space-y-2">
      <Command
        className="rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] overflow-hidden min-w-0 transition-colors duration-75 focus-within:border-[var(--stage-accent)]"
        loop
      >
        <Command.Input
          value={selected ? selected.name : query}
          onValueChange={(v) => {
            setSelected(null);
            setQuery(v);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={performerVariant ? 'Search venue, promoter, or company…' : 'Search company or contact…'}
          className="w-full min-w-0 border-0 bg-transparent px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-0 truncate"
        />
        {open && (results.length > 0 || (query.length >= 2 && !loading)) && (
          <Command.List className="h-fit max-h-[200px] overflow-y-auto overflow-x-hidden border-t border-[oklch(1_0_0_/_0.04)] bg-[var(--ctx-dropdown)]">
            {results.map((r) => (
              <Command.Item
                key={`${r.type}-${r.id}`}
                value={`${r.type}-${r.id}-${r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}`}
                onSelect={() => {
                  if (r.type === 'org') {
                    setSelected({ type: 'org', id: r.id, name: r.name });
                  } else {
                    setSelected({
                      type: 'contact',
                      id: r.id,
                      name: `${r.first_name} ${r.last_name}`,
                      organizationId: r.organization_id,
                    });
                  }
                  setQuery('');
                  setResults([]);
                }}
                className="flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer hover:bg-[oklch(1_0_0/0.08)] data-[selected]:bg-[oklch(1_0_0/0.06)] min-w-0"
              >
                {r.type === 'org' ? (
                  <Building2 size={16} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                ) : (
                  <User size={16} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                )}
                <span className="text-[var(--stage-text-primary)] truncate min-w-0">
                  {r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}
                </span>
                {r.type === 'contact' && r.email && (
                  <span className="text-[var(--stage-text-secondary)] text-xs truncate shrink-0 max-w-[120px]">{r.email}</span>
                )}
              </Command.Item>
            ))}
            {query.length >= 2 && results.length === 0 && !loading && (
              <Command.Item
                value={`create-${query}`}
                onSelect={() => {
                  setSelected({ type: 'org', id: '', name: query.trim() });
                  setQuery('');
                  setResults([]);
                }}
                className="flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] data-[selected]:bg-[oklch(1_0_0/0.06)] min-w-0"
              >
                <span className="shrink-0 text-[var(--stage-text-primary)]">+</span>
                <span className="truncate min-w-0">Add &quot;{query.trim()}&quot; as client</span>
              </Command.Item>
            )}
          </Command.List>
        )}
      </Command>
    </div>
  );
}
