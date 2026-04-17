'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Mail, User, ArrowUpRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { addContactToGhostOrg } from '@/features/network-data';
import { getContactFieldLabel } from '@/shared/lib/contact-field-labels';
import { STAGE_MEDIUM, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { withFrom } from '@/shared/lib/smart-back';
import { useCurrentHref } from '@/shared/lib/smart-back-client';
import { cn } from '@/shared/lib/utils';

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
  const origin = useCurrentHref();
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
      onAdded?.({ id: `pending-${Date.now()}`, subjectEntityId: null, name, email: email ?? null, role: null, jobTitle: null, avatarUrl: null, phone: null });
    } else {
      setStatus('error');
      setError(result.error ?? 'Couldn’t add contact.');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="stage-label text-[var(--stage-text-secondary)]">
        Crew
      </h3>
      <ul className="space-y-3">
        {crew.length === 0 && !showForm && (
          <li className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
            No contacts yet.
          </li>
        )}
        {crew.map((m) => {
          // Optimistic pending rows don't yet have a real entity id.
          const href = m.subjectEntityId
            ? withFrom(`/network/entity/${m.subjectEntityId}`, origin)
            : null;
          const content = (
            <>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--stage-surface)] border border-[var(--stage-edge-top)]">
                <User className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">
                  {m.name?.trim() || 'Contact'}
                </p>
                {(m.email?.trim() || null) && (
                  <p className="flex items-center gap-1.5 text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-0.5">
                    <Mail className="size-3" strokeWidth={1.5} />
                    {m.email}
                  </p>
                )}
                {m.role && (
                  <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-0.5">
                    {m.role}
                  </p>
                )}
              </div>
              {href && (
                <ArrowUpRight
                  className="size-4 shrink-0 text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
                  strokeWidth={1.5}
                />
              )}
            </>
          );

          return (
            <li key={m.id}>
              {href ? (
                <Link
                  href={href}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl border border-[var(--stage-edge-top)]',
                    'bg-[var(--stage-surface-elevated)] px-4 py-3',
                    'hover:border-[var(--stage-accent)]/40 hover:bg-[oklch(1_0_0/0.06)]',
                    'transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-xl border border-dashed border-[var(--stage-edge-top)]',
                    'bg-[var(--stage-surface-elevated)] px-4 py-3 opacity-70',
                  )}
                  title="Saving…"
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isEditable && (
        <div className="pt-2">
          <AnimatePresence mode="wait">
          {!showForm ? (
            <motion.div
              key="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STAGE_NAV_CROSSFADE}
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="gap-2"
            >
              <UserPlus className="size-4" strokeWidth={1.5} />
              Add contact
            </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ ...STAGE_MEDIUM, opacity: { duration: 0.12, ease: 'easeOut' } }}
              onSubmit={handleSubmit}
              className="overflow-hidden rounded-xl border border-[var(--stage-edge-subtle)] p-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <Input
                  name="firstName"
                  placeholder={getContactFieldLabel('first_name')}
                  aria-label={getContactFieldLabel('first_name')}
                  className="stage-input text-[var(--stage-text-primary)]"
                  required
                />
                <Input
                  name="lastName"
                  placeholder={getContactFieldLabel('last_name')}
                  aria-label={getContactFieldLabel('last_name')}
                  className="stage-input text-[var(--stage-text-primary)]"
                />
              </div>
              <Input
                name="email"
                type="email"
                placeholder={`${getContactFieldLabel('email')} (optional)`}
                aria-label={getContactFieldLabel('email')}
                className="stage-input text-[var(--stage-text-primary)]"
              />
              {error && (
                <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={status === 'loading'}
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
