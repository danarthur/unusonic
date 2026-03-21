'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Mail, User } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { addContactToGhostOrg } from '@/features/network-data';
import { getContactFieldLabel } from '@/shared/lib/contact-field-labels';

const listVariants = {
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0 },
  },
};

const itemVariants = {
  hidden: { y: 8, opacity: 1 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
};
import type { NodeDetailCrewMember } from '@/features/network-data';

interface NodeCrewListProps {
  crew: NodeDetailCrewMember[];
  sourceOrgId: string;
  ghostOrgId: string;
  isEditable: boolean;
  /** Called after add; pass new member so the sheet can show them immediately (optimistic). */
  onAdded?: (newMember?: NodeDetailCrewMember) => void;
}

export function NodeCrewList({
  crew,
  sourceOrgId,
  ghostOrgId,
  isEditable,
  onAdded,
}: NodeCrewListProps) {
  const [showForm, setShowForm] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const firstName = (fd.get('firstName') as string)?.trim() ?? '';
    const lastName = (fd.get('lastName') as string)?.trim() ?? '';
    const email = (fd.get('email') as string)?.trim() || undefined;
    setError(null);
    setStatus('loading');
    const result = await addContactToGhostOrg(sourceOrgId, ghostOrgId, {
      firstName: firstName || 'Contact',
      lastName,
      email: email || null,
    });
    if (result.ok) {
      setStatus('success');
      form.reset();
      setShowForm(false);
      const name = [firstName || 'Contact', lastName].filter(Boolean).join(' ').trim() || 'Contact';
      onAdded?.({ id: `pending-${Date.now()}`, name, email: email ?? null, role: null, jobTitle: null, avatarUrl: null, phone: null });
    } else {
      setStatus('error');
      setError(result.error ?? 'Couldn’t add contact.');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
        Crew
      </h3>
      <motion.ul
        className="space-y-3"
        variants={listVariants}
        initial="visible"
        animate="visible"
      >
        {crew.length === 0 && !showForm && (
          <li className="text-sm text-[var(--color-ink-muted)]">
            No members.
          </li>
        )}
        {crew.map((m) => (
          <motion.li
            key={m.id}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-3 rounded-xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] px-4 py-3 shadow-sm"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-glass-surface)] border border-[var(--color-mercury)]">
              <User className="size-5 text-[var(--color-ink-muted)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-ink)]">{m.name?.trim() || 'Contact'}</p>
              {(m.email?.trim() || null) && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)] mt-0.5">
                  <Mail className="size-3" />
                  {m.email}
                </p>
              )}
              {m.role && (
                <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">{m.role}</p>
              )}
            </div>
          </motion.li>
        ))}
      </motion.ul>

      {isEditable && (
        <div className="pt-2">
          <AnimatePresence mode="wait">
          {!showForm ? (
            <motion.div
              key="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="gap-2 border-[var(--color-silk)]/40 text-[var(--color-silk)]"
            >
              <UserPlus className="size-4" />
              Add contact
            </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onSubmit={handleSubmit}
              className="overflow-hidden rounded-xl border border-[var(--color-mercury)] bg-white/5 p-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <Input
                  name="firstName"
                  placeholder={getContactFieldLabel('first_name')}
                  className="bg-white/5 border-[var(--color-mercury)] text-[var(--color-ink)]"
                  required
                />
                <Input
                  name="lastName"
                  placeholder={getContactFieldLabel('last_name')}
                  className="bg-white/5 border-[var(--color-mercury)] text-[var(--color-ink)]"
                />
              </div>
              <Input
                name="email"
                type="email"
                placeholder={`${getContactFieldLabel('email')} (optional)`}
                className="bg-white/5 border-[var(--color-mercury)] text-[var(--color-ink)]"
              />
              {error && (
                <p className="text-xs text-[var(--color-signal-error)]">{error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={status === 'loading'}
                  className="bg-[var(--color-silk)]/20 text-[var(--color-silk)] border-[var(--color-silk)]/40"
                >
                  {status === 'loading' ? 'Adding…' : 'Add contact'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                    setStatus('idle');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </motion.form>
          )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
