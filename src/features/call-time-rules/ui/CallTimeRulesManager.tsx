'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Plus, Trash2, Pencil, ChevronUp, ChevronDown, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';
import {
  getCallTimeRules,
  upsertCallTimeRule,
  deleteCallTimeRule,
  type WorkspaceCallTimeRule,
  type UpsertCallTimeRulePayload,
} from '../api/actions';

const EVENT_ARCHETYPES = [
  'corporate',
  'festival',
  'touring',
  'private',
  'conference',
  'wedding',
  'concert',
];

function offsetToDisplay(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = minutes < 0 ? '−' : '+';
  if (h > 0 && m > 0) return `${sign}${h}h ${m}m`;
  if (h > 0) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

function RuleDescription({ rule }: { rule: WorkspaceCallTimeRule }) {
  const criteria: string[] = [];
  if (rule.role_patterns.length > 0) criteria.push(rule.role_patterns.join(', '));
  if (rule.event_archetypes.length > 0) criteria.push(`${rule.event_archetypes.join('/')} events`);

  const action =
    rule.action_type === 'slot'
      ? `→ ${rule.slot_label ?? '—'} slot`
      : `→ ${rule.offset_minutes != null ? offsetToDisplay(rule.offset_minutes) : '—'} from show`;

  return (
    <p className="text-xs text-ink-muted mt-0.5 truncate">
      {criteria.length > 0 ? criteria.join(' · ') : 'All crew'}{' '}
      <span className="text-ceramic/70">{action}</span>
    </p>
  );
}

type TagInputProps = {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
};

function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2 min-h-[40px]">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-xs text-ceramic"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-ink-muted hover:text-[var(--color-signal-error)] transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          if (e.key === 'Backspace' && !draft && value.length > 0) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] bg-transparent text-sm text-ceramic placeholder:text-ink-muted/50 focus:outline-none"
      />
    </div>
  );
}

type RuleSheetProps = {
  open: boolean;
  rule: WorkspaceCallTimeRule | null; // null = new
  onClose: () => void;
  onSaved: (rule: WorkspaceCallTimeRule) => void;
};

const BLANK: UpsertCallTimeRulePayload = {
  name: '',
  role_patterns: [],
  entity_ids: [],
  event_archetypes: [],
  action_type: 'slot',
  slot_label: '',
  offset_minutes: -120,
  priority: 0,
  apply_only_when_unset: true,
};

