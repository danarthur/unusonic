'use client';

import { Building2, User, Heart } from 'lucide-react';
import { Command } from 'cmdk';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { cn } from '@/shared/lib/utils';
import type { OmniResult } from '../../actions/lookup';

type ClientType = 'company' | 'individual' | 'couple';

interface ClientTypePillsProps {
  clientType: ClientType;
  onChange: (type: ClientType) => void;
  pillBase: string;
  pillActive: string;
  pillInactive: string;
}

export function ClientTypePills({ clientType, onChange, pillBase, pillActive, pillInactive }: ClientTypePillsProps) {
  return (
    <div className="flex gap-1 p-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] mb-3">
      <button
        type="button"
        onClick={() => onChange('company')}
        className={cn(pillBase, clientType === 'company' ? pillActive : pillInactive)}
      >
        <Building2 className="inline-block size-3 mr-1" />
        Company
      </button>
      <button
        type="button"
        onClick={() => onChange('individual')}
        className={cn(pillBase, clientType === 'individual' ? pillActive : pillInactive)}
      >
        <User className="inline-block size-3 mr-1" />
        Individual
      </button>
      <button
        type="button"
        onClick={() => onChange('couple')}
        className={cn(pillBase, clientType === 'couple' ? pillActive : pillInactive)}
      >
        <Heart className="inline-block size-3 mr-1" />
        Couple
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company client picker (cmdk Command)
// ---------------------------------------------------------------------------

interface CompanyClientPickerProps {
  clientQuery: string;
  setClientQuery: (v: string) => void;
  clientOpen: boolean;
  setClientOpen: (v: boolean) => void;
  clientResults: OmniResult[];
  clientLoading: boolean;
  selectedClient: { type: 'org' | 'contact'; id: string; name: string; organizationId?: string | null } | null;
  setSelectedClient: (v: { type: 'org' | 'contact'; id: string; name: string; organizationId?: string | null } | null) => void;
  setClientResults: (v: OmniResult[]) => void;
}

export function CompanyClientPicker({
  clientQuery, setClientQuery, clientOpen, setClientOpen,
  clientResults, clientLoading, selectedClient, setSelectedClient, setClientResults,
}: CompanyClientPickerProps) {
  return (
    <Command
      className="rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] overflow-hidden min-w-0 transition-colors duration-75 focus-within:border-[var(--stage-accent)]"
      loop
    >
      <Command.Input
        value={selectedClient ? selectedClient.name : clientQuery}
        onValueChange={(v) => {
          setSelectedClient(null);
          setClientQuery(v);
        }}
        onFocus={() => setClientOpen(true)}
        onBlur={() => setTimeout(() => setClientOpen(false), 180)}
        placeholder="Search org or contact…"
        className="w-full min-w-0 border-0 bg-transparent px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-0 truncate"
      />
      {clientOpen && (clientResults.length > 0 || (clientQuery.length >= 2 && !clientLoading)) && (
      <Command.List className="h-fit max-h-[200px] overflow-y-auto overflow-x-hidden border-t border-[oklch(1_0_0_/_0.04)] bg-[var(--ctx-dropdown)]">
        <>
            {clientResults.map((r) => (
              <Command.Item
                key={`${r.type}-${r.id}`}
                value={`${r.type}-${r.id}-${r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}`}
                onSelect={() => {
                  if (r.type === 'org') {
                    setSelectedClient({ type: 'org', id: r.id, name: r.name });
                  } else {
                    setSelectedClient({
                      type: 'contact',
                      id: r.id,
                      name: `${r.first_name} ${r.last_name}`,
                      organizationId: r.organization_id,
                    });
                  }
                  setClientQuery('');
                  setClientResults([]);
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
            {clientQuery.length >= 2 && clientResults.length === 0 && !clientLoading && (
              <Command.Item
                value={`create-${clientQuery}`}
                onSelect={() => {
                  setSelectedClient({ type: 'org', id: '', name: clientQuery.trim() });
                  setClientQuery('');
                  setClientResults([]);
                }}
                className="flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] data-[selected]:bg-[oklch(1_0_0/0.06)] min-w-0"
              >
                <span className="shrink-0 text-[var(--stage-text-primary)]">+</span>
                <span className="truncate min-w-0">Add &quot;{clientQuery.trim()}&quot; as client</span>
              </Command.Item>
            )}
        </>
      </Command.List>
      )}
    </Command>
  );
}

// ---------------------------------------------------------------------------
// Individual client form
// ---------------------------------------------------------------------------

interface IndividualClientFormProps {
  form: { firstName: string; lastName: string; email: string; phone: string };
  setForm: (updater: (prev: { firstName: string; lastName: string; email: string; phone: string }) => { firstName: string; lastName: string; email: string; phone: string }) => void;
}

export function IndividualClientForm({ form, setForm }: IndividualClientFormProps) {
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
        className="bg-[var(--ctx-well)] border-[oklch(1_0_0_/_0.10)] hover:border-[oklch(1_0_0_/_0.20)] focus-within:border-[var(--stage-accent)] transition-colors duration-75"
      />
      <FloatingLabelInput
        label="Phone (optional)"
        type="tel"
        value={form.phone}
        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
        className="bg-[var(--ctx-well)] border-[oklch(1_0_0_/_0.10)] hover:border-[oklch(1_0_0_/_0.20)] focus-within:border-[var(--stage-accent)] transition-colors duration-75"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Couple client form
// ---------------------------------------------------------------------------

interface CoupleClientFormProps {
  form: {
    partnerAFirst: string; partnerALast: string; partnerAEmail: string;
    partnerBFirst: string; partnerBLast: string; partnerBEmail: string;
  };
  setForm: (updater: (prev: CoupleClientFormProps['form']) => CoupleClientFormProps['form']) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  displayNameMode: 'auto' | 'manual';
  setDisplayNameMode: (v: 'auto' | 'manual') => void;
}

export function CoupleClientForm({ form, setForm, displayName, setDisplayName, displayNameMode, setDisplayNameMode }: CoupleClientFormProps) {
  return (
    <div className="space-y-4">
      {/* Partner A */}
      <div>
        <p className="stage-label mb-2">Partner A</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FloatingLabelInput
              label="First name"
              value={form.partnerAFirst}
              onChange={(e) => setForm((p) => ({ ...p, partnerAFirst: e.target.value }))}
            />
            <FloatingLabelInput
              label="Last name"
              value={form.partnerALast}
              onChange={(e) => setForm((p) => ({ ...p, partnerALast: e.target.value }))}
            />
          </div>
          <FloatingLabelInput
            label="Email (optional)"
            type="email"
            value={form.partnerAEmail}
            onChange={(e) => setForm((p) => ({ ...p, partnerAEmail: e.target.value }))}
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
              value={form.partnerBFirst}
              onChange={(e) => setForm((p) => ({ ...p, partnerBFirst: e.target.value }))}
            />
            <FloatingLabelInput
              label="Last name"
              value={form.partnerBLast}
              onChange={(e) => setForm((p) => ({ ...p, partnerBLast: e.target.value }))}
            />
          </div>
          <FloatingLabelInput
            label="Email (optional)"
            type="email"
            value={form.partnerBEmail}
            onChange={(e) => setForm((p) => ({ ...p, partnerBEmail: e.target.value }))}
          />
        </div>
      </div>

      {/* Display name (auto/manual) */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <p className="stage-label">Display name</p>
          {displayNameMode === 'auto' && (
            <span className="rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-2 py-0.5 text-label text-[var(--stage-text-secondary)]">
              auto
            </span>
          )}
          {displayNameMode === 'manual' && (
            <button
              type="button"
              onClick={() => setDisplayNameMode('auto')}
              className="rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-2 py-0.5 text-label text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              reset to auto
            </button>
          )}
        </div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setDisplayNameMode('manual');
          }}
          placeholder="e.g. Emma & James Johnson"
          className="stage-input w-full min-w-0"
        />
      </div>
    </div>
  );
}
