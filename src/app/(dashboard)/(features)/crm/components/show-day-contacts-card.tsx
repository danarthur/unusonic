'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mail, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { updateEventContacts, type ShowDayContact } from '../actions/update-event-contacts';

type ShowDayContactsCardProps = {
  eventId: string;
  initialContacts: ShowDayContact[];
  onSaved?: () => void;
};

export function ShowDayContactsCard({ eventId, initialContacts, onSaved }: ShowDayContactsCardProps) {
  const [contacts, setContacts] = useState<ShowDayContact[]>(initialContacts);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ShowDayContact[]>(initialContacts);
  const [isPending, startTransition] = useTransition();

  const startEdit = () => {
    setDraft(contacts.length > 0 ? [...contacts] : [{ role: '', name: '', phone: null, email: null }]);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(contacts);
  };

  const addRow = () => {
    setDraft((prev) => [...prev, { role: '', name: '', phone: null, email: null }]);
  };

  const removeRow = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateField = (idx: number, field: keyof ShowDayContact, value: string) => {
    setDraft((prev) =>
      prev.map((c, i) =>
        i === idx
          ? { ...c, [field]: field === 'phone' || field === 'email' ? value || null : value }
          : c
      )
    );
  };

  const save = () => {
    // Filter out rows with empty required fields
    const valid = draft.filter((c) => c.role.trim() && c.name.trim());
    startTransition(async () => {
      const result = await updateEventContacts(eventId, valid);
      if (result.success) {
        setContacts(valid);
        setEditing(false);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--stage-gap-wide, 12px)' }}>
        <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
          Show day contacts
        </p>
        {!editing && (
          <button
            onClick={startEdit}
            className="stage-badge-text inline-flex items-center gap-1.5 transition-colors hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            <Pencil size={13} aria-hidden />
            {contacts.length > 0 ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {editing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STAGE_MEDIUM}
            className="flex flex-col"
            style={{ gap: 'var(--stage-gap, 8px)' }}
          >
            {draft.map((c, idx) => (
              <div
                key={idx}
                className="flex flex-col relative"
                style={{
                  gap: 'var(--stage-gap, 6px)',
                  padding: 'var(--stage-gap-wide, 10px)',
                  borderRadius: 'var(--stage-radius-nested, 8px)',
                  backgroundColor: 'var(--ctx-well)',
                }}
              >
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="absolute top-2 right-2 p-0.5 rounded transition-colors hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ color: 'var(--stage-text-tertiary)' }}
                  aria-label="Remove contact"
                >
                  <X size={14} />
                </button>
                <input
                  type="text"
                  placeholder="Role (e.g. Venue manager)"
                  value={c.role}
                  onChange={(e) => updateField(idx, 'role', e.target.value)}
                  className="w-full bg-transparent text-sm font-medium tracking-tight placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ color: 'var(--stage-text-primary)' }}
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateField(idx, 'name', e.target.value)}
                  className="w-full bg-transparent text-sm tracking-tight placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ color: 'var(--stage-text-primary)' }}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={c.phone ?? ''}
                  onChange={(e) => updateField(idx, 'phone', e.target.value)}
                  className="w-full bg-transparent text-sm tracking-tight placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ color: 'var(--stage-text-primary)' }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={c.email ?? ''}
                  onChange={(e) => updateField(idx, 'email', e.target.value)}
                  className="w-full bg-transparent text-sm tracking-tight placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ color: 'var(--stage-text-primary)' }}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addRow}
              className="stage-badge-text flex items-center gap-1.5 transition-colors hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded py-1"
              style={{ color: 'var(--stage-accent)' }}
            >
              <Plus size={13} aria-hidden />
              Add contact
            </button>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={save}
                disabled={isPending}
                className="stage-btn stage-btn-primary text-xs px-3 py-1.5"
              >
                {isPending ? 'Saving\u2026' : 'Save'}
              </button>
              <button
                onClick={cancel}
                disabled={isPending}
                className="stage-btn stage-btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : contacts.length === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_LIGHT}
            className="stage-field-label"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            No contacts added
          </motion.p>
        ) : (
          <motion.div
            key="read"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_LIGHT}
            className="flex flex-col"
            style={{ gap: 'var(--stage-gap, 8px)' }}
          >
            {contacts.map((c, idx) => (
              <div
                key={idx}
                className="flex flex-col"
                style={{ gap: '2px' }}
              >
                <p
                  className="stage-label"
                  style={{ color: 'var(--stage-text-tertiary)' }}
                >
                  {c.role}
                </p>
                <p className="stage-readout truncate">
                  {c.name}
                </p>
                <div className="flex items-center flex-wrap" style={{ gap: 'var(--stage-gap, 8px)' }}>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="stage-label inline-flex items-center gap-1 transition-colors hover:text-[var(--stage-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                      style={{ color: 'var(--stage-text-secondary)' }}
                    >
                      <Phone size={12} aria-hidden />
                      {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="stage-label inline-flex items-center gap-1 transition-colors hover:text-[var(--stage-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                      style={{ color: 'var(--stage-text-secondary)' }}
                    >
                      <Mail size={12} aria-hidden />
                      {c.email}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </StagePanel>
  );
}