function RuleSheet({ open, rule, onClose, onSaved }: RuleSheetProps) {
  const [form, setForm] = useState<UpsertCallTimeRulePayload>(rule ? {
    id: rule.id,
    name: rule.name,
    role_patterns: rule.role_patterns,
    entity_ids: rule.entity_ids,
    event_archetypes: rule.event_archetypes,
    action_type: rule.action_type,
    slot_label: rule.slot_label,
    offset_minutes: rule.offset_minutes,
    priority: rule.priority,
    apply_only_when_unset: rule.apply_only_when_unset,
  } : BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form when rule prop changes (opening a different rule for edit)
  const [prevRule, setPrevRule] = useState(rule);
  if (prevRule !== rule) {
    setPrevRule(rule);
    setForm(rule ? {
      id: rule.id,
      name: rule.name,
      role_patterns: rule.role_patterns,
      entity_ids: rule.entity_ids,
      event_archetypes: rule.event_archetypes,
      action_type: rule.action_type,
      slot_label: rule.slot_label,
      offset_minutes: rule.offset_minutes,
      priority: rule.priority,
      apply_only_when_unset: rule.apply_only_when_unset,
    } : BLANK);
    setError(null);
  }

  const set = <K extends keyof UpsertCallTimeRulePayload>(k: K, v: UpsertCallTimeRulePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setError('Rule name is required.'); return; }
    if (form.action_type === 'slot' && !form.slot_label?.trim()) { setError('Slot label is required.'); return; }
    if (form.action_type === 'offset' && form.offset_minutes == null) { setError('Offset is required.'); return; }
    setSaving(true);
    setError(null);
    const result = await upsertCallTimeRule(form);
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    onSaved(result.rule);
    onClose();
  };

  // Offset helpers
  const absOffset = Math.abs(form.offset_minutes ?? 120);
  const offsetHours = Math.floor(absOffset / 60);
  const offsetMins = absOffset % 60;
  const offsetSign = (form.offset_minutes ?? -120) < 0 ? -1 : 1;

  const toggleArchetype = (a: string) => {
    const current = form.event_archetypes;
    set('event_archetypes', current.includes(a) ? current.filter((x) => x !== a) : [...current, a]);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="center" className="max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {rule ? 'Edit rule' : 'New call time rule'}
          </SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5 block">
              Rule name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. DJs → Load-in"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ceramic placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>

          {/* Criteria — Roles */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1 block">
              Matches roles
            </label>
            <p className="text-xs text-ink-muted/60 mb-1.5">Enter, press comma or Return to add. Partial match — "DJ" matches "DJ", "Lead DJ", "DJ Booth".</p>
            <TagInput
              value={form.role_patterns}
              onChange={(v) => set('role_patterns', v)}
              placeholder="DJ, FOH Engineer, Stage Manager…"
            />
          </div>

          {/* Criteria — Event type */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5 block">
              Event type (optional)
            </label>
            <p className="text-xs text-ink-muted/60 mb-2">Leave blank to apply to all event types.</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_ARCHETYPES.map((a) => {
                const active = form.event_archetypes.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleArchetype(a)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors capitalize ${
                      active
                        ? 'border-[var(--color-neon-blue)]/40 bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)]'
                        : 'border-white/10 text-ink-muted hover:border-white/20 hover:text-ceramic'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5 block">
              Assigns to
            </label>
            <div className="flex gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => set('action_type', 'slot')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  form.action_type === 'slot'
                    ? 'border-[var(--color-neon-blue)]/40 bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)]'
                    : 'border-white/10 text-ink-muted hover:bg-white/5'
                }`}
              >
                Named slot
              </button>
              <button
                type="button"
                onClick={() => set('action_type', 'offset')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  form.action_type === 'offset'
                    ? 'border-[var(--color-neon-blue)]/40 bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)]'
                    : 'border-white/10 text-ink-muted hover:bg-white/5'
                }`}
              >
                Offset from show
              </button>
            </div>

            {form.action_type === 'slot' && (
              <div>
                <p className="text-xs text-ink-muted/60 mb-1.5">
                  Matches a named slot on the event by label (case-insensitive). If the slot doesn&apos;t exist on the event yet, the rule waits until you hit &ldquo;Apply rules&rdquo;.
                </p>
                <input
                  type="text"
                  value={form.slot_label ?? ''}
                  onChange={(e) => set('slot_label', e.target.value)}
                  placeholder="Load-in"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ceramic placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </div>
            )}

            {form.action_type === 'offset' && (
              <div>
                <p className="text-xs text-ink-muted/60 mb-2">Sets a call time relative to show start.</p>
                <div className="flex items-center gap-2">
                  <select
                    value={offsetSign === -1 ? 'before' : 'after'}
                    onChange={(e) => {
                      const s = e.target.value === 'before' ? -1 : 1;
                      set('offset_minutes', s * absOffset);
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <option value="before">Before</option>
                    <option value="after">After</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={offsetHours}
                    onChange={(e) => {
                      const h = Math.max(0, parseInt(e.target.value, 10) || 0);
                      set('offset_minutes', offsetSign * (h * 60 + offsetMins));
                    }}
                    className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-ceramic text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                  <span className="text-sm text-ink-muted">h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={offsetMins}
                    onChange={(e) => {
                      const m = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                      set('offset_minutes', offsetSign * (offsetHours * 60 + m));
                    }}
                    className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-ceramic text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                  <span className="text-sm text-ink-muted">min</span>
                  <span className="text-sm text-ink-muted">show</span>
                </div>
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5 block">
              Priority
            </label>
            <p className="text-xs text-ink-muted/60 mb-1.5">Higher number wins when multiple rules match the same crew member.</p>
            <input
              type="number"
              min={0}
              value={form.priority}
              onChange={(e) => set('priority', parseInt(e.target.value, 10) || 0)}
              className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>

          {/* Overwrite toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.apply_only_when_unset}
              onChange={(e) => set('apply_only_when_unset', e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-[var(--color-neon-blue)] focus:ring-[var(--ring)]"
            />
            <span className="text-sm text-ceramic">Only apply when crew has no call time set</span>
          </label>

          {error && <p className="text-xs text-[var(--color-signal-error)]">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)] font-medium text-sm hover:bg-[var(--color-neon-blue)]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : rule ? 'Update rule' : 'Add rule'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-ink-muted text-sm hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

type CallTimeRulesManagerProps = {
  initialRules: WorkspaceCallTimeRule[];
};

export function CallTimeRulesManager({ initialRules }: CallTimeRulesManagerProps) {
  const [rules, setRules] = useState<WorkspaceCallTimeRule[]>(initialRules);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkspaceCallTimeRule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openNew = () => { setEditingRule(null); setSheetOpen(true); };
  const openEdit = (rule: WorkspaceCallTimeRule) => { setEditingRule(rule); setSheetOpen(true); };

  const onSaved = (rule: WorkspaceCallTimeRule) => {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = rule;
        return next.sort((a, b) => b.priority - a.priority);
      }
      return [rule, ...prev].sort((a, b) => b.priority - a.priority);
    });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await deleteCallTimeRule(id);
    setDeletingId(null);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const adjustPriority = async (id: string, direction: 'up' | 'down') => {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const newPriority = direction === 'up'
      ? (rules[idx - 1]?.priority ?? rules[idx].priority + 1) + 1
      : (rules[idx + 1]?.priority ?? rules[idx].priority - 1) - 1;

    const result = await upsertCallTimeRule({ ...rules[idx], priority: newPriority });
    if (result.success) {
      setRules((prev) => {
        const next = prev.map((r) => r.id === id ? { ...r, priority: newPriority } : r);
        return next.sort((a, b) => b.priority - a.priority);
      });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-ink-muted">
          {rules.length === 0
            ? 'No rules yet. Rules apply automatically when crew is assigned.'
            : `${rules.length} rule${rules.length === 1 ? '' : 's'} · applied when crew is assigned`}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-ceramic hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
        >
          <Plus size={14} aria-hidden />
          Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <LiquidPanel className="p-8 rounded-[28px] border border-dashed border-white/10 flex flex-col items-center gap-3 text-center">
          <Clock size={28} className="text-ink-muted/50" aria-hidden />
          <p className="text-sm text-ink-muted">
            Add your first rule to automatically assign call times when crew is booked.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-neon-blue)]/10 border border-[var(--color-neon-blue)]/20 text-sm font-medium text-[var(--color-neon-blue)] hover:bg-[var(--color-neon-blue)]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
          >
            <Plus size={14} aria-hidden />
            Add first rule
          </button>
        </LiquidPanel>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rules.map((rule, idx) => (
              <motion.li
                key={rule.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={UNUSONIC_PHYSICS}
              >
                <LiquidPanel className="p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                  {/* Priority arrows */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => adjustPriority(rule.id, 'up')}
                      disabled={idx === 0}
                      className="p-0.5 text-ink-muted hover:text-ceramic disabled:opacity-20 transition-colors focus:outline-none"
                      title="Increase priority"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustPriority(rule.id, 'down')}
                      disabled={idx === rules.length - 1}
                      className="p-0.5 text-ink-muted hover:text-ceramic disabled:opacity-20 transition-colors focus:outline-none"
                      title="Decrease priority"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ceramic tracking-tight truncate">{rule.name}</p>
                    <RuleDescription rule={rule} />
                  </div>

                  {/* Priority badge */}
                  <span className="shrink-0 text-[10px] font-mono text-ink-muted/50 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                    P{rule.priority}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(rule)}
                      className="p-1.5 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      disabled={deletingId === rule.id}
                      className="p-1.5 rounded-lg text-ink-muted hover:text-[var(--color-signal-error)] hover:bg-[var(--color-signal-error)]/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </LiquidPanel>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <RuleSheet
        open={sheetOpen}
        rule={editingRule}
        onClose={() => setSheetOpen(false)}
        onSaved={onSaved}
      />
    </>
  );
}
