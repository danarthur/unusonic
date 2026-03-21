'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, User, Globe, Mail } from 'lucide-react';

const formStagger = { type: 'spring' as const, stiffness: 300, damping: 30 };
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { createGhostWithContact, createConnectionFromScout } from '../api/actions';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

export interface ScoutInputProps {
  value: string;
  onChange: (val: string) => void;
  onEnrich: (data: ScoutResult) => void;
}

export interface GhostForgeSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  sourceOrgId: string;
  /** ION scout input (injected from widget layer to respect FSD). Required when using scout mode. */
  ScoutInputComponent: React.ComponentType<ScoutInputProps>;
}

/**
 * Ghost Forge – slide-over to capture new connection: org or person + primary contact.
 * On submit: creates ghost org (+ optional contact), links to source org, redirects to node detail.
 */
export function GhostForgeSheet({
  isOpen,
  onOpenChange,
  initialName,
  sourceOrgId,
  ScoutInputComponent,
}: GhostForgeSheetProps) {
  const router = useRouter();
  const [type, setType] = React.useState<'organization' | 'person'>('organization');
  const [name, setName] = React.useState(initialName);
  const [contactName, setContactName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [scoutUrl, setScoutUrl] = React.useState('');
  const [mode, setMode] = React.useState<'scout' | 'manual'>('scout');
  const [isPending, startTransition] = useTransition();
  const [isScoutPending, startScoutTransition] = useTransition();

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setContactName('');
      setEmail('');
      setWebsite('');
      setScoutUrl('');
    }
  }, [isOpen, initialName]);

  const handleScoutApply = React.useCallback(
    (data: ScoutResult) => {
      startScoutTransition(async () => {
        const result = await createConnectionFromScout(sourceOrgId, data);
        if (result.success) {
          toast.success('Connection added. We pulled the details from the website.');
          onOpenChange(false);
          router.push(`/network?nodeId=${encodeURIComponent(result.relationshipId)}&kind=external_partner`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    },
    [sourceOrgId, onOpenChange, router]
  );

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await createGhostWithContact(sourceOrgId, {
        type,
        name,
        contactName: type === 'organization' ? contactName : undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Added.');
      onOpenChange(false);
      router.push(`/network?nodeId=${encodeURIComponent(result.relationshipId)}&kind=external_partner`);
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="center"
        className="flex w-full max-w-md flex-col border-l border-[var(--color-mercury)] bg-[var(--color-glass-surface)] backdrop-blur-xl p-0"
      >
        <SheetHeader className="flex-col items-stretch gap-2 border-b border-[var(--color-mercury)] px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="text-xl font-light tracking-tight text-[var(--color-ink)]">
              Add connection
            </SheetTitle>
            <SheetClose />
          </div>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Ask ION to scout a website for details, or add them manually.
          </p>

          <div className="mt-4 flex gap-1 rounded-lg border border-[var(--color-mercury)] bg-[var(--color-obsidian)]/20 p-1">
            <button
              type="button"
              onClick={() => setMode('scout')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all',
                mode === 'scout'
                  ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)] shadow-sm'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              )}
            >
              ION
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all',
                mode === 'manual'
                  ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)] shadow-sm'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              )}
            >
              Add manually
            </button>
          </div>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-6 px-6 pt-6 overflow-y-auto">
          {mode === 'scout' && (
            <motion.section
              className="rounded-2xl border border-[var(--color-mercury)]/80 bg-white/[0.02] p-5 space-y-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={formStagger}
            >
              <div>
                <h3 className="text-sm font-medium text-[var(--color-ink)] tracking-tight">
                  Ask ION to scout
                </h3>
                <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                  Paste a company website — ION will pull the name, logo, and team so you don&apos;t have to type it.
                </p>
              </div>
              <ScoutInputComponent
                value={scoutUrl}
                onChange={setScoutUrl}
                onEnrich={handleScoutApply}
              />
              {isScoutPending && (
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-silk)]/90">
                  Creating connection…
                </p>
              )}
            </motion.section>
          )}

          {mode === 'manual' && (
            <>
              <div className="flex gap-1 rounded-lg border border-[var(--color-mercury)] bg-[var(--color-obsidian)]/20 p-1">
                <button
                  type="button"
                  onClick={() => setType('organization')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all',
                    type === 'organization'
                      ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)] shadow-sm'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  )}
                >
                  <Building2 className="size-4" />
                  Organization
                </button>
                <button
                  type="button"
                  onClick={() => setType('person')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all',
                    type === 'person'
                      ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)] shadow-sm'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  )}
                >
                  <User className="size-4" />
                  Person
                </button>
              </div>

          <motion.div
            className="space-y-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...formStagger, delay: 0.05 }}
          >
            <label className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
              {type === 'organization' ? 'Name' : 'Name'}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'organization' ? 'Acme Corp' : 'Jane Doe'}
              className="h-12 rounded-xl border-[var(--color-mercury)] bg-white/5 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-silk)]/50"
            />
          </motion.div>

          <motion.div
            className="space-y-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...formStagger, delay: 0.08 }}
          >
            <label className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
              Website
            </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="example.com"
                  className="h-11 rounded-xl border-[var(--color-mercury)] bg-white/5 pl-10 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
                />
              </div>
          </motion.div>

          <motion.div
            className="space-y-3 border-t border-[var(--color-mercury)] pt-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...formStagger, delay: 0.1 }}
          >
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)] block mb-2">
              {type === 'organization' ? 'Primary contact' : 'Email'}
            </span>
            {type === 'organization' && (
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                className="h-11 rounded-xl border-[var(--color-mercury)] bg-white/5 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
              />
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-11 rounded-xl border-[var(--color-mercury)] bg-white/5 pl-10 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
              />
            </div>
          </motion.div>
            </>
          )}
        </SheetBody>

        {mode === 'manual' && (
          <div className="shrink-0 border-t border-[var(--color-mercury)] bg-[var(--color-obsidian)]/20 px-6 py-5">
            <Button
              className="h-12 w-full rounded-xl bg-[var(--color-silk)]/20 text-[var(--color-silk)] hover:bg-[var(--color-silk)]/30"
              onClick={handleSubmit}
              disabled={!name.trim() || isPending}
            >
              {isPending ? 'Adding…' : 'Add & open'}
            </Button>
            <p className="mt-3 text-center text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">
              You can add notes and details next.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
